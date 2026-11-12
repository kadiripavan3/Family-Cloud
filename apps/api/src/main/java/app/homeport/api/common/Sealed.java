package app.homeport.api.common;

import java.util.regex.Pattern;

/**
 * What a phone scrambled before sending it: a ciphertext, a wrapped key, a public key. The API never looks
 * inside. It only checks that it is text of the expected alphabet (base64url, without padding) and not
 * longer than its kind may be, and refuses anything else with a sentence.
 */
public final class Sealed {

    /** An item's ciphertext holds 64 KB at most, which is this many characters of base64url. */
    public static final int ITEM_CHARS = 87_382;

    /** A key wrapped for one person, a share for a helper, a wrapped private key. */
    public static final int KEY_CHARS = 512;

    /** A note for the family: about 16 KB. */
    public static final int NOTE_CHARS = 22_000;

    /** What a guest is shown from a sealed card: a door code, a Wi‑Fi name and password. */
    public static final int CARD_CHARS = 4_096;

    /** A public key is 32 bytes, which is exactly this many characters. */
    public static final int PUBLIC_KEY_CHARS = 43;

    /**
     * What the sample data holds in place of a ciphertext. The sample people have no keys, so their items
     * can't be scrambled; the app shows this as "sample item: add your own to see the real thing". A phone
     * may not send it.
     */
    public static final String SAMPLE = "sample-item-not-scrambled";

    private static final Pattern BASE64URL = Pattern.compile("[A-Za-z0-9_-]+");

    private Sealed() {}

    /** True for text only a scrambler would write: base64url without padding, of a length such text can have. */
    public static boolean looksSealed(String value) {
        return value != null && BASE64URL.matcher(value).matches() && value.length() % 4 != 1;
    }

    /**
     * The value, when it is base64url of at most this many characters.
     *
     * @param tooLong the sentence for a value that is too long
     */
    public static String text(String value, int maxChars, String tooLong) {
        if (value == null || value.isEmpty()) {
            throw notSealed();
        }
        if (value.length() > maxChars) {
            throw new ApiProblem(org.springframework.http.HttpStatus.CONTENT_TOO_LARGE, "too_large", tooLong);
        }
        if (!looksSealed(value) || SAMPLE.equals(value)) {
            throw notSealed();
        }
        return value;
    }

    /** An item's ciphertext. */
    public static String item(String value) {
        return text(value, ITEM_CHARS, "That is more than one item can hold. Keep an item under 64 KB.");
    }

    /** A key wrapped for one person, or anything else as small. */
    public static String key(String value) {
        return text(value, KEY_CHARS, "That key is longer than a key can be. Update the app and try again.");
    }

    /** The same, for a value that may be left out. */
    public static String keyOrNull(String value) {
        return value == null ? null : key(value);
    }

    public static String note(String value) {
        return value == null ? null : text(value, NOTE_CHARS, "That note is too long. Keep it under 16 KB.");
    }

    public static String card(String value) {
        return text(value, CARD_CHARS, "That is too long to show a guest. Keep it to a code or a password.");
    }

    /** A public key: 32 bytes, so exactly 43 characters. */
    public static String publicKey(String value) {
        if (value == null || value.length() != PUBLIC_KEY_CHARS || !looksSealed(value)) {
            throw ApiProblem.badRequest("not_a_key", "That isn't a key this app made. Update the app and try again.");
        }
        return value;
    }

    private static ApiProblem notSealed() {
        return ApiProblem.badRequest(
                "not_sealed",
                "The Vault only keeps what the app has scrambled, and that wasn't. Update the app and try again.");
    }
}
