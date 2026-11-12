package app.homeport.api.guest;

import app.homeport.api.guest.GuestPassService.Door;
import app.homeport.api.guest.GuestPassService.Visit;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

/** The web page a guest opens with the link of a pass. No account, no app. */
@Controller
@Hidden
class GuestPagesController {

    private static final String COOKIE = "homeport_guest";
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("EEE d MMM, HH:mm 'UTC'", Locale.ENGLISH);

    /**
     * The page opens sealed cards with a key from the link, so what may run on it matters: only the API's own
     * script and style sheets, no script written into the page, nothing loaded from or sent to anywhere else.
     */
    static final String CONTENT_SECURITY_POLICY = "default-src 'none'; script-src 'self'; style-src 'self';"
            + " img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

    private final GuestPassService passes;

    GuestPagesController(GuestPassService passes) {
        this.passes = passes;
    }

    @GetMapping("/g/{token}")
    String open(
            @PathVariable String token,
            @CookieValue(name = COOKIE, required = false) String device,
            HttpServletResponse response,
            Model model) {
        return show(passes.visit(token, device, null), token, null, response, model);
    }

    @PostMapping("/g/{token}")
    String enter(
            @PathVariable String token,
            @RequestParam(defaultValue = "") String code,
            @CookieValue(name = COOKIE, required = false) String device,
            HttpServletRequest request,
            HttpServletResponse response,
            Model model) {
        return show(passes.visit(token, device, code), token, request, response, model);
    }

    /**
     * The page's script says a sealed card was shown. A show-once card is gone from then on. The phone is known
     * by the same cookie that keeps the pass on one phone.
     */
    @PostMapping("/g/{token}/cards/{id}/shown")
    @ResponseBody
    ResponseEntity<Void> shown(
            @PathVariable String token,
            @PathVariable UUID id,
            @CookieValue(name = COOKIE, required = false) String device,
            HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        return ResponseEntity.status(passes.shown(token, device, id) ? HttpStatus.NO_CONTENT : HttpStatus.NOT_FOUND)
                .build();
    }

    private String show(
            Visit visit, String token, HttpServletRequest request, HttpServletResponse response, Model model) {
        // What a pass shows is for one person on one phone, for a while: nothing along the way may keep a copy.
        response.setHeader("Cache-Control", "no-store");
        // The page's address is never told to another site. To this one it is, on purpose: with "no-referrer" a
        // browser also blanks the Origin of the form and of the script's own request, and a request from
        // "nowhere" is refused wherever the API is told which web addresses may call it (local mode).
        response.setHeader("Referrer-Policy", "same-origin");
        response.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
        response.setHeader("X-Content-Type-Options", "nosniff");
        model.addAttribute("state", visit.door().name().toLowerCase(Locale.ROOT));
        model.addAttribute("token", token);
        model.addAttribute("wrong", visit.wrongCode());
        if (visit.pass() != null) {
            model.addAttribute("guest", visit.pass().guestName());
            model.addAttribute("circle", visit.pass().circleName());
            model.addAttribute(
                    "until", "It stops " + WHEN.format(visit.pass().endsAt().atOffset(ZoneOffset.UTC)) + ".");
        }
        model.addAttribute("cards", visit.cards());
        model.addAttribute("sealed", visit.sealed());
        if (visit.door() == Door.OPEN && request != null && visit.device() != null) {
            Cookie cookie = new Cookie(COOKIE, visit.device());
            cookie.setHttpOnly(true);
            cookie.setSecure(request.isSecure());
            cookie.setPath("/g/" + token);
            cookie.setMaxAge((int) Math.max(
                    60, Duration.between(Instant.now(), visit.pass().endsAt()).toSeconds()));
            cookie.setAttribute("SameSite", "Strict");
            response.addCookie(cookie);
        }
        return "guest/pass";
    }
}
