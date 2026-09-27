using FraudDetection.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FraudDetection.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Device> Devices => Set<Device>();
    public DbSet<LoginEvent> LoginEvents => Set<LoginEvent>();
    public DbSet<Beneficiary> Beneficiaries => Set<Beneficiary>();
    public DbSet<ProfileChange> ProfileChanges => Set<ProfileChange>();
    public DbSet<Biller> Billers => Set<Biller>();
    public DbSet<Merchant> Merchants => Set<Merchant>();
    public DbSet<Transaction> Transactions => Set<Transaction>();
    public DbSet<ScreeningRecord> ScreeningRecords => Set<ScreeningRecord>();
    public DbSet<RuleEvaluation> RuleEvaluations => Set<RuleEvaluation>();
    public DbSet<RuleDefinition> RuleDefinitions => Set<RuleDefinition>();
    public DbSet<SystemSetting> SystemSettings => Set<SystemSetting>();
    public DbSet<IpBlacklistEntry> IpBlacklist => Set<IpBlacklistEntry>();
    public DbSet<AdminUser> AdminUsers => Set<AdminUser>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<CaseNote> CaseNotes => Set<CaseNote>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<EvaluationRun> EvaluationRuns => Set<EvaluationRun>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Customer>().HasIndex(c => c.Email).IsUnique();
        b.Entity<Customer>().HasIndex(c => c.Phone);
        b.Entity<Customer>().Property(c => c.Kyc).HasConversion<string>();

        b.Entity<AdminUser>().HasIndex(a => a.Username).IsUnique();

        b.Entity<Account>().HasIndex(a => a.AccountNumberHash).IsUnique();
        b.Entity<Account>()
            .HasOne(a => a.Customer).WithMany(c => c.Accounts).HasForeignKey(a => a.CustomerId);

        b.Entity<Device>().HasIndex(d => new { d.CustomerId, d.Fingerprint });
        b.Entity<LoginEvent>().HasIndex(l => new { l.CustomerId, l.CreatedAt });
        b.Entity<LoginEvent>().HasIndex(l => new { l.DeviceFingerprint, l.CreatedAt });
        b.Entity<Beneficiary>().HasIndex(x => x.CustomerId);
        b.Entity<ProfileChange>().HasIndex(x => new { x.CustomerId, x.ChangedAt });

        b.Entity<Transaction>().HasIndex(t => new { t.AccountId, t.CreatedAt });
        b.Entity<Transaction>().HasIndex(t => t.Status);
        b.Entity<Transaction>().HasIndex(t => t.Reference).IsUnique();
        b.Entity<Transaction>()
            .HasOne(t => t.Account).WithMany(a => a.Transactions).HasForeignKey(t => t.AccountId);
        b.Entity<Transaction>().Property(t => t.Type).HasConversion<string>();
        b.Entity<Transaction>().Property(t => t.Status).HasConversion<string>();

        b.Entity<ScreeningRecord>()
            .HasOne(s => s.Transaction).WithOne(t => t.Screening).HasForeignKey<ScreeningRecord>(s => s.TransactionId);
        b.Entity<ScreeningRecord>().HasIndex(s => s.RiskScore);

        b.Entity<RuleEvaluation>()
            .HasOne(e => e.Screening).WithMany(s => s.Evaluations).HasForeignKey(e => e.ScreeningRecordId);
        b.Entity<RuleEvaluation>().HasIndex(e => new { e.RuleCode, e.Outcome });

        b.Entity<RuleDefinition>().HasIndex(r => r.Code).IsUnique();
        b.Entity<SystemSetting>().HasKey(s => s.Key);
        b.Entity<IpBlacklistEntry>().HasIndex(x => x.Ip).IsUnique();
        b.Entity<AuditLog>().HasIndex(a => a.CreatedAt);
        b.Entity<CaseNote>().HasIndex(n => n.TransactionId);
        b.Entity<Notification>().HasIndex(n => new { n.CustomerId, n.CreatedAt });
    }
}
