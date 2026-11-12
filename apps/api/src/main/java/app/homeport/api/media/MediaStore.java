package app.homeport.api.media;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes the records of uploaded files. */
@Repository
public class MediaStore {

    public record MediaRow(
            UUID id,
            UUID ownerId,
            MediaKind kind,
            MediaStatus status,
            String contentType,
            String fileName,
            String storageKey,
            boolean hasSizes,
            Long bytes,
            Integer width,
            Integer height,
            Integer durationS,
            boolean keepOriginal,
            String originalKey,
            Long originalBytes,
            String contentHash) {

        public boolean ready() {
            return status == MediaStatus.READY;
        }
    }

    private final JdbcClient jdbc;

    MediaStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** A record of a file to come. */
    public void insert(
            UUID id, UUID ownerId, MediaKind kind, String contentType, String fileName, String key, Integer durationS) {
        insert(id, ownerId, kind, contentType, fileName, key, durationS, false);
    }

    /** A record of a file to come. With {@code keepOriginal}, a photo's upload is kept next to the sizes made from it. */
    public void insert(
            UUID id,
            UUID ownerId,
            MediaKind kind,
            String contentType,
            String fileName,
            String key,
            Integer durationS,
            boolean keepOriginal) {
        jdbc.sql("""
            insert into media (id, owner_id, kind, content_type, file_name, storage_key, duration_s, keep_original)
            values (:id, :owner, :kind, :type, :name, :key, :duration, :keep)
            """)
                .param("id", id)
                .param("owner", ownerId)
                .param("kind", kind.code())
                .param("type", contentType)
                .param("name", fileName)
                .param("key", key)
                .param("duration", durationS)
                .param("keep", keepOriginal)
                .update();
    }

    public record Recent(int unfinished, int today) {}

    /** How many uploads this person has started and not finished, and how many they sent in the last day. */
    public Recent recentOf(UUID ownerId) {
        return jdbc.sql("""
            select count(*) filter (where status = 'pending') as unfinished,
                   count(*) filter (where created_at > now() - interval '1 day') as today
            from media where owner_id = :owner and created_at > now() - interval '1 day'
            """)
                .param("owner", ownerId)
                .query((rs, n) -> new Recent(rs.getInt("unfinished"), rs.getInt("today")))
                .single();
    }

    /** Takes a pending upload for finishing, so two "done" calls for one file don't both work on it. */
    public boolean claim(UUID id) {
        return jdbc.sql("update media set status = 'working' where id = :id and status = 'pending'")
                        .param("id", id)
                        .update()
                == 1;
    }

    public void release(UUID id) {
        jdbc.sql("update media set status = 'pending' where id = :id and status = 'working'")
                .param("id", id)
                .update();
    }

    public void photoReady(UUID id, String finalKey, long bytes, int width, int height) {
        // The trigger on delete queues storage_key for removal, so the record has to hold the kept file's key.
        jdbc.sql("""
            update media set status = 'ready', storage_key = :key, has_sizes = true, content_type = 'image/jpeg',
              bytes = :bytes, width = :width, height = :height where id = :id
            """)
                .param("id", id)
                .param("key", finalKey)
                .param("bytes", bytes)
                .param("width", width)
                .param("height", height)
                .update();
    }

    /**
     * A photo whose original was kept: where the original is, how big it is, and its fingerprint. Written with
     * the photo itself, so the record always names every file there is to remove.
     */
    public void photoReady(
            UUID id,
            String finalKey,
            long bytes,
            int width,
            int height,
            String originalKey,
            long originalBytes,
            String contentHash) {
        jdbc.sql("""
            update media set status = 'ready', storage_key = :key, has_sizes = true, content_type = 'image/jpeg',
              bytes = :bytes, width = :width, height = :height, original_key = :original,
              original_bytes = :originalBytes, content_hash = :hash where id = :id
            """)
                .param("id", id)
                .param("key", finalKey)
                .param("bytes", bytes)
                .param("width", width)
                .param("height", height)
                .param("original", originalKey)
                .param("originalBytes", originalBytes)
                .param("hash", contentHash)
                .update();
    }

    public void fileReady(UUID id, long bytes) {
        jdbc.sql("update media set status = 'ready', bytes = :bytes where id = :id")
                .param("id", id)
                .param("bytes", bytes)
                .update();
    }

    public Optional<MediaRow> find(UUID id) {
        return jdbc.sql("select * from media where id = :id")
                .param("id", id)
                .query(MediaStore::row)
                .optional();
    }

    public List<MediaRow> findAll(List<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select * from media where id in (:ids)")
                .param("ids", ids)
                .query(MediaStore::row)
                .list();
    }

    static MediaRow row(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new MediaRow(
                rs.getObject("id", UUID.class),
                rs.getObject("owner_id", UUID.class),
                MediaKind.read(rs.getString("kind")),
                MediaStatus.read(rs.getString("status")),
                rs.getString("content_type"),
                rs.getString("file_name"),
                rs.getString("storage_key"),
                rs.getBoolean("has_sizes"),
                (Long) rs.getObject("bytes"),
                (Integer) rs.getObject("width"),
                (Integer) rs.getObject("height"),
                (Integer) rs.getObject("duration_s"),
                rs.getBoolean("keep_original"),
                rs.getString("original_key"),
                (Long) rs.getObject("original_bytes"),
                rs.getString("content_hash"));
    }

    /** Deletes these records. The database queues their files for removal in the same transaction. */
    public int delete(List<UUID> ids) {
        if (ids.isEmpty()) {
            return 0;
        }
        return jdbc.sql("delete from media where id in (:ids)")
                .param("ids", ids)
                .update();
    }

    /** Everything a person uploaded, for deleting their account. */
    public int deleteOwnedBy(UUID ownerId) {
        return jdbc.sql("delete from media where owner_id = :owner")
                .param("owner", ownerId)
                .update();
    }

    /**
     * Uploads nobody will use: started and never finished within a day, or sent by someone who signed in and
     * never made a profile.
     */
    public List<UUID> neverFinished(int limit) {
        return jdbc.sql("""
            select m.id from media m where m.created_at < now() - interval '1 day'
              and (m.status in ('pending', 'working', 'failed')
                   or not exists (select 1 from profiles p where p.id = m.owner_id))
            order by m.created_at limit :limit
            """).param("limit", limit).query(UUID.class).list();
    }

    /** A file waiting to be removed from storage. */
    public record Removal(long id, String storageKey, boolean hasSizes, int attempts) {}

    /**
     * Takes files that are due to be removed. Each is put off for a while as it is taken, so another copy of
     * the API doesn't take it too, and so one that fails is tried again later (a little later each time).
     */
    public List<Removal> takeRemovals(int limit) {
        return jdbc.sql("""
            update removed_files set attempts = attempts + 1,
              next_try_at = now() + make_interval(mins => least(5 * power(2, attempts)::int, 720))
            where id in (select id from removed_files where next_try_at <= now() order by next_try_at limit :limit
                         for update skip locked)
            returning id, storage_key, has_sizes, attempts
            """)
                .param("limit", limit)
                .query((rs, n) -> new Removal(
                        rs.getLong("id"),
                        rs.getString("storage_key"),
                        rs.getBoolean("has_sizes"),
                        rs.getInt("attempts")))
                .list();
    }

    public void removed(long removalId) {
        jdbc.sql("delete from removed_files where id = :id")
                .param("id", removalId)
                .update();
    }

    /** How many files are waiting to be removed. */
    public int removalsWaiting() {
        return jdbc.sql("select count(*) from removed_files")
                .query(Integer.class)
                .single();
    }
}
