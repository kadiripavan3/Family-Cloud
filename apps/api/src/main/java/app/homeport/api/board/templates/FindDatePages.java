package app.homeport.api.board.templates;

import app.homeport.api.board.BoardStore;
import app.homeport.api.board.BoardStore.BoardRow;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Json;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.Today;
import app.homeport.api.board.Words;
import app.homeport.api.board.templates.FindDate.FindDateSettings;
import app.homeport.api.board.templates.FindDate.Outsider;
import app.homeport.api.common.Names;
import app.homeport.api.common.RateLimit;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Controller;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * The web page someone without the app opens with the link of a "When can everyone?" board. They write their
 * name, tick the days they can do, and that is all: no account, no app.
 *
 * <p>The link's end can't be guessed, and it is all they have. The page shows them the board's title, who is
 * asking, and the days. It shows nothing of what anyone else answered and nothing else about the circle. Their
 * answer counts like everyone's when the best day is worked out.
 *
 * <p>To let them change their mind, the page leaves a small key in their browser (a cookie for this one
 * link). With it the same browser gets its own ticks back and changes them; without it, an answer is a new
 * one. A page can't prove who is answering: the people of the circle see every name that came by link and can
 * take one out. Only so many answers by link are kept, and the page is counted by address.
 *
 * <p>It is a plain form: it works without scripts.
 */
@Controller
@Hidden
class FindDatePages {

    private static final String COOKIE = "homeport_when";

    /** One day as the page offers it. */
    record Offered(String value, String words, boolean ticked) {}

    private final BoardStore boards;
    private final ThingStore things;
    private final TransactionTemplate transaction;

