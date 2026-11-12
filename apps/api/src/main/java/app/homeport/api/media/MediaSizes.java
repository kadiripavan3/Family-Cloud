package app.homeport.api.media;

import app.homeport.api.common.ApiProblem;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageTypeSpecifier;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Turns the file a phone uploaded into the photo Journey keeps. The upload is opened, checked (a JPEG or a
 * PNG, not enormous), drawn the right way up and saved again as a JPEG in three sizes, under an address the
 * phone never had a link to. So what is stored is exactly what the API looked at: nothing can be swapped in
 * afterwards, and nothing that travelled inside the file (where it was taken, on which phone) is kept.
 *
 * <p>The same code runs whatever the storage is (a folder on this computer, or R2).
 */
@Component
public class MediaSizes {

    /** The longest side a photo is kept at. The app sends photos no bigger than this. */
    static final int FULL = 2048;

    /** The biggest picture the API will open: 25 megapixels, as the file's own header says. */
    static final long MAX_PIXELS = 25_000_000L;

    /**
     * The most memory one opened picture may take. A file of a megabyte can claim to be a picture that needs
     * hundreds: such a file is refused before anything is unpacked.
     */
    static final long MAX_UNPACKED_BYTES = 96L * 1024 * 1024;

    private static final Set<String> FORMATS = Set.of("jpeg", "jpg", "png");

    /** Opening a photo takes a lot of memory, so only a couple are worked on at a time. */
    private final Semaphore working = new Semaphore(2);

    private final MediaStorage storage;

    MediaSizes(MediaStorage storage) {
        this.storage = storage;
    }

    /**
     * A photo as it was stored: its size in pixels and in bytes, and its medium version (a JPEG of at most 800
     * pixels) for the automatic check to look at.
     */
    public record Made(int width, int height, long bytes, byte[] preview) {}

    /**
     * Reads the uploaded file, stores the photo made from it under {@code finalKey} (with every
     * {@link MediaSize} next to it) and removes the upload. Refuses, with a sentence, a file that is missing,
     * too big, or not a picture the API takes.
     */
    public Made make(String uploadKey, String finalKey) {
        boolean mine = false;
        try {
            // Wait for a turn before reading anything, so files that wait don't each hold megabytes.
            mine = working.tryAcquire(30, TimeUnit.SECONDS);
            if (!mine) {
                throw busy();
            }
            byte[] upload;
            try (InputStream in = storage.open(uploadKey)) {
                upload = in.readNBytes((int) MediaService.MAX_PHOTO_BYTES + 1);
            } catch (IOException e) {
                throw ApiProblem.badRequest("upload_missing", "The photo didn't arrive. Try again.");
            }
            if (upload.length == 0) {
                throw ApiProblem.badRequest("upload_missing", "The photo didn't arrive. Try again.");
            }
            if (upload.length > MediaService.MAX_PHOTO_BYTES) {
                throw new ApiProblem(HttpStatus.CONTENT_TOO_LARGE, "too_large", "That photo is too big.");
            }
            Made made = store(upload, finalKey);
            storage.delete(uploadKey);
            return made;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw busy();
        } finally {
            if (mine) {
                working.release();
            }
        }
    }

    /**
     * Stores the photo made from these bytes under {@code finalKey}, with its smaller versions. For files the
     * API brings itself (the sample photos); an upload goes through {@link #make}.
     */
    public Made store(byte[] original, String finalKey) {
        BufferedImage full = fit(upright(open(original), orientation(original)), FULL);
        try {
            byte[] fullJpeg = jpeg(full, 0.88f);
            BufferedImage medium = fit(full, MediaSize.MEDIUM.side());
            byte[] mediumJpeg = jpeg(medium, 0.82f);
            byte[] smallJpeg = jpeg(fit(medium, MediaSize.SMALL.side()), 0.8f);
            storage.put(finalKey, fullJpeg, "image/jpeg");
            storage.put(MediaSize.MEDIUM.keyFor(finalKey), mediumJpeg, "image/jpeg");
            storage.put(MediaSize.SMALL.keyFor(finalKey), smallJpeg, "image/jpeg");
            return new Made(full.getWidth(), full.getHeight(), fullJpeg.length, mediumJpeg);
        } catch (IOException | RuntimeException e) {
            remove(finalKey);
            throw new IllegalStateException("Could not store the photo " + finalKey, e);
        }
    }

