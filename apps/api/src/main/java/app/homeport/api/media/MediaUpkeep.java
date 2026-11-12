package app.homeport.api.media;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** What happens to uploaded files by itself, in the background: every minute, files that are no longer used are removed (see {@link MediaService#sweep}). */
@Component
class MediaUpkeep {

    private final MediaService media;

    MediaUpkeep(MediaService media) {
        this.media = media;
    }

    /** Safe in every copy of the API at once: each takes its own rows. */
    @Scheduled(
            initialDelayString = "${homeport.media.sweep-every:PT1M}",
            fixedDelayString = "${homeport.media.sweep-every:PT1M}")
    void everyMinute() {
        media.sweep();
    }
}
