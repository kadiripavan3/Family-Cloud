package app.homeport.api.notify;

/**
 * Sends an email. In local mode it is written to the log; with {@code journey.email.mode=resend} it goes out
 * through Resend.
 */
public interface EmailSender {

    /**
     * One email to one person, with the same words as a web page ({@code html}) and as plain text.
     *
     * @param sendOnceKey the same key on a second try means the service sends it only once
     */
    record Email(String to, String subject, String html, String text, String sendOnceKey) {}

    /** The service looked at the email and won't send it (a wrong address, a sender it doesn't know). Trying again won't help. */
    class Refused extends RuntimeException {
        private static final long serialVersionUID = 1L;

        public Refused(String why, Throwable cause) {
            super(why, cause);
        }
    }

    /**
     * Sends the email.
     *
     * @throws Refused when the service won't send this email, however often it is asked
     * @throws RuntimeException when it couldn't be handed over right now (the service is busy or can't be
     *     reached): try again later
     */
    void send(Email email);
}
