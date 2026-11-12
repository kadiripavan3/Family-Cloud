package app.homeport.api.export;

import app.homeport.api.activity.ActivityKind;
import app.homeport.api.activity.ActivityLog;
import app.homeport.api.activity.ActivityLog.Happened;
import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.export.ExportBuilder.Built;
import app.homeport.api.export.ExportStore.ExportRow;
import app.homeport.api.media.MediaStorage;
import app.homeport.api.notify.Outbox;
import app.homeport.api.notify.Push;
import app.homeport.api.notify.PushKind;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.IOException;
import java.nio.file.Files;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * "Export everything": one zip of what a person owns, or may see, in a circle. Asking for one answers at
 * once; a job makes it in the background, keeps it in storage under an address that can't be guessed, and
 * tells the person when it is ready (a line in Activity and a push). It can be fetched for seven days and is
 * then removed.
 *
 * <p>No transaction is open while the zip is made or stored: the export is taken in one short transaction,
 * built and stored with none, and marked ready in another.
 */
@Service
public class ExportService {

    private static final Logger log = LoggerFactory.getLogger(ExportService.class);
    /** How long a finished export can be fetched. */
    static final Duration KEPT = Duration.ofDays(7);
    /** How many exports one person may have under way at once. */
    static final int AT_ONCE = 2;

    private static final SecureRandom RANDOM = new SecureRandom();

    public record ExportResponse(
            UUID id,
            UUID circleId,
            ExportScope scope,
            ExportState state,

            @Schema(
                    nullable = true,
                    description = "Where the zip is, once it is ready. Nobody can guess the address; whoever has it"
                            + " can fetch the file, so treat it like the file.")
            String url,

            @Schema(nullable = true) Long bytes,

            @Schema(nullable = true, description = "How many files are in it")
            Integer files,

            @Schema(description = "What a bound kept out, in sentences to show as they are. Usually empty.")
            List<String> leftOut,

            Instant askedAt,
            @Schema(nullable = true) Instant readyAt,

            @Schema(nullable = true, description = "When it will be removed: seven days after it was made")
            Instant expiresAt) {}

    private final ExportStore exports;
    private final ExportBuilder builder;
    private final CircleService circles;
    private final MediaStorage storage;
    private final ActivityLog activity;
    private final Outbox outbox;
    private final TransactionTemplate transaction;

    ExportService(
            ExportStore exports,
            ExportBuilder builder,
            CircleService circles,
            MediaStorage storage,
            ActivityLog activity,
            Outbox outbox,
            TransactionTemplate transaction) {
        this.exports = exports;
        this.builder = builder;
        this.circles = circles;
        this.storage = storage;
        this.activity = activity;
        this.outbox = outbox;
        this.transaction = transaction;
    }

    /** Asks for an export of a circle. It is made in the background; ask for its state to see when it is ready. */
    @Transactional
    public ExportResponse ask(UUID circleId, UUID me, ExportScope scope, UUID clientId) {
        circles.require(circleId, me);
        if (exports.underWay(me) >= AT_ONCE) {
            throw ApiProblem.conflict(
                    "export_under_way", "Two exports are being made for you already. They take a few minutes.");
        }
        UUID id = exports.insert(me, circleId, scope == null ? ExportScope.MINE : scope, clientId);
        return view(exports.find(id).orElseThrow());
    }

    /** One export, for the person who asked for it. To anyone else it isn't there. */
    public ExportResponse get(UUID id, UUID me) {
        return view(mine(id, me));
    }

    /** The signed-in person's exports of a circle, newest first. Ten at most: they last a week. */
    public List<ExportResponse> list(UUID circleId, UUID me) {
        circles.require(circleId, me);
        return exports.of(me, circleId).stream().map(this::view).toList();
    }

    /** Removes an export before its week is over. Its file follows within a minute. */
    @Transactional
    public void remove(UUID id, UUID me) {
        exports.find(id).filter(row -> row.userId().equals(me)).ifPresent(row -> exports.delete(id));
    }

    private ExportRow mine(UUID id, UUID me) {
        return exports.find(id)
                .filter(row -> row.userId().equals(me))
                .orElseThrow(() -> new ApiProblem(
                        HttpStatus.NOT_FOUND, "not_found", "That export isn't there any more. Ask for a new one."));
    }

    private ExportResponse view(ExportRow row) {
        boolean ready = row.state() == ExportState.READY && row.storageKey() != null;
        return new ExportResponse(
                row.id(),
                row.circleId(),
                row.scope(),
                row.state(),
                ready ? storage.publicUrl(row.storageKey()) : null,
                row.bytes(),
                row.files(),
                row.leftOut(),
                row.createdAt(),
                row.readyAt(),
                row.expiresAt());
    }

    // ---------- the job's work ----------

    /**
     * Makes the exports that wait, one after the other. Returns how many it made. Safe in several copies of
     * the API at once: each takes its own.
     */
    public int makeWaiting() {
        int made = 0;
        for (int round = 0; round < 10; round++) {
            Optional<ExportRow> next = transaction.execute(status -> exports.take());
            if (next == null || next.isEmpty()) {
                break;
            }
            made += make(next.get()) ? 1 : 0;
        }
        return made;
    }

    private boolean make(ExportRow row) {
        Built built = null;
        try {
            built = builder.build(row.userId(), row.circleId(), row.scope());
            long bytes = Files.size(built.file());
            // Three parts, like every stored file: a folder, an end nobody can guess, and a name to save it under.
            String key = "exports/" + token() + "/homeport-export-" + LocalDate.now(ZoneOffset.UTC) + ".zip";
            storage.put(key, built.file(), "application/zip");
            Built done = built;
            transaction.executeWithoutResult(status -> {
                exports.ready(
                        row.id(),
                        key,
                        bytes,
                        done.files(),
                        done.leftOut(),
                        Instant.now().plus(KEPT));
                tell(row, done);
            });
            return true;
        } catch (ApiProblem gone) {
            // They left the circle, or deleted their account, while it waited: nothing to make.
            exports.failed(row.id());
            return false;
        } catch (IOException | RuntimeException failed) {
            log.error("Export {} couldn't be made (try {}): {}", row.id(), row.attempts(), failed.toString());
            if (row.attempts() >= 3) {
                exports.failed(row.id());
            }
            return false;
        } finally {
            if (built != null) {
                try {
                    Files.deleteIfExists(built.file());
                } catch (IOException leftBehind) {
                    log.warn(
                            "The temporary file of export {} couldn't be removed: {}", row.id(), leftBehind.toString());
                }
            }
        }
    }

    /** The person hears that it is ready: a line in Activity that only they get, and a push. */
    private void tell(ExportRow row, Built built) {
        MemberRow mine;
        try {
            mine = circles.me(row.circleId(), row.userId());
        } catch (ApiProblem gone) {
            return;
        }
        activity.record(Happened.in(row.circleId(), ActivityKind.EXPORT)
                .onlyFor(mine.id())
                .note("%,d files · kept for 7 days".formatted(built.files())));
        outbox.tell(Push.to(
                        row.userId(),
                        PushKind.EXPORT_READY,
                        "Your export is ready",
                        "It is kept for 7 days. Open Export and leaving to save it.",
                        "/settings/leaving")
                // It is their own request: muting the circle doesn't silence the answer to it.
                .once("export:" + row.id()));
    }

    /** Forgets exports whose week is over; their files are removed by the job that removes files. */
    public int forgetExpired() {
        return exports.forgetExpired();
    }

    private static String token() {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }
}
