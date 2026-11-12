package app.homeport.api.notify;

/**
 * One push to one device: what it says, and where in the app it opens ({@code url} is an app path such as
 * {@code /page/<id>}).
 */
public record PushMessage(String token, String title, String body, String url, String kind) {}
