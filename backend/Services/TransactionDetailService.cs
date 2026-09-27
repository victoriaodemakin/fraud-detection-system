using FraudDetection.Api.Data;
using FraudDetection.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FraudDetection.Api.Services;

public class TransactionDetailService(AppDbContext db, SettingsService settings)
{
    public async Task<TransactionDetailDto?> BuildAsync(int id, int? restrictToCustomerId = null)
    {
        var t = await db.Transactions.AsNoTracking()
            .Include(x => x.Account).ThenInclude(a => a!.Customer)
            .Include(x => x.Screening).ThenInclude(s => s!.Evaluations)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (t is null || t.Account is null || t.Screening is null) return null;
        if (restrictToCustomerId is not null && t.Account.CustomerId != restrictToCustomerId) return null;

        var s = t.Screening;
        var c = t.Account.Customer!;
        var risk = await settings.GetRiskAsync();

        var checks = s.Evaluations
            .OrderBy(e => e.RuleCode, StringComparer.Ordinal)
            .Select(e => new RuleCheckDto(e.RuleCode, e.Category, e.RuleName, RuleDescription(e.RuleCode), e.Outcome,
                e.Points, e.PointsAwarded, e.HardBlock, e.Observed, e.Threshold, e.Detail))
            .ToList();

        var ml = new MlLayerDto(s.SampleId, s.MlProfile, s.LogisticRegressionProbability, s.DecisionTreeProbability,
            s.CombinedMlProbability, s.DatasetReferenceAmount, s.SampleId != "-");
        var hybrid = new HybridDto(s.RuleScore, s.RuleWeight, s.MlWeight, s.CombinedMlProbability, s.RiskScore, s.RiskTier,
            s.Decision, s.RuleOnlyTier, s.MlOnlyTier, s.HardBlock, risk.LowMax, risk.MediumMax);

        var timeline = new List<TimelineEventDto>();
        var logs = await db.AuditLogs.AsNoTracking()
            .Where(a => a.EntityType == "Transaction" && a.EntityId == id.ToString())
            .OrderBy(a => a.CreatedAt).ToListAsync();
        foreach (var a in logs)
            timeline.Add(new TimelineEventDto("audit", a.Actor, Humanise(a.Action), a.Detail, a.CreatedAt));
        var notes = await db.CaseNotes.AsNoTracking().Where(n => n.TransactionId == id).OrderBy(n => n.CreatedAt).ToListAsync();
        foreach (var n in notes)
            timeline.Add(new TimelineEventDto("note", n.Author, n.Action == "Note" ? "Analyst note" : $"Analyst decision: {n.Action}", n.Note, n.CreatedAt));
        timeline = timeline.OrderBy(x => x.At).ToList();

        return new TransactionDetailDto(
            t.Id, t.Reference, t.Type.ToString(), t.Status.ToString(), t.Amount, t.Narration, t.Channel,
            t.CounterpartyDisplay, t.MerchantCategory, t.ShippingAddress, t.Ip, t.Country, t.City, s.LocationSource,
            t.DeviceFingerprint, t.CreatedAt, t.ReviewedBy, t.ReviewedAt,
            c.Id, c.FullName, c.Email, c.Segment, t.Account.AccountNumberLast4,
            checks, ml, hybrid, timeline);
    }

    private static string RuleDescription(string code) =>
        Rules.RuleCatalog.Find(code)?.Description ?? "";

    private static string Humanise(string action) => action switch
    {
        "TransactionScreened" => "Screened by the framework",
        "TransactionReviewed" => "Reviewed by an analyst",
        "SensitiveDataDecrypted" => "Protected details decrypted",
        "TransactionEscalated" => "Escalated",
        _ => action,
    };
}
