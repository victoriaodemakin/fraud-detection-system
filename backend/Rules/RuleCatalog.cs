using System.Globalization;
using FraudDetection.Api.Models;

namespace FraudDetection.Api.Rules;

public record ParamMeta(string Key, string Label, string Unit, string Default);

public record RuleEval(string Outcome, string Observed, string Threshold, string Detail);

public delegate RuleEval Evaluator(RuleContext c, RuleParams p);

public record RuleSpec(
    string Code,
    string Category,
    string Name,
    string Description,
    int Points,
    string Action,
    ParamMeta[] Params,
    Evaluator Evaluate)
{
    public Dictionary<string, string> DefaultParams() => Params.ToDictionary(p => p.Key, p => p.Default);
}

public class RuleParams(Dictionary<string, string> raw)
{
    public double D(string key, double fallback = 0) =>
        raw.TryGetValue(key, out var v) && double.TryParse(v, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d : fallback;

    public int I(string key, int fallback = 0) => (int)Math.Round(D(key, fallback));

    public decimal M(string key, decimal fallback = 0) => (decimal)D(key, (double)fallback);

    public string S(string key, string fallback = "") => raw.TryGetValue(key, out var v) ? v : fallback;

    public HashSet<string> List(string key) =>
        S(key).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
              .ToHashSet(StringComparer.OrdinalIgnoreCase);
}

// The rules-engine catalogue: ~30 configurable rules in the 8 groups used by real fraud
// rules engines (velocity, amount, geographic, device and channel, behavioural, account and
// profile, merchant, structuring/AML-adjacent). Every rule has a weight (points) and
// parameters that an administrator can change on the Rules page; each screened
// transaction stores a pass / fail result for every rule.
public static class RuleCatalog
{
    private const string Naira = "₦";

    private static string Money(decimal v) => $"{Naira}{v:N0}";
    private static string Mins(double m) =>
        m >= 1440 && m % 1440 == 0 ? $"{m / 1440:0} day(s)" :
        m >= 60 && m % 60 == 0 ? $"{m / 60:0} hour(s)" : $"{m:0} min";

    private static RuleEval Pass(string observed, string threshold, string detail = "Within the configured limit.") =>
        new("Pass", observed, threshold, detail);

    private static RuleEval Fail(string observed, string threshold, string detail) =>
        new("Fail", observed, threshold, detail);

    private static RuleEval NA(string reason, string threshold = "-") =>
        new("NotApplicable", "-", threshold, reason);

