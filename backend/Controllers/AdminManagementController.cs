using System.Text.Json;
using FraudDetection.Api.Data;
using FraudDetection.Api.Models;
using FraudDetection.Api.Rules;
using FraudDetection.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FraudDetection.Api.Controllers;

// ---------------------------------------------------------------------- customers
[ApiController]
[Route("api/admin/customers")]
[Authorize(Roles = "Admin")]
public class AdminCustomersController(AppDbContext db, AuditService audit, PgpService pgp) : AdminBase(db, audit)
{
    [HttpGet]
    public async Task<object> List(string? q, string? kyc, string? segment, int page = 1, int pageSize = 20)
    {
        var query = Db.Customers.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(q)) { var s = q.Trim(); query = query.Where(c => c.FullName.Contains(s) || c.Email.Contains(s) || c.Phone.Contains(s)); }
        if (Enum.TryParse<KycStatus>(kyc, out var k)) query = query.Where(c => c.Kyc == k);
        if (!string.IsNullOrEmpty(segment)) query = query.Where(c => c.Segment == segment);
        var total = await query.CountAsync();
        var page1 = await query.OrderBy(c => c.FullName).Skip((Math.Max(page, 1) - 1) * pageSize).Take(pageSize).ToListAsync();
        var ids = page1.Select(c => c.Id).ToList();

        var stats = await Db.Transactions.AsNoTracking().Where(t => ids.Contains(t.Account!.CustomerId) && t.Screening != null)
            .GroupBy(t => t.Account!.CustomerId)
            .Select(g => new
            {
                CustomerId = g.Key, Count = g.Count(), Avg = g.Average(t => (double)t.Screening!.RiskScore),
                Flagged = g.Count(t => t.Status == TransactionStatus.PendingReview), Blocked = g.Count(t => t.Status == TransactionStatus.Blocked),
                Last = g.Max(t => t.CreatedAt),
            }).ToListAsync();
        var balances = await Db.Accounts.AsNoTracking().Where(a => ids.Contains(a.CustomerId)).GroupBy(a => a.CustomerId).Select(g => new { g.Key, Balance = g.Sum(a => a.Balance) }).ToListAsync();

