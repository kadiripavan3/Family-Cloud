package app.homeport.api.journey;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import app.homeport.api.common.Sql;
import app.homeport.api.thing.ThingService;
import com.fasterxml.jackson.annotation.JsonValue;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Work that takes longer than a request should: keeping a journey (every photo is fetched and stored), and
 * sending a draft to Journey (every photo is sent). The request starts it and answers at once; the screen
 * then asks how far it is.
 *
 * <p>The work runs with the sign-in of the person who asked, held in memory only while it runs. Nothing of
 * it is written down, so a job that is cut off (a deploy) can't be picked up by itself: it reads as stopped,
 * and the person asks again. Both kinds of work are safe to ask for again; nothing is kept or sent twice.
 */
@Component
public class JourneyJobs {

    private static final Logger log = LoggerFactory.getLogger(JourneyJobs.class);

    /** A job that hasn't said anything for this long has stopped: the API it ran in was replaced. */
    static final Duration QUIET_MEANS_STOPPED = Duration.ofMinutes(10);

    public enum JourneyJobKind {
        KEEP,
        POST;

        @JsonValue
        public String code() {
            return Codes.of(this);
        }
    }

    public enum JourneyJobStatus {
        WAITING,
        RUNNING,
        DONE,
        FAILED;

        @JsonValue
        public String code() {
            return Codes.of(this);
        }
    }

    public record JourneyJobResponse(
            UUID id,
            JourneyJobKind kind,
            JourneyJobStatus status,

            @Schema(description = "What it is doing, in a few words: Bringing photos home")
            String step,

            int done,
            int total,

            @Schema(nullable = true, description = "For a job that failed: why, in a sentence")
            String problem,

            @Schema(nullable = true, description = "What it is about: the kept journey, or the draft")
            UUID subjectId,

            Instant updatedAt) {}

    /** How work says how far it is. */
    public interface Progress {

        void step(String words, int done, int total);

        /** What the work is about, once it knows (a journey kept for the first time has no id before). */
        void about(UUID subjectId);
    }

    private final JdbcClient jdbc;
    private final ThreadPoolExecutor workers =
            new ThreadPoolExecutor(2, 2, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(40), runnable -> {
                Thread thread = new Thread(runnable, "journey-job");
                thread.setDaemon(true);
                return thread;
            });

    JourneyJobs(JdbcClient jdbc) {
        this.jdbc = jdbc;
        workers.allowCoreThreadTimeOut(true);
    }

    @PreDestroy
    void stop() {
        workers.shutdown();
    }

    /**
     * Starts work for this person, or answers with the job this clientId started before. The work itself
     * runs after this has returned.
     */
    public JourneyJobResponse start(
            UUID me, UUID circleId, JourneyJobKind kind, UUID subjectId, UUID clientId, Consumer<Progress> work) {
        UUID id = UUID.randomUUID();
        boolean started = jdbc.sql("""
            insert into journey_jobs (id, user_id, circle_id, kind, subject_id, client_id)
            values (:id, :user, :circle, :kind, :subject, :client)
            on conflict (user_id, client_id) do nothing
            """)
                        .param("id", id)
                        .param("user", me)
                        .param("circle", circleId)
                        .param("kind", kind.code())
                        .param("subject", subjectId)
                        .param("client", clientId)
                        .update()
                == 1;
        if (!started) {
            return jdbc.sql("select * from journey_jobs where user_id = :user and client_id = :client")
                    .param("user", me)
                    .param("client", clientId)
                    .query(JourneyJobs::job)
                    .single();
        }
        try {
            workers.execute(() -> run(id, work));
        } catch (RejectedExecutionException full) {
            failed(id, "A lot is being kept right now. Try again in a few minutes.");
        }
        return find(id, me).orElseThrow();
    }

    private void run(UUID id, Consumer<Progress> work) {
        update(id, JourneyJobStatus.RUNNING, "Starting", 0, 0, null);
        try {
            work.accept(new Progress() {
                @Override
                public void step(String words, int done, int total) {
                    update(id, JourneyJobStatus.RUNNING, words, done, total, null);
                }

                @Override
                public void about(UUID subjectId) {
                    jdbc.sql("update journey_jobs set subject_id = :subject where id = :id")
                            .param("id", id)
                            .param("subject", subjectId)
                            .update();
                }
            });
            jdbc.sql("update journey_jobs set status = 'done', updated_at = now() where id = :id")
                    .param("id", id)
                    .update();
        } catch (ApiProblem problem) {
            // A sentence written for the person: it is what the screen shows.
            failed(id, problem.getMessage());
        } catch (RuntimeException unexpected) {
            log.error("The journey job {} failed", id, unexpected);
            failed(id, "Something went wrong on our side. Try again.");
        }
    }

    private void failed(UUID id, String problem) {
        jdbc.sql("update journey_jobs set status = 'failed', problem = :problem, updated_at = now() where id = :id")
                .param("id", id)
                .param("problem", problem)
                .update();
    }

    private void update(UUID id, JourneyJobStatus status, String step, int done, int total, String problem) {
        jdbc.sql("""
            update journey_jobs set status = :status, step = :step, done = :done, total = :total, problem = :problem,
              updated_at = now() where id = :id
            """)
                .param("id", id)
                .param("status", status.code())
                .param("step", step)
                .param("done", done)
                .param("total", total)
                .param("problem", problem)
                .update();
    }

    /** A job, for the person who started it. To anyone else it isn't there. */
    public JourneyJobResponse get(UUID id, UUID me) {
        return find(id, me).orElseThrow(ThingService::notFound);
    }

    /** The latest job about something (a kept journey, a draft) that this person started. */
    public Optional<JourneyJobResponse> latest(UUID subjectId, UUID me) {
        return jdbc.sql(
                        "select * from journey_jobs where subject_id = :subject and user_id = :user order by created_at desc limit 1")
                .param("subject", subjectId)
                .param("user", me)
                .query(JourneyJobs::job)
                .optional();
    }

    private Optional<JourneyJobResponse> find(UUID id, UUID me) {
        return jdbc.sql("select * from journey_jobs where id = :id and user_id = :user")
                .param("id", id)
                .param("user", me)
                .query(JourneyJobs::job)
                .optional();
    }

    private static JourneyJobResponse job(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        JourneyJobStatus status =
                JourneyJobStatus.valueOf(rs.getString("status").toUpperCase(java.util.Locale.ROOT));
        Instant updated = Sql.instant(rs, "updated_at");
        String problem = rs.getString("problem");
        if ((status == JourneyJobStatus.RUNNING || status == JourneyJobStatus.WAITING)
                && updated.isBefore(Instant.now().minus(QUIET_MEANS_STOPPED))) {
            status = JourneyJobStatus.FAILED;
            problem = "It stopped half way. Ask again: nothing is kept or sent twice.";
        }
        return new JourneyJobResponse(
                rs.getObject("id", UUID.class),
                JourneyJobKind.valueOf(rs.getString("kind").toUpperCase(java.util.Locale.ROOT)),
                status,
                rs.getString("step"),
                rs.getInt("done"),
                rs.getInt("total"),
                problem,
                rs.getObject("subject_id", UUID.class),
                updated);
    }

    static ApiProblem busy() {
        return new ApiProblem(HttpStatus.CONFLICT, "still_working", "That is still under way. Give it a moment.");
    }
}
