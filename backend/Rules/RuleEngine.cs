using System.Text.Json;
using FraudDetection.Api.Models;

namespace FraudDetection.Api.Rules;

// One rule's result for one transaction: the pass / fail row shown on the dashboards.
public record RuleCheck(
    string Code,
    string Category,
    string Name,
    string Description,
    string Outcome,        // Pass | Fail | NotApplicable
    int Points,            // configured weight
    int PointsAwarded,     // added to the rule score (0 unless the rule failed)
    bool HardBlock,
    string Observed,
    string Threshold,
    string Detail);

public record RuleRunResult(int Score, bool HardBlock, List<RuleCheck> Checks)
{
    public int Failed => Checks.Count(c => c.Outcome == "Fail");
    public int Passed => Checks.Count(c => c.Outcome == "Pass");
    public int NotApplicable => Checks.Count(c => c.Outcome == "NotApplicable");
}

// The rule-based screening layer (first layer of the framework). Deterministic and
// auditable: every enabled rule is evaluated, each failure adds its configured points,
// the total is capped at 100, and a failed hard-block rule stops the transaction outright.
public static class RuleEngine
{
    public static Dictionary<string, string> ParseParams(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? [];
        }
        catch
        {
            return [];
        }
    }

    public static string SerializeParams(Dictionary<string, string> p) => JsonSerializer.Serialize(p);

    public static RuleRunResult Run(RuleContext ctx, IEnumerable<RuleDefinition> definitions)
    {
        var checks = new List<RuleCheck>();
        var score = 0;
        var hard = false;

        foreach (var def in definitions.OrderBy(d => d.Code, StringComparer.Ordinal))
        {
            var spec = RuleCatalog.Find(def.Code);
            if (spec is null) continue;

            if (!def.Enabled)
            {
                checks.Add(new RuleCheck(def.Code, def.Category, def.Name, def.Description, "NotApplicable",
                    def.Points, 0, def.Action == "HardBlock", "-", "-", "Rule is disabled."));
                continue;
            }

            var merged = spec.DefaultParams();
            foreach (var kv in ParseParams(def.ParametersJson)) merged[kv.Key] = kv.Value;

            RuleEval eval;
            try
            {
                eval = spec.Evaluate(ctx, new RuleParams(merged));
            }
            catch (Exception ex)
            {
                eval = new RuleEval("NotApplicable", "-", "-", $"Rule could not be evaluated: {ex.Message}");
            }

            var awarded = 0;
            if (eval.Outcome == "Fail")
            {
                if (def.Action == "HardBlock") hard = true;
                awarded = def.Action == "HardBlock" ? 100 : def.Points;
                score += def.Action == "HardBlock" ? 0 : def.Points;
            }

            checks.Add(new RuleCheck(def.Code, def.Category, def.Name, def.Description, eval.Outcome,
                def.Points, awarded, def.Action == "HardBlock", eval.Observed, eval.Threshold, eval.Detail));
        }

        return new RuleRunResult(hard ? 100 : Math.Min(100, score), hard, checks);
    }
}
