using FraudDetection.Api.Models;
using FraudDetection.Api.Services;

namespace FraudDetection.Api.Rules;

// Probabilities used to draw the simulated banking context of a transaction. Fraudulent
// transactions are much more likely, but not certain, to carry a risky context. The whole
// configuration is stored with every evaluation run so that results can be reproduced.
public class ScenarioProfile
{
    public double AmountLogMean { get; set; } = Math.Log(12000);
    public double AmountLogSd { get; set; } = 0.75;
    public double PExtremeAmount { get; set; } = 0.0;
    public double PVeryHighAmount { get; set; } = 0.01;
    public double PDeviationSpike { get; set; } = 0.01;

    public double PTransfer { get; set; } = 0.45;
    public double PBill { get; set; } = 0.20;
    public double PCard { get; set; } = 0.20;
    public double PAtm { get; set; } = 0.10;
    public double PCollection { get; set; } = 0.05;

    public double POtherCity { get; set; } = 0.02;
    public double PAbroad { get; set; } = 0.02;
    public double PAbroadTravelNotice { get; set; } = 0.6;
    public double PHighRiskCountry { get; set; } = 0.0;
    public double PVpn { get; set; } = 0.004;
    public double PImpossibleTravel { get; set; } = 0.0;

    public double PNewDevice { get; set; } = 0.05;
    public double PSharedDevice { get; set; } = 0.0;
    public double PBurst { get; set; } = 0.01;
    public double PAtmBurst { get; set; } = 0.02;
    public double PFailedLoginBurst { get; set; } = 0.0;
    public double PCategoryHop { get; set; } = 0.0;
    public double PNight { get; set; } = 0.03;

    public double PNewBeneficiary { get; set; } = 0.03;
    public double PContactChange { get; set; } = 0.01;
    public double PSimSwap { get; set; } = 0.005;
    public double PPinChange { get; set; } = 0.005;
    public double PDormant { get; set; } = 0.01;
    public double PNewAccount { get; set; } = 0.01;
    public double PKycIssue { get; set; } = 0.01;
    public double PSamePhone { get; set; } = 0.005;

    public double PHighRiskMerchant { get; set; } = 0.03;
    public double PFirstTimeHighFraudMerchant { get; set; } = 0.01;
    public double PNewShipping { get; set; } = 0.03;
    public double PStructuring { get; set; } = 0.0;
    public double PPassThrough { get; set; } = 0.0;
    public double PTestThenLarge { get; set; } = 0.0;
    public double PRoundRepeat { get; set; } = 0.005;
}

public class ScenarioConfig
{
    public ScenarioProfile Legitimate { get; set; } = new();

    public ScenarioProfile Fraudulent { get; set; } = new()
    {
        AmountLogMean = Math.Log(60000), AmountLogSd = 1.4,
        PExtremeAmount = 0.03, PVeryHighAmount = 0.18, PDeviationSpike = 0.22,
        PTransfer = 0.50, PBill = 0.05, PCard = 0.30, PAtm = 0.10, PCollection = 0.05,
        POtherCity = 0.12, PAbroad = 0.36, PAbroadTravelNotice = 0.02, PHighRiskCountry = 0.06, PVpn = 0.12, PImpossibleTravel = 0.20,
        PNewDevice = 0.55, PSharedDevice = 0.12, PBurst = 0.20, PAtmBurst = 0.15, PFailedLoginBurst = 0.15, PCategoryHop = 0.10, PNight = 0.35,
        PNewBeneficiary = 0.35, PContactChange = 0.12, PSimSwap = 0.15, PPinChange = 0.10, PDormant = 0.08, PNewAccount = 0.10, PKycIssue = 0.15, PSamePhone = 0.08,
        PHighRiskMerchant = 0.35, PFirstTimeHighFraudMerchant = 0.25, PNewShipping = 0.40,
        PStructuring = 0.03, PPassThrough = 0.06, PTestThenLarge = 0.12, PRoundRepeat = 0.12,
    };

    // Share of fraudulent transactions whose banking context looks completely normal
    // (well-disguised fraud that the rule layer cannot see).
    public double PDisguisedFraud { get; set; } = 0.20;
    public double PStudent { get; set; } = 0.15;
    public double PPremium { get; set; } = 0.10;
}

public class ScenarioOverrides
{
    public string? Segment { get; set; }
    public KycStatus? Kyc { get; set; }
    public string? HomeCity { get; set; }
    public DateTime? AccountCreatedAt { get; set; }
    public DateTime? AccountLastActivityAt { get; set; }
    public bool? Fraud { get; set; }
}

