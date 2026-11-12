package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;

/**
 * Grandma's stories: one question a week goes out as a link, someone outside the circle answers it by talking
 * on a web page with no account, and the recording is kept with the question.
 */
class StoriesTest extends BoardTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);

    private String page(String path) throws Exception {
        return mvc.perform(get(path)).andReturn().getResponse().getContentAsString();
    }

    private String outside(String path, String json, int expected) throws Exception {
        var answer = mvc.perform(
                        post(path).contentType(MediaType.APPLICATION_JSON).content(json))
                .andReturn()
                .getResponse();
        assertThat(answer.getStatus()).as(path).isEqualTo(expected);
        return answer.getContentAsString();
    }

    @Test
    void aQuestionGoesOutAsALinkSheAnswersByTalkingAndTheRecordingIsKeptWithTheQuestion() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String mia = addMember(nora, circle, "Mia", "child");
        String stories = board(nora, circle, "stories", "circle", "{\"tellerName\":\"Astrid Lind\"}");
        String empty = view(nora, stories);
        assertThat(JsonPath.<String>read(empty, "$.view.initials")).isEqualTo("AL");
        assertThat(JsonPath.<String>read(empty, "$.view.sendsOn")).isEqualTo("sunday");
        assertThat(JsonPath.<Object>read(empty, "$.view.thisWeek")).isNull();

        // The first question goes out the day it is asked. The next one waits its turn: a week on, on a Sunday.
        String first = add(nora, stories, "question", "{\"text\":\"What was your very first job?\"}");
        String second = add(
                nora,
                stories,
                "question",
                "{\"text\":\"Were you ever in trouble at school?\",\"askedByMemberId\":\"%s\"}".formatted(mia));
        String asked = view(nora, stories);
        assertThat(JsonPath.<String>read(asked, "$.view.thisWeek.id")).isEqualTo(first);
        assertThat(JsonPath.<String>read(asked, "$.view.thisWeek.goesOut")).isEqualTo(TODAY.toString());
        assertThat(JsonPath.<String>read(asked, "$.view.thisWeek.askedBy.name")).isEqualTo("Nora");
        assertThat(JsonPath.<List<String>>read(asked, "$.view.waiting[*].id")).containsExactly(second);
        assertThat(JsonPath.<String>read(asked, "$.view.waiting[0].askedBy.name"))
                .isEqualTo("Mia");
        LocalDate sunday = TODAY.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
        assertThat(JsonPath.<String>read(asked, "$.view.waiting[0].goesOut"))
                .isEqualTo((TODAY.plusDays(7).isAfter(sunday) ? TODAY.plusDays(7) : sunday).toString());
        // It is on Today for the people who can send the link.
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/today?day=" + TODAY, nora), "$.items[*].title"))
                .containsExactly("This week's question for Astrid");

        // The link is for the people who may change the board. Someone who may only look gets none.
        String link = JsonPath.read(asked, "$.view.thisWeek.link");
        String path = link.replaceFirst("^https?://[^/]+", "");
        assertThat(path).matches("/s/[a-z0-9-]{23}");
        send(
                HttpMethod.PUT,
                "/v1/things/" + stories + "/audience",
                nora,
                "{\"audience\":\"circle\",\"everyoneEdits\":false}",
                200);
        assertThat(JsonPath.<Object>read(view(alex, stories), "$.view.thisWeek.link"))
                .isNull();
        assertThat(view(alex, stories)).doesNotContain(path);

        // Her page: the question, who asks, nothing else about the circle. No sign-in.
        String ask = page(path);
        assertThat(ask)
                .contains("What was your very first job?")
                .contains("Nora would like to know")
                .contains("Start talking")
                .doesNotContain("The Linds")
                .doesNotContain("trouble at school");
        assertThat(page("/s/abcde-fghjk-mnpqr-stuvw")).contains("This link doesn't work any more");
        outside("/s/abcde-fghjk-mnpqr-stuvw/upload", "{\"contentType\":\"audio/webm\"}", 404);

        // She talks. The page asks where to send the recording, sends it there and says it is done.
        String target = outside(path + "/upload", "{\"contentType\":\"audio/webm;codecs=opus\",\"seconds\":192}", 200);
        send(target, "audio/webm", new byte[] {1, 2, 3, 4, 5, 6, 7, 8, 9});
        outside(path + "/done", "{\"mediaId\":\"%s\"}".formatted(id()), 400);
        outside(path + "/done", "{\"mediaId\":\"%s\"}".formatted(JsonPath.<String>read(target, "$.mediaId")), 204);
        outside(path + "/done", "{\"mediaId\":\"%s\"}".formatted(JsonPath.<String>read(target, "$.mediaId")), 204);
        assertThat(page(path)).contains("Thank you").doesNotContain("Start talking");
        outside(path + "/upload", "{\"contentType\":\"audio/webm\"}", 404);

        // The recording is with the question, kept as an upload of whoever made the board. Not typed out: no speech
        // service.
        String told = view(alex, stories);
        assertThat(JsonPath.<Integer>read(told, "$.view.told")).isEqualTo(1);
        assertThat(JsonPath.<Boolean>read(told, "$.view.thisWeek.answered")).isTrue();
        assertThat(JsonPath.<Integer>read(told, "$.view.thisWeek.recording.seconds"))
                .isEqualTo(192);
        assertThat(JsonPath.<String>read(told, "$.view.thisWeek.recording.url")).contains("/media/audio/");
        assertThat(JsonPath.<String>read(told, "$.view.thisWeek.transcript")).isEmpty();
        assertThat(JsonPath.<Object>read(view(nora, stories), "$.view.thisWeek.link"))
                .isNull();
        assertThat(jdbc.sql("""
                    select count(*) from media m join things t on t.id = cast(:board as uuid)
                    join members o on o.id = t.owner_id where m.owner_id = o.user_id and m.kind = 'audio' and m.status = 'ready'
                    """).param("board", stories).query(Integer.class).single())
                .isEqualTo(1);
        String today = fetch("/v1/circles/" + circle + "/today", alex);
        assertThat(JsonPath.<List<String>>read(today, "$.fresh[*].note")).contains("Astrid answered, by talking");
        assertThat(JsonPath.<List<String>>read(today, "$.fresh[*].pill")).contains("3:12");
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + stories, alex), "$.glance"))
                .isEqualTo("1 told · one question a week");

        // The family can type her words in and add photos; an answered question stays as it was asked.
        change(nora, first, "{\"transcript\":\"I picked apples for a farmer called Jure.\"}", 200);
        add(nora, stories, "photo", "{\"questionId\":\"%s\",\"mediaId\":\"%s\"}".formatted(first, uploadPhoto(nora)));
        String kept = view(nora, stories);
        assertThat(JsonPath.<String>read(kept, "$.view.thisWeek.transcript")).contains("picked apples");
        assertThat(JsonPath.<Integer>read(kept, "$.view.thisWeek.photos.length()"))
                .isEqualTo(1);
        assertThat(fetch("/v1/circles/" + circle + "/search?q=farmer called", alex))
                .contains(stories);
        assertThat(change(nora, first, "{\"text\":\"What was your second job?\"}", 409))
                .contains("The question stays as it was asked");

        // Mia's question is sent early: it is this week's now, and the first one is "already told".
        String sent = act(nora, stories, "send_now", "{\"entryId\":\"%s\"}".formatted(second), 200);
        assertThat(JsonPath.<String>read(sent, "$.view.thisWeek.id")).isEqualTo(second);
        assertThat(JsonPath.<List<String>>read(sent, "$.view.toldBefore[*].id")).containsExactly(first);
        assertThat(JsonPath.<List<Object>>read(sent, "$.view.waiting")).isEmpty();
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/boards/" + stories + "/entries?kind=question&filter=told", nora), "$.items[*].id"))
                .containsExactly(first);

        // Whose stories, and a real weekday.
        assertThat(newBoard(nora, circle, "stories", null, "{}", 400)).contains("Say whose stories these are");
        newBoard(nora, circle, "stories", null, "{\"tellerName\":\"Astrid\",\"sendsOn\":\"someday\"}", 400);
    }
}
