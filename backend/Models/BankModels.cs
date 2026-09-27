namespace FraudDetection.Api.Models;

// Demo controls: let a demonstrator put a transaction in a chosen context (where it
// comes from, which device, what time, how the log-in went, what the ML layer sees)
// so that every rule can be exercised without real fraud.
public record SimulationInput(
    string? Location,        // key of SimulatedLocations, default "lagos"
    string? DeviceMode,      // current | new | shared
    string? LocalTime,       // HH:mm, overrides the local time of day
    string? LoginBehaviour,  // normal | failed-burst
    string? MlProfile);      // typical | anomalous | subtle

public record TransferRequest(
    int AccountId, int? BeneficiaryId, string? RecipientName, string? RecipientAccountNumber, string? BankName,
    bool SaveBeneficiary, decimal Amount, string? Narration, string Pin, SimulationInput? Sim);

public record BillPaymentRequest(
    int AccountId, int BillerId, string CustomerReference, decimal Amount, string Pin, SimulationInput? Sim);

public record CardPaymentRequest(
    int AccountId, int MerchantId, decimal Amount, string? ShippingAddress, string Pin, SimulationInput? Sim);

public record AtmWithdrawalRequest(int AccountId, decimal Amount, string? AtmLocation, string Pin, SimulationInput? Sim);

public record CollectionRequest(
    int AccountId, string FromName, string FromAccountNumber, decimal Amount, string? Narration, string Pin, SimulationInput? Sim);

public record BillerDto(int Id, string Category, string Name);
public record MerchantDto(int Id, string Name, string Category, bool HighFraud);

// What a CUSTOMER may see of a payment: its outcome only. The risk score, rule results and
// machine learning output are internal to fraud operations and are never sent to customers.
public record TransactionResultDto(
    int TransactionId,
    string Reference,
    string Type,
    string Status,
    decimal Amount,
    string CounterpartyDisplay,
    decimal NewBalance,
    DateTime CreatedAt,
    string Message);

public record TransactionListItemDto(
    int TransactionId,
    string Reference,
    string Type,
    string Status,
    decimal Amount,
    string CounterpartyDisplay,
    string Narration,
    string Channel,
    string? Country,
    string? City,
    DateTime CreatedAt);

public record CustomerTimelineDto(string Title, string Detail, DateTime At);

public record CustomerTransactionDto(
    int TransactionId,
    string Reference,
    string Type,
    string Status,
    string StatusMessage,
    decimal Amount,
    string Narration,
    string Channel,
    string CounterpartyDisplay,
    string? MerchantCategory,
    string? ShippingAddress,
    string Country,
    string City,
    DateTime CreatedAt,
    DateTime? ReviewedAt,
    List<CustomerTimelineDto> Timeline);

// The complete story of one transaction, shared by the customer and analyst views.
public record RuleCheckDto(
    string Code, string Category, string Name, string Description, string Outcome,
    int Points, int PointsAwarded, bool HardBlock, string Observed, string Threshold, string Detail);

public record MlLayerDto(
    string SampleId, string Profile, double LogisticRegressionProbability, double DecisionTreeProbability,
    double CombinedMlProbability, double DatasetReferenceAmount, bool Ran);

public record HybridDto(
    int RuleScore, double RuleWeight, double MlWeight, double MlProbability, int RiskScore, string RiskTier,
    string Decision, string RuleOnlyTier, string MlOnlyTier, bool HardBlock, int LowMax, int MediumMax);

public record TimelineEventDto(string Kind, string Actor, string Title, string Detail, DateTime At);

public record TransactionDetailDto(
    int TransactionId,
    string Reference,
    string Type,
    string Status,
    decimal Amount,
    string Narration,
    string Channel,
    string CounterpartyDisplay,
    string? MerchantCategory,
    string? ShippingAddress,
    string Ip,
    string Country,
    string City,
    string LocationSource,
    string DeviceFingerprint,
    DateTime CreatedAt,
    string? ReviewedBy,
    DateTime? ReviewedAt,
    int CustomerId,
    string CustomerName,
    string CustomerEmail,
    string CustomerSegment,
    string AccountLast4,
    List<RuleCheckDto> Checks,
    MlLayerDto Ml,
    HybridDto Hybrid,
    List<TimelineEventDto> Timeline);
