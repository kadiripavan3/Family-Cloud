package app.homeport.api.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.homeport.api.common.ApiProblem;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

/** What the Library changed about photos: bigger ones are opened when the original is kept, and a file has a fingerprint. */
class MediaSizesTest {

    @Test
    void aPictureWithMorePixelsThanAllowedIsRefusedAndTheLibraryAllowsMoreThanAProfilePicture() throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(120, 100, BufferedImage.TYPE_INT_RGB), "jpg", bytes);
        byte[] picture = bytes.toByteArray();

        assertThat(MediaSizes.open(picture, 12_000).getWidth()).isEqualTo(120);
        assertThatThrownBy(() -> MediaSizes.open(picture, 11_999))
                .isInstanceOfSatisfying(
                        ApiProblem.class,
                        problem -> assertThat(problem.status()).isEqualTo(HttpStatus.CONTENT_TOO_LARGE));
        // A phone's full-size photo (48 or 50 megapixels) fits when its original is kept, and nowhere else.
        assertThat(MediaSizes.MAX_KEPT_PIXELS).isGreaterThan(50_000_000L);
        assertThat(MediaSizes.MAX_PIXELS).isLessThan(48_000_000L);
    }

    @Test
    void aFilesFingerprintIsItsSha256InHex() {
        assertThat(MediaSizes.sha256("abc".getBytes(StandardCharsets.US_ASCII)))
                .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assertThat(MediaSizes.sha256(new byte[0]))
                .isEqualTo("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    }
}
