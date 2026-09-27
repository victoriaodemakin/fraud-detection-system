# ---- build ----
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY FraudDetection.Api.csproj .
RUN dotnet restore

COPY . .
RUN dotnet publish -c Release -o /app --no-restore

# ---- run ----
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app .

# Render sets $PORT at runtime; ASP.NET Core listens on whatever ASPNETCORE_URLS names.
# The keys/ and backups/ directories are the app's own runtime working storage (see
# PgpService and AdminDatabaseController) -- not baked in from the repo, since the real
# key pair is supplied as PGP_PUBLIC_KEY / PGP_PRIVATE_KEY environment variables instead.
ENV PORT=5073
ENV ASPNETCORE_URLS=http://+:5073
EXPOSE 5073
ENTRYPOINT ["sh", "-c", "ASPNETCORE_URLS=http://+:${PORT} exec dotnet FraudDetection.Api.dll"]