    FindDatePages(BoardStore boards, ThingStore things, TransactionTemplate transaction) {
        this.boards = boards;
        this.things = things;
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
            registry.addInterceptor(limit).addPathPatterns("/when/**").order(-10);
        }
    }

    /** The board behind a link, when the link is real. */
    private BoardRow board(String token) {
        return boards.byToken(token)
                .filter(e -> e.is(FindDate.DOOR))
                .flatMap(e -> boards.find(e.boardId()))
                .filter(b -> b.template() == Template.FIND_DATE)
                .orElse(null);
    }

    private List<EntryRow> entries(UUID boardId) {
        return boards.entries(boardId, Set.of(), 2000);
    }

    /** The answer this browser left before, by the key in its cookie. */
    private EntryRow mine(UUID boardId, String key) {
        if (key == null || key.isBlank()) {
            return null;
        }
        return boards.byToken(key)
                .filter(e -> e.is(FindDate.OUTSIDER) && e.boardId().equals(boardId))
                .orElse(null);
    }

    @GetMapping("/when/{token}")
    String open(
            @PathVariable String token,
            @CookieValue(name = COOKIE, required = false) String key,
            @RequestParam(required = false) String saved,
            HttpServletResponse response,
            Model model) {
        return show(token, key, saved != null, null, response, model);
    }

    private String show(
            String token, String key, boolean saved, String problem, HttpServletResponse response, Model model) {
        response.setHeader("Cache-Control", "no-store");
        // Not "no-referrer": with that a browser posts the form with Origin: null, and the API refuses it.
        response.setHeader("Referrer-Policy", "same-origin");
        response.setHeader("X-Content-Type-Options", "nosniff");
        BoardRow board = board(token);
        ThingRow thing =
                board == null ? null : boards.thingForNobody(board.thingId()).orElse(null);
        model.addAttribute("token", token);
        model.addAttribute("problem", problem);
        if (thing == null) {
            model.addAttribute("state", "gone");
            return "when/answer";
        }
        FindDateSettings settings = Json.as(board.settings(), FindDateSettings.class);
        LocalDate today = Today.of(null);
        model.addAttribute("title", thing.title());
        model.addAttribute(
                "asker",
                boards.people(thing.circleId()).stream()
                        .filter(p -> p.id().equals(thing.ownerId()))
                        .map(p -> Names.first(p.name()))
                        .findFirst()
                        .orElse("Your friends"));
        if (settings.setFor() != null && settings.eventId() != null && boards.thingExists(settings.eventId())) {
            model.addAttribute("state", "set");
            model.addAttribute("setFor", Words.weekday(settings.setFor()) + " " + Words.day(settings.setFor()));
            return "when/answer";
        }
        if (settings.to().isBefore(today)) {
            model.addAttribute("state", "over");
            return "when/answer";
        }
        EntryRow mine = mine(board.thingId(), key);
        Set<LocalDate> ticked = new HashSet<>();
        if (mine != null) {
            entries(board.thingId()).stream()
                    .filter(e -> e.is(FindDate.FREE) && mine.id().equals(e.parentId()))
                    .forEach(e -> ticked.add(e.day()));
        }
        List<Offered> days = new ArrayList<>();
        for (LocalDate day = settings.from().isBefore(today) ? today : settings.from();
                !day.isAfter(settings.to());
                day = day.plusDays(1)) {
            days.add(new Offered(day.toString(), Words.weekday(day) + " " + Words.shortDay(day), ticked.contains(day)));
        }
        model.addAttribute("state", saved && mine != null ? "thanks" : "ask");
        model.addAttribute("name", mine == null ? "" : mine.as(Outsider.class).name());
        model.addAttribute("days", days);
        return "when/answer";
    }

    /**
     * Their name and their days. The first time it is a new answer and the browser is given its key; with the
     * key, the answer left before is changed. Then the page is shown again with "thank you".
     */
    @PostMapping("/when/{token}")
    String answer(
            @PathVariable String token,
            @CookieValue(name = COOKIE, required = false) String key,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) List<String> days,
            HttpServletRequest request,
            HttpServletResponse response,
            Model model) {
        BoardRow board = board(token);
        if (board == null) {
            return show(token, key, false, null, response, model);
        }
        FindDateSettings settings = Json.as(board.settings(), FindDateSettings.class);
        LocalDate today = Today.of(null);
        String who = name == null ? "" : name.trim();
        if (who.isEmpty() || who.length() > 50) {
            return show(
                    token,
                    key,
                    false,
                    who.isEmpty()
                            ? "Write your name, so they know whose days these are."
                            : "Keep your name to 50 letters or fewer.",
                    response,
                    model);
        }
        Set<LocalDate> free = new HashSet<>();
        for (String sent : days == null ? List.<String>of() : days) {
            try {
                LocalDate day = LocalDate.parse(sent);
                if (!day.isBefore(settings.from())
                        && !day.isAfter(settings.to())
                        && !day.isBefore(today.minusDays(1))) {
                    free.add(day);
                }
            } catch (RuntimeException notADay) {
                // A day the page never offered is left out.
            }
        }
        EntryRow mine = mine(board.thingId(), key);
        if (mine == null
                && entries(board.thingId()).stream()
                                .filter(e -> e.is(FindDate.OUTSIDER))
                                .count()
                        >= FindDate.MOST_OUTSIDERS) {
            return show(
                    token,
                    key,
                    false,
                    "A lot of people have answered by this link already. Ask whoever sent it to you.",
                    response,
                    model);
        }
        String myKey = mine == null ? Scene.newToken() : mine.token();
        // The name and the days change together, or not at all.
        transaction.executeWithoutResult(status -> {
            UUID myId;
            if (mine == null) {
                myId = boards.add(
                        board.thingId(),
                        EntryDraft.of(FindDate.OUTSIDER).token(myKey).doc(new Outsider(who)),
                        null);
            } else {
                myId = mine.id();
                boards.save(mine.id(), EntryDraft.from(mine).doc(new Outsider(who)));
                entries(board.thingId()).stream()
                        .filter(e -> e.is(FindDate.FREE) && myId.equals(e.parentId()))
                        .forEach(e -> boards.delete(e.id()));
            }
            for (LocalDate day : free) {
                boards.add(
                        board.thingId(),
                        EntryDraft.of(FindDate.FREE).under(myId).day(day),
                        null);
            }
            things.touch(board.thingId());
        });
        Cookie cookie = new Cookie(COOKIE, myKey);
        cookie.setHttpOnly(true);
        cookie.setSecure(request.isSecure());
        cookie.setPath("/when/" + token);
        cookie.setMaxAge(90 * 24 * 3600);
        cookie.setAttribute("SameSite", "Strict");
        response.addCookie(cookie);
        return "redirect:/when/" + token + "?saved=1";
    }
}
