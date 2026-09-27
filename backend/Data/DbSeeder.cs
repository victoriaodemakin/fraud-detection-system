using FraudDetection.Api.Models;
using FraudDetection.Api.Rules;
using FraudDetection.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace FraudDetection.Api.Data;

public static class DbSeeder
{
    private record SeedCustomer(
        string Name, string Email, string Phone, string Segment, decimal Balance, KycStatus Kyc,
        int AccountAgeDays, int HistoryTxns, int? IdleDays, string AccountNumber, string Address);

    private static readonly SeedCustomer[] Customers =
    [
        new("Adaeze Okafor", "adaeze@example.com", "08031110001", "Standard", 1_250_000m, KycStatus.Verified, 420, 46, null, "2001000101", "12 Adeola Odeku Street, Victoria Island, Lagos"),
        new("Tunde Bakare", "tunde@example.com", "08031110002", "Standard", 480_500m, KycStatus.Verified, 230, 32, null, "2001000102", "5 Allen Avenue, Ikeja, Lagos"),
        new("Chiamaka Eze", "chiamaka@example.com", "08031110003", "Premium", 18_020_750m, KycStatus.Verified, 710, 36, null, "2001000103", "20 Banana Island Road, Ikoyi, Lagos"),
        new("Ibrahim Musa", "ibrahim@example.com", "08031110004", "Standard", 320_000m, KycStatus.Pending, 90, 18, null, "2001000104", "3 Herbert Macaulay Way, Yaba, Lagos"),
        new("Ngozi Umeh", "ngozi@example.com", "08031110005", "Standard", 2_100_000m, KycStatus.Verified, 520, 16, 130, "2001000105", "8 Opebi Road, Ikeja, Lagos"),
        new("Femi Adeyemi", "femi@example.com", "08031110006", "Student", 42_000m, KycStatus.Verified, 200, 24, null, "2001000106", "Akoka, University of Lagos, Lagos"),
        new("Zainab Bello", "zainab@example.com", "08031110007", "Standard", 150_000m, KycStatus.Mismatch, 0, 0, null, "2001000107", "14 Admiralty Way, Lekki, Lagos"),
        new("Emeka Nwosu", "emeka@example.com", "08031110008", "Premium", 9_400_000m, KycStatus.Verified, 610, 30, null, "2001000108", "1 Awolowo Road, Ikoyi, Lagos"),
        new("Halima Yusuf", "halima@example.com", "08031110004", "Standard", 610_000m, KycStatus.Verified, 300, 26, null, "2001000109", "9 Ogunlana Drive, Surulere, Lagos"),
        new("Oluwaseun Ajayi", "seun@example.com", "08031110010", "Standard", 760_000m, KycStatus.Verified, 350, 28, null, "2001000110", "22 Ozumba Mbadiwe, Victoria Island, Lagos"),
    ];

    private static readonly string[] Payees =
        ["Amina Yusuf", "Chidi Obi", "Bisi Adekunle", "Kelechi Nnamdi", "Sade Ogunleye", "Musa Danjuma", "Ife Balogun", "Ngozi Okeke", "Tolu Fashola", "Yemi Alade"];
    private static readonly string[] Banks = ["GTBank", "Access Bank", "Zenith Bank", "First Bank", "UBA", "Sterling Bank", "Kuda", "Opay"];

