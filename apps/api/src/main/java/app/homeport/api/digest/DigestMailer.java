package app.homeport.api.digest;

import app.homeport.api.common.Names;
import app.homeport.api.digest.DigestService.SummaryResponse;
import app.homeport.api.notify.EmailOutbox.Letter;
import app.homeport.api.profile.Profile;
import app.homeport.api.profile.ProfileStore;
import java.time.temporal.IsoFields;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.thymeleaf.context.Context;
import org.thymeleaf.spring6.SpringTemplateEngine;

/**
 * Writes the Sunday summary as an email, from the same week the summary page in the app shows. It says what
 * the page says and nothing more; it never holds an amount or a title the person couldn't see in the app.
 */
@Component
class DigestMailer {

    private final ProfileStore profiles;
    private final SpringTemplateEngine templates;

    DigestMailer(ProfileStore profiles, SpringTemplateEngine templates) {
        this.profiles = profiles;
        this.templates = templates;
    }

    Letter write(UUID userId, SummaryResponse week) {
        String name = profiles.find(userId)
                .map(Profile::displayName)
                .map(Names::first)
                .orElse("there");
        String subject = "Your week in " + week.circleName() + ": " + week.range();

        Context model = new Context();
        model.setVariable("name", name);
        model.setVariable("week", week);
        String html = templates.process("email/summary", model);

        StringBuilder text = new StringBuilder(
                "Hi " + name + ",\n\nYour week in " + week.circleName() + ", " + week.range() + ".\n");
        if (week.hero() != null) {
            text.append("\n").append(week.hero().title());
            if (week.hero().line() != null) {
                text.append("\n").append(week.hero().line());
            }
            text.append("\n");
        }
        if (!week.stats().isEmpty()) {
            text.append("\n").append(week.inShort()).append("\n");
        }
        if (!week.nextWeek().isEmpty()) {
            text.append("\nNext week\n");
            week.nextWeek()
                    .forEach(row -> text.append("  ")
                            .append(row.title())
                            .append(" (")
                            .append(row.line())
                            .append(")\n"));
        }
        week.sections().forEach(section -> {
            text.append("\n").append(section.title()).append("\n");
            section.rows()
                    .forEach(row -> text.append("  ")
                            .append(row.title())
                            .append(" (")
                            .append(row.line())
                            .append(")\n"));
        });
        text.append(
                "\nYou get this because you switched on the Sunday summary by email. Switch it off in the app: You, then Notifications and appearance.\n");

        String sendOnce = "summary-%s-%s-%d-W%02d"
                .formatted(
                        userId,
                        week.circleId(),
                        week.to().get(IsoFields.WEEK_BASED_YEAR),
                        week.to().get(IsoFields.WEEK_OF_WEEK_BASED_YEAR));
        return new Letter(subject, html, text.toString(), sendOnce);
    }
}
