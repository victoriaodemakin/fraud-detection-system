using System.Collections.Concurrent;
using System.Text.Json.Serialization;
using FraudDetection.Api.Rules;

namespace FraudDetection.Api.Services;

// A location a customer (or the demo controls) can "travel" to. Each maps to a
// representative IP address; the IP is then resolved by the geolocation service, so the
// location rules see what a real deployment would see: an IP address turned into a
// country, city and coordinates. The static values are only a fallback for when the
// external service is unreachable.
public record SimLocation(string Key, string Label, string Ip, string Country, string City, double Lat, double Lon);

public static class SimulatedLocations
{
    public static readonly IReadOnlyList<SimLocation> All =
    [
        new("lagos", "Lagos, Nigeria (my usual location)", "105.112.5.1", "Nigeria", "Lagos", 6.4653, 3.4252),
        new("asaba", "Asaba, Nigeria (another city)", "102.90.1.1", "Nigeria", "Asaba", 6.2036, 6.7365),
        new("ghana", "Ghana (neighbouring country)", "41.66.192.1", "Ghana", "Agona Swedru", 5.533, -0.7002),
        new("capetown", "Cape Town, South Africa", "165.73.100.1", "South Africa", "Cape Town", -33.914, 18.4129),
        new("london", "London, United Kingdom", "5.10.83.1", "United Kingdom", "London", 51.5081, -0.1278),
        new("us", "Ashburn, United States", "8.8.8.8", "United States", "Ashburn", 39.03, -77.5),
        new("dubai", "Dubai, United Arab Emirates", "5.30.0.1", "United Arab Emirates", "Dubai", 25.0734, 55.2979),
        new("tehran", "Tehran, Iran (high-risk country)", "2.144.0.1", "Iran", "Tehran", 35.7219, 51.3347),
        new("vpn", "Anonymised connection (VPN / Tor)", "185.220.101.1", "Germany", "Brandenburg an der Havel", 52.6171, 13.1207),
    ];

    public static SimLocation Get(string? key) =>
        All.FirstOrDefault(l => l.Key == (key ?? "lagos")) ?? All[0];
}

// Real IP-based geolocation (ip-api.com), implementing the location-based detection
// approach in the literature review: country-level IP accuracy is high (~99%) while
// city-level accuracy is lower, which is why country and city mismatches carry
// different weights in the rule engine.
public class GeoLocationService(HttpClient httpClient, ILogger<GeoLocationService> logger)
{
    private static readonly ConcurrentDictionary<string, GeoInfo> Cache = new();

    public async Task<GeoInfo> ResolveAsync(string ip, SimLocation? fallback = null)
    {
        if (Cache.TryGetValue(ip, out var cached)) return cached;

        GeoInfo result;
        try
        {
            var r = await httpClient.GetFromJsonAsync<IpApiResponse>(
                $"/json/{ip}?fields=status,message,country,city,lat,lon,query");
            if (r is { status: "success" } && !string.IsNullOrEmpty(r.country))
            {
                result = new GeoInfo(true, "ip-api", r.country!, r.city ?? "", r.lat, r.lon);
                Cache[ip] = result;
                return result;
            }
            logger.LogWarning("Geolocation lookup for {Ip} failed: {Message}", ip, r?.message);
        }
        catch (Exception ex)
        {
            logger.LogWarning("Geolocation service unreachable for {Ip}: {Message}", ip, ex.Message);
        }

        result = fallback is null
            ? new GeoInfo(false, "unresolved", "", "", null, null)
            : new GeoInfo(true, "simulated", fallback.Country, fallback.City, fallback.Lat, fallback.Lon);
        return result;
    }

    private record IpApiResponse(string status, string? message, string? country, string? city, double? lat, double? lon, string? query);
}
