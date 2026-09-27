namespace FraudDetection.Api.Models;

public enum TransactionType { Transfer, BillPayment, Collection, CardPayment, AtmWithdrawal }

public enum TransactionStatus { Approved, PendingReview, Blocked, Rejected }

public enum KycStatus { Verified, Pending, Mismatch }

public class Customer
{
    public int Id { get; set; }
    public string FullName { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string PinHash { get; set; } = "";

    public string Address { get; set; } = "";
    public string HomeCountry { get; set; } = "Nigeria";
    public string HomeCity { get; set; } = "Lagos";

    // Standard, Student or Premium - scales the amount thresholds of the rule engine
    // (a high-net-worth customer's "large transaction" differs from a student's).
    public string Segment { get; set; } = "Standard";
    public KycStatus Kyc { get; set; } = KycStatus.Verified;
    public string BvnLast4 { get; set; } = "";
    public string NameOnId { get; set; } = "";

    public string? TravelNoticeCountry { get; set; }
    public DateTime? TravelNoticeUntil { get; set; }

    public string Status { get; set; } = "Active"; // Active | Suspended
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastContactChangeAt { get; set; }

    public List<Account> Accounts { get; set; } = [];
}

public class Account
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }

    // Account number is sensitive - stored PGP-encrypted at rest. The hash allows an
    // exact-match lookup of internal accounts without decrypting anything.
    public string AccountNumberEncrypted { get; set; } = "";
    public string AccountNumberLast4 { get; set; } = "";
    public string AccountNumberHash { get; set; } = "";
    public string Type { get; set; } = "Savings"; // Savings | Current
    public decimal Balance { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastActivityAt { get; set; }

    public List<Transaction> Transactions { get; set; } = [];
}

public class Device
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public string Fingerprint { get; set; } = "";
    public string Label { get; set; } = "";
    public DateTime FirstSeenAt { get; set; } = DateTime.UtcNow;
    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;
    public bool Trusted { get; set; }
}

public class LoginEvent
{
    public int Id { get; set; }
    public int? CustomerId { get; set; }
    public string Email { get; set; } = "";
    public bool Success { get; set; }
    public string Ip { get; set; } = "";
    public string Country { get; set; } = "";
    public string City { get; set; } = "";
    public string DeviceFingerprint { get; set; } = "";
    public bool Simulated { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Beneficiary
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public string Name { get; set; } = "";
    public string BankName { get; set; } = "";
    public string AccountNumberEncrypted { get; set; } = "";
    public string AccountNumberLast4 { get; set; } = "";
    public DateTime AddedAt { get; set; } = DateTime.UtcNow;
}

public class ProfileChange
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public string Field { get; set; } = ""; // Email | Phone | Address | Pin
    public string Detail { get; set; } = "";
    public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
}

public class Biller
{
    public int Id { get; set; }
    public string Category { get; set; } = ""; // Electricity, Cable TV, Airtime & Data, Water, Internet
    public string Name { get; set; } = "";
}

public class Merchant
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Category { get; set; } = ""; // Groceries, Electronics, Gambling, Cryptocurrency ...
    public bool HighFraud { get; set; }
}

public class Transaction
{
    public int Id { get; set; }
    public string Reference { get; set; } = "";
    public int AccountId { get; set; }
    public Account? Account { get; set; }

    public TransactionType Type { get; set; }
    public decimal Amount { get; set; }
    public string Narration { get; set; } = "";
    public string Channel { get; set; } = "Mobile"; // Mobile | Web | ATM | Card

    // Counterparty details are sensitive - stored PGP-encrypted at rest.
    // Only a masked/display form is kept in plaintext for list views.
    public string CounterpartyDisplay { get; set; } = "";
    public string CounterpartyEncrypted { get; set; } = "";
    public string? CounterpartyKey { get; set; } // beneficiary / merchant / biller key, for first-time checks
    public string? MerchantCategory { get; set; }
    public string? ShippingAddress { get; set; }
    public int? BeneficiaryId { get; set; }

