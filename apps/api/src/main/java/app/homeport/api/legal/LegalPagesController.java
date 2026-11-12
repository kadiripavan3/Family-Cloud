package app.homeport.api.legal;

import io.swagger.v3.oas.annotations.Hidden;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;

/**
 * The pages both app stores ask for, in plain words: terms, privacy, community guidelines, how to reach us,
 * and a way to ask for an account to be deleted without the app (Google Play requires one). The app links to
 * them from Settings.
 *
 * <p>The texts are drafts. They say what the product does today and must be read by a lawyer before launch;
 * each page says so at the top.
 */
@Controller
@Hidden
class LegalPagesController {

    private final String contactEmail;

    LegalPagesController(@Value("${homeport.contact.email:}") String contactEmail) {
        this.contactEmail = contactEmail.trim();
    }

    /** The address people can write to. Empty until one is set ({@code HOMEPORT_CONTACT_EMAIL}); the pages then say it is coming. */
    @ModelAttribute("contactEmail")
    String contactEmail() {
        return contactEmail;
    }

    @GetMapping("/terms")
    String terms() {
        return "legal/terms";
    }

    @GetMapping("/privacy")
    String privacy() {
        return "legal/privacy";
    }

    @GetMapping("/contact")
    String contact() {
        return "legal/contact";
    }

    @GetMapping("/delete-account")
    String deleteAccount() {
        return "legal/delete-account";
    }
}
