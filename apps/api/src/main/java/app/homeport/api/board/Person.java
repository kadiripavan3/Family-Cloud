package app.homeport.api.board;

import app.homeport.api.circle.MemberKind;
import app.homeport.api.circle.MemberStatus;
import app.homeport.api.circle.Role;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Someone of the board's circle, as far as a template needs to know them. People who left are kept, so what
 * they wrote still says who wrote it.
 *
 * @param since when they came into the circle
 * @param leftAt when they left it; null while they are in it, and for someone who left before that was kept
 */
public record Person(
        UUID id,
        UUID userId,
        String name,
        MemberKind kind,
        Role role,
        MemberStatus status,
        String avatarKey,
        LocalDate birthday,
        Instant since,
        Instant leftAt) {

    /** True for a child or a pet an adult looks after: they are in the circle without a sign-in of their own. */
    public boolean hasNoSignIn() {
        return userId == null;
    }

    public boolean left() {
        return status == MemberStatus.LEFT;
    }

    public boolean grownUp() {
        return role == Role.OWNER || role == Role.ADULT;
    }
}
