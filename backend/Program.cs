using FraudDetection.Api.Data;
using FraudDetection.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
        policy.WithOrigins("http://localhost:3000", "http://localhost:3001").AllowAnyHeader().AllowAnyMethod());
});

// SQLite database, created and evolved through EF Core migrations (applied at start-up).
var dbPath = Path.Combine(builder.Environment.ContentRootPath, "frauddetection.db");
builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite($"Data Source={dbPath}"));

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
    await DbSeeder.SeedCoreAsync(db, pgp);

    // Demo history needs the ML service (real probabilities); retry briefly while it starts.
    var ml = sp.GetRequiredService<MlServiceClient>();
    for (var attempt = 0; attempt < 10 && !await ml.IsAvailableAsync(); attempt++) await Task.Delay(1500);
    var created = await DbSeeder.SeedDemoHistoryAsync(db, pgp, ml, sp.GetRequiredService<SettingsService>(), logger);
    if (created > 0) logger.LogInformation("Seeded {Count} demo transactions.", created);
}

if (app.Environment.IsDevelopment()) app.MapOpenApi();

app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
