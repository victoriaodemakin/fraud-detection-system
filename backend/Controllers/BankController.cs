using System.Security.Claims;
using System.Text.RegularExpressions;
using FraudDetection.Api.Data;
using FraudDetection.Api.Models;
using FraudDetection.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FraudDetection.Api.Controllers;

[ApiController]
[Route("api/bank")]
[Authorize(Roles = "Customer")]
public class BankController(
    AppDbContext db,
    PgpService pgp,
    TransactionProcessor processor,
    TransactionDetailService details,
    AuditService audit) : ControllerBase
{
    private int CustomerId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private string DeviceId => Request.Headers["X-Device-Id"].FirstOrDefault() ?? "unknown-device";

    private async Task<Customer> CurrentAsync() =>
        await db.Customers.Include(c => c.Accounts).FirstAsync(c => c.Id == CustomerId);

    // ------------------------------------------------------------------ profile
    [HttpGet("me")]
    public async Task<CustomerProfileDto> Me() => await CustomerMapper.ProfileAsync(await CurrentAsync(), db, pgp);

    [HttpGet("locations")]
    public IEnumerable<object> Locations() =>
        SimulatedLocations.All.Select(l => new { key = l.Key, label = l.Label, country = l.Country, city = l.City });

    [HttpGet("billers")]
    public async Task<List<BillerDto>> Billers() =>
        await db.Billers.AsNoTracking().OrderBy(b => b.Category).ThenBy(b => b.Name).Select(b => new BillerDto(b.Id, b.Category, b.Name)).ToListAsync();

    [HttpGet("merchants")]
    public async Task<List<MerchantDto>> Merchants() =>
        await db.Merchants.AsNoTracking().OrderBy(m => m.Category).ThenBy(m => m.Name).Select(m => new MerchantDto(m.Id, m.Name, m.Category, m.HighFraud)).ToListAsync();

    // ------------------------------------------------------------------ dashboard
    [HttpGet("dashboard")]
    public async Task<object> Dashboard()
    {
        var customer = await CurrentAsync();
        var accountIds = customer.Accounts.Select(a => a.Id).ToList();
        var now = DateTime.UtcNow;
        var since30 = now.AddDays(-30);

        var txns = await db.Transactions.AsNoTracking()
            .Where(t => accountIds.Contains(t.AccountId) && t.CreatedAt >= now.AddMonths(-6))
            .OrderByDescending(t => t.CreatedAt).ToListAsync();

        var approved = txns.Where(t => t.Status == TransactionStatus.Approved).ToList();
        var last30 = approved.Where(t => t.CreatedAt >= since30).ToList();
        var income = last30.Where(t => t.Type == TransactionType.Collection).Sum(t => t.Amount);
        var spending = last30.Where(t => t.Type != TransactionType.Collection).Sum(t => t.Amount);

        var byCategory = last30.Where(t => t.Type != TransactionType.Collection)
            .GroupBy(t => t.MerchantCategory ?? (t.Type == TransactionType.Transfer ? "Transfers" : t.Type == TransactionType.AtmWithdrawal ? "Cash" : t.Type.ToString()))
            .Select(g => new { category = g.Key, amount = g.Sum(t => t.Amount) }).OrderByDescending(x => x.amount).ToList();

        var monthly = Enumerable.Range(0, 6).Select(i => now.AddMonths(-5 + i)).Select(m =>
        {
            var inMonth = approved.Where(t => t.CreatedAt.Year == m.Year && t.CreatedAt.Month == m.Month).ToList();
            return new
            {
                month = m.ToString("MMM"),
                income = inMonth.Where(t => t.Type == TransactionType.Collection).Sum(t => t.Amount),
                spending = inMonth.Where(t => t.Type != TransactionType.Collection).Sum(t => t.Amount),
            };
        }).ToList();

        var recent = txns.Take(6).Select(ToListItem).ToList();
        var unread = await db.Notifications.CountAsync(n => n.CustomerId == customer.Id && !n.Read);
        var held = txns.Count(t => t.Status == TransactionStatus.PendingReview);

        return new
        {
            profile = await CustomerMapper.ProfileAsync(customer, db, pgp),
            income, spending, byCategory, monthly, recent, unreadNotifications = unread, heldTransactions = held,
            totalTransactions = txns.Count,
        };
    }

    // ------------------------------------------------------------------ transactions
    private static TransactionListItemDto ToListItem(Transaction t) => new(
        t.Id, t.Reference, t.Type.ToString(), t.Status.ToString(), t.Amount, t.CounterpartyDisplay, t.Narration, t.Channel,
        t.Country, t.City, t.CreatedAt);

    [HttpGet("transactions")]
    public async Task<object> Transactions(string? status, string? type, string? q, DateTime? from, DateTime? to, int page = 1, int pageSize = 15)
    {
        var accountIds = await db.Accounts.Where(a => a.CustomerId == CustomerId).Select(a => a.Id).ToListAsync();
        var query = db.Transactions.AsNoTracking().Where(t => accountIds.Contains(t.AccountId));
        if (Enum.TryParse<TransactionStatus>(status, out var st)) query = query.Where(t => t.Status == st);
        if (Enum.TryParse<TransactionType>(type, out var ty)) query = query.Where(t => t.Type == ty);
        if (from is not null) query = query.Where(t => t.CreatedAt >= from);
        if (to is not null) query = query.Where(t => t.CreatedAt <= to.Value.AddDays(1));
        if (!string.IsNullOrWhiteSpace(q))
        {
            var s = q.Trim();
            query = query.Where(t => t.Reference.Contains(s) || t.CounterpartyDisplay.Contains(s) || t.Narration.Contains(s));
        }
        var total = await query.CountAsync();
        var items = await query.OrderByDescending(t => t.CreatedAt).Skip((Math.Max(page, 1) - 1) * pageSize).Take(pageSize).ToListAsync();
        return new { items = items.Select(ToListItem), total, page, pageSize };
    }

    // A customer sees the outcome of their own payment and a plain timeline, never the
    // screening internals (risk score, rule results, ML output): those are for analysts.
    [HttpGet("transactions/{id:int}")]
    public async Task<IActionResult> TransactionDetail(int id)
    {
        var t = await db.Transactions.AsNoTracking().Include(x => x.Account)
            .FirstOrDefaultAsync(x => x.Id == id && x.Account!.CustomerId == CustomerId);
        if (t is null) return NotFound(new { message = "Transaction not found." });

        var word = t.Type switch { TransactionType.BillPayment => "bill payment", TransactionType.CardPayment => "card payment", TransactionType.AtmWithdrawal => "ATM withdrawal", TransactionType.Collection => "money request", _ => "transfer" };
        var timeline = new List<CustomerTimelineDto> { new("Payment submitted", $"You submitted a {word} of ₦{t.Amount:N2}.", t.CreatedAt) };
        string message;
        switch (t.Status)
        {
            case TransactionStatus.Approved:
                timeline.Add(new("Payment successful", "The payment was approved and completed.", t.ReviewedAt ?? t.CreatedAt));
                message = "This payment was successful.";
                break;
            case TransactionStatus.PendingReview:
                timeline.Add(new("Under review", "The payment is being reviewed by our security team. Your money has not left your account.", t.CreatedAt));
                message = "This payment is under review. Your money has not left your account. We will notify you when the review is complete.";
                break;
            case TransactionStatus.Blocked:
                timeline.Add(new("Not completed", "For your protection this payment could not be completed. Your money has not left your account.", t.CreatedAt));
                message = "For your protection this payment could not be completed. Your money has not left your account. If it was you, please contact support.";
                break;
            default:
                timeline.Add(new("Review completed", "After a security review this payment was not completed.", t.ReviewedAt ?? t.CreatedAt));
                message = "After a security review this payment was not completed. Your money has not left your account.";
                break;
        }
        return Ok(new CustomerTransactionDto(t.Id, t.Reference, t.Type.ToString(), t.Status.ToString(), message, t.Amount, t.Narration, t.Channel,
            t.CounterpartyDisplay, t.MerchantCategory, t.ShippingAddress, t.Country, t.City, t.CreatedAt, t.ReviewedAt, timeline));
    }

    // ------------------------------------------------------------------ payments
    private async Task<IActionResult> Run(Func<Task<TransactionResultDto>> action)
    {
        try { return Ok(await action()); }
        catch (UnauthorizedAccessException ex) { return BadRequest(new { message = ex.Message, code = "pin" }); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("transactions/transfer")]
    public Task<IActionResult> Transfer([FromBody] TransferRequest req) => Run(async () =>
    {
        Beneficiary? ben = null; string display, raw, key; var newRecipient = false;
        if (req.BeneficiaryId is not null)
        {
            ben = await db.Beneficiaries.FirstOrDefaultAsync(b => b.Id == req.BeneficiaryId && b.CustomerId == CustomerId)
                  ?? throw new InvalidOperationException("Beneficiary not found.");
            var acct = pgp.Decrypt(ben.AccountNumberEncrypted);
            display = $"{ben.Name} ••••{ben.AccountNumberLast4}"; raw = $"{ben.Name}|{acct}|{ben.BankName}";
            key = "acct:" + TransactionProcessor.HashAccountNumber(acct);
        }
        else
        {
            var acct = Regex.Replace(req.RecipientAccountNumber ?? "", @"\D", "");
            if (string.IsNullOrWhiteSpace(req.RecipientName) || acct.Length != 10)
                throw new InvalidOperationException("Enter the recipient's name and a 10-digit account number.");
            newRecipient = true;
            display = $"{req.RecipientName.Trim()} ••••{acct[^4..]}"; raw = $"{req.RecipientName.Trim()}|{acct}|{req.BankName ?? "Unknown bank"}";
            key = "acct:" + TransactionProcessor.HashAccountNumber(acct);
            if (req.SaveBeneficiary)
            {
                ben = new Beneficiary { CustomerId = CustomerId, Name = req.RecipientName.Trim(), BankName = req.BankName ?? "Unknown bank", AccountNumberEncrypted = pgp.Encrypt(acct), AccountNumberLast4 = acct[^4..], AddedAt = DateTime.UtcNow };
                db.Beneficiaries.Add(ben);
                await db.SaveChangesAsync();
            }
        }
        return await processor.ProcessAsync(new PaymentInput(CustomerId, req.AccountId, TransactionType.Transfer, req.Amount,
            req.Narration ?? "", req.Pin, display, raw, key, null, null, false, null, ben, newRecipient, "Mobile", DeviceId, req.Sim));
    });

    [HttpPost("transactions/billpayment")]
    public Task<IActionResult> BillPayment([FromBody] BillPaymentRequest req) => Run(async () =>
    {
        var biller = await db.Billers.FindAsync(req.BillerId) ?? throw new InvalidOperationException("Biller not found.");
        if (string.IsNullOrWhiteSpace(req.CustomerReference)) throw new InvalidOperationException("Enter the meter, customer or phone number.");
        return await processor.ProcessAsync(new PaymentInput(CustomerId, req.AccountId, TransactionType.BillPayment, req.Amount,
            $"{biller.Category} - {req.CustomerReference}", req.Pin, biller.Name, $"{biller.Name}|{req.CustomerReference}", $"biller:{biller.Id}",
            biller.Category, biller.Name, false, null, null, false, "Web", DeviceId, req.Sim));
    });

    [HttpPost("transactions/card")]
    public Task<IActionResult> CardPayment([FromBody] CardPaymentRequest req) => Run(async () =>
    {
        var m = await db.Merchants.FindAsync(req.MerchantId) ?? throw new InvalidOperationException("Merchant not found.");
        return await processor.ProcessAsync(new PaymentInput(CustomerId, req.AccountId, TransactionType.CardPayment, req.Amount,
            $"Online purchase - {m.Name}", req.Pin, m.Name, $"{m.Name}|{m.Category}", $"merchant:{m.Id}", m.Category, m.Name, m.HighFraud,
            string.IsNullOrWhiteSpace(req.ShippingAddress) ? null : req.ShippingAddress.Trim(), null, false, "Card", DeviceId, req.Sim));
    });

    [HttpPost("transactions/atm")]
    public Task<IActionResult> Atm([FromBody] AtmWithdrawalRequest req) => Run(async () =>
    {
        var place = string.IsNullOrWhiteSpace(req.AtmLocation) ? "ATM cash withdrawal" : $"ATM - {req.AtmLocation.Trim()}";
        return await processor.ProcessAsync(new PaymentInput(CustomerId, req.AccountId, TransactionType.AtmWithdrawal, req.Amount,
            "Cash withdrawal", req.Pin, place, place, null, null, null, false, null, null, false, "ATM", DeviceId, req.Sim));
    });

    [HttpPost("transactions/collection")]
    public Task<IActionResult> Collection([FromBody] CollectionRequest req) => Run(async () =>
    {
        var acct = Regex.Replace(req.FromAccountNumber ?? "", @"\D", "");
        if (string.IsNullOrWhiteSpace(req.FromName) || acct.Length != 10)
            throw new InvalidOperationException("Enter the payer's name and a 10-digit account number.");
        return await processor.ProcessAsync(new PaymentInput(CustomerId, req.AccountId, TransactionType.Collection, req.Amount,
            req.Narration ?? "Payment request", req.Pin, req.FromName.Trim(), $"{req.FromName.Trim()}|{acct}", null, null, null, false, null, null, false, "Mobile", DeviceId, req.Sim));
    });

    [HttpPost("topup")]
    public async Task<IActionResult> TopUp([FromBody] TopUpRequest req)
    {
        var customer = await CurrentAsync();
        if (!BCrypt.Net.BCrypt.Verify(req.Pin ?? "", customer.PinHash)) return BadRequest(new { message = "Incorrect PIN.", code = "pin" });
        if (req.Amount < 1000 || req.Amount > 5_000_000) return BadRequest(new { message = "Top-up must be between N1,000 and N5,000,000." });
        var account = customer.Accounts.First(a => a.Id == req.AccountId);
        account.Balance += req.Amount;
        account.LastActivityAt = DateTime.UtcNow;
        db.Notifications.Add(new Notification { CustomerId = customer.Id, Kind = "Transaction", Title = "Account funded", Body = $"Your account was credited with ₦{req.Amount:N2} (demo top-up).", CreatedAt = DateTime.UtcNow });
        audit.Add(customer.Email, "Customer", "AccountFunded", "Account", account.Id.ToString(), $"Demo top-up of {req.Amount:N2}.");
        await db.SaveChangesAsync();
        return Ok(new { balance = account.Balance });
    }

    // ------------------------------------------------------------------ beneficiaries
    [HttpGet("beneficiaries")]
    public async Task<object> Beneficiaries() =>
        await db.Beneficiaries.AsNoTracking().Where(b => b.CustomerId == CustomerId).OrderBy(b => b.Name)
            .Select(b => new { b.Id, b.Name, b.BankName, masked = "••••" + b.AccountNumberLast4, b.AddedAt }).ToListAsync();

    [HttpPost("beneficiaries")]
    public async Task<IActionResult> AddBeneficiary([FromBody] AddBeneficiaryRequest req)
    {
        var acct = Regex.Replace(req.AccountNumber ?? "", @"\D", "");
        if (string.IsNullOrWhiteSpace(req.Name) || acct.Length != 10) return BadRequest(new { message = "Enter a name and a 10-digit account number." });
        var b = new Beneficiary { CustomerId = CustomerId, Name = req.Name.Trim(), BankName = string.IsNullOrWhiteSpace(req.BankName) ? "Unknown bank" : req.BankName, AccountNumberEncrypted = pgp.Encrypt(acct), AccountNumberLast4 = acct[^4..], AddedAt = DateTime.UtcNow };
        db.Beneficiaries.Add(b);
        audit.Add((await CurrentAsync()).Email, "Customer", "BeneficiaryAdded", "Beneficiary", "new", $"Saved payee {b.Name}.");
        await db.SaveChangesAsync();
        return Ok(new { b.Id });
    }

    [HttpDelete("beneficiaries/{id:int}")]
    public async Task<IActionResult> DeleteBeneficiary(int id)
    {
        var b = await db.Beneficiaries.FirstOrDefaultAsync(x => x.Id == id && x.CustomerId == CustomerId);
        if (b is null) return NotFound();
        db.Beneficiaries.Remove(b);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ------------------------------------------------------------------ security centre
    [HttpGet("security")]
    public async Task<object> Security()
    {
        var customer = await CurrentAsync();
        var devices = await db.Devices.AsNoTracking().Where(d => d.CustomerId == customer.Id).OrderByDescending(d => d.LastSeenAt)
            .Select(d => new { d.Id, d.Label, d.Fingerprint, d.FirstSeenAt, d.LastSeenAt, d.Trusted, current = d.Fingerprint == DeviceId }).ToListAsync();
        var logins = await db.LoginEvents.AsNoTracking().Where(l => l.CustomerId == customer.Id && !l.Simulated).OrderByDescending(l => l.CreatedAt).Take(20)
            .Select(l => new { l.Id, l.Success, l.Ip, l.Country, l.City, l.DeviceFingerprint, l.CreatedAt }).ToListAsync();
        var changes = await db.ProfileChanges.AsNoTracking().Where(c => c.CustomerId == customer.Id).OrderByDescending(c => c.ChangedAt).Take(10)
            .Select(c => new { c.Id, c.Field, c.Detail, c.ChangedAt }).ToListAsync();
        return new { devices, logins, changes, travelNoticeCountry = customer.TravelNoticeCountry, travelNoticeUntil = customer.TravelNoticeUntil, kyc = customer.Kyc.ToString() };
    }

    [HttpDelete("security/devices/{id:int}")]
    public async Task<IActionResult> RemoveDevice(int id)
    {
        var d = await db.Devices.FirstOrDefaultAsync(x => x.Id == id && x.CustomerId == CustomerId);
        if (d is null) return NotFound();
        db.Devices.Remove(d);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private async Task<IActionResult> ChangeProfile(string pin, string field, Action<Customer> apply, string detail)
    {
        var customer = await CurrentAsync();
        if (!BCrypt.Net.BCrypt.Verify(pin ?? "", customer.PinHash)) return BadRequest(new { message = "Incorrect PIN.", code = "pin" });
        apply(customer);
        var now = DateTime.UtcNow;
        if (field != "Pin") customer.LastContactChangeAt = now;
        db.ProfileChanges.Add(new ProfileChange { CustomerId = customer.Id, Field = field, Detail = detail, ChangedAt = now });
        db.Notifications.Add(new Notification { CustomerId = customer.Id, Kind = "Security", Title = $"{field} changed", Body = $"Your {field.ToLowerInvariant()} was changed. If this was not you, contact support immediately.", CreatedAt = now });
        audit.Add(customer.Email, "Customer", "ProfileChanged", "Customer", customer.Id.ToString(), $"{field}: {detail}");
        await db.SaveChangesAsync();
        return Ok(await CustomerMapper.ProfileAsync(customer, db, pgp));
    }

    [HttpPost("profile/phone")]
    public Task<IActionResult> ChangePhone([FromBody] ChangeValueRequest req)
    {
        var phone = Regex.Replace(req.Value ?? "", @"[\s\-]", "");
        if (!Regex.IsMatch(phone, @"^\+?\d{10,14}$")) return Task.FromResult<IActionResult>(BadRequest(new { message = "Enter a valid phone number." }));
        return ChangeProfile(req.Pin, "Phone", c => c.Phone = phone, "Phone number updated (SIM/number change)");
    }

    [HttpPost("profile/email")]
    public async Task<IActionResult> ChangeEmail([FromBody] ChangeValueRequest req)
    {
        var email = (req.Value ?? "").Trim().ToLowerInvariant();
        if (!Regex.IsMatch(email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$")) return BadRequest(new { message = "Enter a valid email address." });
        if (await db.Customers.AnyAsync(c => c.Email == email && c.Id != CustomerId)) return Conflict(new { message = "That email is already in use." });
        return await ChangeProfile(req.Pin, "Email", c => c.Email = email, "Email address updated");
    }

    [HttpPost("profile/address")]
    public Task<IActionResult> ChangeAddress([FromBody] ChangeValueRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Value)) return Task.FromResult<IActionResult>(BadRequest(new { message = "Enter your address." }));
        return ChangeProfile(req.Pin, "Address", c => c.Address = req.Value.Trim(), "Residential address updated");
    }

    [HttpPost("profile/pin")]
    public async Task<IActionResult> ChangePin([FromBody] ChangePinRequest req)
    {
        if (!Regex.IsMatch(req.NewPin ?? "", @"^\d{4}$")) return BadRequest(new { message = "The new PIN must be exactly 4 digits." });
        return await ChangeProfile(req.CurrentPin, "Pin", c => c.PinHash = BCrypt.Net.BCrypt.HashPassword(req.NewPin), "Transaction PIN changed");
    }

    [HttpPost("security/travel-notice")]
    public async Task<IActionResult> SetTravelNotice([FromBody] TravelNoticeRequest req)
    {
        var customer = await CurrentAsync();
        if (string.IsNullOrWhiteSpace(req.Country) || req.Days is < 1 or > 90) return BadRequest(new { message = "Choose a country and 1 to 90 days." });
        customer.TravelNoticeCountry = req.Country.Trim();
        customer.TravelNoticeUntil = DateTime.UtcNow.AddDays(req.Days);
        audit.Add(customer.Email, "Customer", "TravelNoticeSet", "Customer", customer.Id.ToString(), $"Travelling to {req.Country} for {req.Days} day(s).");
        await db.SaveChangesAsync();
        return Ok(new { customer.TravelNoticeCountry, customer.TravelNoticeUntil });
    }

    [HttpDelete("security/travel-notice")]
    public async Task<IActionResult> ClearTravelNotice()
    {
        var customer = await CurrentAsync();
        customer.TravelNoticeCountry = null; customer.TravelNoticeUntil = null;
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ------------------------------------------------------------------ notifications
    [HttpGet("notifications")]
    public async Task<object> Notifications()
    {
        var items = await db.Notifications.AsNoTracking().Where(n => n.CustomerId == CustomerId).OrderByDescending(n => n.CreatedAt).Take(60)
            .Select(n => new { n.Id, n.Kind, n.Title, n.Body, n.TransactionId, n.Read, n.CreatedAt }).ToListAsync();
        return new { items, unread = items.Count(i => !i.Read) };
    }

    [HttpPost("notifications/read-all")]
    public async Task<IActionResult> ReadAll()
    {
        await db.Notifications.Where(n => n.CustomerId == CustomerId && !n.Read).ExecuteUpdateAsync(s => s.SetProperty(n => n.Read, true));
        return NoContent();
    }

    // ------------------------------------------------------------------ insights
    [HttpGet("insights")]
    public async Task<object> Insights()
    {
        var accountIds = await db.Accounts.Where(a => a.CustomerId == CustomerId).Select(a => a.Id).ToListAsync();
        var now = DateTime.UtcNow;
        var txns = await db.Transactions.AsNoTracking()
            .Where(t => accountIds.Contains(t.AccountId) && t.CreatedAt >= now.AddDays(-90)).ToListAsync();
        var approved = txns.Where(t => t.Status == TransactionStatus.Approved && t.Type != TransactionType.Collection).ToList();

        var byCategory = approved.GroupBy(t => t.MerchantCategory ?? (t.Type == TransactionType.Transfer ? "Transfers" : t.Type == TransactionType.AtmWithdrawal ? "Cash" : t.Type.ToString()))
            .Select(g => new { category = g.Key, amount = g.Sum(t => t.Amount), count = g.Count() }).OrderByDescending(x => x.amount).ToList();
        var topPayees = approved.GroupBy(t => t.CounterpartyDisplay).Select(g => new { name = g.Key, amount = g.Sum(t => t.Amount), count = g.Count() }).OrderByDescending(x => x.amount).Take(6).ToList();
        var daily = Enumerable.Range(0, 30).Select(i => now.Date.AddDays(-29 + i)).Select(d => new
        {
            date = d.ToString("dd MMM"),
            amount = approved.Where(t => t.CreatedAt.Date == d).Sum(t => t.Amount),
        }).ToList();
        var outcomes = new
        {
            approved = txns.Count(t => t.Status == TransactionStatus.Approved),
            underReview = txns.Count(t => t.Status == TransactionStatus.PendingReview),
            notCompleted = txns.Count(t => t.Status is TransactionStatus.Blocked or TransactionStatus.Rejected),
        };
        return new { byCategory, topPayees, daily, outcomes, total = approved.Sum(t => t.Amount) };
    }
}

public record TopUpRequest(int AccountId, decimal Amount, string Pin);
public record AddBeneficiaryRequest(string Name, string? BankName, string AccountNumber);
public record ChangeValueRequest(string Value, string Pin);
public record ChangePinRequest(string CurrentPin, string NewPin);
public record TravelNoticeRequest(string Country, int Days);
