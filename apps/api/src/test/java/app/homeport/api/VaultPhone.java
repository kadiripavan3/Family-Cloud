package app.homeport.api;

import com.jayway.jsonpath.JsonPath;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.interfaces.XECPrivateKey;
import java.security.interfaces.XECPublicKey;
import java.security.spec.NamedParameterSpec;
import java.security.spec.XECPrivateKeySpec;
import java.security.spec.XECPublicKeySpec;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * A stand-in for the phone: everything docs/07-vault-protocol.md says the app does with keys, done here with
 * what the JDK has, so the tests can play the whole protocol against the API and know the document is workable.
 *
 * <p>Two parts are stand-ins, because the JDK doesn't have the real ones and the API never looks inside:
 *
 * <ul>
 *   <li>the app seals with XChaCha20-Poly1305 (a 24-byte nonce); this seals with ChaCha20-Poly1305 (12 bytes);
 *   <li>the app turns the Vault key into a wrapping key with scrypt; this uses PBKDF2-HMAC-SHA-256.
 * </ul>
 *
 * Everything else is as documented: X25519 for agreeing on a key, HKDF-SHA-256 to derive the sealing key,
 * the layout of each sealed piece, AES-GCM for a guest pass, and Shamir's secret sharing in {@link Shamir}.
 */
final class VaultPhone {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final String PURPOSE = "homeport/vault/v1/";
    private static final byte VERSION = 1;
    private static final int NONCE = 12; // the app's XChaCha20 nonce is 24 bytes

    /** The 24 characters the person saw once: "KT4M 9QXZ PL2A 77HD VB3N E8RW". Never sent anywhere. */
    final String vaultKey;

    /** The private key (32 bytes). It leaves the phone only wrapped. */
    private final byte[] privateKey;

    /** The public key, as the API stores it. */
    final String publicKey;

    private VaultPhone(String vaultKey, byte[] privateKey) {
        this.vaultKey = vaultKey;
        this.privateKey = privateKey;
        this.publicKey = b64(x25519(privateKey, basePoint()));
    }