    public static async Task SeedCoreAsync(AppDbContext db, PgpService pgp)
    {
        await db.Database.MigrateAsync();

        if (!await db.AdminUsers.AnyAsync())
        {
            db.AdminUsers.AddRange(
                new AdminUser { Username = "analyst", PasswordHash = BCrypt.Net.BCrypt.HashPassword("admin123"), FullName = "Amaka Eze", Email = "analyst@bank.local", Role = "Analyst" },
                new AdminUser { Username = "admin", PasswordHash = BCrypt.Net.BCrypt.HashPassword("admin123"), FullName = "Kunle Adebayo", Email = "admin@bank.local", Role = "Admin" });
        }

        if (!await db.Billers.AnyAsync())
        {
            db.Billers.AddRange(
                new Biller { Category = "Electricity", Name = "Eko Electricity Distribution Company" },
                new Biller { Category = "Electricity", Name = "Ikeja Electric" },
                new Biller { Category = "Cable TV", Name = "DStv" },
                new Biller { Category = "Cable TV", Name = "GOtv" },
                new Biller { Category = "Airtime & Data", Name = "MTN" },
                new Biller { Category = "Airtime & Data", Name = "Airtel" },
                new Biller { Category = "Airtime & Data", Name = "Glo" },
                new Biller { Category = "Internet", Name = "Spectranet" },
                new Biller { Category = "Internet", Name = "Smile" },
                new Biller { Category = "Water", Name = "Lagos Water Corporation" });
        }

        if (!await db.Merchants.AnyAsync())
        {
            db.Merchants.AddRange(
                new Merchant { Name = "Shoprite Nigeria", Category = "Groceries" },
                new Merchant { Name = "Jumia", Category = "Fashion" },
                new Merchant { Name = "Konga", Category = "Electronics" },
                new Merchant { Name = "Chicken Republic", Category = "Restaurants" },
                new Merchant { Name = "Air Peace", Category = "Travel" },
                new Merchant { Name = "TotalEnergies Filling Station", Category = "Fuel" },
                new Merchant { Name = "Netflix", Category = "Entertainment" },
                new Merchant { Name = "BetNaija", Category = "Gambling", HighFraud = true },
                new Merchant { Name = "CoinBridge Exchange", Category = "Cryptocurrency", HighFraud = true },
                new Merchant { Name = "GlobalWire Remit", Category = "Money Transfer", HighFraud = true },
                new Merchant { Name = "QuickDeal Global", Category = "Electronics", HighFraud = true },
                new Merchant { Name = "Diamond Palace Jewellers", Category = "Jewellery" });
        }

        if (!await db.IpBlacklist.AnyAsync())
        {
            db.IpBlacklist.AddRange(
                new IpBlacklistEntry { Ip = "185.220.101.1", Kind = "Tor", Reason = "Known Tor exit node" },
                new IpBlacklistEntry { Ip = "45.155.205.10", Kind = "VPN", Reason = "Commercial VPN range linked to card-testing" },
                new IpBlacklistEntry { Ip = "91.219.236.5", Kind = "Botnet", Reason = "Botnet command-and-control host" });
        }

        foreach (var (key, value, description) in SettingsService.Defaults)
            if (!await db.SystemSettings.AnyAsync(s => s.Key == key))
                db.SystemSettings.Add(new SystemSetting { Key = key, Value = value, Description = description });

        foreach (var spec in RuleCatalog.All)
        {
            if (await db.RuleDefinitions.AnyAsync(r => r.Code == spec.Code)) continue;
            db.RuleDefinitions.Add(new RuleDefinition
            {
                Code = spec.Code, Category = spec.Category, Name = spec.Name, Description = spec.Description,
                Points = spec.Points, Action = spec.Action, Enabled = true,
                ParametersJson = RuleEngine.SerializeParams(spec.DefaultParams()),
            });
        }

        await db.SaveChangesAsync();

        if (!await db.Customers.AnyAsync())
        {
            var now = DateTime.UtcNow;
            foreach (var c in Customers)
            {
                var customer = new Customer
                {
                    FullName = c.Name, Email = c.Email, Phone = c.Phone,
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword("password123"),
                    PinHash = BCrypt.Net.BCrypt.HashPassword("1234"),
                    Address = c.Address, Segment = c.Segment, Kyc = c.Kyc,
                    NameOnId = c.Kyc == KycStatus.Mismatch ? c.Name.Split(' ')[0] + " A. " + c.Name.Split(' ')[^1] + "son" : c.Name,
                    BvnLast4 = (1000 + c.Name.Length * 137 % 8999).ToString(),
                    CreatedAt = c.AccountAgeDays == 0 ? now.AddHours(-20) : now.AddDays(-c.AccountAgeDays),
                };
                if (c.Name == "Emeka Nwosu")
                {
                    customer.TravelNoticeCountry = "United Kingdom";
                    customer.TravelNoticeUntil = now.AddDays(12);
                }
                customer.Accounts.Add(new Account
                {
                    AccountNumberEncrypted = pgp.Encrypt(c.AccountNumber),
                    AccountNumberLast4 = c.AccountNumber[^4..],
                    AccountNumberHash = TransactionProcessor.HashAccountNumber(c.AccountNumber),
                    Type = c.Segment == "Premium" ? "Current" : "Savings",
                    Balance = c.Balance,
                    CreatedAt = customer.CreatedAt,
                    LastActivityAt = c.IdleDays is not null ? now.AddDays(-c.IdleDays.Value) : c.HistoryTxns == 0 ? null : now.AddDays(-1),
                });
                db.Customers.Add(customer);
            }
            await db.SaveChangesAsync();
        }
    }

