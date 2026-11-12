package app.homeport.api.board.templates;

import app.homeport.api.board.BoardStore;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Template;
import app.homeport.api.board.templates.GuestBook.Line;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.RateLimit;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaService.NewUpload;
import app.homeport.api.thing.ThingStore;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * The web page behind the code by a flat's front door. A guest opens it, writes their name, a line, how many
 * nights they stayed, and may add a photo. No account, no app.
 *
 * <p>The link's end can't be guessed, and it is all a guest has. With it they can leave a line, and read the
 * last few lines the flat has let into the book: a name and a line each, no photos. They learn nothing else
 * about the flat. What they write is not shown to anyone but the people who live there until one of them says
 * yes (see {@link GuestBook}), so the next person to scan the code doesn't read it either.
 *
 * <p>A page can't prove who is writing. That is why everything from here waits, why only so many lines may
 * wait at once, and why the page is counted by address like the other pages that need no sign-in.
 *
 * <p>A photo travels the way every file does: the page asks for a place to send it, sends it there, and says
 * it is done. It is kept as an upload of whoever made the book, so it lives and goes with the book.
 */
@Controller
@Hidden
class GuestBookPages {

    /** How many lines of the book the door's page shows. */
    private static final int SHOWN = 5;

    record SignRequest(UUID clientId, String name, String about, String text, Integer nights, String photoType) {}

    record PhotoRequest(UUID mediaId) {}

    /** A line as the door's page shows it: who, and what they wrote. */
    record Shown(String name, String text) {}

    private final BoardStore boards;
    private final ThingStore things;
    private final MediaService media;
    private final TransactionTemplate transaction;

    GuestBookPages(BoardStore boards, ThingStore things, MediaService media, TransactionTemplate transaction) {
        this.boards = boards;
        this.things = things;
        this.media = media;
        this.transaction = transaction;
    }

    /** These pages need no sign-in, so they are counted by address like the other public pages. */
    @Configuration
    static class Limits implements WebMvcConfigurer {

        private final RateLimit limit;

        Limits(RateLimit limit) {
            this.limit = limit;
        }

        @Override
        public void addInterceptors(InterceptorRegistry registry) {
            registry.addInterceptor(limit).addPathPatterns("/book/**").order(-10);
        }
    }

    /** The door a link ends in, when the link is real and its book is still there. */
    private EntryRow door(String token) {
        return boards.byToken(token)
                .filter(e -> e.is(GuestBook.DOOR))
                .filter(e -> boards.find(e.boardId())
                        .filter(b -> b.template() == Template.GUEST_BOOK)
                        .isPresent())
                .orElse(null);
    }

    private static ApiProblem gone() {
        return new ApiProblem(HttpStatus.NOT_FOUND, "not_found", "This code doesn't work any more.");
    }

    private List<EntryRow> lines(UUID boardId) {
        return boards.entries(boardId, Set.of(), 2000).stream()
                .filter(e -> e.is(GuestBook.LINE))
                .toList();
    }

    @GetMapping("/book/{token}")
    String open(@PathVariable String token, HttpServletResponse response, Model model) {
        response.setHeader("Cache-Control", "no-store");
        // Not "no-referrer": with that a browser posts with Origin: null, and the API refuses a request from nowhere.
        response.setHeader("Referrer-Policy", "same-origin");
        response.setHeader("X-Content-Type-Options", "nosniff");
        EntryRow door = door(token);
        model.addAttribute("state", door == null ? "gone" : "open");
        model.addAttribute("token", token);
        if (door != null) {
            model.addAttribute(
                    "title",
                    boards.thingForNobody(door.boardId())
                            .map(ThingStore.ThingRow::title)
                            .orElse("The guest book"));
            // Only what a flatmate has let in.
            model.addAttribute(
                    "lines",
                    lines(door.boardId()).stream()
                            .filter(EntryRow::done)
                            .sorted(Comparator.comparingDouble(EntryRow::position)
                                    .reversed())
                            .limit(SHOWN)
                            .map(e -> new Shown(
                                    e.as(Line.class).name(), e.as(Line.class).text()))
                            .toList());
        }
        return "book/sign";
    }

    private static String need(String text, int max, String whenMissing) {
        String trimmed = text == null ? "" : text.trim();
        if (trimmed.isEmpty()) {
            throw ApiProblem.badRequest("missing_text", whenMissing);
        }
        if (trimmed.length() > max) {
            throw ApiProblem.badRequest("too_long", "That's too long. Keep it to " + max + " characters or fewer.");
        }
        return trimmed;
    }