    /** A new person's phone: a fresh key pair and a fresh Vault key. */
    static VaultPhone create() {
        try {
            KeyPair pair = KeyPairGenerator.getInstance("X25519").generateKeyPair();
            byte[] scalar = ((XECPrivateKey) pair.getPrivate()).getScalar().orElseThrow();
            VaultPhone phone = new VaultPhone(newVaultKey(), scalar);
            if (!phone.publicKey.equals(b64(littleEndian(((XECPublicKey) pair.getPublic()).getU())))) {
                throw new IllegalStateException("The public key worked out from the private key isn't the pair's own.");
            }
            return phone;
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    /** A temporary key pair for a recovery: a phone that holds no Vault key yet. */
    static VaultPhone temporary() {
        VaultPhone made = create();
        return new VaultPhone(null, made.privateKey);
    }

    static String newVaultKey() {
        StringBuilder key = new StringBuilder();
        for (int i = 0; i < 24; i++) {
            if (i > 0 && i % 4 == 0) {
                key.append(' ');
            }
            key.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return key.toString();
    }

    /** The same phone after its owner chose a new Vault key. */
    VaultPhone withNewVaultKey() {
        return new VaultPhone(newVaultKey(), privateKey);
    }

    // ---------- the Vault record ----------

    /** What setting up a Vault sends: the public key, and the private key wrapped with a key made from the Vault key. */
    String setUpJson() {
        return "{\"publicKey\":\"%s\",%s}".formatted(publicKey, wrappedKeyJson());
    }

    /** What replacing the Vault key sends: the same private key, wrapped afresh. */
    String wrappedKeyJson() {
        byte[] salt = random(16);
        return "\"wrappedPrivateKey\":\"%s\",\"salt\":\"%s\",\"kdf\":{\"n\":32768,\"r\":8,\"p\":1}"
                .formatted(seal(wrappingKey(vaultKey, salt), privateKey, "private-key"), b64(salt));
    }

    /**
     * A new phone: the person types their Vault key, the phone fetches the Vault record and unwraps the
     * private key. Throws when the Vault key is wrong.
     */
    static VaultPhone unlock(String vaultKey, String record) {
        byte[] salt = bytes(JsonPath.read(record, "$.salt"));
        byte[] privateKey =
                open(wrappingKey(vaultKey, salt), JsonPath.read(record, "$.wrappedPrivateKey"), "private-key");
        VaultPhone phone = new VaultPhone(vaultKey, privateKey);
        if (!phone.publicKey.equals(JsonPath.<String>read(record, "$.publicKey"))) {
            throw new IllegalStateException("The private key doesn't belong to this Vault's public key.");
        }
        return phone;
    }

    /** The Vault key as it goes into the key derivation: its 24 characters, upper case, without the spaces. */
    static byte[] normalized(String vaultKey) {
        return vaultKey.replace(" ", "").toUpperCase(java.util.Locale.ROOT).getBytes(StandardCharsets.US_ASCII);
    }

    static String grouped(byte[] normalized) {
        String plain = new String(normalized, StandardCharsets.US_ASCII);
        return String.join(" ", plain.split("(?<=\\G.{4})"));
    }

    /** Stand-in for scrypt (see the class comment). */
    private static byte[] wrappingKey(String vaultKey, byte[] salt) {
        try {
            char[] password = new String(normalized(vaultKey), StandardCharsets.US_ASCII).toCharArray();
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                    .generateSecret(new PBEKeySpec(password, salt, 2000, 256))
                    .getEncoded();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    // ---------- sealing with a key both sides hold ----------

    static byte[] newKey() {
        return random(32);
    }

    /** version || nonce || ciphertext and tag, with the purpose bound in as associated data. */
    static String seal(byte[] key, byte[] plain, String purpose) {
        byte[] nonce = random(NONCE);
        return b64(concat(new byte[] {VERSION}, nonce, chacha(Cipher.ENCRYPT_MODE, key, nonce, plain, purpose)));
    }

    /** Throws when the key is wrong, the text was changed, or it was sealed for another purpose. */
    static byte[] open(byte[] key, String sealed, String purpose) {
        byte[] all = bytes(sealed);
        if (all[0] != VERSION) {
            throw new IllegalStateException("An unknown version.");
        }
        return chacha(
                Cipher.DECRYPT_MODE,
                key,
                Arrays.copyOfRange(all, 1, 1 + NONCE),
                Arrays.copyOfRange(all, 1 + NONCE, all.length),
                purpose);
    }

    // ---------- sealing for a person: only their private key opens it ----------

    /**
     * version || a fresh public key || nonce || ciphertext and tag. The sealing key is HKDF-SHA-256 over the
     * X25519 agreement between the fresh key pair and the recipient, salted with both public keys.
     */
    static String sealTo(String recipientPublicKey, byte[] plain, String purpose) {
        VaultPhone fresh = temporary();
        byte[] theirs = bytes(recipientPublicKey);
        byte[] ours = bytes(fresh.publicKey);
        byte[] key = hkdf(x25519(fresh.privateKey, theirs), concat(ours, theirs), PURPOSE + purpose);
        byte[] nonce = random(NONCE);
        return b64(concat(new byte[] {VERSION}, ours, nonce, chacha(Cipher.ENCRYPT_MODE, key, nonce, plain, purpose)));
    }

    /** Opens what was sealed for this phone's person. */
    byte[] open(String sealed, String purpose) {
        byte[] all = bytes(sealed);
        if (all[0] != VERSION) {
            throw new IllegalStateException("An unknown version.");
        }
        byte[] theirs = Arrays.copyOfRange(all, 1, 33);
        byte[] key = hkdf(x25519(privateKey, theirs), concat(theirs, bytes(publicKey)), PURPOSE + purpose);
        return chacha(
                Cipher.DECRYPT_MODE,
                key,
                Arrays.copyOfRange(all, 33, 33 + NONCE),
                Arrays.copyOfRange(all, 33 + NONCE, all.length),
                purpose);
    }

    // ---------- a guest pass: AES-GCM, because that is what a browser has ----------

    /** nonce (12 bytes) || AES-256-GCM ciphertext and tag: what {@code static/share/guest.js} opens. */
    static String sealForGuest(byte[] passKey, String text) {
        try {
            byte[] nonce = random(12);
            Cipher aes = Cipher.getInstance("AES/GCM/NoPadding");
            aes.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(passKey, "AES"), new GCMParameterSpec(128, nonce));
            return b64(concat(nonce, aes.doFinal(text.getBytes(StandardCharsets.UTF_8))));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    /** What the guest's browser does with the part of the link after the # and a card's sealed text. */
    static String openAsTheBrowserDoes(String keyInTheLink, String sealed) throws GeneralSecurityException {
        byte[] all = bytes(sealed);
        Cipher aes = Cipher.getInstance("AES/GCM/NoPadding");
        aes.init(
                Cipher.DECRYPT_MODE,
                new SecretKeySpec(bytes(keyInTheLink), "AES"),
                new GCMParameterSpec(128, Arrays.copyOfRange(all, 0, 12)));
        return new String(aes.doFinal(Arrays.copyOfRange(all, 12, all.length)), StandardCharsets.UTF_8);
    }

    // ---------- what must never be in a request ----------

    /** This phone's secrets, in every spelling they could leak in. */
    List<String> secrets() {
        List<String> all = new ArrayList<>(spellings(privateKey));
        if (vaultKey != null) {
            all.add(vaultKey);
            all.add(vaultKey.replace(" ", ""));
            all.addAll(spellings(normalized(vaultKey)));
        }
        return all;
    }

    /** A key or any other bytes, as base64url, as plain base64 and as hex. */
    static List<String> spellings(byte[] secret) {
        return List.of(
                b64(secret),
                Base64.getEncoder().withoutPadding().encodeToString(secret),
                HexFormat.of().formatHex(secret));
    }

    // ---------- the pieces ----------

    static String b64(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static byte[] bytes(String base64Url) {
        return Base64.getUrlDecoder().decode(base64Url);
    }

    static byte[] random(int length) {
        byte[] bytes = new byte[length];
        RANDOM.nextBytes(bytes);
        return bytes;
    }

    static byte[] concat(byte[]... parts) {
        int length = Arrays.stream(parts).mapToInt(p -> p.length).sum();
        byte[] all = new byte[length];
        int at = 0;
        for (byte[] part : parts) {
            System.arraycopy(part, 0, all, at, part.length);
            at += part.length;
        }
        return all;
    }

    private static byte[] basePoint() {
        byte[] nine = new byte[32];
        nine[0] = 9;
        return nine;
    }

    /** X25519 with keys as the 32 raw bytes the protocol sends. */
    private static byte[] x25519(byte[] privateKey, byte[] publicKey) {
        try {
            KeyFactory keys = KeyFactory.getInstance("X25519");
            byte[] bigEndian = new byte[32];
            for (int i = 0; i < 32; i++) {
                bigEndian[i] = publicKey[31 - i];
            }
            bigEndian[0] &= 0x7f; // the top bit of a public key is ignored
            KeyAgreement agreement = KeyAgreement.getInstance("X25519");
            agreement.init(keys.generatePrivate(new XECPrivateKeySpec(NamedParameterSpec.X25519, privateKey)));
            agreement.doPhase(
                    keys.generatePublic(new XECPublicKeySpec(NamedParameterSpec.X25519, new BigInteger(1, bigEndian))),
                    true);
            return agreement.generateSecret();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] littleEndian(BigInteger u) {
        byte[] big = u.toByteArray();
        byte[] little = new byte[32];
        for (int i = 0; i < Math.min(32, big.length); i++) {
            little[i] = big[big.length - 1 - i];
        }
        return little;
    }

    /** HKDF-SHA-256 (RFC 5869) for one block of output: 32 bytes. */
    private static byte[] hkdf(byte[] inputKey, byte[] salt, String info) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(salt, "HmacSHA256"));
            byte[] pseudoRandomKey = mac.doFinal(inputKey);
            mac.init(new SecretKeySpec(pseudoRandomKey, "HmacSHA256"));
            mac.update(info.getBytes(StandardCharsets.UTF_8));
            return mac.doFinal(new byte[] {1});
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] chacha(int mode, byte[] key, byte[] nonce, byte[] text, String purpose) {
        try {
            Cipher cipher = Cipher.getInstance("ChaCha20-Poly1305");
            cipher.init(mode, new SecretKeySpec(key, "ChaCha20"), new IvParameterSpec(nonce));
            cipher.updateAAD((PURPOSE + purpose).getBytes(StandardCharsets.UTF_8));
            return cipher.doFinal(text);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("It doesn't open: the wrong key, a changed text, or another purpose.", e);
        }
    }

    /**
     * Shamir's secret sharing over GF(256), for "any two helpers together": each byte of the secret is the
     * value at 0 of a random straight line, and a share is that line's value at one other point. Two shares
     * give the line back; one says nothing about where it crosses 0.
     *
     * <p>A share is its point's number (one byte, 1 to 255) followed by one byte for each byte of the secret.
     */
    static final class Shamir {

        private Shamir() {}

        /** Splits a secret into this many shares, any two of which rebuild it. */
        static List<byte[]> split(byte[] secret, int shares) {
            if (shares < 2 || shares > 255) {
                throw new IllegalArgumentException("Between 2 and 255 shares.");
            }
            byte[] slope = random(secret.length);
            List<byte[]> all = new ArrayList<>();
            for (int x = 1; x <= shares; x++) {
                byte[] share = new byte[secret.length + 1];
                share[0] = (byte) x;
                for (int i = 0; i < secret.length; i++) {
                    share[i + 1] = (byte) (secret[i] ^ multiply(slope[i] & 0xff, x));
                }
                all.add(share);
            }
            return all;
        }

        /** Rebuilds the secret from two shares of the same split. */
        static byte[] join(byte[] a, byte[] b) {
            int xa = a[0] & 0xff;
            int xb = b[0] & 0xff;
            if (xa == xb || a.length != b.length) {
                throw new IllegalArgumentException("Two different shares of the same split are needed.");
            }
            // The line through (xa, ya) and (xb, yb), read at 0. In GF(256) adding and subtracting are both XOR.
            int oneOverDifference = inverse(xa ^ xb);
            byte[] secret = new byte[a.length - 1];
            for (int i = 0; i < secret.length; i++) {
                int ya = a[i + 1] & 0xff;
                int yb = b[i + 1] & 0xff;
                secret[i] = (byte) multiply(multiply(ya, xb) ^ multiply(yb, xa), oneOverDifference);
            }
            return secret;
        }

        /** Multiplication in GF(256) with the polynomial x^8 + x^4 + x^3 + x + 1 (the one AES uses). */
        static int multiply(int a, int b) {
            int product = 0;
            for (int i = 0; i < 8; i++) {
                if ((b & 1) != 0) {
                    product ^= a;
                }
                boolean carry = (a & 0x80) != 0;
                a = (a << 1) & 0xff;
                if (carry) {
                    a ^= 0x1b;
                }
                b >>= 1;
            }
            return product;
        }

        /** The number that multiplies with this one to 1: this one to the power of 254. */
        static int inverse(int a) {
            int result = 1;
            for (int i = 0; i < 254; i++) {
                result = multiply(result, a);
            }
            return result;
        }
    }
}
