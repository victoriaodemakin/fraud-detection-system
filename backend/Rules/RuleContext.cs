using FraudDetection.Api.Models;

namespace FraudDetection.Api.Rules;

// Everything the rule engine needs to judge one transaction. The engine is a pure
// function of this context, so the same code screens live transactions (context built
// from the database) and the evaluation runner's simulated scenarios (context built
// by the scenario generator).

public record GeoInfo(
    bool Resolved,
    string Source,        // ip-api | simulated | unresolved
    string Country,
    string City,
    double? Lat,
    double? Lon);

public record HistTxn(
    DateTime AtUtc,
    decimal Amount,
    TransactionType Type,
    bool Credit,
    string? Category,
    string? Country,
    string? City,
    double? Lat,
    double? Lon);

public record HistLogin(DateTime AtUtc, bool Success);

public record HistChange(DateTime AtUtc, string Field);

public record DeviceEvent(int CustomerId, DateTime AtUtc);

public class CustomerHistory
{
    public List<HistTxn> Txns { get; } = [];
    public List<HistLogin> Logins { get; } = [];
    public List<HistChange> Changes { get; } = [];
    public List<DeviceEvent> DeviceEvents { get; } = [];

    public IEnumerable<HistTxn> TxnsWithin(DateTime now, TimeSpan window) =>
        Txns.Where(t => now - t.AtUtc <= window && now >= t.AtUtc);
}

public class RuleContext
{
    public required DateTime NowUtc { get; init; }
    public required int LocalHour { get; init; }
    public required int LocalMinute { get; init; }

    public required TransactionType Type { get; init; }
    public required decimal Amount { get; init; }
    public required string Channel { get; init; }

    public required string Segment { get; init; }
    public required double SegmentMultiplier { get; init; }
    public required KycStatus Kyc { get; init; }
    public required string HomeCountry { get; init; }
    public required string HomeCity { get; init; }
    public string? TravelNoticeCountry { get; init; }
    public DateTime? TravelNoticeUntil { get; init; }

    public required DateTime AccountCreatedAt { get; init; }
    public DateTime? AccountLastActivityAt { get; init; }

    public required GeoInfo Geo { get; init; }
    public required string Ip { get; init; }
    public string? BlacklistReason { get; init; }

    public required string DeviceFingerprint { get; init; }
    public bool DeviceKnown { get; init; }
    public DateTime? DeviceFirstSeenAt { get; init; }

    public string? MerchantName { get; init; }
    public string? MerchantCategory { get; init; }
    public bool MerchantHighFraud { get; init; }
    public bool FirstTimeMerchant { get; init; }
    public string? ShippingAddress { get; init; }
    public bool ShippingAddressNew { get; init; }

    public DateTime? BeneficiaryAddedAt { get; init; }
    public int OtherCustomersSamePhone { get; init; }

    public required CustomerHistory History { get; init; }

    public bool IsCredit => Type == TransactionType.Collection;
}
