package app.homeport.api.activity;

import java.util.List;
import java.util.UUID;

/**
 * What a batch of photos is called and a picture to stand for it: "Saturday at the lake", when they all
 * belong to one moment. The Library answers; without it a batch is simply "19 photos".
 */
public interface PhotoBatches {

    /**
     * @param title what they are together, or null when they are from several days
     * @param imageUrl a small picture of one of them, or null
     */
    record Named(String title, String imageUrl) {}

    /** These photos and videos, all of which the viewer may see, newest first. */
    Named name(UUID circleId, UUID me, List<UUID> photoIds);
}
