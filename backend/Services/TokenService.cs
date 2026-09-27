using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace FraudDetection.Api.Services;

// JSON Web Tokens for the two user roles. "Customer" tokens reach only the customer's own
// data; "Admin" tokens (with an adminRole of Analyst or Admin) open the analyst dashboard,
// and only the Admin sub-role may change rules, settings and the database.
public class TokenService(IConfiguration config)
{
    private readonly string _secret = config["Jwt:Secret"] ?? "fraud-detection-demo-signing-key-change-me-32bytes+";
    private readonly string _issuer = config["Jwt:Issuer"] ?? "fraud-detection-system";

    public string CreateToken(int id, string role, string name, string? adminRole = null)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, id.ToString()),
            new(ClaimTypes.Role, role),
            new(ClaimTypes.Name, name),
        };
        if (adminRole is not null) claims.Add(new Claim("adminRole", adminRole));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _issuer,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(8),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public TokenValidationParameters ValidationParameters => new()
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = _issuer,
        ValidAudience = _issuer,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret)),
        NameClaimType = ClaimTypes.Name,
        RoleClaimType = ClaimTypes.Role,
    };
}
