using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FraudDetection.Api.Data;
using FraudDetection.Api.Models;
using FraudDetection.Api.Rules;
using Microsoft.EntityFrameworkCore;

namespace FraudDetection.Api.Services;

public class AuditService(AppDbContext db)
{
    public void Add(string actor, string role, string action, string entityType, string entityId, string detail) =>
        db.AuditLogs.Add(new AuditLog
        {
            Actor = actor, ActorRole = role, Action = action, EntityType = entityType,
            EntityId = entityId, Detail = detail, CreatedAt = DateTime.UtcNow,
        });
}

// Everything the processor needs to know about one requested payment, already resolved
// from the request (beneficiary, biller or merchant looked up).
public record PaymentInput(
    int CustomerId,
    int AccountId,
    TransactionType Type,
    decimal Amount,
    string Narration,
    string Pin,
    string CounterpartyDisplay,
    string CounterpartyRaw,
    string? CounterpartyKey,
    string? MerchantCategory,
    string? MerchantName,
    bool MerchantHighFraud,
    string? ShippingAddress,
    Beneficiary? Beneficiary,
    bool NewRecipient,
    string Channel,
    string DeviceId,
    SimulationInput? Sim);

// Screens and records a customer-initiated payment: builds the rule context from the
// customer's real history in the database, runs the rule layer, then (unless hard-blocked)
// the ML layer, combines both into the hybrid risk score, decides, and persists the
// transaction, the pass/fail result of every rule, the audit trail and a notification.
public class TransactionProcessor(
    AppDbContext db,
    GeoLocationService geo,
    MlServiceClient ml,
    SettingsService settings,
    PgpService pgp,
    AuditService audit)
{
    private static readonly Random Rng = new();

    public async Task<TransactionResultDto> ProcessAsync(PaymentInput input)
    {
        var account = await db.Accounts.Include(a => a.Customer)
            .FirstOrDefaultAsync(a => a.Id == input.AccountId && a.CustomerId == input.CustomerId)
            ?? throw new InvalidOperationException("Account not found.");
        var customer = account.Customer!;

        if (customer.Status == "Suspended")
            throw new InvalidOperationException("This account is suspended. Please contact support.");

        if (!BCrypt.Net.BCrypt.Verify(input.Pin, customer.PinHash))
        {
            audit.Add(customer.Email, "Customer", "PinRejected", "Customer", customer.Id.ToString(), "Incorrect transaction PIN entered.");
            await db.SaveChangesAsync();
            throw new UnauthorizedAccessException("Incorrect PIN.");
        }

        if (input.Amount <= 0) throw new InvalidOperationException("Enter an amount greater than zero.");
        var isCredit = input.Type == TransactionType.Collection;
        if (!isCredit && input.Amount > account.Balance) throw new InvalidOperationException("Insufficient balance.");

        var now = DateTime.UtcNow;
        var sim = input.Sim;
        var location = SimulatedLocations.Get(sim?.Location);
        var geoInfo = await geo.ResolveAsync(location.Ip, location);

        // ---- device and log-in context (demo controls can override the real ones)
        var fingerprint = (sim?.DeviceMode ?? "current") switch
        {
            "new" => "SIM-NEW-" + Guid.NewGuid().ToString("N")[..8].ToUpperInvariant(),
            "shared" => "SIM-SHARED-CYBERCAFE",
            _ => string.IsNullOrWhiteSpace(input.DeviceId) ? "unknown-device" : input.DeviceId,
        };

        if (sim?.LoginBehaviour == "failed-burst")
        {
            foreach (var minutesAgo in new[] { 14, 11, 8 })
                db.LoginEvents.Add(new LoginEvent { CustomerId = customer.Id, Email = customer.Email, Success = false, Ip = location.Ip, Country = geoInfo.Country, City = geoInfo.City, DeviceFingerprint = fingerprint, Simulated = true, CreatedAt = now.AddMinutes(-minutesAgo) });
            db.LoginEvents.Add(new LoginEvent { CustomerId = customer.Id, Email = customer.Email, Success = true, Ip = location.Ip, Country = geoInfo.Country, City = geoInfo.City, DeviceFingerprint = fingerprint, Simulated = true, CreatedAt = now.AddMinutes(-4) });
        }

        if (sim?.DeviceMode == "shared")
        {
            var others = await db.Customers.Where(c => c.Id != customer.Id).OrderBy(c => c.Id).Take(3).Select(c => new { c.Id, c.Email }).ToListAsync();
            var minutes = 25;
            foreach (var o in others)
            {
                db.LoginEvents.Add(new LoginEvent { CustomerId = o.Id, Email = o.Email, Success = true, Ip = location.Ip, Country = geoInfo.Country, City = geoInfo.City, DeviceFingerprint = fingerprint, Simulated = true, CreatedAt = now.AddMinutes(-minutes) });
                minutes -= 8;
            }
        }
        await db.SaveChangesAsync();

        var device = await db.Devices.FirstOrDefaultAsync(d => d.CustomerId == customer.Id && d.Fingerprint == fingerprint);

        // ---- local time of day
        var local = now.AddHours(1); // West Africa Time (UTC+1)
        var hour = local.Hour; var minute = local.Minute;
        if (!string.IsNullOrWhiteSpace(sim?.LocalTime) && TimeSpan.TryParse(sim.LocalTime, out var t))
        {
            hour = t.Hours; minute = t.Minutes;
        }

        // ---- the customer's own history (last 90 days)
        var since = now.AddDays(-90);
        var history = new CustomerHistory();
        var past = await db.Transactions.AsNoTracking()
            .Where(x => x.AccountId == account.Id && x.CreatedAt >= since)
            .Select(x => new { x.CreatedAt, x.Amount, x.Type, x.MerchantCategory, x.Country, x.City, x.Latitude, x.Longitude })
            .ToListAsync();
        foreach (var p in past)
            history.Txns.Add(new HistTxn(p.CreatedAt, p.Amount, p.Type, p.Type == TransactionType.Collection,
                p.MerchantCategory ?? p.Type.ToString(), p.Country, p.City, p.Latitude, p.Longitude));

        var logins = await db.LoginEvents.AsNoTracking()
            .Where(l => l.CustomerId == customer.Id && l.CreatedAt >= now.AddDays(-1))
            .Select(l => new { l.CreatedAt, l.Success }).ToListAsync();
        foreach (var l in logins) history.Logins.Add(new HistLogin(l.CreatedAt, l.Success));

        var changes = await db.ProfileChanges.AsNoTracking()
            .Where(c => c.CustomerId == customer.Id && c.ChangedAt >= now.AddDays(-7))
            .Select(c => new { c.ChangedAt, c.Field }).ToListAsync();
        foreach (var c in changes) history.Changes.Add(new HistChange(c.ChangedAt, c.Field));

        var deviceEvents = await db.LoginEvents.AsNoTracking()
            .Where(l => l.DeviceFingerprint == fingerprint && l.CustomerId != null && l.CustomerId != customer.Id && l.CreatedAt >= now.AddDays(-1))
            .Select(l => new { l.CustomerId, l.CreatedAt }).ToListAsync();
        foreach (var e in deviceEvents) history.DeviceEvents.Add(new DeviceEvent(e.CustomerId!.Value, e.CreatedAt));

        var blacklist = await db.IpBlacklist.AsNoTracking().FirstOrDefaultAsync(b => b.Ip == location.Ip);
        var samePhone = await db.Customers.CountAsync(c => c.Phone == customer.Phone && c.Id != customer.Id);

        var firstTimeMerchant = false;
        if (input.CounterpartyKey is not null && input.MerchantName is not null)
            firstTimeMerchant = !await db.Transactions.AnyAsync(x => x.AccountId == account.Id && x.CounterpartyKey == input.CounterpartyKey);
        var shippingNew = false;
        if (!string.IsNullOrWhiteSpace(input.ShippingAddress))
            shippingNew = !await db.Transactions.AnyAsync(x => x.AccountId == account.Id && x.ShippingAddress == input.ShippingAddress);

        var riskSettings = await settings.GetRiskAsync();
        var ctx = new RuleContext
        {
            NowUtc = now, LocalHour = hour, LocalMinute = minute,
            Type = input.Type, Amount = input.Amount, Channel = input.Channel,
            Segment = customer.Segment, SegmentMultiplier = riskSettings.MultiplierFor(customer.Segment),
            Kyc = customer.Kyc, HomeCountry = customer.HomeCountry, HomeCity = customer.HomeCity,
            TravelNoticeCountry = customer.TravelNoticeCountry, TravelNoticeUntil = customer.TravelNoticeUntil,
            AccountCreatedAt = account.CreatedAt, AccountLastActivityAt = account.LastActivityAt,
            Geo = geoInfo, Ip = location.Ip, BlacklistReason = blacklist is null ? null : $"{blacklist.Kind}: {blacklist.Reason}",
            DeviceFingerprint = fingerprint, DeviceKnown = device is not null, DeviceFirstSeenAt = device?.FirstSeenAt,
            MerchantName = input.MerchantName, MerchantCategory = input.MerchantCategory, MerchantHighFraud = input.MerchantHighFraud,
            FirstTimeMerchant = firstTimeMerchant, ShippingAddress = input.ShippingAddress, ShippingAddressNew = shippingNew,
            BeneficiaryAddedAt = input.Type == TransactionType.Transfer ? (input.Beneficiary?.AddedAt ?? (input.NewRecipient ? now : null)) : null,
            OtherCustomersSamePhone = samePhone,
            History = history,
        };

        // ---- layer 1: rule engine; layer 2: ML (skipped on a hard block)
        var defs = await db.RuleDefinitions.AsNoTracking().ToListAsync();
        var ruleResult = RuleEngine.Run(ctx, defs);

        MlAssessment? mlResult = null;
        if (!ruleResult.HardBlock)
        {
            var sampleId = await ml.PickSampleIdAsync(sim?.MlProfile, Rng);
            mlResult = await ml.PredictAsync(sampleId);
        }

        var risk = RiskScoring.Combine(ruleResult.Score, ruleResult.HardBlock, mlResult?.CombinedMlProbability, riskSettings);
        var status = risk.Tier switch
        {
            "Low" => TransactionStatus.Approved,
            "Medium" => TransactionStatus.PendingReview,
            _ => TransactionStatus.Blocked,
        };

        // ---- persist
        var reference = $"TX{now:yyyyMMdd}-{RandomNumberGenerator.GetInt32(100000, 999999)}";
        var transaction = new Transaction
        {
            Reference = reference, AccountId = account.Id, Type = input.Type, Amount = input.Amount,
            Narration = input.Narration, Channel = input.Channel,
            CounterpartyDisplay = input.CounterpartyDisplay, CounterpartyEncrypted = pgp.Encrypt(input.CounterpartyRaw),
            CounterpartyKey = input.CounterpartyKey, MerchantCategory = input.MerchantCategory,
            ShippingAddress = input.ShippingAddress, BeneficiaryId = input.Beneficiary?.Id,
            DeviceFingerprint = fingerprint, Ip = location.Ip, Country = geoInfo.Country, City = geoInfo.City,
            Latitude = geoInfo.Lat, Longitude = geoInfo.Lon,
            Status = status, CreatedAt = now,
        };
        db.Transactions.Add(transaction);
        await db.SaveChangesAsync();

        var rawPayload = JsonSerializer.Serialize(new
        {
            input.AccountId, input.Type, input.Amount, input.CounterpartyRaw, input.Narration, input.Channel,
            location.Ip, fingerprint, localTime = $"{hour:00}:{minute:00}", simulation = sim, mlSample = mlResult?.SampleId,
        });

        var screening = new ScreeningRecord
        {
            TransactionId = transaction.Id,
            SampleId = mlResult?.SampleId ?? "-", MlProfile = mlResult?.Profile ?? "-",
            RuleScore = ruleResult.Score, HardBlock = ruleResult.HardBlock,
            ChecksTotal = ruleResult.Checks.Count, ChecksFailed = ruleResult.Failed,
            LocationResolved = geoInfo.Resolved, LocationSource = geoInfo.Source, Country = geoInfo.Country, City = geoInfo.City,
            LogisticRegressionProbability = mlResult?.LogisticRegressionProbability ?? 0,
            DecisionTreeProbability = mlResult?.DecisionTreeProbability ?? 0,
            CombinedMlProbability = mlResult?.CombinedMlProbability ?? 0,
            DatasetReferenceAmount = mlResult?.DatasetAmount ?? 0,
            RuleWeight = riskSettings.RuleWeight, MlWeight = riskSettings.MlWeight,
            RiskScore = risk.Score, RiskTier = risk.Tier, Decision = risk.Decision,
            RuleOnlyTier = risk.RuleOnlyTier, MlOnlyTier = risk.MlOnlyTier,
            RawPayloadEncrypted = pgp.Encrypt(rawPayload),
        };
        foreach (var c in ruleResult.Checks)
            screening.Evaluations.Add(new RuleEvaluation
            {
                RuleCode = c.Code, Category = c.Category, RuleName = c.Name, Outcome = c.Outcome,
                Points = c.Points, PointsAwarded = c.Outcome == "Fail" && !c.HardBlock ? c.Points : 0,
                HardBlock = c.HardBlock, Observed = c.Observed, Threshold = c.Threshold, Detail = c.Detail,
            });
        db.ScreeningRecords.Add(screening);

        // Money only moves for approved transactions; flagged or blocked ones are held.
        if (status == TransactionStatus.Approved)
        {
            account.Balance += isCredit ? input.Amount : -input.Amount;
            account.LastActivityAt = now;
        }

        // Remember the device and any new payee.
        if (device is null)
            db.Devices.Add(new Device { CustomerId = customer.Id, Fingerprint = fingerprint, Label = fingerprint.StartsWith("SIM-") ? "Simulated device" : "Web browser", FirstSeenAt = now, LastSeenAt = now });
        else
            device.LastSeenAt = now;

        audit.Add(customer.Email, "Customer", "TransactionScreened", "Transaction", transaction.Id.ToString(),
            $"{input.Type} of {input.Amount:N2}: rule score {ruleResult.Score}, ML {(mlResult is null ? "not run" : mlResult.CombinedMlProbability.ToString("P1"))}, hybrid {risk.Score} ({risk.Tier}) -> {risk.Decision}.");

        var (title, body) = status switch
        {
            TransactionStatus.Approved => ("Transaction successful", $"Your {TypeWord(input.Type)} of ₦{input.Amount:N2} to {input.CounterpartyDisplay} was successful."),
            TransactionStatus.PendingReview => ("Transaction under review", $"Your {TypeWord(input.Type)} of ₦{input.Amount:N2} is under review. We will notify you as soon as it is complete."),
            _ => ("Transaction not completed", $"For your protection we could not complete your {TypeWord(input.Type)} of ₦{input.Amount:N2}. Your money has not left your account. If this was you, please contact support."),
        };
        db.Notifications.Add(new Notification { CustomerId = customer.Id, Kind = status == TransactionStatus.Approved ? "Transaction" : "Security", Title = title, Body = body, TransactionId = transaction.Id, CreatedAt = now });

        await db.SaveChangesAsync();

        return new TransactionResultDto(
            transaction.Id, reference, input.Type.ToString(), status.ToString(),
            input.Amount, input.CounterpartyDisplay, account.Balance, now, body);
    }

    private static string TypeWord(TransactionType t) => t switch
    {
        TransactionType.BillPayment => "bill payment",
        TransactionType.CardPayment => "card payment",
        TransactionType.AtmWithdrawal => "ATM withdrawal",
        TransactionType.Collection => "money request",
        _ => "transfer",
    };

    public static string HashAccountNumber(string accountNumber) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(accountNumber.Trim()))).ToLowerInvariant();
}
