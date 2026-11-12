package app.homeport.api.circle;

import app.homeport.api.common.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes the members of circles. */
@Repository
public class MemberStore {

    public record MemberRow(
            UUID id,
            UUID circleId,
            UUID userId,
            String name,
            MemberKind kind,
            Role role,
            MemberStatus status,
            String avatarKey,
            LocalDate birthday,
            String about,
            List<String> facts,
            String invitedEmail,
            int tint,
            boolean seesLibrary,
            boolean seesPlan,
            boolean seesPages,
            Instant createdAt) {

        /** True for someone who runs things in a family: its owner and the other adults. Everywhere else everyone does. */
        public boolean grownUp() {
            return role == Role.OWNER || role == Role.ADULT;
        }
    }

    private static final String COLUMNS = """
        m.id, m.circle_id, m.user_id, m.name, m.kind, m.role, m.status, a.storage_key as avatar_key, m.birthday,
        m.about, m.facts, m.invited_email, m.tint, m.sees_library, m.sees_plan, m.sees_pages, m.created_at
        from members m left join media a on a.id = m.avatar_media_id and a.status = 'ready'
        """;

    private final JdbcClient jdbc;

    MemberStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    static MemberRow row(ResultSet rs, int n) throws SQLException {
        return new MemberRow(
                rs.getObject("id", UUID.class),
                rs.getObject("circle_id", UUID.class),
                rs.getObject("user_id", UUID.class),
                rs.getString("name"),
                MemberKind.read(rs.getString("kind")),
                Role.read(rs.getString("role")),
                MemberStatus.read(rs.getString("status")),
                rs.getString("avatar_key"),
                rs.getObject("birthday", LocalDate.class),
                rs.getString("about"),
                Sql.strings(rs, "facts"),
                rs.getString("invited_email"),
                rs.getInt("tint"),
                rs.getBoolean("sees_library"),
                rs.getBoolean("sees_plan"),
                rs.getBoolean("sees_pages"),
                Sql.instant(rs, "created_at"));
    }

    /** The signed-in person's own place in a circle, when they have joined it. */
    public Optional<MemberRow> mine(UUID circleId, UUID me) {
        return jdbc.sql("select " + COLUMNS
                        + " where m.circle_id = :circle and m.user_id = :me and m.status = 'joined'")
                .param("circle", circleId)
                .param("me", me)
                .query(MemberStore::row)
                .optional();
    }

    public Optional<MemberRow> find(UUID id) {
        return jdbc.sql("select " + COLUMNS + " where m.id = :id and m.status <> 'left'")
                .param("id", id)
                .query(MemberStore::row)
                .optional();
    }