    // Demo history: realistic past activity for each demo customer, produced by the same
    // rule engine and real ML probabilities the live system uses, so the dashboards are
    // populated from the first start.
    public static async Task<int> SeedDemoHistoryAsync(AppDbContext db, PgpService pgp, MlServiceClient ml, SettingsService settings, ILogger logger)
    {
        if (await db.Transactions.AnyAsync()) return 0;

        TestPredictions preds;
        try { preds = await ml.GetTestPredictionsAsync(); }
        catch (Exception ex)
        {
            logger.LogWarning("ML service unavailable, demo history not seeded: {Message}", ex.Message);
            return -1;
        }

        var rng = new Random(20260926);
        var cfg = new ScenarioConfig();
        var risk = await settings.GetRiskAsync();
        var defs = await db.RuleDefinitions.AsNoTracking().ToListAsync();
        var fraudIdx = Enumerable.Range(0, preds.Y.Length).Where(i => preds.Y[i] == 1).ToArray();
        var legitIdx = Enumerable.Range(0, preds.Y.Length).Where(i => preds.Y[i] == 0).Take(6000).ToArray();
        var now = DateTime.UtcNow;
        var customers = await db.Customers.Include(c => c.Accounts).OrderBy(c => c.Id).ToListAsync();
        var billers = await db.Billers.AsNoTracking().ToListAsync();
        var merchants = await db.Merchants.AsNoTracking().ToListAsync();
        var analyst = await db.AdminUsers.AsNoTracking().FirstAsync(a => a.Role == "Analyst");
        var total = 0;

        foreach (var cust in customers)
        {
            var seed = Customers.First(s => s.Email == cust.Email);
            var account = cust.Accounts[0];

            // devices, log-ins, payees, welcome notifications
            var fp = $"device-{cust.Id:D3}-web";
            db.Devices.Add(new Device { CustomerId = cust.Id, Fingerprint = fp, Label = "Chrome on Windows", FirstSeenAt = cust.CreatedAt, LastSeenAt = now.AddHours(-3), Trusted = true });
            if (cust.Id % 2 == 0) db.Devices.Add(new Device { CustomerId = cust.Id, Fingerprint = $"device-{cust.Id:D3}-mobile", Label = "Android app", FirstSeenAt = cust.CreatedAt.AddDays(5), LastSeenAt = now.AddDays(-2), Trusted = true });
            for (var i = 0; i < 14; i++)
                db.LoginEvents.Add(new LoginEvent { CustomerId = cust.Id, Email = cust.Email, Success = true, Ip = "105.112.5.1", Country = "Nigeria", City = "Lagos", DeviceFingerprint = fp, CreatedAt = now.AddDays(-rng.Next(0, 40)).AddMinutes(-rng.Next(0, 1400)) });
            if (cust.Email == "ibrahim@example.com")
                for (var i = 0; i < 4; i++)
                    db.LoginEvents.Add(new LoginEvent { CustomerId = cust.Id, Email = cust.Email, Success = false, Ip = "105.112.5.1", Country = "Nigeria", City = "Lagos", DeviceFingerprint = "device-unknown", CreatedAt = now.AddDays(-3).AddMinutes(i * 2) });
            for (var i = 0; i < 3; i++)
            {
                var name = Payees[(cust.Id + i) % Payees.Length];
                var acct = $"0{rng.Next(100000000, 999999999)}";
                db.Beneficiaries.Add(new Beneficiary { CustomerId = cust.Id, Name = name, BankName = Banks[(cust.Id + i) % Banks.Length], AccountNumberEncrypted = pgp.Encrypt(acct), AccountNumberLast4 = acct[^4..], AddedAt = now.AddDays(-rng.Next(30, 300)) });
            }
            db.Notifications.Add(new Notification { CustomerId = cust.Id, Kind = "Promo", Title = "Welcome to Arclight", Body = "Enjoy free transfers this month and 2% cashback on bill payments.", CreatedAt = cust.CreatedAt });
            if (cust.Email == "emeka@example.com")
                db.ProfileChanges.Add(new ProfileChange { CustomerId = cust.Id, Field = "Address", Detail = "Address updated", ChangedAt = now.AddDays(-30) });
            await db.SaveChangesAsync();

            // transaction history
            var ov = new ScenarioOverrides { Segment = cust.Segment, Kyc = cust.Kyc, AccountCreatedAt = account.CreatedAt, AccountLastActivityAt = seed.IdleDays is null ? null : now.AddDays(-seed.IdleDays.Value) };
            var span = seed.IdleDays is not null ? 250 : 88;
            for (var i = 0; i < seed.HistoryTxns; i++)
            {
                // spread over the history window; the last few days hold the recent cases
                var ageDays = seed.IdleDays is not null ? seed.IdleDays.Value + rng.NextDouble() * (span - seed.IdleDays.Value) : rng.NextDouble() * span;
                var at = now.AddDays(-ageDays).AddMinutes(-rng.Next(0, 600));
                if (at < account.CreatedAt.AddHours(2)) at = account.CreatedAt.AddHours(2 + rng.Next(0, 30));
                var fraudLike = rng.NextDouble() < (ageDays < 6 ? 0.28 : 0.05);
                await AddSeedTransactionAsync(db, pgp, cust, account, fp, at, fraudLike, cfg, risk, defs, preds, fraudIdx, legitIdx, billers, merchants, analyst, rng, ov, now);
                total++;
            }
        }

        await db.SaveChangesAsync();
        return total;
    }

