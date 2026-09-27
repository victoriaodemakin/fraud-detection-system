using FraudDetection.Api.Data;
using FraudDetection.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;

// Npgsql (as of v6+) requires DateTime.Kind to match the column's timestamp type exactly.
// This codebase uses DateTime.UtcNow (Kind=Utc) throughout for "timestamp without time zone"
// columns, which is the pre-v6 behaviour; this switch restores it instead of retrofitting
// every property with a UTC conversion.
AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
        policy.WithOrigins("http://localhost:3000", "http://localhost:3001").AllowAnyHeader().AllowAnyMethod());
});

// PostgreSQL database (hosted on Supabase), created and evolved through EF Core migrations
// (applied at start-up). The connection string comes from the ConnectionStrings:Default
// configuration key, which in production is supplied as the ConnectionStrings__Default
// environment variable so the real credentials never live in a committed file. Render also
// sets a single DATABASE_URL variable for linked Postgres add-ons, in the
// postgres://user:pass@host:port/db form, which is accepted as a fallback and converted.
var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? ConvertDatabaseUrl(Environment.GetEnvironmentVariable("DATABASE_URL"))
    ?? throw new InvalidOperationException("No database connection string configured. Set ConnectionStrings:Default (or ConnectionStrings__Default) or DATABASE_URL.");
// Supabase's connection string here points at Supavisor (its PgBouncer-based pooler) in
// transaction mode. Npgsql's own client-side connection pooling (the default) reliably hangs
// against it for this app's first DDL statement -- confirmed by testing with pooling on and
// off -- so pooling is disabled here; each logical unit of work opens its own connection
// instead (see OpenConnectionAsync usage in Program.cs and DbSeeder for places that batch many
// operations onto one explicitly-held-open connection, to avoid opening hundreds of them).
if (!connectionString.Contains("Pooling=", StringComparison.OrdinalIgnoreCase)) connectionString += ";Pooling=false";
builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));

static string? ConvertDatabaseUrl(string? url)
{
    if (string.IsNullOrWhiteSpace(url)) return null;
    var uri = new Uri(url);
    var userInfo = uri.UserInfo.Split(':', 2);
    return $"Host={uri.Host};Port={(uri.Port > 0 ? uri.Port : 5432)};Database={uri.AbsolutePath.TrimStart('/')};" +
           $"Username={Uri.UnescapeDataString(userInfo[0])};Password={Uri.UnescapeDataString(userInfo.Length > 1 ? userInfo[1] : "")};SSL Mode=Require;Trust Server Certificate=true";
}

builder.Services.AddHttpClient<MlServiceClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["MlService:BaseUrl"] ?? "http://127.0.0.1:8000");
    client.Timeout = TimeSpan.FromSeconds(60);
});
builder.Services.AddHttpClient<GeoLocationService>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["GeoService:BaseUrl"] ?? "http://ip-api.com");
    client.Timeout = TimeSpan.FromSeconds(4);
});

builder.Services.AddScoped<SettingsService>();
builder.Services.AddScoped<AuditService>();
builder.Services.AddScoped<TransactionProcessor>();
builder.Services.AddScoped<TransactionDetailService>();
builder.Services.AddScoped<EvaluationService>();
builder.Services.AddSingleton<PgpService>();
builder.Services.AddSingleton<TokenService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        var tokenService = new TokenService(builder.Configuration);
        options.TokenValidationParameters = tokenService.ValidationParameters;
    });
builder.Services.AddAuthorization(options =>
{
    // Only the Admin sub-role may change rules, settings and the database.
    options.AddPolicy("AdminOnly", p => p.RequireRole("Admin").RequireClaim("adminRole", "Admin"));
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var sp = scope.ServiceProvider;
    var logger = sp.GetRequiredService<ILogger<Program>>();
    var db = sp.GetRequiredService<AppDbContext>();
    var pgp = sp.GetRequiredService<PgpService>();

    // Migrating and seeding make many small round trips (one per row in the demo history).
    // With connection pooling disabled (see above), each would otherwise open and close its
    // own physical connection to Supabase; holding one open for this whole block keeps
    // start-up to a single connection instead of hundreds.
    await db.Database.OpenConnectionAsync();
    try
    {
        await DbSeeder.SeedCoreAsync(db, pgp);

        // Demo history needs the ML service (real probabilities); retry briefly while it starts.
        var ml = sp.GetRequiredService<MlServiceClient>();
        for (var attempt = 0; attempt < 10 && !await ml.IsAvailableAsync(); attempt++) await Task.Delay(1500);
        var created = await DbSeeder.SeedDemoHistoryAsync(db, pgp, ml, sp.GetRequiredService<SettingsService>(), logger);
        if (created > 0) logger.LogInformation("Seeded {Count} demo transactions.", created);
    }
    finally
    {
        await db.Database.CloseConnectionAsync();
    }
}

if (app.Environment.IsDevelopment()) app.MapOpenApi();

app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
