package app.homeport.api;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.springframework.http.HttpMethod;

/**
 * What the tests of Plan and Jot share: The Linds (Nora and Alex with their own sign-ins, Mia and Leo
 * without), a fixed "today" (Wednesday 11 November 2026, as on the screens), and short ways to make an event,
 * a reminder and a goal.
 */
public abstract class PlanTestBase extends ApiTest {

    protected static final String ZONE = "Europe/Ljubljana";
    /** A Wednesday. */
    protected static final String TODAY = "2026-11-11";

    protected String nora;
    protected String alex;
    protected String circle;
    protected String noraId;
    protected String alexId;
    protected String miaId;
    protected String leoId;

    /** Nora starts a family, Alex joins, and Mia and Leo are added as children without a phone. */
    protected void theLinds() throws Exception {
        nora = person("Nora");
        alex = person("Alex");
        circle = circle(nora, "family", "The Linds");
        noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        alexId = join(nora, circle, alex);
        miaId = addMember(nora, circle, "Mia", "child");
        leoId = addMember(nora, circle, "Leo", "child");
    }

    /** Makes an event on a day. {@code more} is extra JSON fields, starting with a comma, or empty. */
    protected String event(String token, String title, String day, String time, String more) throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/events",
                        token,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\",\"day\":\"%s\"%s,\"timeZone\":\"%s\"%s}"
                                .formatted(
                                        id(),
                                        circle,
                                        title,
                                        day,
                                        time == null ? "" : ",\"time\":\"" + time + "\"",
                                        ZONE,
                                        more),
                        201),
                "$.id");
    }

    /** Makes a reminder. {@code more} is extra JSON fields, starting with a comma, or empty. */
    protected String reminder(String token, String title, String more) throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/reminders",
                        token,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\",\"timeZone\":\"%s\"%s}"
                                .formatted(id(), circle, title, ZONE, more),
                        201),
                "$.id");
    }

    /** Makes a goal. {@code more} is extra JSON fields, starting with a comma, or empty. */
    protected String goal(String token, String title, String more) throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/goals",
                        token,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\",\"day\":\"%s\"%s}"
                                .formatted(id(), circle, title, TODAY, more),
                        201),
                "$.id");
    }

    protected void share(String token, String thing, String body) throws Exception {
        send(HttpMethod.PUT, "/v1/things/" + thing + "/audience", token, body, 200);
    }

    protected int status(String path, String token) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(path)
                        .header("Authorization", token))
                .andReturn()
                .getResponse()
                .getStatus();
    }

    /** The lines of one day of the day's list, each as "lead|title|note". */
    protected List<String> day(String token, String day) throws Exception {
        String plan = fetch("/v1/circles/" + circle + "/plan?day=" + day + "&days=1", token);
        List<String> leads = JsonPath.read(plan, "$.days[0].entries[*].lead");
        List<String> titles = JsonPath.read(plan, "$.days[0].entries[*].title");
        List<String> notes = JsonPath.read(plan, "$.days[0].entries[*].note");
        List<String> lines = new java.util.ArrayList<>();
        for (int i = 0; i < titles.size(); i++) {
            lines.add(leads.get(i) + "|" + titles.get(i) + "|" + notes.get(i));
        }
        return lines;
    }
}
