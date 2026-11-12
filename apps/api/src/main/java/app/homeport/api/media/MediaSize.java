package app.homeport.api.media;

/**
 * The smaller versions of a photo, so a list of faces or a row of cards doesn't download full-size pictures.
 * Small is for profile pictures and little squares; medium for cards and grids. Each is made once, when the
 * upload finishes, and stored next to the original under its own key.
 */
public enum MediaSize {
    SMALL(320),
    MEDIUM(800);

    private final int side;

    MediaSize(int side) {
        this.side = side;
    }

    /** The longest side, in pixels. */
    public int side() {
        return side;
    }

    /** Where this size of a photo is stored: next to the original, always as a JPEG. */
    public String keyFor(String storageKey) {
        return storageKey + ".w" + side + ".jpg";
    }
}
