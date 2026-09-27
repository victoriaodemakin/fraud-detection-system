using System.Text.Json;
using FraudDetection.Api.Models;

namespace FraudDetection.Api.Services;

public record MlAssessment(
    string SampleId,
    string Profile,
    double LogisticRegressionProbability,
    double DecisionTreeProbability,
    double CombinedMlProbability,
    double DatasetAmount);

public record TestPredictions(int[] Y, double[] PLr, double[] PDt, double[] PMl);

public record MlSample(string SampleId, string Profile, double Amount, double TimeSeconds);

// Thin client for the Python/FastAPI machine learning layer (logistic regression and
// decision tree). The ML layer always scores the real recorded feature values of a
// dataset sample; the Naira amount of the transaction only drives the rule layer.
public class MlServiceClient(HttpClient httpClient)
{
    private static List<MlSample>? _samples;
    private static DateTime _samplesAt = DateTime.MinValue;

    public async Task<List<MlSample>> GetSamplesAsync()
    {
        if (_samples is not null && DateTime.UtcNow - _samplesAt < TimeSpan.FromMinutes(10)) return _samples;
        var raw = await httpClient.GetFromJsonAsync<List<SampleDto>>("/samples") ?? [];
        _samples = raw.Select(s => new MlSample(s.sample_id, s.profile, s.amount, s.time_seconds)).ToList();
        _samplesAt = DateTime.UtcNow;
        return _samples;
    }

    // profile: "typical" (a real legitimate transaction) or "anomalous" (a real fraudulent one).
    public async Task<string> PickSampleIdAsync(string? profile, Random rng)
    {
        var wanted = profile?.ToLowerInvariant() is "anomalous" or "subtle" ? profile.ToLowerInvariant() : "typical";
        var pool = (await GetSamplesAsync()).Where(s => s.Profile == wanted).ToList();
        if (pool.Count == 0) throw new InvalidOperationException("The ML service has no samples for this profile.");
        return pool[rng.Next(pool.Count)].SampleId;
    }

    public async Task<MlAssessment> PredictAsync(string sampleId)
    {
        var response = await httpClient.PostAsJsonAsync("/predict", new { sample_id = sampleId });
        response.EnsureSuccessStatusCode();
        var b = await response.Content.ReadFromJsonAsync<PredictDto>()
            ?? throw new InvalidOperationException("Empty response from ML service.");
        return new MlAssessment(b.sample_id, b.profile, b.logistic_regression_probability,
            b.decision_tree_probability, b.combined_ml_probability, b.dataset_amount);
    }

    public async Task<JsonElement> GetMetricsAsync() =>
        await httpClient.GetFromJsonAsync<JsonElement>("/metrics");

    public async Task<JsonElement> GetTrainingInfoAsync() =>
        await httpClient.GetFromJsonAsync<JsonElement>("/training-info");

    public async Task<TestPredictions> GetTestPredictionsAsync()
    {
        var d = await httpClient.GetFromJsonAsync<TestDto>("/test-predictions")
            ?? throw new InvalidOperationException("Empty test predictions.");
        return new TestPredictions(d.y, d.p_lr, d.p_dt, d.p_ml);
    }

    public async Task<bool> IsAvailableAsync()
    {
        try
        {
            var r = await httpClient.GetAsync("/health");
            return r.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private record SampleDto(string sample_id, string profile, double amount, double time_seconds);

    private record PredictDto(
        string sample_id,
        string profile,
        double logistic_regression_probability,
        double decision_tree_probability,
        double combined_ml_probability,
        double dataset_amount);

    private record TestDto(int[] y, double[] p_lr, double[] p_dt, double[] p_ml);
}
