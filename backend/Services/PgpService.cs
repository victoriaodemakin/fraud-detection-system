using Org.BouncyCastle.Bcpg;
using Org.BouncyCastle.Bcpg.OpenPgp;
using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.Crypto.Generators;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.Math;
using Org.BouncyCastle.Security;
using System.Text;

namespace FraudDetection.Api.Services;

// Real OpenPGP (RFC 4880) encryption via BouncyCastle, used to encrypt sensitive
// fields (PINs, account numbers, counterparty details, raw screening payloads)
// before they are persisted, per the data-privacy commitment in section 3.9:
// "sensitive fields would require encryption and strict access control". A
// 2048-bit RSA keypair is generated once and stored under keys/ (ascii-armored,
// matching how real PGP key material is distributed); the private key is only
// ever used server-side, for the admin "decrypt to view" action.
public class PgpService
{
    private const string PassPhrase = "fraud-detection-demo-passphrase"; // demo only - see README
    private readonly PgpPublicKey _publicKey;
    private readonly PgpPrivateKey _privateKey;

    public PgpService(IWebHostEnvironment env)
    {
        var keysDir = Path.Combine(env.ContentRootPath, "keys");
        Directory.CreateDirectory(keysDir);
        var pubPath = Path.Combine(keysDir, "pgp-public.asc");
        var secPath = Path.Combine(keysDir, "pgp-private.asc");

        if (!File.Exists(pubPath) || !File.Exists(secPath))
        {
            GenerateKeyPair(pubPath, secPath);
        }

        (_publicKey, _privateKey) = LoadKeyPair(pubPath, secPath);
    }

    public string Encrypt(string plainText)
    {
        var data = Encoding.UTF8.GetBytes(plainText);
        using var outStream = new MemoryStream();

        using (var armored = new ArmoredOutputStream(outStream))
        {
            var compressed = new MemoryStream();
            using (var compStream = new PgpCompressedDataGenerator(CompressionAlgorithmTag.Zip).Open(compressed))
            {
                var literal = new PgpLiteralDataGenerator();
                using var literalStream = literal.Open(compStream, PgpLiteralData.Utf8, "data", data.Length, DateTime.UtcNow);
                literalStream.Write(data, 0, data.Length);
            }

            var encryptedDataGenerator = new PgpEncryptedDataGenerator(SymmetricKeyAlgorithmTag.Aes256, withIntegrityPacket: true, new SecureRandom());
            encryptedDataGenerator.AddMethod(_publicKey);
            var compressedBytes = compressed.ToArray();
            using var encStream = encryptedDataGenerator.Open(armored, compressedBytes.Length);
            encStream.Write(compressedBytes, 0, compressedBytes.Length);
        }

        return Encoding.ASCII.GetString(outStream.ToArray());
    }

    public string Decrypt(string armoredCipherText)
    {
        using var inStream = PgpUtilities.GetDecoderStream(
            new MemoryStream(Encoding.ASCII.GetBytes(armoredCipherText)));
        var factory = new PgpObjectFactory(inStream);

        PgpEncryptedDataList? encryptedDataList = null;
        PgpObject? pgpObject;
        while ((pgpObject = factory.NextPgpObject()) != null)
        {
            if (pgpObject is PgpEncryptedDataList list) { encryptedDataList = list; break; }
        }
        if (encryptedDataList is null) throw new InvalidOperationException("Not a valid PGP encrypted message.");

        PgpPublicKeyEncryptedData? encryptedData = null;
        foreach (PgpPublicKeyEncryptedData candidate in encryptedDataList.GetEncryptedDataObjects())
        {
            encryptedData = candidate;
            break;
        }
        if (encryptedData is null) throw new InvalidOperationException("No encrypted data found.");

        using var clearStream = encryptedData.GetDataStream(_privateKey);
        var plainFactory = new PgpObjectFactory(clearStream);

        var message = plainFactory.NextPgpObject();
        if (message is PgpCompressedData compressedData)
        {
            var compFactory = new PgpObjectFactory(compressedData.GetDataStream());
            message = compFactory.NextPgpObject();
        }

        if (message is PgpLiteralData literalData)
        {
            using var litStream = literalData.GetInputStream();
            using var reader = new StreamReader(litStream, Encoding.UTF8);
            return reader.ReadToEnd();
        }

        throw new InvalidOperationException("Unexpected PGP message content.");
    }

    private static void GenerateKeyPair(string pubPath, string secPath)
    {
        var generator = new RsaKeyPairGenerator();
        generator.Init(new KeyGenerationParameters(new SecureRandom(), 2048));
        AsymmetricCipherKeyPair keyPair = generator.GenerateKeyPair();

        var pgpKeyPair = new PgpKeyPair(PublicKeyAlgorithmTag.RsaGeneral, keyPair, DateTime.UtcNow);

        var secretKey = new PgpSecretKey(
            PgpSignature.DefaultCertification,
            pgpKeyPair,
            "fraud-detection-system@demo.local",
            SymmetricKeyAlgorithmTag.Aes256,
            PassPhrase.ToCharArray(),
            useSha1: true,
            null,
            null,
            new SecureRandom());

        using (var pubOut = new ArmoredOutputStream(File.Create(pubPath)))
        {
            secretKey.PublicKey.Encode(pubOut);
        }
        using (var secOut = new ArmoredOutputStream(File.Create(secPath)))
        {
            secretKey.Encode(secOut);
        }
    }

    private static (PgpPublicKey, PgpPrivateKey) LoadKeyPair(string pubPath, string secPath)
    {
        using var pubStream = PgpUtilities.GetDecoderStream(OpenReadWithRetry(pubPath));
        var pubRing = new PgpPublicKeyRing(pubStream);
        PgpPublicKey? publicKey = null;
        foreach (PgpPublicKey key in pubRing.GetPublicKeys())
        {
            if (key.IsEncryptionKey) { publicKey = key; break; }
        }
        publicKey ??= pubRing.GetPublicKey();

        using var secStream = PgpUtilities.GetDecoderStream(OpenReadWithRetry(secPath));
        var secRing = new PgpSecretKeyRing(secStream);
        var secretKey = secRing.GetSecretKey();
        var privateKey = secretKey.ExtractPrivateKey(PassPhrase.ToCharArray());

        return (publicKey!, privateKey);
    }

    // Newly-written key files can be transiently locked for a moment (e.g. by
    // antivirus real-time scanning), the same issue seen with other small
    // files created and immediately re-opened during this project - retry a
    // few times with a short backoff instead of failing the whole app startup.
    private static FileStream OpenReadWithRetry(string path, int attempts = 5)
    {
        for (var i = 0; i < attempts; i++)
        {
            try
            {
                return File.Open(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            }
            catch (IOException) when (i < attempts - 1)
            {
                Thread.Sleep(300);
            }
        }
        return File.Open(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
    }
}
