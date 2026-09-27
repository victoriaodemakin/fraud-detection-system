using System.Text.Json;
using FraudDetection.Api.Data;
using FraudDetection.Api.Models;
using FraudDetection.Api.Rules;
using Microsoft.EntityFrameworkCore;

namespace FraudDetection.Api.Services;

public class Confusion
{
    public int Tp { get; set; }
    public int Fp { get; set; }
    public int Tn { get; set; }
    public int Fn { get; set; }
    public Dictionary<string, int> TiersFraud { get; set; } = new() { ["Low"] = 0, ["Medium"] = 0, ["High"] = 0 };
    public Dictionary<string, int> TiersLegit { get; set; } = new() { ["Low"] = 0, ["Medium"] = 0, ["High"] = 0 };

    public void Add(bool actualFraud, string tier)
    {
        var predicted = tier != "Low";
        if (actualFraud) { if (predicted) Tp++; else Fn++; TiersFraud[tier]++; }
        else { if (predicted) Fp++; else Tn++; TiersLegit[tier]++; }
    }

    public object Summary()
    {
        double Div(double a, double b) => b == 0 ? 0 : a / b;
        var precision = Div(Tp, Tp + Fp);
        var recall = Div(Tp, Tp + Fn);
        return new
        {
            tp = Tp, fp = Fp, tn = Tn, fn = Fn,
            precision = Math.Round(precision, 4),
            recall = Math.Round(recall, 4),
            f1 = Math.Round(Div(2 * precision * recall, precision + recall), 4),
            falsePositiveRate = Math.Round(Div(Fp, Fp + Tn), 4),
            accuracy = Math.Round(Div(Tp + Tn, Tp + Tn + Fp + Fn), 4),
            tiersFraud = TiersFraud,
            tiersLegit = TiersLegit,
        };
    }
}

// Compares the three detectors of the framework on the same held-out transactions:
// the rule-based layer alone, the machine learning layer alone, and the hybrid framework.
// Real ML probabilities come from the ULB test set; the banking context the rule layer
// needs (Naira amount, recent activity, device, location...) is drawn by the seeded
// scenario generator, so the run is reproducible and its assumptions are on record.
public class EvaluationService(AppDbContext db, MlServiceClient ml, SettingsService settings)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<EvaluationRun> RunAsync(string actor, int seed, int? maxRows, ScenarioConfig? config)
    {
        var cfg = config ?? new ScenarioConfig();
        var preds = await ml.GetTestPredictionsAsync();
        var risk = await settings.GetRiskAsync();
        var defs = await db.RuleDefinitions.AsNoTracking().ToListAsync();
        var rng = new Random(seed);
        var now = DateTime.UtcNow;

        var indices = Enumerable.Range(0, preds.Y.Length).ToList();
        if (maxRows is not null && maxRows < indices.Count)
        {
            // Stratified subsample: keep every fraud row, sample legitimate rows.
            var fraud = indices.Where(i => preds.Y[i] == 1).ToList();
            var legit = indices.Where(i => preds.Y[i] == 0).OrderBy(_ => rng.Next()).Take(Math.Max(0, maxRows.Value - fraud.Count)).ToList();
            indices = fraud.Concat(legit).OrderBy(i => i).ToList();
        }

        var det = new Dictionary<string, Confusion>
        {
            ["rule"] = new(), ["ml"] = new(), ["hybrid"] = new(), ["logreg"] = new(), ["tree"] = new(),
        };
        var ruleStats = RuleCatalog.All.ToDictionary(r => r.Code, _ => new int[4]); // fraudTriggered, legitTriggered, fraudTotal, legitTotal
        var histFraud = new int[10]; var histLegit = new int[10];
        double sumFraud = 0, sumLegit = 0; int nFraud = 0, nLegit = 0;

        foreach (var i in indices)
        {
            var isFraud = preds.Y[i] == 1;
            var ctx = ScenarioBuilder.Build(rng, isFraud, cfg, now, risk);
            var run = RuleEngine.Run(ctx, defs);

            det["rule"].Add(isFraud, run.HardBlock ? "High" : RiskScoring.TierOf(run.Score, risk));
            det["ml"].Add(isFraud, RiskScoring.TierOf(preds.PMl[i] * 100, risk));
            det["logreg"].Add(isFraud, RiskScoring.TierOf(preds.PLr[i] * 100, risk));
            det["tree"].Add(isFraud, RiskScoring.TierOf(preds.PDt[i] * 100, risk));
            var hybrid = RiskScoring.Combine(run.Score, run.HardBlock, preds.PMl[i], risk);
            det["hybrid"].Add(isFraud, hybrid.Tier);

            var bin = Math.Min(9, hybrid.Score / 10);
            if (isFraud) { histFraud[bin]++; sumFraud += hybrid.Score; nFraud++; } else { histLegit[bin]++; sumLegit += hybrid.Score; nLegit++; }

            foreach (var c in run.Checks)
            {
                if (!ruleStats.TryGetValue(c.Code, out var s)) continue;
                if (c.Outcome == "NotApplicable") continue;
                if (isFraud) { s[2]++; if (c.Outcome == "Fail") s[0]++; } else { s[3]++; if (c.Outcome == "Fail") s[1]++; }
            }
        }

        var ruleRows = RuleCatalog.All.Select(r =>
        {
            var s = ruleStats[r.Code];
            var trig = s[0] + s[1];
            return new
            {
                code = r.Code, name = r.Name, category = r.Category,
                triggeredOnFraud = s[0], triggeredOnLegit = s[1],
                precision = Math.Round(trig == 0 ? 0 : (double)s[0] / trig, 4),
                fraudCoverage = Math.Round(nFraud == 0 ? 0 : (double)s[0] / nFraud, 4),
                legitRate = Math.Round(nLegit == 0 ? 0 : (double)s[1] / nLegit, 4),
            };
        }).ToList();

        var result = new
        {
            generatedAt = now,
            seed,
            rows = indices.Count,
            fraudRows = nFraud,
            legitimateRows = nLegit,
            weights = new { rule = risk.RuleWeight, ml = risk.MlWeight },
            bands = new { lowMax = risk.LowMax, mediumMax = risk.MediumMax },
            predictedFraudMeans = "Medium or High tier (flagged or blocked)",
            detectors = new
            {
                rule = det["rule"].Summary(),
                ml = det["ml"].Summary(),
                hybrid = det["hybrid"].Summary(),
                logisticRegression = det["logreg"].Summary(),
                decisionTree = det["tree"].Summary(),
            },
            averageHybridScore = new { fraud = Math.Round(nFraud == 0 ? 0 : sumFraud / nFraud, 1), legitimate = Math.Round(nLegit == 0 ? 0 : sumLegit / nLegit, 1) },
            histogram = new { fraud = histFraud, legitimate = histLegit },
            rules = ruleRows,
        };

        var run2 = new EvaluationRun
        {
            CreatedAt = now, CreatedBy = actor, Seed = seed, Rows = indices.Count,
            ConfigJson = JsonSerializer.Serialize(cfg, Json),
            ResultJson = JsonSerializer.Serialize(result, Json),
        };
        db.EvaluationRuns.Add(run2);
        await db.SaveChangesAsync();
        return run2;
    }
}
