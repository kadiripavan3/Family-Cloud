package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Who can see what: the promise the whole app stands on. Each test is one sentence of the rule, tried through
 * every way a thing can be reached: by its id, in its list, in search, on Home, and through its audience.
 */
class SharingRulesTest extends ApiTest {

    /** True when this person can reach the page by any of the ways there are. They must all agree. */
    private boolean sees(String token, String circle, String page, String title) throws Exception {
        boolean byId = status("/v1/pages/" + page, token) == 200;
        boolean asThing = status("/v1/things/" + page, token) == 200;
        boolean audience = status("/v1/things/" + page + "/audience", token) == 200;
        boolean inList = fetch("/v1/circles/" + circle + "/pages", token).contains(page);
        boolean inSearch = fetch("/v1/circles/" + circle + "/search?q=" + title.split(" ")[0], token)
                .contains(page);
        boolean inWords =
                fetch("/v1/circles/" + circle + "/search?q=Words about", token).contains(page);
        List<Boolean> all = List.of(byId, asThing, audience, inList, inSearch, inWords);
        assertThat(all)
                .as("every way to reach \"" + title + "\" gives the same answer")
                .containsOnly(byId);
        return byId;
    }

    private int status(String path, String token) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(path)
                        .header("Authorization", token))
                .andReturn()
                .getResponse()
                .getStatus();
    }

    private void share(String token, String page, String body, int expected) throws Exception {
        send(HttpMethod.PUT, "/v1/things/" + page + "/audience", token, body, expected);
    }

    @Test
    void inAFamilyAThingIsYoursAloneUntilYouShareIt() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);

        String page = page(nora, circle, "Gift list", null);

        assertThat(JsonPath.<String>read(fetch("/v1/pages/" + page, nora), "$.chip.audience"))
                .isEqualTo("me");
        assertThat(sees(nora, circle, page, "Gift list")).isTrue();
        assertThat(sees(alex, circle, page, "Gift list")).isFalse();
        assertThat(fetch("/v1/circles/" + circle + "/today", alex)).doesNotContain(page);
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle, alex), "$.shared.length()"))
                .isZero();
    }

    @Test
    void amongEqualsAThingStartsSharedWithEveryone() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        for (String kind : List.of("couple", "flat", "crew")) {
            String circle = circle(nora, kind, "Us " + kind);
            join(nora, circle, alex);
            String page = page(nora, circle, "Plans", null);
            assertThat(JsonPath.<String>read(fetch("/v1/pages/" + page, nora), "$.chip.audience"))
                    .isEqualTo("circle");
            assertThat(sees(alex, circle, page, "Plans")).as(kind).isTrue();
        }
    }

    @Test
    void someoneWhoIsNotInTheCircleSeesNothingOfIt() throws Exception {
        String nora = person("Nora");
        String stranger = person("Stranger");
        String circle = circle(nora, "crew", "Lisbon crew");
        String page = page(nora, circle, "Plans", "circle");

        assertThat(status("/v1/circles/" + circle, stranger)).isEqualTo(404);
        assertThat(status("/v1/circles/" + circle + "/pages", stranger)).isEqualTo(404);
        assertThat(status("/v1/circles/" + circle + "/search?q=Plans", stranger))
                .isEqualTo(404);
        assertThat(status("/v1/circles/" + circle + "/today", stranger)).isEqualTo(404);
        assertThat(status("/v1/pages/" + page, stranger)).isEqualTo(404);
        assertThat(status("/v1/things/" + page + "/audience", stranger)).isEqualTo(404);
        assertThat(fetch("/v1/circles", stranger)).isEqualTo("[]");
        // And can't put a page into it.
        send(
                HttpMethod.POST,
                "/v1/pages",
                stranger,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Hello\"}".formatted(id(), circle),
                404);
    }

    @Test
    void sharedWithSomePeopleEachCanViewOrEdit() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String kaiId = join(nora, circle, kai);
        String page = page(nora, circle, "House manual", "me");

        share(
                nora,
                page,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(alexId),
                200);

        assertThat(sees(alex, circle, page, "House manual")).isTrue();
        assertThat(sees(kai, circle, page, "House manual")).isFalse();
        send(HttpMethod.PATCH, "/v1/pages/" + page, alex, "{\"title\":\"Mine now\"}", 403);

        share(
                nora,
                page,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"edit\"},{\"memberId\":\"%s\",\"access\":\"none\"}]}"
                        .formatted(alexId, kaiId),
                200);
        send(HttpMethod.PATCH, "/v1/pages/" + page, alex, "{\"title\":\"House manual, tidied\"}", 200);
        assertThat(sees(kai, circle, page, "House manual")).isFalse();

        // The chip says who, to both of them.
        assertThat(JsonPath.<List<String>>read(fetch("/v1/pages/" + page, alex), "$.chip.people[*].name"))
                .containsExactly("Alex");
    }

    @Test
    void sharedWithEveryoneIncludesWhoeverJoinsLaterAndCanBeLookOnly() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String page = page(nora, circle, "Emergency numbers", "circle");

        join(nora, circle, alex);
        assertThat(sees(alex, circle, page, "Emergency numbers")).isTrue();
        send(
                HttpMethod.PATCH,
                "/v1/pages/" + page,
                alex,
                "{\"body\":\"Words about Emergency numbers. Alex was here.\"}",
                200);

        share(nora, page, "{\"audience\":\"circle\",\"everyoneEdits\":false}", 200);
        send(HttpMethod.PATCH, "/v1/pages/" + page, alex, "{\"body\":\"Again\"}", 403);
        assertThat(sees(alex, circle, page, "Emergency numbers")).isTrue();
    }

    @Test
    void hiddenFromOnePersonUntilADayThenItOpensByItself() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String mia = person("Mia");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String miaId = join(nora, circle, mia);
        String page = page(nora, circle, "Birthday plan", "circle");

        share(
                nora,
                page,
                "{\"audience\":\"circle\",\"hiddenFrom\":[{\"memberId\":\"%s\",\"through\":\"%s\"}]}"
                        .formatted(miaId, LocalDate.now().plusDays(3)),
                200);

        assertThat(sees(alex, circle, page, "Birthday plan")).isTrue();
        assertThat(sees(mia, circle, page, "Birthday plan")).isFalse();
        assertThat(fetch("/v1/circles/" + circle + "/today", mia)).doesNotContain(page);
        assertThat(JsonPath.<List<String>>read(fetch("/v1/pages/" + page, alex), "$.chip.hiddenFrom"))
                .containsExactly("Mia");

        // The day after the last hidden day, it is simply there.
        jdbc.sql("update thing_hides set through = current_date - 1").update();
        assertThat(sees(mia, circle, page, "Birthday plan")).isTrue();
        assertThat(JsonPath.<List<String>>read(fetch("/v1/pages/" + page, alex), "$.chip.hiddenFrom"))
                .isEmpty();

        // Hidden on its last day still.
        jdbc.sql("update thing_hides set through = current_date").update();
        assertThat(sees(mia, circle, page, "Birthday plan")).isFalse();
    }

    @Test
    void hidingAlsoHoldsForSomeoneItWasSharedWithByName() throws Exception {
        String nora = person("Nora");
        String mia = person("Mia");
        String circle = circle(nora, "family", "The Linds");
        String miaId = join(nora, circle, mia);
        String page = page(nora, circle, "Surprise", "me");

        share(
                nora,
                page,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"edit\"}],\"hiddenFrom\":[{\"memberId\":\"%s\"}]}"
                        .formatted(miaId, miaId),
                200);

        assertThat(sees(mia, circle, page, "Surprise")).isFalse();
        send(HttpMethod.PATCH, "/v1/pages/" + page, mia, "{\"title\":\"Found it\"}", 404);
    }

    @Test
    void onlyItsOwnerDecidesWhoSeesAThingAndOnlyItsOwnerDeletesIt() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        String alexId = join(nora, circle, alex);
        String page = page(nora, circle, "Our place", "circle");

        share(alex, page, "{\"audience\":\"me\"}", 403);
        send(HttpMethod.DELETE, "/v1/things/" + page, alex, null, 403);
        assertThat(JsonPath.<Boolean>read(fetch("/v1/things/" + page + "/audience", alex), "$.mine"))
                .isFalse();

        // Its owner takes it back: it is gone for Alex at once.
        share(nora, page, "{\"audience\":\"me\"}", 200);
        assertThat(sees(alex, circle, page, "Our place")).isFalse();
        share(
                nora,
                page,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(alexId),
                200);
        send(HttpMethod.DELETE, "/v1/things/" + page, nora, null, 204);
        assertThat(status("/v1/pages/" + page, nora)).isEqualTo(404);
    }

    @Test
    void aThingCanOnlyBeSharedWithPeopleOfItsOwnCircleAndNeverWithAPet() throws Exception {
        String nora = person("Nora");
        String kai = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        String other = circle(nora, "crew", "Lisbon crew");
        String kaiInCrew = join(nora, other, kai);
        String dog = addMember(nora, circle, "Biscuit", "pet");
        String mia = addMember(nora, circle, "Mia", "child");
        String page = page(nora, circle, "House manual", "me");

        share(
                nora,
                page,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(kaiInCrew),
                400);
        share(
                nora,
                page,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(dog),
                400);
        share(nora, page, "{\"audience\":\"some\",\"people\":[]}", 400);
        // A child without a phone can be shared with: it shows on what the adults see of her.
        share(
                nora,
                page,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(mia),
                200);
        assertThat(sees(kai, other, page, "House manual")).isFalse();
    }

    @Test
    void aGuestOfTheCircleSeesOnlyWhatWasSharedWithThemByName() throws Exception {
        String nora = person("Nora");
        String astrid = person("Astrid");
        String circle = circle(nora, "family", "The Linds");
        String astridId = join(nora, circle, astrid);
        send(HttpMethod.PATCH, "/v1/members/" + astridId, nora, "{\"role\":\"guest\"}", 200);
        String forAll = page(nora, circle, "Emergency numbers", "circle");
        String forHer = page(nora, circle, "Recipes", "me");

        share(
                nora,
                forHer,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(astridId),
                200);

        assertThat(sees(astrid, circle, forAll, "Emergency numbers")).isFalse();
        assertThat(sees(astrid, circle, forHer, "Recipes")).isTrue();
        // With everyone, a name on the list is how a guest is let in.
        share(
                nora,
                forAll,
                "{\"audience\":\"circle\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(astridId),
                200);
        assertThat(sees(astrid, circle, forAll, "Emergency numbers")).isTrue();
        send(HttpMethod.PATCH, "/v1/pages/" + forAll, astrid, "{\"body\":\"Hello\"}", 403);
    }

    @Test
    void someoneWhoLeftOrWasRemovedSeesNothingAnyMore() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "crew", "Lisbon crew");
        String alexId = join(nora, circle, alex);
        String page = page(nora, circle, "Plans", "circle");
        String named = page(nora, circle, "Budget", "me");
        share(
                nora,
                named,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"edit\"}]}".formatted(alexId),
                200);
        assertThat(sees(alex, circle, page, "Plans")).isTrue();

        send(HttpMethod.DELETE, "/v1/members/" + alexId, nora, null, 204);

        assertThat(status("/v1/pages/" + page, alex)).isEqualTo(404);
        assertThat(status("/v1/pages/" + named, alex)).isEqualTo(404);
        assertThat(status("/v1/circles/" + circle, alex)).isEqualTo(404);
        // Coming back through the link doesn't bring back what was shared by name.
        join(nora, circle, alex);
        assertThat(status("/v1/pages/" + page, alex)).isEqualTo(200);
        assertThat(status("/v1/pages/" + named, alex)).isEqualTo(404);
    }

    @Test
    void theAudienceSheetListsEveryoneWithWhatTheyCanDo() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String mia = addMember(nora, circle, "Mia", "child");
        addMember(nora, circle, "Biscuit", "pet");
        String page = page(nora, circle, "Wi-Fi", "me");
        share(
                nora,
                page,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"edit\"},{\"memberId\":\"%s\",\"access\":\"view\"}]}"
                        .formatted(alexId, mia),
                200);

        String sheet = fetch("/v1/things/" + page + "/audience", nora);

        assertThat(JsonPath.<String>read(sheet, "$.circleName")).isEqualTo("The Linds");
        assertThat(JsonPath.<List<String>>read(sheet, "$.people[*].name")).containsExactly("Alex", "Mia");
        assertThat(JsonPath.<List<String>>read(sheet, "$.people[*].access")).containsExactly("edit", "view");
    }
}
