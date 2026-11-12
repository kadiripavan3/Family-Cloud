package app.homeport.api.profile;

import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes profiles. */
@Repository
public class ProfileStore {

    private final JdbcClient jdbc;

    ProfileStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Profile> find(UUID id) {
        return jdbc.sql("""
            select p.id, p.display_name, p.avatar_media_id, a.storage_key as avatar_key
            from profiles p left join media a on a.id = p.avatar_media_id and a.status = 'ready'
            where p.id = :id
            """)
                .param("id", id)
                .query((rs, n) -> new Profile(
                        rs.getObject("id", UUID.class),
                        rs.getString("display_name"),
                        rs.getObject("avatar_media_id", UUID.class),
                        rs.getString("avatar_key")))
                .optional();
    }

    public boolean exists(UUID id) {
        return jdbc.sql("select exists (select 1 from profiles where id = :id)")
                .param("id", id)
                .query(Boolean.class)
                .single();
    }

    /** Records that the person said they are 13 or older, the moment a new profile is made. Kept once; never changed. */
    public void confirmAge(UUID id) {
        jdbc.sql("update profiles set age_confirmed_at = now() where id = :id and age_confirmed_at is null")
                .param("id", id)
                .update();
    }

    /** Creates the profile the first time and changes it after that. */
    public void save(UUID id, String displayName, UUID avatarMediaId) {
        jdbc.sql("""
            insert into profiles (id, display_name, avatar_media_id) values (:id, :name, :avatar)
            on conflict (id) do update set display_name = excluded.display_name,
              avatar_media_id = excluded.avatar_media_id, updated_at = now()
            """)
                .param("id", id)
                .param("name", displayName)
                .param("avatar", avatarMediaId)
                .update();
    }

    /**
     * A person's name and picture follow them into every circle they are in: their member rows show what the
     * profile says, unless the circle gave them a picture of its own before they joined.
     */
    public void carryIntoCircles(UUID id, String displayName, UUID avatarMediaId) {
        jdbc.sql("update members set name = :name, avatar_media_id = :avatar where user_id = :id")
                .param("id", id)
                .param("name", displayName)
                .param("avatar", avatarMediaId)
                .update();
    }
}