    public string DeviceFingerprint { get; set; } = "";
    public string Ip { get; set; } = "";
    public string Country { get; set; } = "";
    public string City { get; set; } = "";
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    public TransactionStatus Status { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReviewedAt { get; set; }
    public string? ReviewedBy { get; set; }

    public ScreeningRecord? Screening { get; set; }
}

public class ScreeningRecord
{
    public int Id { get; set; }
    public int TransactionId { get; set; }
    public Transaction? Transaction { get; set; }

    public string SampleId { get; set; } = "";
    public string MlProfile { get; set; } = "typical";

    public int RuleScore { get; set; }
    public bool HardBlock { get; set; }
    public int ChecksTotal { get; set; }
    public int ChecksFailed { get; set; }
    public bool LocationResolved { get; set; }
    public string LocationSource { get; set; } = "";
    public string? Country { get; set; }
    public string? City { get; set; }

    public double LogisticRegressionProbability { get; set; }
    public double DecisionTreeProbability { get; set; }
    public double CombinedMlProbability { get; set; }
    public double DatasetReferenceAmount { get; set; }

    public double RuleWeight { get; set; }
    public double MlWeight { get; set; }
    public int RiskScore { get; set; }
    public string RiskTier { get; set; } = "";
    public string Decision { get; set; } = "";

    // The same transaction judged by each detector on its own (for the three-way comparison).
    public string RuleOnlyTier { get; set; } = "";
    public string MlOnlyTier { get; set; } = "";

    // Full original request payload, PGP-encrypted, for audit purposes.
    public string RawPayloadEncrypted { get; set; } = "";

    public List<RuleEvaluation> Evaluations { get; set; } = [];
}

// One row per rule per screened transaction: the pass / fail table of the analyst dashboard.
public class RuleEvaluation
{
    public int Id { get; set; }
    public int ScreeningRecordId { get; set; }
    public ScreeningRecord? Screening { get; set; }

    public string RuleCode { get; set; } = "";
    public string Category { get; set; } = "";
    public string RuleName { get; set; } = "";
    public string Outcome { get; set; } = ""; // Pass | Fail | NotApplicable
    public int Points { get; set; }           // points configured for the rule
    public int PointsAwarded { get; set; }    // points actually added (0 if the rule passed)
    public bool HardBlock { get; set; }
    public string Observed { get; set; } = "";
    public string Threshold { get; set; } = "";
    public string Detail { get; set; } = "";
}

public class RuleDefinition
{
    public int Id { get; set; }
    public string Code { get; set; } = "";
    public string Category { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public int Points { get; set; }
    public string Action { get; set; } = "Score"; // Score | HardBlock
    public bool Enabled { get; set; } = true;
    public string ParametersJson { get; set; } = "{}";
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string? UpdatedBy { get; set; }
}

public class SystemSetting
{
    public string Key { get; set; } = "";
    public string Value { get; set; } = "";
    public string Description { get; set; } = "";
}

public class IpBlacklistEntry
{
    public int Id { get; set; }
    public string Ip { get; set; } = "";
    public string Kind { get; set; } = "VPN"; // VPN | Tor | Botnet | Proxy
    public string Reason { get; set; } = "";
    public DateTime AddedAt { get; set; } = DateTime.UtcNow;
}

public class AdminUser
{
    public int Id { get; set; }
    public string Username { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string FullName { get; set; } = "";
    public string Email { get; set; } = "";
    public string Role { get; set; } = "Analyst"; // Analyst | Admin
}

public class AuditLog
{
    public int Id { get; set; }
    public string Actor { get; set; } = "";
    public string ActorRole { get; set; } = "";
    public string Action { get; set; } = "";
    public string EntityType { get; set; } = "";
    public string EntityId { get; set; } = "";
    public string Detail { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class CaseNote
{
    public int Id { get; set; }
    public int TransactionId { get; set; }
    public string Author { get; set; } = "";
    public string Action { get; set; } = "Note"; // Note | Approve | Reject | Escalate
    public string Note { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Notification
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public string Kind { get; set; } = "Transaction"; // Transaction | Security | Promo
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public int? TransactionId { get; set; }
    public bool Read { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class EvaluationRun
{
    public int Id { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = "";
    public int Seed { get; set; }
    public int Rows { get; set; }
    public string ConfigJson { get; set; } = "{}";
    public string ResultJson { get; set; } = "{}";
}
