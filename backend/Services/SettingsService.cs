using FraudDetection.Api.Data;
using FraudDetection.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FraudDetection.Api.Services;

public record RiskSettings(
    double RuleWeight,
    double MlWeight,
    int LowMax,
    int MediumMax,
    double StudentMultiplier,
    double StandardMultiplier,
    double PremiumMultiplier)
{
    public double MultiplierFor(string segment) => segment switch
    {
        "Student" => StudentMultiplier,
        "Premium" => PremiumMultiplier,
        _ => StandardMultiplier,
    };

    public static RiskSettings Defaults => new(0.4, 0.6, 30, 65, 0.2, 1.0, 3.0);
}

public static class SettingKeys
{
    public const string RuleWeight = "Risk.RuleWeight";
    public const string MlWeight = "Risk.MlWeight";
    public const string LowMax = "Risk.LowMax";
    public const string MediumMax = "Risk.MediumMax";
    public const string Student = "Segment.Student";
    public const string Standard = "Segment.Standard";
    public const string Premium = "Segment.Premium";
}

public class SettingsService(AppDbContext db)
{
    public static readonly (string Key, string Value, string Description)[] Defaults =
    [
        (SettingKeys.RuleWeight, "0.4", "Weight of the rule score in the hybrid risk score"),
        (SettingKeys.MlWeight, "0.6", "Weight of the machine learning probability (x100) in the hybrid risk score"),
        (SettingKeys.LowMax, "30", "Highest risk score of the Low tier (approve)"),
        (SettingKeys.MediumMax, "65", "Highest risk score of the Medium tier (flag and review); above is High (block)"),
        (SettingKeys.Student, "0.2", "Amount-threshold multiplier for the Student segment"),
        (SettingKeys.Standard, "1", "Amount-threshold multiplier for the Standard segment"),
        (SettingKeys.Premium, "3", "Amount-threshold multiplier for the Premium segment"),
    ];

    public async Task<Dictionary<string, string>> AllAsync() =>
        await db.SystemSettings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.Value);

    public async Task<RiskSettings> GetRiskAsync()
    {
        var all = await AllAsync();
        var d = RiskSettings.Defaults;
        double Num(string key, double fallback) =>
            all.TryGetValue(key, out var v) && double.TryParse(v, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var x) ? x : fallback;

        return new RiskSettings(
            Num(SettingKeys.RuleWeight, d.RuleWeight),
            Num(SettingKeys.MlWeight, d.MlWeight),
            (int)Num(SettingKeys.LowMax, d.LowMax),
            (int)Num(SettingKeys.MediumMax, d.MediumMax),
            Num(SettingKeys.Student, d.StudentMultiplier),
            Num(SettingKeys.Standard, d.StandardMultiplier),
            Num(SettingKeys.Premium, d.PremiumMultiplier));
    }

    public async Task SetAsync(string key, string value)
    {
        var s = await db.SystemSettings.FindAsync(key);
        if (s is null) return;
        s.Value = value;
        await db.SaveChangesAsync();
    }
}

public record RiskResult(int Score, string Tier, string Decision, string RuleOnlyTier, string MlOnlyTier);

// The hybrid risk score (Equation 3.10 of the write-up): a weighted combination of the
// rule score and the machine learning probability, mapped to three tiers. A hard block
// from the rule layer bypasses the ML layer and scores 100.
public static class RiskScoring
{
    public static string TierOf(double score, RiskSettings s) =>
        score <= s.LowMax ? "Low" : score <= s.MediumMax ? "Medium" : "High";

    public static string DecisionOf(string tier) => tier switch
    {
        "Low" => "Approve",
        "Medium" => "Flag and review",
        _ => "Block and alert",
    };

    public static RiskResult Combine(int ruleScore, bool hardBlock, double? mlProbability, RiskSettings s)
    {
        if (hardBlock || mlProbability is null)
        {
            var score = hardBlock ? 100 : ruleScore;
            var tier = TierOf(score, s);
            return new RiskResult(score, tier, DecisionOf(tier), TierOf(ruleScore, s), "NotRun");
        }

        var raw = s.RuleWeight * ruleScore + s.MlWeight * mlProbability.Value * 100;
        var final = (int)Math.Clamp(Math.Round(raw), 0, 100);
        var t = TierOf(final, s);
        return new RiskResult(final, t, DecisionOf(t), TierOf(ruleScore, s), TierOf(mlProbability.Value * 100, s));
    }
}