    private static double Haversine(double lat1, double lon1, double lat2, double lon2)
    {
        const double r = 6371.0;
        double ToRad(double x) => x * Math.PI / 180.0;
        var dLat = ToRad(lat2 - lat1);
        var dLon = ToRad(lon2 - lon1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                Math.Cos(ToRad(lat1)) * Math.Cos(ToRad(lat2)) * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        return 2 * r * Math.Asin(Math.Sqrt(a));
    }

    private static string CategoryOf(RuleContext c) => c.MerchantCategory ?? c.Type.ToString();

    public static readonly IReadOnlyList<RuleSpec> All =
    [
        // ---------------------------------------------------------------- 1. Velocity
        new("VEL-01", "Velocity", "Transaction burst",
            "Too many transactions on the same account within a short window (e.g. 5+ in 10 minutes).",
            25, "Score",
            [new("count", "Transactions", "txns", "5"), new("windowMinutes", "Window", "minutes", "10")],
            (c, p) =>
            {
                var w = TimeSpan.FromMinutes(p.D("windowMinutes", 10));
                var limit = p.I("count", 5);
                var n = c.History.TxnsWithin(c.NowUtc, w).Count() + 1;
                var obs = $"{n} in {Mins(w.TotalMinutes)}";
                var thr = $">= {limit} in {Mins(w.TotalMinutes)}";
                return n >= limit ? Fail(obs, thr, "Rapid succession of transactions on this account.") : Pass(obs, thr);
            }),

        new("VEL-02", "Velocity", "ATM withdrawals per day",
            "More ATM withdrawals in a day than the configured limit.",
            20, "Score",
            [new("count", "Max withdrawals", "per window", "3"), new("windowMinutes", "Window", "minutes", "1440")],
            (c, p) =>
            {
                if (c.Type != TransactionType.AtmWithdrawal) return NA("Not an ATM withdrawal.");
                var w = TimeSpan.FromMinutes(p.D("windowMinutes", 1440));
                var limit = p.I("count", 3);
                var n = c.History.TxnsWithin(c.NowUtc, w).Count(t => t.Type == TransactionType.AtmWithdrawal) + 1;
                var obs = $"{n} withdrawals in {Mins(w.TotalMinutes)}";
                var thr = $"> {limit} per {Mins(w.TotalMinutes)}";
                return n > limit ? Fail(obs, thr, "ATM withdrawal limit exceeded for the window.") : Pass(obs, thr);
            }),

        new("VEL-03", "Velocity", "Failed logins, then a high-value transaction",
            "Several failed log-in attempts, then a successful one, followed at once by a high-value transaction.",
            35, "Score",
            [new("count", "Failed attempts", "attempts", "3"), new("windowMinutes", "Window before login", "minutes", "30"),
             new("afterLoginMinutes", "Transaction within", "minutes of login", "15"), new("amount", "Amount from", "NGN", "100000")],
            (c, p) =>
            {
                var limit = p.I("count", 3);
                var w = TimeSpan.FromMinutes(p.D("windowMinutes", 30));
                var after = TimeSpan.FromMinutes(p.D("afterLoginMinutes", 15));
                var amt = p.M("amount", 100000);
                var thr = $">= {limit} failures in {Mins(w.TotalMinutes)}, then a {Money(amt)}+ transaction within {Mins(after.TotalMinutes)}";
                var lastOk = c.History.Logins.Where(l => l.Success).Select(l => (DateTime?)l.AtUtc).Max();
                if (lastOk is null) return Pass("No recent log-in history", thr);
                var failed = c.History.Logins.Count(l => !l.Success && l.AtUtc <= lastOk && lastOk.Value - l.AtUtc <= w);
                var sinceLogin = c.NowUtc - lastOk.Value;
                var obs = $"{failed} failed log-ins, transaction {sinceLogin.TotalMinutes:0} min after log-in";
                return failed >= limit && sinceLogin <= after && c.Amount >= amt
                    ? Fail(obs, thr, "Possible account takeover: failed log-ins followed by an immediate high-value transaction.")
                    : Pass(obs, thr);
            }),

        new("VEL-04", "Velocity", "Rapid category hopping",
            "Transactions across many different merchant categories in a short window.",
            15, "Score",
            [new("count", "Categories", "distinct", "4"), new("windowMinutes", "Window", "minutes", "30")],
            (c, p) =>
            {
                var w = TimeSpan.FromMinutes(p.D("windowMinutes", 30));
                var limit = p.I("count", 4);
                var cats = c.History.TxnsWithin(c.NowUtc, w).Select(t => t.Category ?? t.Type.ToString()).Append(CategoryOf(c))
                    .Distinct(StringComparer.OrdinalIgnoreCase).Count();
                var obs = $"{cats} categories in {Mins(w.TotalMinutes)}";
                var thr = $">= {limit} categories in {Mins(w.TotalMinutes)}";
                return cats >= limit ? Fail(obs, thr, "Spending jumped across many categories quickly.") : Pass(obs, thr);
            }),

        // ---------------------------------------------------------------- 2. Amount
        new("AMT-01", "Amount", "High amount",
            "Amount above a fixed threshold, scaled by customer segment (student / standard / premium).",
            30, "Score",
            [new("amount", "Threshold (standard segment)", "NGN", "500000")],
            (c, p) =>
            {
                var thr = p.M("amount", 500000) * (decimal)c.SegmentMultiplier;
                var t = $"> {Money(thr)} ({c.Segment} x{c.SegmentMultiplier:0.##})";
                return c.Amount > thr
                    ? Fail(Money(c.Amount), t, "Amount exceeds the high-amount threshold for this segment.")
                    : Pass(Money(c.Amount), t);
            }),

        new("AMT-02", "Amount", "Extreme amount (hard block)",
            "Amount above the extreme ceiling: the transaction is blocked outright, without the ML layer.",
            100, "HardBlock",
            [new("amount", "Ceiling (standard segment)", "NGN", "5000000")],
            (c, p) =>
            {
                var thr = p.M("amount", 5000000) * (decimal)c.SegmentMultiplier;
                var t = $"> {Money(thr)} ({c.Segment} x{c.SegmentMultiplier:0.##})";
                return c.Amount > thr
                    ? Fail(Money(c.Amount), t, "Amount exceeds the extreme-amount ceiling: hard block.")
                    : Pass(Money(c.Amount), t);
            }),

        new("AMT-03", "Amount", "Deviation from the customer's average",
            "Amount several times the customer's own 90-day average transaction.",
            25, "Score",
            [new("ratio", "Multiple of average", "x", "5"), new("count", "Minimum history", "txns", "3"), new("windowMinutes", "History window", "minutes", "129600")],
            (c, p) =>
            {
                var w = TimeSpan.FromMinutes(p.D("windowMinutes", 129600));
                var min = p.I("count", 3);
                var ratio = p.D("ratio", 5);
                var past = c.History.TxnsWithin(c.NowUtc, w).Where(t => !t.Credit).ToList();
                var thr = $"> {ratio:0.#}x the {Mins(w.TotalMinutes)} average (needs {min}+ past txns)";
                if (c.IsCredit) return NA("Credits are not compared with spending history.", thr);
                if (past.Count < min) return NA($"Not enough history ({past.Count} of {min} transactions).", thr);
                var avg = past.Average(t => t.Amount);
                var mult = avg > 0 ? (double)(c.Amount / avg) : 0;
                var obs = $"{Money(c.Amount)} = {mult:0.0}x average ({Money(avg)})";
                return mult > ratio ? Fail(obs, thr, "Amount is far above what this customer normally spends.") : Pass(obs, thr);
            }),

        new("AMT-04", "Amount", "Repeated round-number amounts",
            "Round-number amounts repeated within a short period (a pattern seen when stolen cards are tested).",
            10, "Score",
            [new("count", "Round transactions", "txns", "3"), new("amount", "Round to multiples of", "NGN", "10000"), new("windowMinutes", "Window", "minutes", "1440")],
            (c, p) =>
            {
                var b = p.M("amount", 10000);
                var w = TimeSpan.FromMinutes(p.D("windowMinutes", 1440));
                var limit = p.I("count", 3);
                var thr = $">= {limit} multiples of {Money(b)} in {Mins(w.TotalMinutes)}";
                if (c.IsCredit) return NA("Credits are not checked.", thr);
                var isRound = c.Amount >= b && c.Amount % b == 0;
                if (!isRound) return Pass($"{Money(c.Amount)} is not a round figure", thr);
                var n = c.History.TxnsWithin(c.NowUtc, w).Count(t => !t.Credit && t.Amount >= b && t.Amount % b == 0) + 1;
                var obs = $"{n} round-number txns in {Mins(w.TotalMinutes)}";
                return n >= limit ? Fail(obs, thr, "Round amounts are repeated frequently.") : Pass(obs, thr);
            }),

        new("AMT-05", "Amount", "Small test transactions, then a large one",
            "Several very small \"test\" transactions followed by a large one.",
            35, "Score",
            [new("count", "Small transactions", "txns", "2"), new("amount", "Small means up to", "NGN", "1000"),
             new("amount2", "Large means from", "NGN", "50000"), new("windowMinutes", "Window", "minutes", "60")],
            (c, p) =>
            {
                var small = p.M("amount", 1000);
                var large = p.M("amount2", 50000);
                var w = TimeSpan.FromMinutes(p.D("windowMinutes", 60));
                var limit = p.I("count", 2);
                var thr = $">= {limit} txns of {Money(small)} or less in {Mins(w.TotalMinutes)}, then {Money(large)}+";
                if (c.IsCredit) return NA("Credits are not checked.", thr);
                if (c.Amount < large) return Pass($"{Money(c.Amount)} is below the large-amount level", thr);
                var n = c.History.TxnsWithin(c.NowUtc, w).Count(t => !t.Credit && t.Amount <= small);
                var obs = $"{n} small txns in {Mins(w.TotalMinutes)}, then {Money(c.Amount)}";
                return n >= limit ? Fail(obs, thr, "Card-testing pattern: small probes followed by a large transaction.") : Pass(obs, thr);
            }),

        // ---------------------------------------------------------------- 3. Geographic
        new("GEO-01", "Geographic", "Impossible travel",
            "The distance from the previous transaction cannot be covered in the time between them.",
            45, "Score",
            [new("maxSpeedKmh", "Max plausible speed", "km/h", "900"), new("minDistanceKm", "Ignore distances below", "km", "300")],
            (c, p) =>
            {
                var maxSpeed = p.D("maxSpeedKmh", 900);
                var minDist = p.D("minDistanceKm", 300);
                var thr = $"> {maxSpeed:0} km/h over {minDist:0}+ km";
                if (!c.Geo.Resolved || c.Geo.Lat is null || c.Geo.Lon is null) return NA("Location could not be resolved.", thr);
                var last = c.History.Txns.Where(t => t.Lat is not null && t.Lon is not null && t.AtUtc <= c.NowUtc)
                    .OrderByDescending(t => t.AtUtc).FirstOrDefault();
                if (last is null) return NA("No earlier located transaction.", thr);
                var km = Haversine(last.Lat!.Value, last.Lon!.Value, c.Geo.Lat.Value, c.Geo.Lon.Value);
                var hours = Math.Max((c.NowUtc - last.AtUtc).TotalHours, 1.0 / 60);
                var speed = km / hours;
                var obs = $"{last.City ?? "previous"} to {c.Geo.City}: {km:N0} km in {hours * 60:N0} min ({speed:N0} km/h)";
                return km >= minDist && speed > maxSpeed
                    ? Fail(obs, thr, "The customer could not physically have travelled this far in the time.")
                    : Pass(obs, thr);
            }),

        new("GEO-02", "Geographic", "High-risk country",
            "Transaction originates from a country on the high-risk list.",
            40, "Score",
            [new("countries", "High-risk countries", "list", "Iran,North Korea,Syria,Myanmar,Afghanistan,Yemen,Sudan,Cuba")],
            (c, p) =>
            {
                var list = p.List("countries");
                var thr = $"in {list.Count} listed countries";
                if (!c.Geo.Resolved) return NA("Location could not be resolved.", thr);
                return list.Contains(c.Geo.Country)
                    ? Fail(c.Geo.Country, thr, "Transaction from a high-risk country.")
                    : Pass(c.Geo.Country, thr);
            }),

        new("GEO-03", "Geographic", "New country for the customer",
            "The customer has never transacted from this country before.",
            20, "Score",
            [],
            (c, p) =>
            {
                const string thr = "country never seen in history";
                if (!c.Geo.Resolved) return NA("Location could not be resolved.", thr);
                if (string.Equals(c.Geo.Country, c.HomeCountry, StringComparison.OrdinalIgnoreCase)) return Pass(c.Geo.Country + " (home)", thr);
                var seen = c.History.Txns.Any(t => string.Equals(t.Country, c.Geo.Country, StringComparison.OrdinalIgnoreCase));
                return seen ? Pass(c.Geo.Country + " (seen before)", thr) : Fail(c.Geo.Country + " (first time)", thr, "First transaction from this country.");
            }),

        new("GEO-04", "Geographic", "Foreign country without travel notice",
            "Transaction outside the customer's home country and no travel notice is on file.",
            40, "Score",
            [],
            (c, p) =>
            {
                const string thr = "outside home country, no travel notice";
                if (!c.Geo.Resolved) return NA("Location could not be resolved.", thr);
                if (string.Equals(c.Geo.Country, c.HomeCountry, StringComparison.OrdinalIgnoreCase)) return Pass(c.Geo.Country + " (home)", thr);
                var notice = c.TravelNoticeCountry is not null &&
                             string.Equals(c.TravelNoticeCountry, c.Geo.Country, StringComparison.OrdinalIgnoreCase) &&
                             c.TravelNoticeUntil is not null && c.TravelNoticeUntil >= c.NowUtc;
                return notice
                    ? Pass($"{c.Geo.Country}, travel notice on file", thr)
                    : Fail($"{c.Geo.Country} (home is {c.HomeCountry})", thr, "Customer is transacting abroad without a travel notification.");
            }),

        new("GEO-05", "Geographic", "Unusual city (same country)",
            "Transaction from a different city in the home country. City-level IP accuracy is lower, so the weight is lower.",
            15, "Score",
            [],
            (c, p) =>
            {
                const string thr = "city differs from home city";
                if (!c.Geo.Resolved) return NA("Location could not be resolved.", thr);
                if (!string.Equals(c.Geo.Country, c.HomeCountry, StringComparison.OrdinalIgnoreCase)) return NA("Outside the home country (see GEO-04).", thr);
                return string.Equals(c.Geo.City, c.HomeCity, StringComparison.OrdinalIgnoreCase)
                    ? Pass(c.Geo.City + " (home city)", thr)
                    : Fail($"{c.Geo.City} (home is {c.HomeCity})", thr, "Different city from the customer's usual one.");
            }),

        new("GEO-06", "Geographic", "IP does not match billing country",
            "Online card payment whose IP address country differs from the customer's registered (billing) country.",
            25, "Score",
            [],
            (c, p) =>
            {
                const string thr = "IP country = billing country";
                if (c.Type != TransactionType.CardPayment) return NA("Not a card payment.", thr);
                if (!c.Geo.Resolved) return NA("Location could not be resolved.", thr);
                return string.Equals(c.Geo.Country, c.HomeCountry, StringComparison.OrdinalIgnoreCase)
                    ? Pass($"IP {c.Geo.Country}", thr)
                    : Fail($"IP {c.Geo.Country}, billing {c.HomeCountry}", thr, "Online payment placed from outside the billing country.");
            }),

        // ---------------------------------------------------------------- 4. Device and channel
        new("DEV-01", "Device & channel", "New device, high-value transaction",
            "A device seen for the first time recently is used for a high-value transaction.",
            30, "Score",
            [new("windowMinutes", "Device is new if first seen within", "minutes", "60"), new("amount", "High value from", "NGN", "100000")],
            (c, p) =>
            {
                var w = p.D("windowMinutes", 60);
                var amt = p.M("amount", 100000);
                var thr = $"device first seen < {Mins(w)} ago and amount >= {Money(amt)}";
                var age = c.DeviceKnown && c.DeviceFirstSeenAt is not null ? (c.NowUtc - c.DeviceFirstSeenAt.Value).TotalMinutes : 0;
                var isNew = !c.DeviceKnown || age <= w;
                var obs = isNew ? $"new device, {Money(c.Amount)}" : $"known device (first seen {Mins(Math.Round(age))} ago), {Money(c.Amount)}";
                return isNew && c.Amount >= amt
                    ? Fail(obs, thr, "High-value transaction from a device the bank has not seen before.")
                    : Pass(obs, thr);
            }),

        new("DEV-02", "Device & channel", "Many accounts on one device",
            "Several different accounts accessed from the same device in a short window.",
            25, "Score",
            [new("count", "Other accounts", "accounts", "2"), new("windowMinutes", "Window", "minutes", "60")],
            (c, p) =>
            {
                var w = TimeSpan.FromMinutes(p.D("windowMinutes", 60));
                var limit = p.I("count", 2);
                var others = c.History.DeviceEvents.Where(e => c.NowUtc - e.AtUtc <= w).Select(e => e.CustomerId).Distinct().Count();
                var obs = $"{others} other account(s) in {Mins(w.TotalMinutes)}";
                var thr = $">= {limit} other accounts in {Mins(w.TotalMinutes)}";
                return others >= limit ? Fail(obs, thr, "The same device is being used across several accounts.") : Pass(obs, thr);
            }),

        new("DEV-03", "Device & channel", "Blacklisted IP, VPN or Tor exit node",
            "The request comes from an IP address on the blacklist (VPN, Tor exit node, botnet).",
            60, "Score",
            [],
            (c, p) =>
            {
                const string thr = "IP not on the blacklist";
                return c.BlacklistReason is null
                    ? Pass(c.Ip, thr)
                    : Fail($"{c.Ip} ({c.BlacklistReason})", thr, "Request originates from an anonymising or known-bad network.");
            }),

        new("DEV-04", "Device & channel", "SIM swap / phone change, then transaction",
            "The phone number was changed recently and a transaction follows within the window.",
            35, "Score",
            [new("windowMinutes", "Window after change", "minutes", "2880"), new("amount", "Amount from", "NGN", "10000")],
            (c, p) =>
            {
                var w = TimeSpan.FromMinutes(p.D("windowMinutes", 2880));
                var amt = p.M("amount", 10000);
                var thr = $"phone changed < {Mins(w.TotalMinutes)} ago and amount >= {Money(amt)}";
                var swap = c.History.Changes.Where(x => x.Field == "Phone" && c.NowUtc - x.AtUtc <= w).OrderByDescending(x => x.AtUtc).FirstOrDefault();
                if (swap is null) return Pass("no recent phone change", thr);
                var obs = $"phone changed {(c.NowUtc - swap.AtUtc).TotalHours:0.#} h ago, {Money(c.Amount)}";
                return c.Amount >= amt ? Fail(obs, thr, "Possible SIM swap: phone changed just before a transaction.") : Pass(obs, thr);
            }),

        // ---------------------------------------------------------------- 5. Behavioural
        new("BEH-01", "Behavioural", "Unusual time of day",
            "Transaction at a time the customer does not normally transact (learned from history, or a default band).",
            15, "Score",
            [new("startHour", "Default band starts", "hour", "6"), new("endHour", "Default band ends", "hour", "22"), new("count", "History needed", "txns", "5"), new("marginHours", "Margin around learned hours", "hours", "3")],
            (c, p) =>
            {
                var start = p.I("startHour", 6);
                var end = p.I("endHour", 22);
                var need = p.I("count", 5);
                var margin = p.I("marginHours", 3);
                var hours = c.History.Txns.Where(t => !t.Credit).Select(t => t.AtUtc.AddHours(1).Hour).ToList();
                var lo = start; var hi = end; var basis = "default band";
                if (hours.Count >= need)
                {
                    lo = Math.Max(0, hours.Min() - margin); hi = Math.Min(23, hours.Max() + margin); basis = "learned from history";
                }
                var thr = $"outside {lo:00}:00-{hi:00}:59 ({basis})";
                var obs = $"{c.LocalHour:00}:{c.LocalMinute:00} local time";
                return c.LocalHour < lo || c.LocalHour > hi
                    ? Fail(obs, thr, "Transaction at an unusual hour for this customer.")
                    : Pass(obs, thr);
            }),

        new("BEH-02", "Behavioural", "Sudden change in spending category",
            "A category the customer has never used before, with a sizeable amount.",
            15, "Score",
            [new("count", "History needed", "txns", "3"), new("amount", "Amount from", "NGN", "50000")],
            (c, p) =>
            {
                var need = p.I("count", 3);
                var amt = p.M("amount", 50000);
                var thr = $"new category, amount >= {Money(amt)}";
                if (c.MerchantCategory is null) return NA("No merchant category on this transaction.", thr);
                if (c.History.Txns.Count < need) return NA($"Not enough history ({c.History.Txns.Count} of {need}).", thr);
                var used = c.History.Txns.Any(t => string.Equals(t.Category, c.MerchantCategory, StringComparison.OrdinalIgnoreCase));
                var obs = $"{c.MerchantCategory} ({(used ? "used before" : "first time")}), {Money(c.Amount)}";
                return !used && c.Amount >= amt ? Fail(obs, thr, "Spending moved into a category the customer has never used.") : Pass(obs, thr);
            }),

        new("BEH-03", "Behavioural", "Dormant account suddenly active",
            "No activity for a long time, then a large transaction.",
            30, "Score",
            [new("dormantDays", "Dormant after", "days", "90"), new("amount", "Amount from", "NGN", "50000")],
            (c, p) =>
            {
                var days = p.D("dormantDays", 90);
                var amt = p.M("amount", 50000);
                var thr = $"inactive >= {days:0} days and amount >= {Money(amt)}";
                if (c.AccountLastActivityAt is null) return NA("No previous activity on the account.", thr);
                var idle = (c.NowUtc - c.AccountLastActivityAt.Value).TotalDays;
                var obs = $"inactive {idle:0} days, {Money(c.Amount)}";
                return idle >= days && c.Amount >= amt ? Fail(obs, thr, "A dormant account became active with a large transaction.") : Pass(obs, thr);
            }),

        new("BEH-04", "Behavioural", "New beneficiary paid straight away",
            "A payee was added a very short time ago and a large transfer follows.",
            30, "Score",
            [new("windowMinutes", "Beneficiary is new if added within", "minutes", "60"), new("amount", "Amount from", "NGN", "50000")],
            (c, p) =>
            {
                var w = p.D("windowMinutes", 60);
                var amt = p.M("amount", 50000);
                var thr = $"beneficiary added < {Mins(w)} ago and amount >= {Money(amt)}";
                if (c.Type != TransactionType.Transfer || c.BeneficiaryAddedAt is null) return NA("Not a transfer to a saved beneficiary.", thr);
                var age = (c.NowUtc - c.BeneficiaryAddedAt.Value).TotalMinutes;
                var obs = $"beneficiary added {Mins(Math.Round(age))} ago, {Money(c.Amount)}";
                return age <= w && c.Amount >= amt ? Fail(obs, thr, "Funds sent to a payee added moments earlier.") : Pass(obs, thr);
            }),

        // ---------------------------------------------------------------- 6. Account and profile
        new("PRO-01", "Account & profile", "Recent email or address change",
            "Contact details changed shortly before a transaction.",
            30, "Score",
            [new("windowMinutes", "Window after change", "minutes", "1440"), new("amount", "Amount from", "NGN", "20000")],
            (c, p) =>
            {
                var w = TimeSpan.FromMinutes(p.D("windowMinutes", 1440));
                var amt = p.M("amount", 20000);
                var thr = $"email/address changed < {Mins(w.TotalMinutes)} ago and amount >= {Money(amt)}";
                var ch = c.History.Changes.Where(x => (x.Field == "Email" || x.Field == "Address") && c.NowUtc - x.AtUtc <= w)
                    .OrderByDescending(x => x.AtUtc).FirstOrDefault();
                if (ch is null) return Pass("no recent change", thr);
                var obs = $"{ch.Field} changed {(c.NowUtc - ch.AtUtc).TotalHours:0.#} h ago, {Money(c.Amount)}";
                return c.Amount >= amt ? Fail(obs, thr, "Contact details changed just before money moved.") : Pass(obs, thr);
            }),

        new("PRO-02", "Account & profile", "New account, high-value transaction",
            "A high-value transaction shortly after the account was opened (bust-out pattern).",
            35, "Score",
            [new("windowMinutes", "Account is new if opened within", "minutes", "2880"), new("amount", "Amount from", "NGN", "100000")],
            (c, p) =>
            {
                var w = p.D("windowMinutes", 2880);
                var amt = p.M("amount", 100000);
                var thr = $"account opened < {Mins(w)} ago and amount >= {Money(amt)}";
                var age = (c.NowUtc - c.AccountCreatedAt).TotalMinutes;
                var obs = $"account age {(age >= 1440 ? $"{age / 1440:0.#} days" : $"{age / 60:0.#} h")}, {Money(c.Amount)}";
                return age <= w && c.Amount >= amt ? Fail(obs, thr, "Large transaction on a brand-new account.") : Pass(obs, thr);
            }),

        new("PRO-03", "Account & profile", "Linked accounts (shared phone number)",
            "Other customers are registered with the same phone number.",
            20, "Score",
            [new("count", "Other accounts", "accounts", "1")],
            (c, p) =>
            {
                var limit = p.I("count", 1);
                var obs = $"{c.OtherCustomersSamePhone} other account(s) with this phone";
                var thr = $">= {limit} other account(s)";
                return c.OtherCustomersSamePhone >= limit ? Fail(obs, thr, "The same phone number is linked to several accounts.") : Pass(obs, thr);
            }),

        new("PRO-04", "Account & profile", "KYC not verified",
            "The customer's identity check is pending or mismatched, but the account is transacting.",
            30, "Score",
            [],
            (c, p) =>
            {
                const string thr = "KYC status = Verified";
                return c.Kyc == KycStatus.Verified
                    ? Pass("Verified", thr)
                    : Fail(c.Kyc.ToString(), thr, "Account is transacting without a completed identity verification.");
            }),

        new("PRO-05", "Account & profile", "Recent PIN change, then transaction",
            "The transaction PIN was changed shortly before a high-value transaction (account-takeover pattern).",
            35, "Score",
            [new("windowMinutes", "Window after change", "minutes", "1440"), new("amount", "Amount from", "NGN", "20000")],
            (c, p) =>
            {
                var w = TimeSpan.FromMinutes(p.D("windowMinutes", 1440));
                var amt = p.M("amount", 20000);
                var thr = $"PIN changed < {Mins(w.TotalMinutes)} ago and amount >= {Money(amt)}";
                var ch = c.History.Changes.Where(x => x.Field == "Pin" && c.NowUtc - x.AtUtc <= w).OrderByDescending(x => x.AtUtc).FirstOrDefault();
                if (ch is null) return Pass("no recent PIN change", thr);
                var obs = $"PIN changed {(c.NowUtc - ch.AtUtc).TotalHours:0.#} h ago, {Money(c.Amount)}";
                return c.Amount >= amt ? Fail(obs, thr, "Transaction PIN changed just before money moved.") : Pass(obs, thr);
            }),

        // ---------------------------------------------------------------- 7. Merchant / transaction type
        new("MER-01", "Merchant & type", "High-risk merchant category",
            "Merchant category flagged as high risk (gambling, cryptocurrency, money transfer services).",
            25, "Score",
            [new("categories", "High-risk categories", "list", "Gambling,Cryptocurrency,Money Transfer")],
            (c, p) =>
            {
                var list = p.List("categories");
                var thr = $"category in {string.Join(", ", list)}";
                if (c.MerchantCategory is null) return NA("No merchant category on this transaction.", thr);
                return list.Contains(c.MerchantCategory)
                    ? Fail(c.MerchantCategory, thr, "Payment to a high-risk merchant category.")
                    : Pass(c.MerchantCategory, thr);
            }),

        new("MER-02", "Merchant & type", "First payment to a high-fraud merchant",
            "First-time payment to a merchant known for high fraud rates.",
            20, "Score",
            [],
            (c, p) =>
            {
                const string thr = "first-time payment to a high-fraud merchant";
                if (c.MerchantName is null) return NA("No merchant on this transaction.", thr);
                var obs = $"{c.MerchantName} ({(c.FirstTimeMerchant ? "first time" : "used before")}, {(c.MerchantHighFraud ? "high-fraud" : "normal fraud rate")})";
                return c.FirstTimeMerchant && c.MerchantHighFraud ? Fail(obs, thr, "New payee with a high fraud rate.") : Pass(obs, thr);
            }),

        new("MER-03", "Merchant & type", "Card-not-present, high-risk merchant, new shipping address",
            "Online card payment to a high-risk merchant combined with a shipping address never used before.",
            25, "Score",
            [new("categories", "High-risk categories", "list", "Gambling,Cryptocurrency,Money Transfer,Electronics,Jewellery")],
            (c, p) =>
            {
                var list = p.List("categories");
                const string thr = "online card payment + high-risk merchant + new shipping address";
                if (c.Type != TransactionType.CardPayment) return NA("Not a card payment.", thr);
                var risky = c.MerchantCategory is not null && list.Contains(c.MerchantCategory);
                var obs = $"{c.MerchantCategory ?? "-"}, shipping address {(c.ShippingAddressNew ? "new" : "known")}";
                return risky && c.ShippingAddressNew ? Fail(obs, thr, "Classic card-not-present fraud combination.") : Pass(obs, thr);
            }),

        // ---------------------------------------------------------------- 8. Structuring / AML-adjacent
        new("AML-01", "Structuring (AML-adjacent)", "Amounts just under the reporting threshold",
            "Repeated transactions just below a reporting threshold (structuring).",
            40, "Score",
            [new("amount", "Reporting threshold", "NGN", "5000000"), new("percent", "Band starts at", "% of threshold", "90"),
             new("count", "Transactions in band", "txns", "3"), new("windowMinutes", "Window", "minutes", "1440")],
            (c, p) =>
            {
                var limitAmt = p.M("amount", 5000000);
                var lower = limitAmt * (decimal)(p.D("percent", 90) / 100.0);
                var w = TimeSpan.FromMinutes(p.D("windowMinutes", 1440));
                var need = p.I("count", 3);
                var thr = $">= {need} txns between {Money(lower)} and {Money(limitAmt)} in {Mins(w.TotalMinutes)}";
                if (c.IsCredit) return NA("Credits are not checked.", thr);
                var inBand = c.Amount >= lower && c.Amount <= limitAmt;
                if (!inBand) return Pass($"{Money(c.Amount)} is not close to the threshold", thr);
                var n = c.History.TxnsWithin(c.NowUtc, w).Count(t => !t.Credit && t.Amount >= lower && t.Amount <= limitAmt) + 1;
                var obs = $"{n} transactions in the band in {Mins(w.TotalMinutes)}";
                return n >= need ? Fail(obs, thr, "Several amounts just under the reporting threshold: possible structuring.") : Pass(obs, thr);
            }),

        new("AML-02", "Structuring (AML-adjacent)", "Pass-through: money in, money straight out",
            "Several credits followed by an immediate transfer out of most of the money.",
            35, "Score",
            [new("count", "Credits", "credits", "2"), new("windowMinutes", "Credit window", "minutes", "1440"),
             new("ratio", "Outflow share of credits", "ratio", "0.8"), new("payoutMinutes", "Outflow within", "minutes of last credit", "60")],
            (c, p) =>
            {
                var need = p.I("count", 2);
                var w = TimeSpan.FromMinutes(p.D("windowMinutes", 1440));
                var ratio = p.D("ratio", 0.8);
                var payout = TimeSpan.FromMinutes(p.D("payoutMinutes", 60));
                var thr = $">= {need} credits in {Mins(w.TotalMinutes)}, {ratio:P0}+ sent out within {Mins(payout.TotalMinutes)}";
                if (c.IsCredit) return NA("This is a credit.", thr);
                var credits = c.History.TxnsWithin(c.NowUtc, w).Where(t => t.Credit).OrderByDescending(t => t.AtUtc).ToList();
                if (credits.Count < need) return Pass($"{credits.Count} credit(s) in {Mins(w.TotalMinutes)}", thr);
                var total = credits.Sum(t => t.Amount);
                var since = c.NowUtc - credits[0].AtUtc;
                var share = total > 0 ? (double)(c.Amount / total) : 0;
                var obs = $"{credits.Count} credits ({Money(total)}), {share:P0} sent out {since.TotalMinutes:0} min after the last one";
                return share >= ratio && since <= payout ? Fail(obs, thr, "Funds are moving straight through the account.") : Pass(obs, thr);
            }),
    ];

    public static RuleSpec? Find(string code) => All.FirstOrDefault(r => r.Code == code);
}
