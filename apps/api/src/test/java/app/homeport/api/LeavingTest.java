package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Leaving a circle does what the "Export and leaving" screen promises, each promise tried here: what you kept
 * private leaves with you, what you shared stays for the others, passwords you shared stop working for them.
 * And deleting the account keeps to the choice: only Homeport, or Journey too.
 */
class LeavingTest extends TiesTestBase {

    private String diary;
    private String rules;
    private String groceries;
    private String wifi;
    private String ownPin;

    /** Alex has two private things, two shared ones, a password he shares with Nora and one he keeps. */
    private void alexHasThings() throws Exception {
        theLinds();
        vault(nora);
        vault(alex);
        diary = page(alex, circle, "Alex's diary", "me");
        photos(alex, "me", 1);
        rules = page(alex, circle, "House rules", "circle");
        groceries = checklist(alex, "Groceries", "circle", "Milk");
        wifi = vaultItem(alex, "Home Wi-Fi");
        vaultShare(alex, wifi, noraId, "");
        ownPin = vaultItem(alex, "His PIN");
        send(HttpMethod.POST, "/v1/vault/items/" + wifi + "/open", nora, null, 200);
        quiet();
    }

    private int count(String sql) {
        return jdbc.sql(sql).query(Integer.class).single();
    }

    @Test
    void theScreenSaysInNumbersWhatWillHappenBeforeAnythingDoes() throws Exception {
        alexHasThings();

        String his = fetch("/v1/circles/" + circle + "/leaving", alex);

        // The diary, the photo and his own PIN are only his; the page and the list are shared; one password is.
        assertThat(JsonPath.<Integer>read(his, "$.onlyYours")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(his, "$.shared")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(his, "$.passwords")).isEqualTo(1);
        assertThat(JsonPath.<String>read(his, "$.circleName")).isEqualTo("The Linds");
        assertThat(JsonPath.<Boolean>read(his, "$.lastOne")).isFalse();
        assertThat(JsonPath.<Object>read(his, "$.nextOwner")).isNull();
        // The owner is told who takes over; someone alone in a circle that it goes with them.
        assertThat(JsonPath.<String>read(fetch("/v1/circles/" + circle + "/leaving", nora), "$.nextOwner"))
                .isEqualTo("Alex");
        String alone = circle(nora, "solo", "Just me");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/circles/" + alone + "/leaving", nora), "$.lastOne"))
                .isTrue();
        // Asking changed nothing.
        send(HttpMethod.GET, "/v1/pages/" + diary, alex, null, 200);
    }

    @Test
    void whatYouKeptPrivateLeavesWithYouWhatYouSharedStaysAndPasswordsYouSharedStopWorking() throws Exception {
        alexHasThings();

        send(HttpMethod.DELETE, "/v1/members/" + alexId, alex, null, 204);

        // What he kept private is gone, with its files.
        assertThat(count("select count(*) from things where title in ('Alex''s diary', 'His PIN')"))
                .isZero();
        assertThat(count("select count(*) from things where kind = 'photo'")).isZero();
        assertThat(count("select count(*) from removed_files")).isPositive();
        // What he shared stays for Nora, in his name, and she can go on using it.
        assertThat(JsonPath.<String>read(fetch("/v1/pages/" + rules, nora), "$.title"))
                .isEqualTo("House rules");
        addLine(nora, groceries, "Eggs");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/checklists/" + groceries, nora), "$.mine"))
                .isFalse();
        assertThat(count("select count(*) from things t join members m on m.id = t.owner_id where m.name = 'Alex'"
                        + " and m.status = 'left' and t.audience = 'circle'"))
                .isEqualTo(2);
        // The password he shared no longer opens for her, nor is it there for her: it is his alone again.
        send(HttpMethod.POST, "/v1/vault/items/" + wifi + "/open", nora, null, 404);
        send(HttpMethod.GET, "/v1/vault/items/" + wifi, nora, null, 404);
        assertThat(count(
                        "select count(*) from vault_grants g join things t on t.id = g.thing_id where t.title = 'Home Wi-Fi'"
                                + " and g.member_id <> t.owner_id"))
                .isZero();
        assertThat(jdbc.sql("select audience from things where title = 'Home Wi-Fi'")
                        .query(String.class)
                        .single())
                .isEqualTo("me");
        // He is out: nothing of the circle is his to read any more, and the others read that he left.
        send(HttpMethod.GET, "/v1/circles/" + circle, alex, null, 404);
        send(HttpMethod.GET, "/v1/pages/" + rules, alex, null, 404);
        assertThat(lines(nora)).contains("Alex left the circle");
        assertThat(ownPin).isNotNull();
    }

    @Test
    void someoneTakenOutByOthersKeepsWhatWasOnlyTheirsForWhenTheyComeBackButTheirPasswordsStopAtOnce()
            throws Exception {
        alexHasThings();

        send(HttpMethod.DELETE, "/v1/members/" + alexId, nora, null, 204);

        assertThat(count("select count(*) from things where title = 'Alex''s diary'"))
                .isEqualTo(1);
        send(HttpMethod.POST, "/v1/vault/items/" + wifi + "/open", nora, null, 404);
        assertThat(lines(nora)).containsExactly("Alex was taken out of the circle");
        // He comes back through the link and finds his diary where it was.
        join(nora, circle, alex);
        assertThat(JsonPath.<String>read(fetch("/v1/pages/" + diary, alex), "$.title"))
                .isEqualTo("Alex's diary");
        send(HttpMethod.GET, "/v1/vault/items/" + wifi, alex, null, 200);
        assertThat(sentences(nora)).contains("Alex joined the circle");
    }

    @Test
    void deletingTheAccountKeepsToTheChoiceOnlyHomeportOrJourneyToo() throws Exception {
        alexHasThings();
        String kai = person("Kai");
        join(nora, circle, kai);

        // Only Homeport: everything of his here goes, and the sign-in he shares with Journey is never touched.
        String only = send(HttpMethod.DELETE, "/v1/me", alex, null, 200);
        assertThat(JsonPath.<String>read(only, "$.signIn")).isEqualTo("kept");
        assertThat(JsonPath.<String>read(only, "$.message")).contains("Journey goes on as it was");
        assertThat(count("select count(*) from local_users where email = 'alex@example.com'"))
                .isEqualTo(1);
        assertThat(count("select count(*) from profiles where display_name = 'Alex'"))
                .isZero();
        send(HttpMethod.GET, "/v1/me", alex, null, 401);
        // The phone that was signed in stays shut out. Signing in again is Alex coming back: the sign-in was
        // kept for Journey, so he starts a new, empty account here instead of being locked out for good.
        Thread.sleep(1100);
        String back = person("Alex");
        assertThat(JsonPath.<String>read(fetch("/v1/me", back), "$.profile.displayName"))
                .isEqualTo("Alex");
        assertThat(fetch("/v1/circles", back)).isEqualTo("[]");

        // Journey too: where this API may remove the sign-in (it may, here), it is gone as well.
        String both = send(HttpMethod.DELETE, "/v1/me?journeyToo=true", kai, null, 200);
        assertThat(JsonPath.<String>read(both, "$.signIn")).isEqualTo("removed");
        assertThat(count("select count(*) from local_users where email = 'kai@example.com'"))
                .isZero();
        assertThat(JsonPath.<List<String>>read(fetch("/v1/circles/" + circle, nora), "$.members[*].name"))
                .doesNotContain("Alex", "Kai");
    }
}
