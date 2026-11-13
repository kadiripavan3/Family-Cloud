package app.homeport.api.account;

import app.homeport.api.account.AccountService.SettingsResponse;
import app.homeport.api.common.Sql;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes a person's settings, and what deleting an account leaves behind. */
@Repository
public class AccountStore {

    private final JdbcClient jdbc;

    AccountStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<SettingsResponse> settings(UUID userId) {
        return jdbc.sql("select * from settings where user_id = :me")
                .param("me", userId)
                .query((rs, n) -> new SettingsResponse(
                        rs.getBoolean("notify_activity"),
                        rs.getBoolean("weekly_summary"),
                        rs.getBoolean("summary_email"),
                        rs.getBoolean("hide_details")))
                .optional();
    }

    public void saveSettings(UUID userId, SettingsResponse s) {
        jdbc.sql("""
            insert into settings (user_id, notify_activity, weekly_summary, summary_email, hide_details)
            values (:me, :activity, :summary, :email, :hide)
            on conflict (user_id) do update set notify_activity = excluded.notify_activity,
              weekly_summary = excluded.weekly_summary, summary_email = excluded.summary_email,
              hide_details = excluded.hide_details, updated_at = now()
            """)
                .param("me", userId)
                .param("activity", s.notifyActivity())
                .param("summary", s.weeklySummary())
                .param("email", s.summaryEmail())
                .param("hide", s.hideDetails())
                .update();
    }

    /** What the You screen counts: the circles a person is in, the notes and lists they wrote, and how much they keep. */
    public AccountService.OverviewResponse overview(UUID userId) {
        return jdbc.sql("""
            select
              (select coalesce(array_agg(c.name order by m.created_at), '{}') from members m join circles c on c.id = m.circle_id
                where m.user_id = :me and m.status = 'joined') as circles,
              (select count(*) from things t join members m on m.id = t.owner_id
                where m.user_id = :me and m.status = 'joined' and t.place = 'notes') as notes,
              (select coalesce(sum(bytes), 0) from media where owner_id = :me and status = 'ready') as bytes,
              (select coalesce(array_agg(distinct platform), '{}') from devices where user_id = :me) as phones
            """)
                .param("me", userId)
                .query((rs, n) -> new AccountService.OverviewResponse(
                        Sql.strings(rs, "circles"), rs.getInt("notes"), rs.getLong("bytes"), Sql.strings(rs, "phones")))
                .single();
    }

    /** Deleting an account takes its circles' things with it, which can be a lot of rows. */
    public void roomToDeleteAnAccount() {
        jdbc.sql(Sql.ROOM_FOR_A_JOB).update();
    }

    /**
     * Removes what is this person's alone, in the order the database needs. A circle they are the last
     * signed-in person of goes entirely. In a circle others stay in, their own things go and their place in
     * it is kept as a name without a sign-in, so "Alex paid" in an old bill still says Alex.
     */
    public void deleteProfile(UUID userId) {
        jdbc.sql("""
            delete from circles c where exists (select 1 from members m where m.circle_id = c.id and m.user_id = :me)
              and not exists (select 1 from members o where o.circle_id = c.id and o.user_id is not null
                              and o.user_id <> :me and o.status = 'joined')
            """).param("me", userId).update();
        jdbc.sql("delete from things t using members m where t.owner_id = m.id and m.user_id = :me")
                .param("me", userId)
                .update();
        // Someone else becomes the owner of a circle that would be left without one: whoever joined first.
        jdbc.sql("""
            update members set role = 'owner' where id in (
              select distinct on (o.circle_id) o.id from members o
              join members mine on mine.circle_id = o.circle_id and mine.user_id = :me and mine.role = 'owner'
              where o.user_id is not null and o.user_id <> :me and o.status = 'joined' and o.role = 'adult'
              order by o.circle_id, o.created_at)
            """).param("me", userId).update();
        jdbc.sql("update members set status = 'left', role = 'adult', invited_email = null, avatar_media_id = null"
                        + " where user_id = :me")
                .param("me", userId)
                .update();
        jdbc.sql("delete from profiles where id = :me").param("me", userId).update();
    }

    /** Remembered so a token that is still valid for a while can't bring the account back. */
    public void rememberDeleted(UUID userId) {
        jdbc.sql("insert into deleted_accounts (id) values (:id) on conflict do nothing")
                .param("id", userId)
                .update();
    }

    /** When this account was deleted, if it was (and not long enough ago to be forgotten). */
    public Optional<Instant> deletedAt(UUID userId) {
        return jdbc.sql("select deleted_at from deleted_accounts where id = :id")
                .param("id", userId)
                .query((row, n) -> row.getTimestamp(1).toInstant())
                .optional();
    }

    /** Deleted accounts whose sign-in is still there and due for another try. Each is put off as it is taken. */
    public List<UUID> takeSignInsToRemove(int limit) {
        return jdbc.sql("""
            update deleted_accounts set attempts = attempts + 1,
              next_try_at = now() + make_interval(mins => least(5 * power(2, attempts)::int, 720))
            where id in (select id from deleted_accounts where sign_in_removed_at is null and next_try_at <= now()
                         order by next_try_at limit :limit for update skip locked)
            returning id
            """).param("limit", limit).query(UUID.class).list();
    }

    public void signInRemoved(UUID userId) {
        jdbc.sql("update deleted_accounts set sign_in_removed_at = now() where id = :id")
                .param("id", userId)
                .update();
    }

    /** A token lives an hour or so; a month later nothing can still be holding one. */
    public int forgetDeletedBefore(int days) {
        return jdbc.sql(
                        "delete from deleted_accounts where sign_in_removed_at is not null and deleted_at < now() - make_interval(days => :days)")
                .param("days", days)
                .update();
    }
}