        return new
        {
            total, page, pageSize,
            items = page1.Select(c =>
            {
                var s = stats.FirstOrDefault(x => x.CustomerId == c.Id);
                return new
                {
                    c.Id, c.FullName, c.Email, c.Phone, c.Segment, kyc = c.Kyc.ToString(), c.Status, c.CreatedAt,
                    balance = balances.FirstOrDefault(b => b.Key == c.Id)?.Balance ?? 0,
                    transactions = s?.Count ?? 0, averageScore = Math.Round(s?.Avg ?? 0, 1), flagged = s?.Flagged ?? 0, blocked = s?.Blocked ?? 0, lastActivity = s?.Last,
                };
            }),
        };
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Detail(int id)
    {
        var c = await Db.Customers.AsNoTracking().Include(x => x.Accounts).FirstOrDefaultAsync(x => x.Id == id);
        if (c is null) return NotFound();
        var accountIds = c.Accounts.Select(a => a.Id).ToList();
        var txns = await Db.Transactions.AsNoTracking().Include(t => t.Screening).Where(t => accountIds.Contains(t.AccountId)).OrderByDescending(t => t.CreatedAt).Take(60).ToListAsync();
        var devices = await Db.Devices.AsNoTracking().Where(d => d.CustomerId == id).OrderByDescending(d => d.LastSeenAt).ToListAsync();
        var logins = await Db.LoginEvents.AsNoTracking().Where(l => l.CustomerId == id).OrderByDescending(l => l.CreatedAt).Take(25).ToListAsync();
        var changes = await Db.ProfileChanges.AsNoTracking().Where(x => x.CustomerId == id).OrderByDescending(x => x.ChangedAt).Take(15).ToListAsync();
        var otherSamePhone = await Db.Customers.AsNoTracking().Where(x => x.Phone == c.Phone && x.Id != id).Select(x => new { x.Id, x.FullName }).ToListAsync();
        var scored = txns.Where(t => t.Screening != null).ToList();
        return Ok(new
        {
            profile = new { c.Id, c.FullName, c.Email, c.Phone, c.Address, c.Segment, kyc = c.Kyc.ToString(), c.NameOnId, c.BvnLast4, c.Status, c.CreatedAt, c.HomeCountry, c.HomeCity, c.TravelNoticeCountry, c.TravelNoticeUntil },
            accounts = c.Accounts.Select(a => new { a.Id, masked = "••••" + a.AccountNumberLast4, a.Type, a.Balance, a.CreatedAt, a.LastActivityAt }),
            stats = new
            {
                transactions = txns.Count,
                approved = txns.Count(t => t.Status == TransactionStatus.Approved), flagged = txns.Count(t => t.Status == TransactionStatus.PendingReview),
                blocked = txns.Count(t => t.Status == TransactionStatus.Blocked), rejected = txns.Count(t => t.Status == TransactionStatus.Rejected),
                averageScore = scored.Count == 0 ? 0 : Math.Round(scored.Average(t => (double)t.Screening!.RiskScore), 1),
                maxScore = scored.Count == 0 ? 0 : scored.Max(t => t.Screening!.RiskScore),
                volume = txns.Where(t => t.Status == TransactionStatus.Approved).Sum(t => t.Amount),
            },
            transactions = txns.Select(t => new { t.Id, t.Reference, type = t.Type.ToString(), status = t.Status.ToString(), t.Amount, t.CounterpartyDisplay, t.Country, t.City, score = t.Screening?.RiskScore ?? 0, tier = t.Screening?.RiskTier ?? "-", failed = t.Screening?.ChecksFailed ?? 0, t.CreatedAt }),
            devices = devices.Select(d => new { d.Id, d.Label, d.Fingerprint, d.FirstSeenAt, d.LastSeenAt, d.Trusted }),
            logins = logins.Select(l => new { l.Id, l.Success, l.Ip, l.Country, l.City, l.DeviceFingerprint, l.Simulated, l.CreatedAt }),
            changes = changes.Select(x => new { x.Id, x.Field, x.Detail, x.ChangedAt }),
            linkedCustomers = otherSamePhone,
            beneficiaries = await Db.Beneficiaries.CountAsync(b => b.CustomerId == id),
        });
    }

    public record StatusRequest(string Status, string? Reason);

    [HttpPost("{id:int}/status")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> SetStatus(int id, [FromBody] StatusRequest req)
    {
        var c = await Db.Customers.FindAsync(id);
        if (c is null) return NotFound();
        if (req.Status is not ("Active" or "Suspended")) return BadRequest(new { message = "Status must be Active or Suspended." });
        c.Status = req.Status;
        Audit.Add(Actor, ActorRole, req.Status == "Suspended" ? "CustomerSuspended" : "CustomerReactivated", "Customer", id.ToString(), req.Reason ?? "");
        Db.Notifications.Add(new Notification { CustomerId = id, Kind = "Security", Title = req.Status == "Suspended" ? "Account suspended" : "Account reactivated", Body = req.Status == "Suspended" ? "Your account has been suspended pending a security review." : "Your account is active again." });
        await Db.SaveChangesAsync();
        return Ok(new { c.Status });
    }
}

// ---------------------------------------------------------------------- rules and settings
[ApiController]
[Route("api/admin")]
[Authorize(Roles = "Admin")]
public class AdminRulesController(AppDbContext db, AuditService audit, SettingsService settings) : AdminBase(db, audit)
{
    [HttpGet("rules")]
    public async Task<object> Rules()
    {
        var defs = await Db.RuleDefinitions.AsNoTracking().OrderBy(r => r.Code).ToListAsync();
        var since = DateTime.UtcNow.AddDays(-30);
        var stats = await Db.RuleEvaluations.AsNoTracking()
            .Where(e => e.Screening!.Transaction!.CreatedAt >= since && e.Outcome != "NotApplicable")
            .GroupBy(e => e.RuleCode)
            .Select(g => new { Code = g.Key, Evaluated = g.Count(), Failed = g.Count(e => e.Outcome == "Fail") }).ToListAsync();

        return new
        {
            rules = defs.Select(d =>
            {
                var spec = RuleCatalog.Find(d.Code);
                var s = stats.FirstOrDefault(x => x.Code == d.Code);
                var p = RuleEngine.ParseParams(d.ParametersJson);
                return new
                {
                    d.Code, d.Category, d.Name, d.Description, d.Points, d.Action, d.Enabled, d.UpdatedAt, d.UpdatedBy,
                    defaultPoints = spec?.Points ?? d.Points,
                    parameters = (spec?.Params ?? []).Select(m => new { m.Key, m.Label, m.Unit, value = p.GetValueOrDefault(m.Key, m.Default), @default = m.Default }),
                    evaluated30d = s?.Evaluated ?? 0, triggered30d = s?.Failed ?? 0,
                    triggerRate = s is null || s.Evaluated == 0 ? 0 : Math.Round(100.0 * s.Failed / s.Evaluated, 1),
                };
            }),
            risk = await settings.GetRiskAsync(),
        };
    }

