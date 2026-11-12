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
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

/** The web page a guest opens with the link of a pass. No account, no app. */
@Controller
@Hidden
class GuestPagesController {

    private static final String COOKIE = "homeport_guest";
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("EEE d MMM, HH:mm 'UTC'", Locale.ENGLISH);

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

    private String show(
            Visit visit, String token, HttpServletRequest request, HttpServletResponse response, Model model) {
        // What a pass shows is for one person on one phone, for a while: nothing along the way may keep a copy.
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
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
