package app.homeport.api.board.templates;

import app.homeport.api.board.BoardStore;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Json;
import app.homeport.api.board.templates.Stories.Question;
import app.homeport.api.board.templates.Stories.StoriesSettings;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.RateLimit;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaService.NewUpload;
import app.homeport.api.thing.ThingStore;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Instant;
import java.util.List;
import java.util.Map;
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
 * The web page someone outside the circle opens with the link of one question: Grandma taps it and talks. No
 * account, no app. The link's end can't be guessed, and it is all they have: with it they can read that one
 * question and answer it once. They learn nothing else about the circle.
 *
 * <p>The recording travels the way every file does: the page asks for a place to send it, sends it there,
 * and says it is done. Only then is it kept with the question. It is stored as an upload of the person who
 * made the board, so it lives and goes with their account like the board does.
 *
 * <p>Recording in the page needs a browser that lets a page use the microphone; where it doesn't, the page
 * offers to pick a recording made with the phone's own recorder.
 */
@Controller
@Hidden
class StoryPages {

    /** The page's three states. */
    enum Door {
        GONE,
        ASK,
        THANKS
    }

    record UploadRequest(String contentType, Integer seconds) {}

    record DoneRequest(UUID mediaId) {}

    private final BoardStore boards;
    private final ThingStore things;
    private final MediaService media;
    private final TransactionTemplate transaction;

    StoryPages(BoardStore boards, ThingStore things, MediaService media, TransactionTemplate transaction) {
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
            registry.addInterceptor(limit).addPathPatterns("/s/**").order(-10);
        }
    }

    /** The question behind a link, when the link is real and its board is still there. */
    private EntryRow question(String token) {
        return boards.byToken(token).filter(e -> e.is(Stories.QUESTION)).orElse(null);
    }

    private static ApiProblem gone() {
        return new ApiProblem(HttpStatus.NOT_FOUND, "not_found", "This link doesn't work any more.");
    }

    @GetMapping("/s/{token}")
    String open(@PathVariable String token, HttpServletResponse response, Model model) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
        EntryRow question = question(token);
        Door door = question == null ? Door.GONE : question.done() ? Door.THANKS : Door.ASK;
        model.addAttribute("state", door.name().toLowerCase(java.util.Locale.ROOT));
        model.addAttribute("token", token);
        if (question != null) {
            StoriesSettings settings = boards.find(question.boardId())
                    .map(b -> Json.as(b.settings(), StoriesSettings.class))
                    .orElse(new StoriesSettings("", "sunday"));
            model.addAttribute("teller", settings.tellerName().trim().split("\\s+")[0]);
            model.addAttribute("question", question.as(Question.class).text());
            model.addAttribute(
                    "asker",
                    boards
                            .people(boards.thingForNobody(question.boardId())
                                    .orElseThrow()
                                    .circleId())
                            .stream()
                            .filter(p -> p.id().equals(question.forId()))
                            .map(p -> app.homeport.api.common.Names.first(p.name()))
                            .findFirst()
                            .orElse("Your family"));
        }
        return "story/answer";
    }

    /** Where the page sends the recording. The same answer the app gets when it starts an upload. */
    @PostMapping("/s/{token}/upload")
    @ResponseBody
    Map<String, Object> upload(@PathVariable String token, @RequestBody UploadRequest request) {
        EntryRow question = question(token);
        if (question == null || question.done()) {
            throw gone();
        }
        UUID owner = boards.ownerUser(question.boardId()).orElseThrow(StoryPages::gone);
        Integer seconds = request.seconds() == null ? null : Math.clamp(request.seconds(), 0, 4 * 3600);
        Question asked = question.as(Question.class);
        if (asked.pending() != null) {
            // A second try: the first try's unfinished upload goes, so a link can never pile uploads up.
            media.remove(List.of(asked.pending()));
        }
        NewUpload upload = media.startUpload(owner, MediaKind.AUDIO, request.contentType(), null, seconds);
        boards.save(
                question.id(),
                EntryDraft.from(question).doc(new Question(asked.text(), asked.transcript(), upload.mediaId())));
        return Map.of(
                "mediaId", upload.mediaId(),
                "uploadUrl", upload.target().url(),
                "method", upload.target().method(),
                "headers", upload.target().headers());
    }

    /** The page says the recording was sent. It is checked, and kept with the question. Saying so twice is fine. */
    @PostMapping("/s/{token}/done")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void done(@PathVariable String token, @RequestBody DoneRequest request) {
        EntryRow question = question(token);
        if (question == null) {
            throw gone();
        }
        if (question.done()) {
            return;
        }
        UUID pending = question.as(Question.class).pending();
        if (pending == null || !pending.equals(request.mediaId())) {
            throw ApiProblem.badRequest("unknown_media", "That recording couldn't be found. Record it again.");
        }
        UUID owner = boards.ownerUser(question.boardId()).orElseThrow(StoryPages::gone);
        // The file is looked at with no transaction open; keeping it with the question is a short one of its own.
        media.completeUpload(pending, owner);
        transaction.executeWithoutResult(status -> {
            EntryRow now = boards.entry(question.id()).orElse(null);
            if (now != null && !now.done()) {
                Question asked = now.as(Question.class);
                boards.save(
                        now.id(),
                        EntryDraft.from(now)
                                .media(pending)
                                .done(Instant.now(), null)
                                .doc(new Question(asked.text(), asked.transcript(), null)));
                things.touch(now.boardId());
            }
        });
    }
}