    /** Everyone in these circles who hasn't left: the owner first, then adults, teens, children and pets, each in the order they were added. */
    public List<MemberRow> of(List<UUID> circleIds) {
        if (circleIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select " + COLUMNS + """
             where m.circle_id in (:circles) and m.status <> 'left'
             order by m.circle_id, case when m.kind = 'pet' then 5 else array_position(array['owner','adult','teen','child','guest'], m.role) end,
               m.created_at, m.id
            """)
                .param("circles", circleIds)
                .query(MemberStore::row)
                .list();
    }

    public int countIn(UUID circleId) {
        return jdbc.sql("select count(*) from members where circle_id = :circle and status <> 'left'")
                .param("circle", circleId)
                .query(Integer.class)
                .single();
    }

    /** Adds a member. Sending the same clientId again adds nothing and returns the member made the first time. */
    public UUID insert(
            UUID circleId,
            UUID userId,
            String name,
            MemberKind kind,
            Role role,
            MemberStatus status,
            UUID avatarMediaId,
            LocalDate birthday,
            String about,
            String invitedEmail,
            int tint,
            UUID clientId) {
        UUID id = UUID.randomUUID();
        return jdbc.sql("""
            insert into members (id, circle_id, user_id, name, kind, role, status, avatar_media_id, birthday, about,
              invited_email, tint, client_id)
            values (:id, :circle, :user, :name, :kind, :role, :status, :avatar, :birthday, :about, :email, :tint, :client)
            on conflict (circle_id, client_id) do update set client_id = excluded.client_id
            returning id
            """)
                .param("id", id)
                .param("circle", circleId)
                .param("user", userId)
                .param("name", name)
                .param("kind", kind.code())
                .param("role", role.code())
                .param("status", status.code())
                .param("avatar", avatarMediaId)
                .param("birthday", birthday)
                .param("about", about)
                .param("email", invitedEmail)
                .param("tint", tint)
                .param("client", clientId)
                .query(UUID.class)
                .single();
    }

    public void update(
            UUID id,
            String name,
            Role role,
            UUID avatarMediaId,
            boolean changeAvatar,
            LocalDate birthday,
            String about,
            List<String> facts,
            boolean seesLibrary,
            boolean seesPlan,
            boolean seesPages) {
        jdbc.sql("""
            update members set name = :name, role = :role, birthday = :birthday, about = :about, facts = :facts,
              avatar_media_id = case when :change then cast(:avatar as uuid) else avatar_media_id end,
              sees_library = :library, sees_plan = :plan, sees_pages = :pages
            where id = :id
            """)
                .param("id", id)
                .param("name", name)
                .param("role", role.code())
                .param("birthday", birthday)
                .param("about", about)
                .param("facts", facts.toArray(String[]::new))
                .param("change", changeAvatar)
                .param("avatar", avatarMediaId == null ? null : avatarMediaId.toString())
                .param("library", seesLibrary)
                .param("plan", seesPlan)
                .param("pages", seesPages)
                .update();
    }

    /** A member who never had a sign-in and owns nothing is simply removed. */
    public void delete(UUID id) {
        jdbc.sql("delete from members where id = :id").param("id", id).update();
    }

    /**
     * Someone who was in the circle is kept as a name, so what they did still says who did it. They are no
     * longer shared with: what was shared with them by name stops being, and nothing is hidden from them any more.
     */
    public void markLeft(UUID id) {
        jdbc.sql("update members set status = 'left', role = 'adult', invited_email = null where id = :id")
                .param("id", id)
                .update();
        jdbc.sql("delete from thing_shares where member_id = :id")
                .param("id", id)
                .update();
        jdbc.sql("delete from thing_hides where member_id = :id")
                .param("id", id)
                .update();
    }

    public void makeOwner(UUID id) {
        jdbc.sql("update members set role = 'owner' where id = :id")
                .param("id", id)
                .update();
    }

    /** The invited member this email address was asked to become, if there is one in the circle. */
    public Optional<UUID> invited(UUID circleId, String email) {
        return jdbc.sql("""
            select id from members where circle_id = :circle and status = 'invited' and lower(invited_email) = lower(:email)
            order by created_at limit 1
            """)
                .param("circle", circleId)
                .param("email", email)
                .query(UUID.class)
                .optional();
    }

    /** An invited member becomes a person with a sign-in. */
    public void join(UUID id, UUID userId, String name, UUID avatarMediaId) {
        jdbc.sql("""
            update members set user_id = :user, status = 'joined', name = :name,
              avatar_media_id = coalesce(cast(:avatar as uuid), avatar_media_id), invited_email = null
            where id = :id
            """)
                .param("id", id)
                .param("user", userId)
                .param("name", name)
                .param("avatar", avatarMediaId == null ? null : avatarMediaId.toString())
                .update();
    }

    /** Someone who left and comes back gets their old place again. */
    public Optional<UUID> leftBefore(UUID circleId, UUID userId) {
        return jdbc.sql("select id from members where circle_id = :circle and user_id = :user and status = 'left'")
                .param("circle", circleId)
                .param("user", userId)
                .query(UUID.class)
                .optional();
    }

    public void comeBack(UUID id) {
        jdbc.sql("update members set status = 'joined' where id = :id")
                .param("id", id)
                .update();
    }
}