    /** Removes a stored photo and its smaller versions. Throws when storage can't be reached. */
    public void remove(String finalKey) {
        storage.delete(finalKey);
        for (MediaSize size : MediaSize.values()) {
            storage.delete(size.keyFor(finalKey));
        }
    }

    private static ApiProblem busy() {
        return new ApiProblem(HttpStatus.SERVICE_UNAVAILABLE, "busy", "We're a bit busy. Try again in a moment.");
    }

    private static ApiProblem unsupported() {
        return ApiProblem.badRequest("unsupported_media", "That photo's format isn't supported. Use JPEG or PNG.");
    }

    private static ApiProblem tooLarge() {
        return new ApiProblem(HttpStatus.CONTENT_TOO_LARGE, "too_large", "That photo is too large. Try a smaller one.");
    }

    /**
     * Opens the picture, at a reduced size when it is far bigger than what is kept. Only a JPEG or a PNG is
     * opened, whatever the file calls itself, and only when its header says it fits in memory.
     */
    static BufferedImage open(byte[] file) {
        try (ImageInputStream in = new MemoryCacheImageInputStream(new ByteArrayInputStream(file))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                throw unsupported();
            }
            ImageReader reader = readers.next();
            try {
                if (!FORMATS.contains(reader.getFormatName().toLowerCase(Locale.ROOT))) {
                    throw unsupported();
                }
                reader.setInput(in, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1 || height < 1) {
                    throw unsupported();
                }
                if ((long) width * height > MAX_PIXELS) {
                    throw tooLarge();
                }
                // Every "step"-th pixel is read: the result is between the size that is kept and twice that.
                int step = Math.max(1, Math.max(width, height) / FULL);
                long unpacked = (long) Math.ceilDiv(width, step) * Math.ceilDiv(height, step) * bytesPerPixel(reader);
                if (unpacked > MAX_UNPACKED_BYTES) {
                    throw tooLarge();
                }
                ImageReadParam how = reader.getDefaultReadParam();
                how.setSourceSubsampling(step, step, 0, 0);
                BufferedImage image = reader.read(0, how);
                if (image == null) {
                    throw unsupported();
                }
                return image;
            } finally {
                reader.dispose();
            }
        } catch (IOException | IllegalArgumentException | IndexOutOfBoundsException | NegativeArraySizeException e) {
            // A file that is cut off, or made to trip the reader, is not a picture.
            throw unsupported();
        }
    }

    private static long bytesPerPixel(ImageReader reader) throws IOException {
        ImageTypeSpecifier type = reader.getRawImageType(0);
        if (type == null) {
            Iterator<ImageTypeSpecifier> types = reader.getImageTypes(0);
            type = types.hasNext() ? types.next() : null;
        }
        if (type == null) {
            return 8; // unknown: assume the worst (four 16-bit channels)
        }
        int bits = 0;
        for (int sample : type.getSampleModel().getSampleSize()) {
            bits += sample;
        }
        return Math.max(1, (bits + 7) / 8);
    }

    /**
     * How a JPEG says it should be turned to be the right way up (1 to 8, as cameras write it; 1 is "as it
     * is"). Phones often store a photo sideways and note the turn next to it; that note is not kept, so the
     * turn is made here.
     */
    static int orientation(byte[] file) {
        try {
            if (file.length < 4 || (file[0] & 0xff) != 0xff || (file[1] & 0xff) != 0xd8) {
                return 1;
            }
            int at = 2;
            while (at + 4 <= file.length) {
                if ((file[at] & 0xff) != 0xff) {
                    return 1;
                }
                int marker = file[at + 1] & 0xff;
                if (marker == 0xda || marker == 0xd9) {
                    return 1; // the picture itself starts here; the notes come before it
                }
                int length = u16(file, at + 2, false);
                int end = at + 2 + length;
                if (length < 2 || end > file.length) {
                    return 1;
                }
                if (marker == 0xe1 && length >= 16 && isExif(file, at + 4)) {
                    int tiff = at + 10;
                    boolean little = file[tiff] == 'I' && file[tiff + 1] == 'I';
                    if (!little && !(file[tiff] == 'M' && file[tiff + 1] == 'M')) {
                        return 1;
                    }
                    long first = u32(file, tiff + 4, little);
                    if (first < 8 || tiff + first + 2 > end) {
                        return 1;
                    }
                    int list = tiff + (int) first;
                    int entries = u16(file, list, little);
                    for (int i = 0; i < entries; i++) {
                        int entry = list + 2 + 12 * i;
                        if (entry + 12 > end) {
                            return 1;
                        }
                        if (u16(file, entry, little) == 0x0112) {
                            int value = u16(file, entry + 8, little);
                            return value >= 1 && value <= 8 ? value : 1;
                        }
                    }
                    return 1;
                }
                at = end;
            }
        } catch (IndexOutOfBoundsException cutOff) {
            // Notes that end in the middle say nothing.
        }
        return 1;
    }

    private static boolean isExif(byte[] file, int at) {
        return file[at] == 'E'
                && file[at + 1] == 'x'
                && file[at + 2] == 'i'
                && file[at + 3] == 'f'
                && file[at + 4] == 0
                && file[at + 5] == 0;
    }

    private static int u16(byte[] file, int at, boolean little) {
        int a = file[at] & 0xff;
        int b = file[at + 1] & 0xff;
        return little ? (b << 8) | a : (a << 8) | b;
    }

    private static long u32(byte[] file, int at, boolean little) {
        long low = u16(file, little ? at : at + 2, little);
        long high = u16(file, little ? at + 2 : at, little);
        return (high << 16) | low;
    }

    /** The picture the right way up, on a white background (a PNG may be see-through), in plain colours. */
    static BufferedImage upright(BufferedImage image, int orientation) {
        int w = image.getWidth();
        int h = image.getHeight();
        boolean sideways = orientation >= 5;
        BufferedImage out = new BufferedImage(sideways ? h : w, sideways ? w : h, BufferedImage.TYPE_INT_RGB);
        AffineTransform turn = new AffineTransform();
        switch (orientation) {
            case 2 -> {
                turn.scale(-1, 1);
                turn.translate(-w, 0);
            }
            case 3 -> {
                turn.translate(w, h);
                turn.rotate(Math.PI);
            }
            case 4 -> {
                turn.scale(1, -1);
                turn.translate(0, -h);
            }
            case 5 -> {
                turn.rotate(-Math.PI / 2);
                turn.scale(-1, 1);
            }
            case 6 -> {
                turn.translate(h, 0);
                turn.rotate(Math.PI / 2);
            }
            case 7 -> {
                turn.translate(h, w);
                turn.rotate(Math.PI / 2);
                turn.scale(-1, 1);
            }
            case 8 -> {
                turn.translate(0, w);
                turn.rotate(-Math.PI / 2);
            }
            default -> {
                // As it is.
            }
        }
        Graphics2D g = out.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, out.getWidth(), out.getHeight());
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR);
        g.drawImage(image, turn, null);
        g.dispose();
        return out;
    }

    /** The picture no longer than {@code side} on its long side; as it is when it is already that small. */
    static BufferedImage fit(BufferedImage image, int side) {
        BufferedImage current = image;
        // Halving first keeps a big photo from turning grainy when it is made much smaller.
        while (Math.max(current.getWidth(), current.getHeight()) >= 2 * side) {
            current = drawn(current, Math.max(1, current.getWidth() / 2), Math.max(1, current.getHeight() / 2));
        }
        int longest = Math.max(current.getWidth(), current.getHeight());
        if (longest <= side) {
            return current;
        }
        double scale = (double) side / longest;
        return drawn(current, Math.max(1, (int) Math.round(current.getWidth() * scale)), Math.max(1, (int)
                Math.round(current.getHeight() * scale)));
    }

    private static BufferedImage drawn(BufferedImage image, int width, int height) {
        BufferedImage out = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.drawImage(image, 0, 0, width, height, Color.WHITE, null);
        g.dispose();
        return out;
    }

    /** The picture as a JPEG, with nothing but the picture in it. */
    static byte[] jpeg(BufferedImage image, float quality) throws IOException {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (MemoryCacheImageOutputStream out = new MemoryCacheImageOutputStream(bytes)) {
            ImageWriteParam how = writer.getDefaultWriteParam();
            how.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            how.setCompressionQuality(quality);
            writer.setOutput(out);
            writer.write(null, new IIOImage(image, null, null), how);
        } finally {
            writer.dispose();
        }
        return bytes.toByteArray();
    }
}