    /**
     * A guest leaves a line. It waits for a flatmate's yes. With a photo to come, the answer says where the page
     * sends it. Sending the same line twice (a second tap) leaves one.
     */
    @PostMapping("/book/{token}/sign")
    @ResponseBody
    Map<String, Object> sign(@PathVariable String token, @RequestBody SignRequest request) {
        EntryRow door = door(token);
        if (door == null) {
            throw gone();
        }
        String name = need(request.name(), 50, "Write your name.");
        String text = need(request.text(), 300, "Write a line for the book.");
        String about = request.about() == null || request.about().isBlank() ? null : need(request.about(), 80, "");
        if (request.nights() != null && (request.nights() < 1 || request.nights() > 3650)) {
            throw ApiProblem.badRequest("invalid_nights", "Write how many nights you stayed, as a number.");
        }
        if (boards.sentBefore(door.boardId(), request.clientId()).isEmpty()
                && lines(door.boardId()).stream().filter(e -> !e.done()).count() >= GuestBook.MOST_WAITING) {
            throw new ApiProblem(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "book_full",
                    "A lot is waiting to be read already. Tell your hosts, and try again later.");
        }
        NewUpload upload = null;
        if (request.photoType() != null && !request.photoType().isBlank()) {
            UUID owner = boards.ownerUser(door.boardId()).orElseThrow(GuestBookPages::gone);
            upload = media.startUpload(owner, MediaKind.PHOTO, request.photoType(), null, null);
        }
        Instant now = Instant.now();
        LocalDate today = now.atOffset(ZoneOffset.UTC).toLocalDate();
        UUID lineId = boards.add(
                door.boardId(),
                EntryDraft.of(GuestBook.LINE)
                        .day(today)
                        .position(today.toEpochDay() + (now.toEpochMilli() % 86_400_000L) / 86_400_000.0)
                        .amount(
                                request.nights() == null
                                        ? null
                                        : request.nights().longValue())
                        .doc(new Line(name, about, text, upload == null ? null : upload.mediaId(), true)),
                request.clientId());
        // A second try at the same line (the photo didn't arrive the first time): the line stays as it was
        // written, and waits for the photo of this try.
        EntryRow line = boards.entry(lineId).orElseThrow(GuestBookPages::gone);
        Line written = line.as(Line.class);
        if (upload != null && !upload.mediaId().equals(written.pending())) {
            if (line.done() || line.mediaId() != null) {
                media.remove(List.of(upload.mediaId()));
                upload = null;
            } else {
                if (written.pending() != null) {
                    media.remove(List.of(written.pending()));
                }
                boards.save(
                        line.id(),
                        EntryDraft.from(line)
                                .doc(new Line(
                                        written.name(), written.about(), written.text(), upload.mediaId(), true)));
            }
        }
        things.touch(door.boardId());
        Map<String, Object> answer = new LinkedHashMap<>();
        if (upload != null) {
            answer.put("mediaId", upload.mediaId());
            answer.put("uploadUrl", upload.target().url());
            answer.put("method", upload.target().method());
            answer.put("headers", upload.target().headers());
        }
        return answer;
    }

    /** The page says the photo was sent. It is checked, and kept with the line. Saying so twice is fine. */
    @PostMapping("/book/{token}/photo")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void photo(@PathVariable String token, @RequestBody PhotoRequest request) {
        EntryRow door = door(token);
        if (door == null || request.mediaId() == null) {
            throw gone();
        }
        EntryRow line = lines(door.boardId()).stream()
                .filter(e -> request.mediaId().equals(e.as(Line.class).pending()))
                .findFirst()
                .orElse(null);
        if (line == null) {
            if (lines(door.boardId()).stream().anyMatch(e -> request.mediaId().equals(e.mediaId()))) {
                return;
            }
            throw ApiProblem.badRequest(
                    "unknown_media", "That photo couldn't be found. Your line is there without it.");
        }
        UUID owner = boards.ownerUser(door.boardId()).orElseThrow(GuestBookPages::gone);
        boolean arrived = true;
        try {
            // The file is looked at with no transaction open; keeping it with the line is a short one of its own.
            media.completeUpload(request.mediaId(), owner);
        } catch (ApiProblem notAPhoto) {
            arrived = false;
        }
        boolean keep = arrived;
        transaction.executeWithoutResult(status -> {
            EntryRow now = boards.entry(line.id()).orElse(null);
            if (now != null && request.mediaId().equals(now.as(Line.class).pending())) {
                Line written = now.as(Line.class);
                EntryDraft draft =
                        EntryDraft.from(now).doc(new Line(written.name(), written.about(), written.text(), null, true));
                boards.save(now.id(), keep ? draft.media(request.mediaId()) : draft);
                things.touch(now.boardId());
            }
        });
        if (!keep) {
            media.remove(List.of(request.mediaId()));
            throw ApiProblem.badRequest("wrong_file", "That photo couldn't be used. Your line is there without it.");
        }
    }
}