    [HttpGet("rules/export")]
    public async Task<IActionResult> ExportRules()
    {
        var defs = await Db.RuleDefinitions.AsNoTracking().OrderBy(r => r.Code).ToListAsync();
        var sheet = new ExcelExport.Sheet("Rules engine",
            ["Code", "Category", "Rule", "Description", "Points", "Action", "Enabled", "Parameters", "Last updated (UTC)", "Updated by"],
            defs.Select(d =>
            {
                var spec = RuleCatalog.Find(d.Code);
                var p = RuleEngine.ParseParams(d.ParametersJson);
                var ptxt = string.Join("; ", (spec?.Params ?? []).Select(m => $"{m.Label}: {p.GetValueOrDefault(m.Key, m.Default)} {m.Unit}"));
                return new object?[] { d.Code, d.Category, d.Name, d.Description, d.Points, d.Action, d.Enabled, ptxt, d.UpdatedAt, d.UpdatedBy };
            }).ToList());
        return File(ExcelExport.Workbook("Rules engine", sheet), ExcelExport.ContentType, "rules-engine.xlsx");
    }

    public record RuleUpdate(bool Enabled, int Points, Dictionary<string, string>? Parameters);

    [HttpPut("rules/{code}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> UpdateRule(string code, [FromBody] RuleUpdate req)
    {
        var d = await Db.RuleDefinitions.FirstOrDefaultAsync(r => r.Code == code);
        var spec = RuleCatalog.Find(code);
        if (d is null || spec is null) return NotFound();
        if (req.Points is < 0 or > 100) return BadRequest(new { message = "Points must be between 0 and 100." });

        var current = RuleEngine.ParseParams(d.ParametersJson);
        var before = $"enabled={d.Enabled}, points={d.Points}, params={d.ParametersJson}";
        if (req.Parameters is not null)
            foreach (var m in spec.Params)
                if (req.Parameters.TryGetValue(m.Key, out var v) && !string.IsNullOrWhiteSpace(v)) current[m.Key] = v.Trim();
        d.Enabled = req.Enabled; d.Points = req.Points; d.ParametersJson = RuleEngine.SerializeParams(current);
        d.UpdatedAt = DateTime.UtcNow; d.UpdatedBy = Actor;
        Audit.Add(Actor, ActorRole, "RuleUpdated", "Rule", code, $"{before} -> enabled={d.Enabled}, points={d.Points}, params={d.ParametersJson}");
        await Db.SaveChangesAsync();
        return Ok();
    }

    [HttpPost("rules/{code}/reset")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> ResetRule(string code)
    {
        var d = await Db.RuleDefinitions.FirstOrDefaultAsync(r => r.Code == code);
        var spec = RuleCatalog.Find(code);
        if (d is null || spec is null) return NotFound();
        d.Points = spec.Points; d.Enabled = true; d.ParametersJson = RuleEngine.SerializeParams(spec.DefaultParams()); d.UpdatedAt = DateTime.UtcNow; d.UpdatedBy = Actor;
        Audit.Add(Actor, ActorRole, "RuleReset", "Rule", code, "Reset to catalogue defaults.");
        await Db.SaveChangesAsync();
        return Ok();
    }

    public record SettingsUpdate(double RuleWeight, double MlWeight, int LowMax, int MediumMax, double StudentMultiplier, double StandardMultiplier, double PremiumMultiplier);

    [HttpPut("settings")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> UpdateSettings([FromBody] SettingsUpdate s)
    {
        if (s.RuleWeight < 0 || s.MlWeight < 0 || Math.Abs(s.RuleWeight + s.MlWeight - 1) > 0.001)
            return BadRequest(new { message = "The rule and ML weights must be non-negative and add up to 1." });
        if (s.LowMax < 0 || s.MediumMax <= s.LowMax || s.MediumMax >= 100)
            return BadRequest(new { message = "Bands must satisfy 0 <= Low max < Medium max < 100." });
        if (s.StudentMultiplier <= 0 || s.StandardMultiplier <= 0 || s.PremiumMultiplier <= 0)
            return BadRequest(new { message = "Segment multipliers must be greater than zero." });

        var inv = System.Globalization.CultureInfo.InvariantCulture;
        var before = await settings.GetRiskAsync();
        await settings.SetAsync(SettingKeys.RuleWeight, s.RuleWeight.ToString(inv));
        await settings.SetAsync(SettingKeys.MlWeight, s.MlWeight.ToString(inv));
        await settings.SetAsync(SettingKeys.LowMax, s.LowMax.ToString(inv));
        await settings.SetAsync(SettingKeys.MediumMax, s.MediumMax.ToString(inv));
        await settings.SetAsync(SettingKeys.Student, s.StudentMultiplier.ToString(inv));
        await settings.SetAsync(SettingKeys.Standard, s.StandardMultiplier.ToString(inv));
        await settings.SetAsync(SettingKeys.Premium, s.PremiumMultiplier.ToString(inv));
        Audit.Add(Actor, ActorRole, "RiskSettingsUpdated", "Settings", "risk", $"{JsonSerializer.Serialize(before)} -> {JsonSerializer.Serialize(s)}");
        await Db.SaveChangesAsync();
        return Ok(await settings.GetRiskAsync());
    }

    // ------------------------------------------------------------------ IP blacklist
    [HttpGet("blacklist")]
    public async Task<object> Blacklist() => await Db.IpBlacklist.AsNoTracking().OrderByDescending(b => b.AddedAt).ToListAsync();

    public record BlacklistRequest(string Ip, string Kind, string Reason);

    [HttpPost("blacklist")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> AddBlacklist([FromBody] BlacklistRequest req)
    {
        var ip = (req.Ip ?? "").Trim();
        if (!System.Net.IPAddress.TryParse(ip, out _)) return BadRequest(new { message = "Enter a valid IP address." });
        if (await Db.IpBlacklist.AnyAsync(b => b.Ip == ip)) return Conflict(new { message = "That IP is already on the blacklist." });
        Db.IpBlacklist.Add(new IpBlacklistEntry { Ip = ip, Kind = string.IsNullOrWhiteSpace(req.Kind) ? "VPN" : req.Kind, Reason = req.Reason ?? "" });
        Audit.Add(Actor, ActorRole, "BlacklistAdded", "Blacklist", ip, req.Reason ?? "");
        await Db.SaveChangesAsync();
        return Ok();
    }

    [HttpDelete("blacklist/{id:int}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> RemoveBlacklist(int id)
    {
        var b = await Db.IpBlacklist.FindAsync(id);
        if (b is null) return NotFound();
        Db.IpBlacklist.Remove(b);
        Audit.Add(Actor, ActorRole, "BlacklistRemoved", "Blacklist", b.Ip, "");
        await Db.SaveChangesAsync();
        return NoContent();
    }
}

// ---------------------------------------------------------------------- model performance
[ApiController]
[Route("api/admin/model")]
[Authorize(Roles = "Admin")]
public class AdminModelController(AppDbContext db, AuditService audit, MlServiceClient ml, EvaluationService evaluation) : AdminBase(db, audit)
{
    [HttpGet]
    public async Task<object> Info()
    {
        object? training = null, metrics = null; var online = false;
        try { training = await ml.GetTrainingInfoAsync(); metrics = await ml.GetMetricsAsync(); online = true; } catch { }
        var latest = await Db.EvaluationRuns.AsNoTracking().OrderByDescending(r => r.CreatedAt).FirstOrDefaultAsync();
        return new
        {
            online, training, metrics,
            defaultScenario = new ScenarioConfig(),
            latest = latest is null ? null : new { latest.Id, latest.CreatedAt, latest.CreatedBy, latest.Seed, latest.Rows, result = JsonSerializer.Deserialize<JsonElement>(latest.ResultJson) },
        };
    }

    [HttpGet("runs")]
    public async Task<object> Runs() =>
        (await Db.EvaluationRuns.AsNoTracking().OrderByDescending(r => r.CreatedAt).Take(30).ToListAsync())
            .Select(r =>
            {
                var res = JsonSerializer.Deserialize<JsonElement>(r.ResultJson);
                return new { r.Id, r.CreatedAt, r.CreatedBy, r.Seed, r.Rows, detectors = res.GetProperty("detectors") };
            });

    [HttpGet("runs/{id:int}")]
    public async Task<IActionResult> Run(int id)
    {
        var r = await Db.EvaluationRuns.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        if (r is null) return NotFound();
        return Ok(new { r.Id, r.CreatedAt, r.CreatedBy, r.Seed, r.Rows, config = JsonSerializer.Deserialize<JsonElement>(r.ConfigJson), result = JsonSerializer.Deserialize<JsonElement>(r.ResultJson) });
    }

    public record EvaluateRequest(int? Seed, int? Rows);

    [HttpPost("evaluate")]
    public async Task<IActionResult> Evaluate([FromBody] EvaluateRequest? req)
    {
        try
        {
            var run = await Task.Run(() => evaluation.RunAsync(Actor, req?.Seed ?? 42, req?.Rows, null));
            Audit.Add(Actor, ActorRole, "EvaluationRun", "EvaluationRun", run.Id.ToString(), $"Evaluated {run.Rows} transactions with seed {run.Seed}.");
            await Db.SaveChangesAsync();
            return Ok(new { run.Id });
        }
        catch (HttpRequestException)
        {
            return StatusCode(503, new { message = "The machine learning service is not reachable. Start it and try again." });
        }
    }

    [HttpGet("runs/{id:int}/export")]
    public async Task<IActionResult> Export(int id)
    {
        var r = await Db.EvaluationRuns.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        if (r is null) return NotFound();
        var res = JsonSerializer.Deserialize<JsonElement>(r.ResultJson);
        var names = new Dictionary<string, string>
        {
            ["rule"] = "Rule-based layer only", ["ml"] = "Machine learning layer only", ["hybrid"] = "Hybrid framework",
            ["logisticRegression"] = "Logistic regression only", ["decisionTree"] = "Decision tree only",
        };
        var detRows = new List<object?[]>();
        foreach (var d in res.GetProperty("detectors").EnumerateObject())
        {
            var v = d.Value;
            detRows.Add([names.GetValueOrDefault(d.Name, d.Name), v.GetProperty("tp").GetInt32(), v.GetProperty("fp").GetInt32(), v.GetProperty("tn").GetInt32(), v.GetProperty("fn").GetInt32(),
                v.GetProperty("precision").GetDouble(), v.GetProperty("recall").GetDouble(), v.GetProperty("f1").GetDouble(), v.GetProperty("falsePositiveRate").GetDouble(), v.GetProperty("accuracy").GetDouble()]);
        }
        var ruleRows = res.GetProperty("rules").EnumerateArray().Select(x => new object?[]
        {
            x.GetProperty("code").GetString(), x.GetProperty("name").GetString(), x.GetProperty("category").GetString(),
            x.GetProperty("triggeredOnFraud").GetInt32(), x.GetProperty("triggeredOnLegit").GetInt32(),
            x.GetProperty("precision").GetDouble(), x.GetProperty("fraudCoverage").GetDouble(), x.GetProperty("legitRate").GetDouble(),
        }).ToList();
        var info = new List<object?[]>
        {
            new object?[] { "Run id", id }, new object?[] { "Created (UTC)", r.CreatedAt }, new object?[] { "Created by", r.CreatedBy },
            new object?[] { "Random seed", r.Seed }, new object?[] { "Transactions evaluated", r.Rows },
            new object?[] { "Predicted fraud means", "Medium or High tier (flagged or blocked)" },
            new object?[] { "Scenario configuration (JSON)", r.ConfigJson },
        };
        var bytes = ExcelExport.Workbook($"Evaluation run {id}",
            new ExcelExport.Sheet("Detector comparison", ["Detector", "TP", "FP", "TN", "FN", "Precision", "Recall", "F1", "False positive rate", "Accuracy"], detRows),
            new ExcelExport.Sheet("Rule effectiveness", ["Code", "Rule", "Category", "Triggered on fraud", "Triggered on legitimate", "Precision", "Fraud coverage", "Legitimate rate"], ruleRows),
            new ExcelExport.Sheet("Run details", ["Item", "Value"], info));
        return File(bytes, ExcelExport.ContentType, $"evaluation-run-{id}.xlsx");
    }
}

// ---------------------------------------------------------------------- audit log
[ApiController]
[Route("api/admin/audit")]
[Authorize(Roles = "Admin")]
public class AdminAuditController(AppDbContext db, AuditService audit) : AdminBase(db, audit)
{
    private IQueryable<AuditLog> Query(string? actor, string? action, string? role, string? q, DateTime? from, DateTime? to)
    {
        var query = Db.AuditLogs.AsNoTracking().AsQueryable();
        if (!string.IsNullOrEmpty(actor)) query = query.Where(a => a.Actor.Contains(actor));
        if (!string.IsNullOrEmpty(action)) query = query.Where(a => a.Action == action);
        if (!string.IsNullOrEmpty(role)) query = query.Where(a => a.ActorRole == role);
        if (from is not null) query = query.Where(a => a.CreatedAt >= from);
        if (to is not null) query = query.Where(a => a.CreatedAt <= to.Value.AddDays(1));
        if (!string.IsNullOrWhiteSpace(q)) query = query.Where(a => a.Detail.Contains(q) || a.EntityId == q);
        return query;
    }

    [HttpGet]
    public async Task<object> List(string? actor, string? action, string? role, string? q, DateTime? from, DateTime? to, int page = 1, int pageSize = 25)
    {
        var query = Query(actor, action, role, q, from, to);
        var total = await query.CountAsync();
        var items = await query.OrderByDescending(a => a.CreatedAt).Skip((Math.Max(page, 1) - 1) * pageSize).Take(pageSize).ToListAsync();
        var actions = await Db.AuditLogs.AsNoTracking().Select(a => a.Action).Distinct().OrderBy(a => a).ToListAsync();
        return new { total, page, pageSize, items, actions };
    }

    // Excel (.xlsx) export of the audit trail, honouring the filters chosen on the page.
    [HttpGet("export")]
    public async Task<IActionResult> Export(string? actor, string? action, string? role, string? q, DateTime? from, DateTime? to)
    {
        var rows = await Query(actor, action, role, q, from, to).OrderByDescending(a => a.CreatedAt).Take(50000).ToListAsync();
        var sheet = new ExcelExport.Sheet("Audit log",
            ["Time (UTC)", "Actor", "Role", "Action", "Entity type", "Entity id", "Detail"],
            rows.Select(a => new object?[] { a.CreatedAt, a.Actor, a.ActorRole, a.Action, a.EntityType, a.EntityId, a.Detail }).ToList());
        Audit.Add(Actor, ActorRole, "AuditLogExported", "Report", "audit-log", $"{rows.Count} audit entries exported to Excel.");
        await Db.SaveChangesAsync();
        return File(ExcelExport.Workbook("Audit log", sheet), ExcelExport.ContentType, $"audit-log-{DateTime.UtcNow:yyyyMMdd-HHmm}.xlsx");
    }
}

// ---------------------------------------------------------------------- database management
[ApiController]
[Route("api/admin/database")]
[Authorize(Policy = "AdminOnly")]
public class AdminDatabaseController(
    AppDbContext db, AuditService audit, IWebHostEnvironment env, PgpService pgp, MlServiceClient ml,
    SettingsService settings, ILogger<AdminDatabaseController> logger) : AdminBase(db, audit)
{
    private string DbPath => Path.Combine(env.ContentRootPath, "frauddetection.db");
    private string BackupDir => Path.Combine(env.ContentRootPath, "backups");

    [HttpGet]
    public async Task<object> Info()
    {
        var tables = new List<object>();
        foreach (var e in Db.Model.GetEntityTypes().OrderBy(e => e.GetTableName()))
        {
            var name = e.GetTableName()!;
            var count = await Db.Database.SqlQueryRaw<int>($"SELECT COUNT(*) AS Value FROM \"{name}\"").FirstAsync();
            tables.Add(new { name, rows = count, columns = e.GetProperties().Count(), indexes = e.GetIndexes().Count() });
        }
        Directory.CreateDirectory(BackupDir);
        var backups = new DirectoryInfo(BackupDir).GetFiles("*.db").OrderByDescending(f => f.CreationTimeUtc)
            .Select(f => new { f.Name, sizeBytes = f.Length, createdAt = f.CreationTimeUtc }).ToList();
        return new
        {
            provider = Db.Database.ProviderName, file = Path.GetFileName(DbPath),
            sizeBytes = System.IO.File.Exists(DbPath) ? new FileInfo(DbPath).Length : 0,
            applied = (await Db.Database.GetAppliedMigrationsAsync()).ToList(),
            pending = (await Db.Database.GetPendingMigrationsAsync()).ToList(),
            tables, backups, encryption = "OpenPGP (RSA-2048 + AES-256) for account numbers, counterparties and raw payloads; BCrypt for passwords and PINs",
        };
    }

    [HttpPost("backup")]
    public async Task<IActionResult> Backup()
    {
        Directory.CreateDirectory(BackupDir);
        var name = $"frauddetection-{DateTime.UtcNow:yyyyMMdd-HHmmss}.db";
        var path = Path.Combine(BackupDir, name);
        await Db.Database.ExecuteSqlRawAsync($"VACUUM INTO '{path.Replace("'", "''")}'");
        Audit.Add(Actor, ActorRole, "DatabaseBackup", "Database", name, $"Backup created ({new FileInfo(path).Length} bytes).");
        await Db.SaveChangesAsync();
        return Ok(new { name });
    }

    [HttpGet("backups/{name}")]
    public IActionResult Download(string name)
    {
        var path = Path.Combine(BackupDir, Path.GetFileName(name));
        if (!System.IO.File.Exists(path)) return NotFound();
        return PhysicalFile(path, "application/octet-stream", Path.GetFileName(path));
    }

    [HttpPost("integrity")]
    public async Task<object> Integrity()
    {
        var result = await Db.Database.SqlQueryRaw<string>("PRAGMA integrity_check").ToListAsync();
        var fk = await Db.Database.SqlQueryRaw<string>("PRAGMA foreign_key_check").ToListAsync();
        Audit.Add(Actor, ActorRole, "DatabaseIntegrityCheck", "Database", "sqlite", string.Join("; ", result));
        await Db.SaveChangesAsync();
        return new { integrity = result, foreignKeyViolations = fk.Count };
    }

    [HttpPost("optimize")]
    public async Task<object> Optimize()
    {
        var before = new FileInfo(DbPath).Length;
        await Db.Database.ExecuteSqlRawAsync("ANALYZE");
        await Db.Database.ExecuteSqlRawAsync("VACUUM");
        var after = new FileInfo(DbPath).Length;
        Audit.Add(Actor, ActorRole, "DatabaseOptimized", "Database", "sqlite", $"ANALYZE + VACUUM: {before} -> {after} bytes.");
        await Db.SaveChangesAsync();
        return new { before, after };
    }

    [HttpPost("seed-demo")]
    public async Task<object> SeedDemo()
    {
        var n = await DbSeeder.SeedDemoHistoryAsync(Db, pgp, ml, settings, logger);
        Audit.Add(Actor, ActorRole, "DemoDataSeeded", "Database", "demo", n < 0 ? "ML service offline" : $"{n} transactions created");
        await Db.SaveChangesAsync();
        return new { created = n, message = n < 0 ? "The ML service is offline." : n == 0 ? "Demo history already exists." : $"Created {n} demo transactions." };
    }
}