    private static async Task AddSeedTransactionAsync(
        AppDbContext db, PgpService pgp, Customer cust, Account account, string fp, DateTime at, bool fraudLike,
        ScenarioConfig cfg, RiskSettings risk, List<RuleDefinition> defs, TestPredictions preds, int[] fraudIdx, int[] legitIdx,
        List<Biller> billers, List<Merchant> merchants, AdminUser analyst, Random rng, ScenarioOverrides ov, DateTime now)
    {
        var ctx = ScenarioBuilder.Build(rng, fraudLike, cfg, at, risk, ov);
        var run = RuleEngine.Run(ctx, defs);
        var idx = fraudLike ? fraudIdx[rng.Next(fraudIdx.Length)] : legitIdx[rng.Next(legitIdx.Length)];
        double pMl = preds.PMl[idx];
        var result = RiskScoring.Combine(run.Score, run.HardBlock, run.HardBlock ? null : pMl, risk);

        var status = result.Tier switch { "Low" => TransactionStatus.Approved, "Medium" => TransactionStatus.PendingReview, _ => TransactionStatus.Blocked };
        string? reviewedBy = null; DateTime? reviewedAt = null; string? reviewNote = null; string reviewAction = "";
        if (status == TransactionStatus.PendingReview && (now - at).TotalDays > 4)
        {
            var approve = fraudLike ? rng.NextDouble() < 0.2 : rng.NextDouble() < 0.85;
            status = approve ? TransactionStatus.Approved : TransactionStatus.Rejected;
            reviewedBy = analyst.FullName; reviewedAt = at.AddHours(1 + rng.Next(0, 20));
            reviewAction = approve ? "Approve" : "Reject";
            reviewNote = approve ? "Customer confirmed the payment by phone. Approved." : "Customer denied the payment. Rejected and card reissued.";
        }

        string display, raw, narration; string? key = null;
        switch (ctx.Type)
        {
            case TransactionType.BillPayment:
                var biller = billers.FirstOrDefault(b => b.Category == ctx.MerchantCategory) ?? billers[rng.Next(billers.Count)];
                display = biller.Name; raw = $"{biller.Name}|{rng.Next(10000000, 99999999)}"; narration = $"{biller.Category} payment"; key = $"biller:{biller.Id}";
                break;
            case TransactionType.CardPayment:
                var m = merchants.FirstOrDefault(x => x.Category == ctx.MerchantCategory) ?? merchants[rng.Next(merchants.Count)];
                display = m.Name; raw = $"{m.Name}|{m.Category}"; narration = $"Card payment - {m.Category}"; key = $"merchant:{m.Id}"; break;
            case TransactionType.AtmWithdrawal:
                display = "ATM - " + new[] { "Ikeja City Mall", "Lekki Phase 1", "Yaba Tech", "Surulere" }[rng.Next(4)]; raw = display; narration = "Cash withdrawal"; break;
            case TransactionType.Collection:
                var from = Payees[rng.Next(Payees.Length)];
                display = from; raw = $"{from}|0{rng.Next(100000000, 999999999)}"; narration = "Payment received"; break;
            default:
                var to = Payees[rng.Next(Payees.Length)]; var acct = $"0{rng.Next(100000000, 999999999)}";
                display = $"{to} ••••{acct[^4..]}"; raw = $"{to}|{acct}|{Banks[rng.Next(Banks.Length)]}"; narration = new[] { "Rent", "Feeding", "Thank you", "School fees", "Family support" }[rng.Next(5)]; break;
        }

        // Make the stored timestamp agree with the local time of day of the context.
        at = at.Date.AddHours(ctx.LocalHour - 1).AddMinutes(ctx.LocalMinute);
        if (at > now) at = now.AddMinutes(-30);

        var loc = SimulatedLocations.All.First(l => l.Country == ctx.Geo.Country && l.City == ctx.Geo.City);
        var transaction = new Transaction
        {
            Reference = $"TX{at:yyyyMMdd}-{rng.Next(100000, 999999)}",
            AccountId = account.Id, Type = ctx.Type, Amount = ctx.Amount, Narration = narration, Channel = ctx.Channel,
            CounterpartyDisplay = display, CounterpartyEncrypted = pgp.Encrypt(raw), CounterpartyKey = key,
            MerchantCategory = ctx.MerchantCategory, ShippingAddress = ctx.ShippingAddress,
            DeviceFingerprint = ctx.DeviceKnown ? fp : "device-unknown", Ip = loc.Ip,
            Country = ctx.Geo.Country, City = ctx.Geo.City, Latitude = ctx.Geo.Lat, Longitude = ctx.Geo.Lon,
            Status = status, CreatedAt = at, ReviewedAt = reviewedAt, ReviewedBy = reviewedBy,
        };
        db.Transactions.Add(transaction);
        await db.SaveChangesAsync();

        var screening = new ScreeningRecord
        {
            TransactionId = transaction.Id,
            SampleId = run.HardBlock ? "-" : $"TEST-{idx}", MlProfile = run.HardBlock ? "-" : (fraudLike ? "anomalous" : "typical"),
            RuleScore = run.Score, HardBlock = run.HardBlock, ChecksTotal = run.Checks.Count, ChecksFailed = run.Failed,
            LocationResolved = true, LocationSource = "simulated", Country = ctx.Geo.Country, City = ctx.Geo.City,
            LogisticRegressionProbability = run.HardBlock ? 0 : preds.PLr[idx],
            DecisionTreeProbability = run.HardBlock ? 0 : preds.PDt[idx],
            CombinedMlProbability = run.HardBlock ? 0 : pMl,
            RuleWeight = risk.RuleWeight, MlWeight = risk.MlWeight,
            RiskScore = result.Score, RiskTier = result.Tier, Decision = result.Decision,
            RuleOnlyTier = result.RuleOnlyTier, MlOnlyTier = result.MlOnlyTier,
            RawPayloadEncrypted = pgp.Encrypt($"{{\"seeded\":true,\"amount\":{ctx.Amount},\"type\":\"{ctx.Type}\"}}"),
        };
        foreach (var c in run.Checks)
            screening.Evaluations.Add(new RuleEvaluation
            {
                RuleCode = c.Code, Category = c.Category, RuleName = c.Name, Outcome = c.Outcome, Points = c.Points,
                PointsAwarded = c.Outcome == "Fail" && !c.HardBlock ? c.Points : 0, HardBlock = c.HardBlock,
                Observed = c.Observed, Threshold = c.Threshold, Detail = c.Detail,
            });
        db.ScreeningRecords.Add(screening);

        db.AuditLogs.Add(new AuditLog { Actor = cust.Email, ActorRole = "Customer", Action = "TransactionScreened", EntityType = "Transaction", EntityId = transaction.Id.ToString(), CreatedAt = at, Detail = $"{ctx.Type} of {ctx.Amount:N2}: rule score {run.Score}, hybrid {result.Score} ({result.Tier}) -> {result.Decision}." });
        if (reviewedBy is not null)
        {
            db.CaseNotes.Add(new CaseNote { TransactionId = transaction.Id, Author = reviewedBy, Action = reviewAction, Note = reviewNote!, CreatedAt = reviewedAt!.Value });
            db.AuditLogs.Add(new AuditLog { Actor = reviewedBy, ActorRole = "Analyst", Action = "TransactionReviewed", EntityType = "Transaction", EntityId = transaction.Id.ToString(), CreatedAt = reviewedAt.Value, Detail = $"{reviewAction}: {reviewNote}" });
        }
        if (status != TransactionStatus.Approved && (now - at).TotalDays < 20)
            db.Notifications.Add(new Notification { CustomerId = cust.Id, Kind = "Security", Title = status == TransactionStatus.Blocked ? "Transaction blocked" : status == TransactionStatus.PendingReview ? "Transaction held for review" : "Review completed", Body = $"{ctx.Type} of {ctx.Amount:N2} - {status}.", TransactionId = transaction.Id, CreatedAt = reviewedAt ?? at });
    }
}
