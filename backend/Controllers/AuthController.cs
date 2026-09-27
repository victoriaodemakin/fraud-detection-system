using System.Security.Cryptography;
using System.Text.RegularExpressions;
using FraudDetection.Api.Data;
using FraudDetection.Api.Models;
using FraudDetection.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FraudDetection.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(AppDbContext db, TokenService tokens, PgpService pgp, AuditService audit) : ControllerBase
{
    private string DeviceId => Request.Headers["X-Device-Id"].FirstOrDefault() ?? "unknown-device";

    [HttpPost("customer/login")]
    public async Task<ActionResult<CustomerAuthResponse>> CustomerLogin([FromBody] CustomerLoginRequest req)
    {
        var email = (req.Email ?? "").Trim().ToLowerInvariant();
        var now = DateTime.UtcNow;
        var customer = await db.Customers.Include(c => c.Accounts).FirstOrDefaultAsync(c => c.Email == email);
        var home = SimulatedLocations.Get("lagos");

        // Lock-out after repeated failures - and the failures themselves feed the rule engine (VEL-03).
        if (customer is not null)
        {
            var recentFailures = await db.LoginEvents.CountAsync(l => l.CustomerId == customer.Id && !l.Success && l.CreatedAt >= now.AddMinutes(-15) && !l.Simulated);
            if (recentFailures >= 5)
                return StatusCode(429, new { message = "Too many failed attempts. Please wait 15 minutes and try again." });
        }

        if (customer is null || !BCrypt.Net.BCrypt.Verify(req.Password ?? "", customer.PasswordHash))
        {
            db.LoginEvents.Add(new LoginEvent { CustomerId = customer?.Id, Email = email, Success = false, Ip = home.Ip, Country = home.Country, City = home.City, DeviceFingerprint = DeviceId, CreatedAt = now });
            await db.SaveChangesAsync();
            return Unauthorized(new { message = "Invalid email or password." });
        }

        if (customer.Status == "Suspended")
            return StatusCode(403, new { message = "This account is suspended. Please contact support." });

        db.LoginEvents.Add(new LoginEvent { CustomerId = customer.Id, Email = email, Success = true, Ip = home.Ip, Country = home.Country, City = home.City, DeviceFingerprint = DeviceId, CreatedAt = now });

        var device = await db.Devices.FirstOrDefaultAsync(d => d.CustomerId == customer.Id && d.Fingerprint == DeviceId);
        if (device is null)
        {
            db.Devices.Add(new Device { CustomerId = customer.Id, Fingerprint = DeviceId, Label = "Web browser", FirstSeenAt = now, LastSeenAt = now });
            db.Notifications.Add(new Notification { CustomerId = customer.Id, Kind = "Security", Title = "New device sign-in", Body = "You signed in from a device we have not seen before. If this was not you, change your password.", CreatedAt = now });
        }
        else device.LastSeenAt = now;

        await db.SaveChangesAsync();
        var token = tokens.CreateToken(customer.Id, "Customer", customer.FullName);
        return Ok(new CustomerAuthResponse(token, await CustomerMapper.ProfileAsync(customer, db, pgp)));
    }

    [HttpPost("register")]
    public async Task<ActionResult<CustomerAuthResponse>> Register([FromBody] RegisterRequest req)
    {
        var email = (req.Email ?? "").Trim().ToLowerInvariant();
        var phone = Regex.Replace(req.Phone ?? "", @"[\s\-]", "");
        if (string.IsNullOrWhiteSpace(req.FullName) || req.FullName.Trim().Length < 3)
            return BadRequest(new { message = "Enter your full name." });
        if (!Regex.IsMatch(email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
            return BadRequest(new { message = "Enter a valid email address." });
        if (!Regex.IsMatch(phone, @"^\+?\d{10,14}$"))
            return BadRequest(new { message = "Enter a valid phone number." });
        if ((req.Password ?? "").Length < 8)
            return BadRequest(new { message = "Password must be at least 8 characters." });
        if (!Regex.IsMatch(req.Pin ?? "", @"^\d{4}$"))
            return BadRequest(new { message = "Transaction PIN must be exactly 4 digits." });
        if (await db.Customers.AnyAsync(c => c.Email == email))
            return Conflict(new { message = "An account with this email already exists." });

        // Simple KYC check: the name on the ID document must match the registered name.
        static string Norm(string s) => Regex.Replace((s ?? "").ToLowerInvariant(), @"[^a-z]", "");
        var nameOnId = string.IsNullOrWhiteSpace(req.NameOnId) ? "" : req.NameOnId.Trim();
        var bvn = Regex.Replace(req.Bvn ?? "", @"\D", "");
        var kyc = string.IsNullOrEmpty(nameOnId) || bvn.Length != 11
            ? KycStatus.Pending
            : Norm(nameOnId) == Norm(req.FullName) ? KycStatus.Verified : KycStatus.Mismatch;

        var now = DateTime.UtcNow;
        var customer = new Customer
        {
            FullName = req.FullName.Trim(), Email = email, Phone = phone,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            PinHash = BCrypt.Net.BCrypt.HashPassword(req.Pin),
            Address = (req.Address ?? "").Trim(), Segment = "Standard", Kyc = kyc,
            NameOnId = nameOnId, BvnLast4 = bvn.Length == 11 ? bvn[^4..] : "",
            CreatedAt = now,
        };

        string number;
        do { number = "20" + RandomNumberGenerator.GetInt32(10000000, 99999999); }
        while (await db.Accounts.AnyAsync(a => a.AccountNumberHash == TransactionProcessor.HashAccountNumber(number)));

        customer.Accounts.Add(new Account
        {
            AccountNumberEncrypted = pgp.Encrypt(number), AccountNumberLast4 = number[^4..],
            AccountNumberHash = TransactionProcessor.HashAccountNumber(number),
            Type = req.AccountType == "Current" ? "Current" : "Savings",
            Balance = 250_000m, // demo welcome credit so the new customer can transact
            CreatedAt = now,
        });
        db.Customers.Add(customer);
        await db.SaveChangesAsync();

        var home = SimulatedLocations.Get("lagos");
        db.Devices.Add(new Device { CustomerId = customer.Id, Fingerprint = DeviceId, Label = "Web browser", FirstSeenAt = now, LastSeenAt = now, Trusted = true });
        db.LoginEvents.Add(new LoginEvent { CustomerId = customer.Id, Email = email, Success = true, Ip = home.Ip, Country = home.Country, City = home.City, DeviceFingerprint = DeviceId, CreatedAt = now });
        db.Notifications.Add(new Notification { CustomerId = customer.Id, Kind = "Promo", Title = "Welcome to Arclight", Body = "We credited your new account with a N250,000 demo welcome bonus. Explore transfers, bills and card payments.", CreatedAt = now });
        if (kyc != KycStatus.Verified)
            db.Notifications.Add(new Notification { CustomerId = customer.Id, Kind = "Security", Title = "Complete your identity check", Body = kyc == KycStatus.Mismatch ? "The name on your ID does not match your registered name." : "Add your BVN and the name on your ID to finish verification.", CreatedAt = now });
        audit.Add(email, "Customer", "CustomerRegistered", "Customer", customer.Id.ToString(), $"New customer onboarded. KYC: {kyc}.");
        await db.SaveChangesAsync();

        var token = tokens.CreateToken(customer.Id, "Customer", customer.FullName);
        return Ok(new CustomerAuthResponse(token, await CustomerMapper.ProfileAsync(customer, db, pgp)));
    }

    [HttpPost("admin/login")]
    public async Task<ActionResult<AdminAuthResponse>> AdminLogin([FromBody] AdminLoginRequest req)
    {
        var admin = await db.AdminUsers.FirstOrDefaultAsync(a => a.Username == req.Username);
        if (admin is null || !BCrypt.Net.BCrypt.Verify(req.Password ?? "", admin.PasswordHash))
            return Unauthorized(new { message = "Invalid username or password." });

        audit.Add(admin.Username, admin.Role, "AnalystLogin", "AdminUser", admin.Id.ToString(), "Signed in to the analyst dashboard.");
        await db.SaveChangesAsync();
        var token = tokens.CreateToken(admin.Id, "Admin", admin.FullName, admin.Role);
        return Ok(new AdminAuthResponse(token, admin.FullName, admin.Role, admin.Username));
    }
}

public static class CustomerMapper
{
    public static async Task<CustomerProfileDto> ProfileAsync(Customer c, AppDbContext db, PgpService pgp)
    {
        var accounts = c.Accounts.Count > 0 ? c.Accounts : await db.Accounts.Where(a => a.CustomerId == c.Id).ToListAsync();
        return new CustomerProfileDto(
            c.Id, c.FullName, c.Email, c.Phone, c.Address, c.Segment, c.Kyc.ToString(), c.NameOnId,
            c.TravelNoticeCountry, c.TravelNoticeUntil, c.CreatedAt, c.Status,
            accounts.Select(a => new AccountDto(a.Id, $"••••{a.AccountNumberLast4}", pgp.Decrypt(a.AccountNumberEncrypted), a.Type, a.Balance)).ToList());
    }
}
