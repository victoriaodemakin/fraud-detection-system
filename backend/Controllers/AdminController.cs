using System.Security.Claims;
using System.Text;
using FraudDetection.Api.Data;
using FraudDetection.Api.Models;
using FraudDetection.Api.Rules;
using FraudDetection.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FraudDetection.Api.Controllers;

public abstract class AdminBase(AppDbContext db, AuditService audit) : ControllerBase
{
    protected AppDbContext Db => db;
    protected AuditService Audit => audit;
    protected string Actor => User.FindFirstValue(ClaimTypes.Name) ?? "unknown";
    protected string ActorRole => User.FindFirst("adminRole")?.Value ?? "Analyst";

    protected static string Csv(string? v)
    {
        v ??= "";
        return v.Contains(',') || v.Contains('"') || v.Contains('\n') ? "\"" + v.Replace("\"", "\"\"") + "\"" : v;
    }
}

[ApiController]
[Route("api/admin")]
[Authorize(Roles = "Admin")]
public class AdminController(
    AppDbContext db,
    AuditService audit,
    TransactionDetailService details,
    PgpService pgp,
    MlServiceClient ml) : AdminBase(db, audit)
{
    // ------------------------------------------------------------------ overview
    [HttpGet("overview")]
    public async Task<object> Overview(int days = 14)
    {
        days = Math.Clamp(days, 1, 90);
        var now = DateTime.UtcNow;
        var since = now.Date.AddDays(-(days - 1));
        var all = Db.ScreeningRecords.AsNoTracking();

        var rows = await Db.Transactions.AsNoTracking()
            .Where(t => t.CreatedAt >= since && t.Screening != null)
            .Select(t => new { t.Id, t.CreatedAt, t.Status, t.Type, t.Amount, Score = t.Screening!.RiskScore, Tier = t.Screening.RiskTier, Failed = t.Screening.ChecksFailed })
            .ToListAsync();

        var totalScreened = await all.CountAsync();
        var pendingAll = await Db.Transactions.CountAsync(t => t.Status == TransactionStatus.PendingReview);
        var oldestPending = await Db.Transactions.Where(t => t.Status == TransactionStatus.PendingReview).OrderBy(t => t.CreatedAt).Select(t => (DateTime?)t.CreatedAt).FirstOrDefaultAsync();
        var todayRows = rows.Where(r => r.CreatedAt.Date == now.Date).ToList();

        var series = Enumerable.Range(0, days).Select(i => since.AddDays(i)).Select(d =>
        {
            var day = rows.Where(r => r.CreatedAt.Date == d).ToList();
            return new
            {
                date = d.ToString("dd MMM"),
                screened = day.Count,
                approved = day.Count(r => r.Status == TransactionStatus.Approved),
                flagged = day.Count(r => r.Status == TransactionStatus.PendingReview),
                blocked = day.Count(r => r.Status == TransactionStatus.Blocked),
                rejected = day.Count(r => r.Status == TransactionStatus.Rejected),
                averageScore = day.Count == 0 ? 0 : Math.Round(day.Average(r => (double)r.Score), 1),
            };
        }).ToList();

        var tiers = new[] { "Low", "Medium", "High" }.Select(t => new { tier = t, count = rows.Count(r => r.Tier == t) }).ToList();
        var byType = rows.GroupBy(r => r.Type.ToString()).Select(g => new { type = g.Key, count = g.Count(), averageScore = Math.Round(g.Average(r => (double)r.Score), 1), amount = g.Sum(r => r.Amount) }).OrderByDescending(x => x.count).ToList();
        var histogram = Enumerable.Range(0, 10).Select(b => new { range = $"{b * 10}-{b * 10 + 9}", count = rows.Count(r => Math.Min(9, r.Score / 10) == b) }).ToList();

        var failedRules = await Db.RuleEvaluations.AsNoTracking()
            .Where(e => e.Outcome == "Fail" && e.Screening!.Transaction!.CreatedAt >= since)
            .GroupBy(e => new { e.RuleCode, e.RuleName, e.Category })
            .Select(g => new { code = g.Key.RuleCode, name = g.Key.RuleName, category = g.Key.Category, count = g.Count() })
            .OrderByDescending(x => x.count).Take(10).ToListAsync();
        var byCategory = failedRules.GroupBy(r => r.category).Select(g => new { category = g.Key, count = g.Sum(x => x.count) }).OrderByDescending(x => x.count).ToList();

        var alerts = await Db.Transactions.AsNoTracking().Include(t => t.Account).ThenInclude(a => a!.Customer).Include(t => t.Screening)
            .Where(t => t.Status == TransactionStatus.PendingReview || t.Status == TransactionStatus.Blocked)
            .OrderByDescending(t => t.CreatedAt).Take(8)
            .Select(t => new { t.Id, t.Reference, customer = t.Account!.Customer!.FullName, type = t.Type.ToString(), status = t.Status.ToString(), t.Amount, score = t.Screening!.RiskScore, tier = t.Screening.RiskTier, failed = t.Screening.ChecksFailed, t.CreatedAt })
            .ToListAsync();

        object? model = null;
        try { model = new { training = await ml.GetTrainingInfoAsync(), metrics = await ml.GetMetricsAsync() }; } catch { /* ML service offline */ }

        var decided = rows.Count(r => r.Status is TransactionStatus.Approved or TransactionStatus.Rejected or TransactionStatus.Blocked or TransactionStatus.PendingReview);
        return new
        {
            days,
            kpis = new
            {
                totalScreened,
                screenedToday = todayRows.Count,
                pendingReview = pendingAll,
                oldestPendingHours = oldestPending is null ? 0 : Math.Round((now - oldestPending.Value).TotalHours, 1),
                blocked = rows.Count(r => r.Status == TransactionStatus.Blocked),
                approved = rows.Count(r => r.Status == TransactionStatus.Approved),
                rejected = rows.Count(r => r.Status == TransactionStatus.Rejected),
                approvalRate = decided == 0 ? 0 : Math.Round(100.0 * rows.Count(r => r.Status == TransactionStatus.Approved) / decided, 1),
                averageRiskScore = rows.Count == 0 ? 0 : Math.Round(rows.Average(r => (double)r.Score), 1),
                valueApproved = rows.Where(r => r.Status == TransactionStatus.Approved).Sum(r => r.Amount),
                valueAtRisk = rows.Where(r => r.Status is TransactionStatus.PendingReview or TransactionStatus.Blocked).Sum(r => r.Amount),
                customers = await Db.Customers.CountAsync(),
                activeRules = await Db.RuleDefinitions.CountAsync(r => r.Enabled),
                totalRules = await Db.RuleDefinitions.CountAsync(),
            },
            series, tiers, byType, histogram, topRules = failedRules, ruleCategories = byCategory, alerts, model,
        };
    }

    // ------------------------------------------------------------------ live monitor
    [HttpGet("monitor")]
    public async Task<object> Monitor(int take = 40)
    {
        var items = await Db.Transactions.AsNoTracking().Include(t => t.Account).ThenInclude(a => a!.Customer).Include(t => t.Screening).ThenInclude(s => s!.Evaluations)
            .OrderByDescending(t => t.CreatedAt).Take(Math.Clamp(take, 5, 100)).ToListAsync();
        return new
        {
            serverTime = DateTime.UtcNow,
            items = items.Select(t => new
            {
                t.Id, t.Reference, customer = t.Account!.Customer!.FullName, type = t.Type.ToString(), status = t.Status.ToString(), t.Amount,
                country = t.Country, city = t.City,
                score = t.Screening?.RiskScore ?? 0, tier = t.Screening?.RiskTier ?? "-", decision = t.Screening?.Decision ?? "-",
                ruleScore = t.Screening?.RuleScore ?? 0, ml = t.Screening?.CombinedMlProbability ?? 0,
                failed = t.Screening?.ChecksFailed ?? 0,
                topRules = t.Screening?.Evaluations.Where(e => e.Outcome == "Fail").OrderByDescending(e => e.Points).Take(3).Select(e => e.RuleName).ToList() ?? [],
                t.CreatedAt,
            }),
        };
    }

    // ------------------------------------------------------------------ transactions
    private IQueryable<Transaction> Filtered(string? status, string? tier, string? type, string? q, int? minScore, int? maxScore, int? customerId, DateTime? from, DateTime? to, string? rule)
    {
        var query = Db.Transactions.AsNoTracking().Include(t => t.Account).ThenInclude(a => a!.Customer).Include(t => t.Screening).Where(t => t.Screening != null);
        if (Enum.TryParse<TransactionStatus>(status, out var st)) query = query.Where(t => t.Status == st);
        if (!string.IsNullOrEmpty(tier)) query = query.Where(t => t.Screening!.RiskTier == tier);
        if (Enum.TryParse<TransactionType>(type, out var ty)) query = query.Where(t => t.Type == ty);
        if (minScore is not null) query = query.Where(t => t.Screening!.RiskScore >= minScore);
        if (maxScore is not null) query = query.Where(t => t.Screening!.RiskScore <= maxScore);
        if (customerId is not null) query = query.Where(t => t.Account!.CustomerId == customerId);
        if (from is not null) query = query.Where(t => t.CreatedAt >= from);
        if (to is not null) query = query.Where(t => t.CreatedAt <= to.Value.AddDays(1));
        if (!string.IsNullOrEmpty(rule)) query = query.Where(t => t.Screening!.Evaluations.Any(e => e.RuleCode == rule && e.Outcome == "Fail"));
        if (!string.IsNullOrWhiteSpace(q))
        {
            var s = q.Trim();
            query = query.Where(t => t.Reference.Contains(s) || t.Account!.Customer!.FullName.Contains(s) || t.CounterpartyDisplay.Contains(s));
        }
        return query;
    }

    [HttpGet("transactions")]
    public async Task<object> Transactions(string? status, string? tier, string? type, string? q, int? minScore, int? maxScore, int? customerId,
        DateTime? from, DateTime? to, string? rule, string? sort, int page = 1, int pageSize = 20)
    {
        var query = Filtered(status, tier, type, q, minScore, maxScore, customerId, from, to, rule);
        var total = await query.CountAsync();
        query = sort switch
        {
            "score" => query.OrderByDescending(t => t.Screening!.RiskScore).ThenByDescending(t => t.CreatedAt),
            "amount" => query.OrderByDescending(t => (double)t.Amount),
            "oldest" => query.OrderBy(t => t.CreatedAt),
            _ => query.OrderByDescending(t => t.CreatedAt),
        };
        var items = await query.Skip((Math.Max(page, 1) - 1) * pageSize).Take(Math.Clamp(pageSize, 5, 100)).ToListAsync();
        var counts = await Db.Transactions.AsNoTracking().GroupBy(t => t.Status).Select(g => new { status = g.Key.ToString(), count = g.Count() }).ToListAsync();
        return new
        {
            total, page, pageSize, counts,
            items = items.Select(t => new
            {
                t.Id, t.Reference, customerId = t.Account!.CustomerId, customer = t.Account.Customer!.FullName, segment = t.Account.Customer.Segment,
                type = t.Type.ToString(), status = t.Status.ToString(), t.Amount, t.CounterpartyDisplay, t.Channel, t.Country, t.City,
                score = t.Screening!.RiskScore, tier = t.Screening.RiskTier, decision = t.Screening.Decision,
                ruleScore = t.Screening.RuleScore, ml = t.Screening.CombinedMlProbability, failed = t.Screening.ChecksFailed, total = t.Screening.ChecksTotal, t.CreatedAt,
            }),
        };
    }

    [HttpGet("transactions/export")]
    public async Task<IActionResult> ExportTransactions(string? status, string? tier, string? type, string? q, int? minScore, int? maxScore, int? customerId, DateTime? from, DateTime? to, string? rule)
    {
        var rows = await Filtered(status, tier, type, q, minScore, maxScore, customerId, from, to, rule).OrderByDescending(t => t.CreatedAt).Take(5000).ToListAsync();
        var sheet = new ExcelExport.Sheet("Transactions",
            ["Reference", "Date (UTC)", "Customer", "Segment", "Type", "Amount (NGN)", "Status", "Country", "City", "Rule score", "ML probability", "Risk score", "Risk tier", "Decision", "Rules failed", "Rules evaluated"],
            rows.Select(t => new object?[]
            {
                t.Reference, t.CreatedAt, t.Account!.Customer!.FullName, t.Account.Customer.Segment, t.Type.ToString(), t.Amount, t.Status.ToString(),
                t.Country, t.City, t.Screening!.RuleScore, t.Screening.CombinedMlProbability, t.Screening.RiskScore, t.Screening.RiskTier,
                t.Screening.Decision, t.Screening.ChecksFailed, t.Screening.ChecksTotal,
            }).ToList());
        return File(ExcelExport.Workbook("Transactions", sheet), ExcelExport.ContentType, "transactions.xlsx");
    }

    [HttpGet("transactions/{id:int}")]
    public async Task<IActionResult> TransactionDetail(int id)
    {
        var d = await details.BuildAsync(id);
        if (d is null) return NotFound(new { message = "Transaction not found." });

        var customer = await Db.Customers.AsNoTracking().Include(c => c.Accounts).FirstAsync(c => c.Id == d.CustomerId);
        var accountIds = customer.Accounts.Select(a => a.Id).ToList();
        var history = await Db.Transactions.AsNoTracking().Include(t => t.Screening)
            .Where(t => accountIds.Contains(t.AccountId) && t.Id != id).OrderByDescending(t => t.CreatedAt).Take(60).ToListAsync();
        var stats = new
        {
            transactions = history.Count + 1,
            approved = history.Count(t => t.Status == TransactionStatus.Approved),
            flagged = history.Count(t => t.Status == TransactionStatus.PendingReview),
            blocked = history.Count(t => t.Status == TransactionStatus.Blocked),
            rejected = history.Count(t => t.Status == TransactionStatus.Rejected),
            averageScore = history.Count == 0 ? 0 : Math.Round(history.Where(t => t.Screening != null).Average(t => (double)t.Screening!.RiskScore), 1),
        };
        return Ok(new
        {
            detail = d,
            customer = new { customer.Id, customer.FullName, customer.Email, customer.Phone, customer.Segment, kyc = customer.Kyc.ToString(), customer.CreatedAt, customer.Status, customer.HomeCountry, customer.HomeCity, balance = customer.Accounts.Sum(a => a.Balance) },
            stats,
            related = history.Take(8).Select(t => new { t.Id, t.Reference, type = t.Type.ToString(), status = t.Status.ToString(), t.Amount, score = t.Screening?.RiskScore ?? 0, tier = t.Screening?.RiskTier ?? "-", t.CreatedAt }),
        });
    }

    [HttpPost("transactions/{id:int}/decrypt")]
    public async Task<IActionResult> Decrypt(int id)
    {
        var t = await Db.Transactions.Include(x => x.Account).Include(x => x.Screening).FirstOrDefaultAsync(x => x.Id == id);
        if (t is null) return NotFound();
        Audit.Add(Actor, ActorRole, "SensitiveDataDecrypted", "Transaction", id.ToString(), "Decrypted counterparty details, account number and raw payload with the PGP private key.");
        await Db.SaveChangesAsync();
        return Ok(new
        {
            counterparty = pgp.Decrypt(t.CounterpartyEncrypted),
            accountNumber = pgp.Decrypt(t.Account!.AccountNumberEncrypted),
            rawPayload = t.Screening is null ? "" : pgp.Decrypt(t.Screening.RawPayloadEncrypted),
            counterpartyCipherText = t.CounterpartyEncrypted,
        });
    }

    public record ReviewRequest(bool Approve, string? Note);
    public record NoteRequest(string Note);

    [HttpPost("transactions/{id:int}/review")]
    public async Task<IActionResult> Review(int id, [FromBody] ReviewRequest req)
    {
        var t = await Db.Transactions.Include(x => x.Account).Include(x => x.Screening).FirstOrDefaultAsync(x => x.Id == id);
        if (t is null) return NotFound();
        if (t.Status is not (TransactionStatus.PendingReview or TransactionStatus.Blocked))
            return BadRequest(new { message = $"This transaction is already {t.Status} and cannot be reviewed again." });
        var note = (req.Note ?? "").Trim();
        if (note.Length < 5) return BadRequest(new { message = "Add a reviewer note of at least 5 characters." });

        var isCredit = t.Type == TransactionType.Collection;
        if (req.Approve)
        {
            if (!isCredit && t.Amount > t.Account!.Balance) return BadRequest(new { message = "The customer's balance is now too low to approve this transaction." });
            t.Account!.Balance += isCredit ? t.Amount : -t.Amount;
            t.Account.LastActivityAt = DateTime.UtcNow;
        }
        t.Status = req.Approve ? TransactionStatus.Approved : TransactionStatus.Rejected;
        t.ReviewedBy = Actor; t.ReviewedAt = DateTime.UtcNow;

        var action = req.Approve ? "Approve" : "Reject";
        Db.CaseNotes.Add(new CaseNote { TransactionId = id, Author = Actor, Action = action, Note = note });
        Audit.Add(Actor, ActorRole, "TransactionReviewed", "Transaction", id.ToString(), $"{action}: {note}");
        Db.Notifications.Add(new Notification
        {
            CustomerId = t.Account!.CustomerId, Kind = "Transaction", TransactionId = id,
            Title = req.Approve ? "Transaction approved" : "Transaction declined",
            Body = req.Approve ? $"Your {t.Type.ToString().ToLowerInvariant()} of ₦{t.Amount:N2} was reviewed and completed." : $"Your {t.Type.ToString().ToLowerInvariant()} of ₦{t.Amount:N2} could not be completed after a security review.",
        });
        await Db.SaveChangesAsync();
        return Ok(new { status = t.Status.ToString() });
    }

    [HttpPost("transactions/{id:int}/notes")]
    public async Task<IActionResult> AddNote(int id, [FromBody] NoteRequest req)
    {
        if (!await Db.Transactions.AnyAsync(t => t.Id == id)) return NotFound();
        if (string.IsNullOrWhiteSpace(req.Note)) return BadRequest(new { message = "Write a note first." });
        Db.CaseNotes.Add(new CaseNote { TransactionId = id, Author = Actor, Action = "Note", Note = req.Note.Trim() });
        Audit.Add(Actor, ActorRole, "NoteAdded", "Transaction", id.ToString(), req.Note.Trim());
        await Db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("transactions/{id:int}/escalate")]
    public async Task<IActionResult> Escalate(int id, [FromBody] NoteRequest req)
    {
        if (!await Db.Transactions.AnyAsync(t => t.Id == id)) return NotFound();
        var note = string.IsNullOrWhiteSpace(req.Note) ? "Escalated to a senior analyst." : req.Note.Trim();
        Db.CaseNotes.Add(new CaseNote { TransactionId = id, Author = Actor, Action = "Escalate", Note = note });
        Audit.Add(Actor, ActorRole, "TransactionEscalated", "Transaction", id.ToString(), note);
        await Db.SaveChangesAsync();
        return NoContent();
    }
}