public static class ScenarioBuilder
{
    private static readonly string[] AbroadKeys = ["ghana", "capetown", "london", "us", "dubai"];
    private static readonly string[] NormalCategories = ["Groceries", "Fashion", "Restaurants", "Travel", "Fuel", "Entertainment"];
    private static readonly string[] RiskyCategories = ["Gambling", "Cryptocurrency", "Money Transfer", "Electronics", "Jewellery"];
    private static readonly string[] BillCategories = ["Electricity", "Cable TV", "Airtime & Data", "Water", "Internet"];

    private static double Gauss(Random r)
    {
        var u1 = 1.0 - r.NextDouble();
        var u2 = r.NextDouble();
        return Math.Sqrt(-2.0 * Math.Log(u1)) * Math.Cos(2.0 * Math.PI * u2);
    }

    private static double Between(Random r, double lo, double hi) => lo + r.NextDouble() * (hi - lo);
    private static decimal Naira(double v) => Math.Round((decimal)v / 50m) * 50m;

    public static RuleContext Build(Random r, bool fraud, ScenarioConfig cfg, DateTime now, RiskSettings risk, ScenarioOverrides? o = null)
    {
        var profile = fraud && r.NextDouble() >= cfg.PDisguisedFraud ? cfg.Fraudulent : cfg.Legitimate;
        bool P(double p) => r.NextDouble() < p;

        // ---- customer profile
        var seg = o?.Segment ?? (P(cfg.PStudent) ? "Student" : P(cfg.PPremium / (1 - cfg.PStudent)) ? "Premium" : "Standard");
        var segFactor = seg switch { "Student" => 0.3, "Premium" => 4.0, _ => 1.0 };
        var mult = risk.MultiplierFor(seg);
        var baseAmount = 12000 * segFactor * Math.Exp(Gauss(r) * 0.35);

        var history = new CustomerHistory();
        var homeLoc = SimulatedLocations.Get("lagos");
        DateTime LocalAt(double daysAgo, int localHour, int minute) =>
            now.Date.AddDays(-Math.Ceiling(daysAgo)).AddHours(localHour - 1).AddMinutes(minute);

        // ---- account state
        var dormant = P(profile.PDormant);
        var newAccount = !dormant && P(profile.PNewAccount);
        var accountCreated = o?.AccountCreatedAt ?? (newAccount ? now.AddHours(-Between(r, 1, 40)) : now.AddDays(-Between(r, 60, 900)));
        DateTime? lastActivity = o?.AccountLastActivityAt;
        var catPool = new[] { "Groceries", "Electricity", "Airtime & Data", "Transfer", "Restaurants", "Fuel", "Fashion", "Travel", "Entertainment", "Cable TV", "Water", "Internet" };

        if (dormant)
        {
            lastActivity ??= now.AddDays(-Between(r, 95, 320));
        }
        else if (!newAccount)
        {
            var n = 12;
            for (var i = 0; i < n; i++)
            {
                var days = Between(r, 1.2, 70);
                var type = i % 5 == 0 ? TransactionType.BillPayment : i % 3 == 0 ? TransactionType.CardPayment : TransactionType.Transfer;
                var cat = type == TransactionType.Transfer ? "Transfer" : catPool[r.Next(catPool.Length)];
                var amt = Naira(baseAmount * Math.Exp(Gauss(r) * 0.5));
                history.Txns.Add(new HistTxn(LocalAt(days, 8 + r.Next(12), r.Next(60)), Math.Max(200m, amt), type, false, cat,
                    "Nigeria", "Lagos", homeLoc.Lat, homeLoc.Lon));
            }
            lastActivity ??= history.Txns.Max(t => t.AtUtc);
        }
        else
        {
            var k = r.Next(0, 3);
            for (var i = 0; i < k; i++)
                history.Txns.Add(new HistTxn(now.AddHours(-Between(r, 1, 30)), Naira(baseAmount * Math.Exp(Gauss(r) * 0.5)), TransactionType.Transfer, false, "Transfer", "Nigeria", "Lagos", homeLoc.Lat, homeLoc.Lon));
            lastActivity ??= history.Txns.Count > 0 ? history.Txns.Max(t => t.AtUtc) : null;
        }

        // ---- transaction type and amount
        var w = new[] { profile.PTransfer, profile.PBill, profile.PCard, profile.PAtm, profile.PCollection };
        var pick = r.NextDouble() * w.Sum();
        var type2 = TransactionType.Transfer; var acc = 0.0;
        var types = new[] { TransactionType.Transfer, TransactionType.BillPayment, TransactionType.CardPayment, TransactionType.AtmWithdrawal, TransactionType.Collection };
        for (var i = 0; i < w.Length; i++) { acc += w[i]; if (pick <= acc) { type2 = types[i]; break; } }

        decimal amount;
        var spike = false;
        if (P(profile.PExtremeAmount)) amount = Naira(Between(r, 5.2e6 * mult, 9e6 * mult));
        else if (P(profile.PVeryHighAmount)) amount = Naira(Between(r, 0.6e6 * mult, 4.9e6 * mult));
        else if (history.Txns.Count >= 3 && P(profile.PDeviationSpike)) { amount = Naira(baseAmount * Between(r, 6, 14)); spike = true; }
        else amount = Naira(Math.Clamp(Math.Exp(profile.AmountLogMean + Gauss(r) * profile.AmountLogSd) * segFactor, 200, 480000 * mult));
        if (type2 == TransactionType.AtmWithdrawal) amount = Math.Min(amount, 150000m);

        // ---- structuring, pass-through, test-then-large, round repeat
        if (type2 != TransactionType.Collection && P(profile.PStructuring))
        {
            amount = Naira(Between(r, 4.55e6, 4.98e6));
            for (var i = 0; i < 2; i++)
                history.Txns.Add(new HistTxn(now.AddHours(-Between(r, 1, 20)), Naira(Between(r, 4.55e6, 4.98e6)), TransactionType.Transfer, false, "Transfer", "Nigeria", "Lagos", homeLoc.Lat, homeLoc.Lon));
        }
        if (type2 == TransactionType.Transfer && P(profile.PPassThrough))
        {
            var credits = r.Next(2, 4); decimal total = 0;
            for (var i = 0; i < credits; i++)
            {
                var a = Naira(Between(r, 60000, 400000)); total += a;
                history.Txns.Add(new HistTxn(now.AddMinutes(-(i == 0 ? Between(r, 10, 50) : Between(r, 90, 1200))), a, TransactionType.Collection, true, "Collection", "Nigeria", "Lagos", homeLoc.Lat, homeLoc.Lon));
            }
            amount = Naira((double)total * Between(r, 0.85, 0.99));
        }
        if (type2 != TransactionType.Collection && P(profile.PTestThenLarge))
        {
            for (var i = 0; i < r.Next(2, 4); i++)
                history.Txns.Add(new HistTxn(now.AddMinutes(-Between(r, 3, 45)), Naira(Between(r, 100, 900)), TransactionType.CardPayment, false, "Electronics", "Nigeria", "Lagos", homeLoc.Lat, homeLoc.Lon));
            amount = Math.Max(amount, Naira(Between(r, 60000, 250000)));
        }
        if (type2 != TransactionType.Collection && P(profile.PRoundRepeat))
        {
            amount = 10000m * r.Next(1, 40);
            for (var i = 0; i < r.Next(2, 4); i++)
                history.Txns.Add(new HistTxn(now.AddHours(-Between(r, 1, 20)), 10000m * r.Next(1, 30), TransactionType.Transfer, false, "Transfer", "Nigeria", "Lagos", homeLoc.Lat, homeLoc.Lon));
        }

        // ---- velocity
        if (P(profile.PBurst))
            for (var i = 0; i < r.Next(4, 7); i++)
                history.Txns.Add(new HistTxn(now.AddMinutes(-Between(r, 0.5, 8)), Naira(baseAmount * 0.6), TransactionType.Transfer, false, "Transfer", "Nigeria", "Lagos", homeLoc.Lat, homeLoc.Lon));
        if (type2 == TransactionType.AtmWithdrawal && P(profile.PAtmBurst))
            for (var i = 0; i < r.Next(3, 6); i++)
                history.Txns.Add(new HistTxn(now.AddHours(-Between(r, 0.5, 12)), Naira(Between(r, 20000, 100000)), TransactionType.AtmWithdrawal, false, "AtmWithdrawal", "Nigeria", "Lagos", homeLoc.Lat, homeLoc.Lon));
        if (P(profile.PCategoryHop))
            foreach (var cat in new[] { "Groceries", "Electronics", "Travel", "Fashion" })
                history.Txns.Add(new HistTxn(now.AddMinutes(-Between(r, 1, 25)), Naira(Between(r, 3000, 40000)), TransactionType.CardPayment, false, cat, "Nigeria", "Lagos", homeLoc.Lat, homeLoc.Lon));

        // ---- log-ins
        if (P(profile.PFailedLoginBurst))
        {
            for (var i = 0; i < r.Next(3, 5); i++) history.Logins.Add(new HistLogin(now.AddMinutes(-Between(r, 10, 25)), false));
            history.Logins.Add(new HistLogin(now.AddMinutes(-Between(r, 1, 8)), true));
        }
        else history.Logins.Add(new HistLogin(now.AddMinutes(-Between(r, 30, 600)), true));

        // ---- location
        SimLocation loc = homeLoc; string? travelCountry = null;
        if (P(profile.PHighRiskCountry)) loc = SimulatedLocations.Get("tehran");
        else if (P(profile.PVpn)) loc = SimulatedLocations.Get("vpn");
        else if (P(profile.PAbroad)) loc = SimulatedLocations.Get(AbroadKeys[r.Next(AbroadKeys.Length)]);
        else if (P(profile.POtherCity)) loc = SimulatedLocations.Get("asaba");
        if (loc.Country != "Nigeria" && P(profile.PAbroadTravelNotice)) travelCountry = loc.Country;
        if (loc.Key != "lagos" && P(profile.PImpossibleTravel))
            history.Txns.Add(new HistTxn(now.AddMinutes(-Between(r, 10, 45)), Naira(baseAmount), TransactionType.Transfer, false, "Transfer", "Nigeria", "Lagos", homeLoc.Lat, homeLoc.Lon));

        // ---- device
        var newDevice = P(profile.PNewDevice);
        var shared = P(profile.PSharedDevice);
        if (shared)
            for (var i = 0; i < r.Next(2, 5); i++) history.DeviceEvents.Add(new DeviceEvent(100 + i, now.AddMinutes(-Between(r, 2, 40))));

        // ---- time of day
        int hour = P(profile.PNight) ? r.Next(0, 5) : 8 + r.Next(0, 12);
        int minute = r.Next(0, 60);

        // ---- beneficiary and profile changes
        DateTime? benAdded = null;
        if (type2 == TransactionType.Transfer)
            benAdded = P(profile.PNewBeneficiary) ? now.AddMinutes(-Between(r, 2, 50)) : now.AddDays(-Between(r, 30, 400));
        if (P(profile.PContactChange)) history.Changes.Add(new HistChange(now.AddHours(-Between(r, 1, 20)), r.Next(2) == 0 ? "Email" : "Address"));
        if (P(profile.PSimSwap)) history.Changes.Add(new HistChange(now.AddHours(-Between(r, 2, 40)), "Phone"));
        if (P(profile.PPinChange)) history.Changes.Add(new HistChange(now.AddHours(-Between(r, 1, 20)), "Pin"));

        // ---- merchant
        string? merchantName = null, merchantCategory = null; var highFraud = false; var firstTime = false; var shipNew = false; string? shipAddr = null;
        if (type2 == TransactionType.CardPayment)
        {
            var risky = P(profile.PHighRiskMerchant);
            merchantCategory = risky ? RiskyCategories[r.Next(RiskyCategories.Length)] : NormalCategories[r.Next(NormalCategories.Length)];
            highFraud = risky && P(profile.PFirstTimeHighFraudMerchant / Math.Max(profile.PHighRiskMerchant, 0.001));
            firstTime = highFraud || P(0.15);
            merchantName = highFraud ? "QuickDeal Global" : "Merchant " + merchantCategory;
            shipNew = P(profile.PNewShipping);
            shipAddr = shipNew ? "New address " + r.Next(1000) : "Home address";
        }
        else if (type2 == TransactionType.BillPayment)
        {
            merchantCategory = BillCategories[r.Next(BillCategories.Length)];
            merchantName = "Biller " + merchantCategory;
        }

        var kyc = o?.Kyc ?? (P(profile.PKycIssue) ? (r.Next(2) == 0 ? KycStatus.Pending : KycStatus.Mismatch) : KycStatus.Verified);
        var blacklisted = loc.Key == "vpn" ? "Tor: known exit node" : null;

        return new RuleContext
        {
            NowUtc = now, LocalHour = hour, LocalMinute = minute,
            Type = type2, Amount = amount,
            Channel = type2 switch { TransactionType.AtmWithdrawal => "ATM", TransactionType.CardPayment => "Card", TransactionType.BillPayment => "Web", _ => "Mobile" },
            Segment = seg, SegmentMultiplier = mult, Kyc = kyc,
            HomeCountry = "Nigeria", HomeCity = o?.HomeCity ?? "Lagos",
            TravelNoticeCountry = travelCountry, TravelNoticeUntil = travelCountry is null ? null : now.AddDays(7),
            AccountCreatedAt = accountCreated, AccountLastActivityAt = lastActivity,
            Geo = new GeoInfo(true, "simulated", loc.Country, loc.City, loc.Lat, loc.Lon),
            Ip = loc.Ip, BlacklistReason = blacklisted,
            DeviceFingerprint = newDevice ? "SIM-NEW" : "KNOWN-DEVICE",
            DeviceKnown = !newDevice, DeviceFirstSeenAt = newDevice ? null : now.AddDays(-Between(r, 20, 300)),
            MerchantName = merchantName, MerchantCategory = merchantCategory, MerchantHighFraud = highFraud,
            FirstTimeMerchant = firstTime, ShippingAddress = shipAddr, ShippingAddressNew = shipNew,
            BeneficiaryAddedAt = benAdded, OtherCustomersSamePhone = P(profile.PSamePhone) ? 1 : 0,
            History = history,
        };
    }
}
