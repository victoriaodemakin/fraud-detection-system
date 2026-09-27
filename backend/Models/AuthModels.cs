namespace FraudDetection.Api.Models;

public record CustomerLoginRequest(string Email, string Password);

public record RegisterRequest(
    string FullName,
    string Email,
    string Phone,
    string Password,
    string Pin,
    string Address,
    string? NameOnId,
    string? Bvn,
    string? AccountType);

public record AccountDto(int AccountId, string MaskedAccountNumber, string AccountNumber, string Type, decimal Balance);

public record CustomerProfileDto(
    int Id,
    string FullName,
    string Email,
    string Phone,
    string Address,
    string Segment,
    string Kyc,
    string NameOnId,
    string? TravelNoticeCountry,
    DateTime? TravelNoticeUntil,
    DateTime CreatedAt,
    string Status,
    List<AccountDto> Accounts);

public record CustomerAuthResponse(string Token, CustomerProfileDto Profile);

public record AdminLoginRequest(string Username, string Password);
public record AdminAuthResponse(string Token, string FullName, string Role, string Username);
