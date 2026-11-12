package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Who knows a Vault item exists: the one sharing rule, tried through every way an item can be reached (by its
 * id, as a thing, its audience, its share sheet, the circle's list, its drawer, the Vault's home, search by
 * title and by site, Today, a person's page). They must all agree. Being handed what is inside takes a grant
 * on top; that is {@link VaultItemTest}.
 */
class VaultSharingRulesTest extends VaultTestBase {

    /** An ID that runs out in ten days, about this member: it is on Today and on their page for whoever may see it. */
    private String passport(String token, String circle, String aboutMember) throws Exception {
        return item(
                token,
                circle,
                "Passport of Quentin",
                "id",
                ",\"site\":\"zanzibar-office\",\"expiresOn\":\"%s\",\"about\":[\"%s\"]"
                        .formatted(LocalDate.now().plusDays(10), aboutMember));
    }

    /** True when this person can reach the passport by any of the ways there are. They must all agree. */
    private boolean sees(String token, String circle, String item, String aboutMember) throws Exception {
        boolean byId = status("/v1/vault/items/" + item, token) == 200;
        List<Boolean> all = List.of(
                byId,
                status("/v1/things/" + item, token) == 200,
                status("/v1/things/" + item + "/audience", token) == 200,
                status("/v1/vault/items/" + item + "/sharing", token) == 200,
                fetch("/v1/circles/" + circle + "/vault/items", token).contains(item),
                fetch("/v1/circles/" + circle + "/vault/items?category=id", token)
                        .contains(item),
                JsonPath.<List<Integer>>read(fetch("/v1/circles/" + circle + "/vault", token), "$.drawers[*].items")
                                .stream()
                                .mapToInt(Integer::intValue)
                                .sum()
                        > 0,
                fetch("/v1/circles/" + circle + "/search?q=Quentin", token).contains(item),
                fetch("/v1/circles/" + circle + "/search?q=zanzibar", token).contains(item),
                fetch("/v1/circles/" + circle + "/search?q=zanzibar&place=vault", token)
                        .contains(item),
                fetch("/v1/circles/" + circle + "/today", token).contains(item),
                fetch("/v1/members/" + aboutMember, token).contains(item));
        assertThat(all).as("every way to reach the item gives the same answer").containsOnly(byId);
        // Whoever can't see it can do nothing with it either, and learns nothing from trying.
        if (!byId) {
            send(HttpMethod.POST, "/v1/vault/items/" + item + "/open", token, null, 404);
            send(HttpMethod.PATCH, "/v1/vault/items/" + item, token, "{\"title\":\"Mine now\"}", 404);
            send(HttpMethod.PUT, "/v1/vault/items/" + item + "/sharing", token, "{\"audience\":\"circle\"}", 404);
            send(HttpMethod.PUT, "/v1/vault/items/" + item + "/keys", token, "{\"keys\":[]}", 404);
            send(HttpMethod.DELETE, "/v1/things/" + item, token, null, 404);
        }
        return byId;
    }

    @Test
    void aNewItemIsItsOwnersAloneAlsoAmongEqualsWhereOtherThingsStartShared() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String stranger = person("Stranger");
        vault(nora);
        vault(alex);
        vault(stranger);
        for (String kind : List.of("family", "couple", "crew")) {
            String circle = circle(nora, kind, "Us " + kind);
            join(nora, circle, alex);
            String me = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");

            String item = passport(nora, circle, me);

            assertThat(JsonPath.<String>read(fetch("/v1/vault/items/" + item, nora), "$.chip.audience"))
                    .as(kind)
                    .isEqualTo("me");
            assertThat(sees(nora, circle, item, me)).isTrue();
            assertThat(sees(alex, circle, item, me)).as(kind).isFalse();
            // A stranger can't even ask the circle.
            for (String path : List.of(
                    "/v1/vault/items/" + item,
                    "/v1/vault/items/" + item + "/sharing",
                    "/v1/things/" + item,
                    "/v1/circles/" + circle + "/vault",
                    "/v1/circles/" + circle + "/vault/items",
                    "/v1/circles/" + circle + "/vault-keys")) {
                assertThat(status(path, stranger)).as(path).isEqualTo(404);
            }
            send(HttpMethod.POST, "/v1/vault/items/" + item + "/open", stranger, null, 404);
            send(HttpMethod.POST, "/v1/vault/items", stranger, itemJson(circle, "Hello", "login", ""), 404);
        }
    }

    @Test
    void sharedWithSomeoneByNameTheySeeItAndOnlyCanChangeLetsThemChangeIt() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        vault(nora);
        vault(alex);
        vault(kai);
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String kaiId = join(nora, circle, kai);
        String item = passport(nora, circle, alexId);

        for (String access : List.of("use", "see")) {
            share(nora, item, "some", 200, with(alexId, access));
            assertThat(sees(alex, circle, item, alexId)).as(access).isTrue();
            assertThat(sees(kai, circle, item, alexId)).as(access).isFalse();
            assertThat(JsonPath.<Boolean>read(fetch("/v1/vault/items/" + item, alex), "$.canEdit"))
                    .isFalse();
            assertThat(code(send(HttpMethod.PATCH, "/v1/vault/items/" + item, alex, "{\"title\":\"Mine now\"}", 403)))
                    .isEqualTo("view_only");
            assertThat(JsonPath.<String>read(fetch("/v1/things/" + item + "/audience", nora), "$.people[0].access"))
                    .isEqualTo("view");
        }

        share(nora, item, "some", 200, with(alexId, "change"), with(kaiId, "see"));
        send(HttpMethod.PATCH, "/v1/vault/items/" + item, alex, "{\"title\":\"Passport of Quentin, renewed\"}", 200);
        send(HttpMethod.PATCH, "/v1/vault/items/" + item, kai, "{\"title\":\"Mine now\"}", 403);
        // The chip and the general audience sheet say the same as the Vault's own sheet.
        assertThat(JsonPath.<List<String>>read(fetch("/v1/vault/items/" + item, kai), "$.chip.people[*].name"))
                .containsExactly("Alex", "Kai");
        assertThat(JsonPath.<List<String>>read(fetch("/v1/things/" + item + "/audience", nora), "$.people[*].access"))
                .containsExactly("edit", "view");
    }

    @Test
    void aTeenOrAChildSeesNothingInTheVaultUnlessItWasSharedWithThemByName() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String mia = person("Mia");
        String leo = person("Leo");
        vault(nora);
        vault(alex);
        vault(mia);
        vault(leo);
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String miaId = join(nora, circle, mia);
        String leoId = join(nora, circle, leo);
        send(HttpMethod.PATCH, "/v1/members/" + miaId, nora, "{\"role\":\"teen\"}", 200);
        send(HttpMethod.PATCH, "/v1/members/" + leoId, nora, "{\"role\":\"child\"}", 200);
        String item = passport(nora, circle, alexId);

        // Everyone in The Linds: the other adult, not the young.
        share(nora, item, "circle", 200, with(alexId, "see"));
        assertThat(sees(alex, circle, item, alexId)).isTrue();
        assertThat(sees(mia, circle, item, alexId)).isFalse();
        assertThat(sees(leo, circle, item, alexId)).isFalse();
        // A key for someone the audience doesn't include is refused, and nothing changes.
        assertThat(code(send(
                        HttpMethod.PUT,
                        "/v1/vault/items/" + item + "/keys",
                        nora,
                        "{\"keys\":[{\"memberId\":\"%s\",\"wrappedKey\":\"%s\"}]}".formatted(miaId, sealed(105)),
                        400)))
                .isEqualTo("not_in_audience");
        // The Vault's home counts nothing for them, and its list is empty.
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle + "/vault", mia), "$.sharedWithYouCount"))
                .isZero();

        // By name, the teen is let in; the child still isn't.
        share(nora, item, "circle", 200, with(alexId, "see"), with(miaId, "use"));
        assertThat(sees(mia, circle, item, alexId)).isTrue();
        assertThat(sees(leo, circle, item, alexId)).isFalse();
        assertThat(JsonPath.<String>read(fetch("/v1/vault/items/" + item, mia), "$.myAccess"))
                .isEqualTo("use");
        open(mia, item, 200);
    }

    @Test
    void hiddenFromHoldsInTheVaultAndNobodyHiddenIsGivenAKey() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        vault(nora);
        vault(alex);
        vault(kai);
        String circle = circle(nora, "crew", "Lisbon crew");
        String alexId = join(nora, circle, alex);
        String kaiId = join(nora, circle, kai);
        String item = passport(nora, circle, alexId);
        String hidden = ",\"hiddenFrom\":[{\"memberId\":\"%s\",\"through\":\"%s\"}]"
                .formatted(kaiId, LocalDate.now().plusDays(3));

        // A key for someone it is hidden from is refused, whole: the audience doesn't change either.
        assertThat(code(send(
                        HttpMethod.PUT,
                        "/v1/vault/items/" + item + "/sharing",
                        nora,
                        "{\"audience\":\"circle\",\"people\":[%s,%s]%s}"
                                .formatted(with(alexId, "see"), with(kaiId, "see"), hidden),
                        400)))
                .isEqualTo("not_in_audience");
        assertThat(sees(alex, circle, item, alexId)).isFalse();

        send(
                HttpMethod.PUT,
                "/v1/vault/items/" + item + "/sharing",
                nora,
                "{\"audience\":\"circle\",\"people\":[%s]%s}".formatted(with(alexId, "see"), hidden),
                200);
        assertThat(sees(alex, circle, item, alexId)).isTrue();
        assertThat(sees(kai, circle, item, alexId)).isFalse();
        assertThat(JsonPath.<List<String>>read(fetch("/v1/vault/items/" + item, alex), "$.chip.hiddenFrom"))
                .containsExactly("Kai");
        // And nobody is asked to make a key for him.
        assertThat(fetch("/v1/vault/waiting", nora)).isEqualTo("[]");

        // The day after the last hidden day he sees it, and waits for a key.
        jdbc.sql("update thing_hides set through = current_date - 1").update();
        assertThat(sees(kai, circle, item, alexId)).isTrue();
        assertThat(JsonPath.<List<String>>read(fetch("/v1/vault/waiting", nora), "$[*].name"))
                .containsExactly("Kai");
    }

    @Test
    void aGuestOfTheCircleSeesOnlyWhatWasSharedWithThemByName() throws Exception {
        String nora = person("Nora");
        String astrid = person("Astrid");
        vault(nora);
        vault(astrid);
        String circle = circle(nora, "family", "The Linds");
        String astridId = join(nora, circle, astrid);
        send(HttpMethod.PATCH, "/v1/members/" + astridId, nora, "{\"role\":\"guest\"}", 200);
        String item = passport(nora, circle, astridId);

        share(nora, item, "circle", 200);
        assertThat(sees(astrid, circle, item, astridId)).isFalse();

        share(nora, item, "circle", 200, with(astridId, "see"));
        assertThat(sees(astrid, circle, item, astridId)).isTrue();
        open(astrid, item, 200);
    }

    @Test
    void onlyItsOwnerSharesAnItemHandsOutKeysOrDeletesItEvenWhenSomeoneElseMayChangeIt() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        vault(nora);
        vault(alex);
        String circle = circle(nora, "couple", "Nora and Alex");
        String alexId = join(nora, circle, alex);
        String noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        String item = passport(nora, circle, alexId);
        share(nora, item, "some", 200, with(alexId, "change"));

        assertThat(code(share(alex, item, "circle", 403))).isEqualTo("not_yours");
        assertThat(code(share(alex, item, "some", 403, with(noraId, "see")))).isEqualTo("not_yours");
        send(HttpMethod.PUT, "/v1/vault/items/" + item + "/keys", alex, "{\"keys\":[]}", 403);
        send(HttpMethod.DELETE, "/v1/things/" + item, alex, null, 403);
        assertThat(JsonPath.<Boolean>read(fetch("/v1/vault/items/" + item + "/sharing", alex), "$.mine"))
                .isFalse();
        // What the owner saw of who opened it is the owner's to see.
        open(alex, item, 200);
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/vault/items/" + item, alex), "$.people[*].openedAt"))
                .containsOnlyNulls();
        assertThat(JsonPath.<String>read(fetch("/v1/vault/items/" + item, nora), "$.people[1].openedAt"))
                .isNotNull();

        // Its owner takes it back: it is gone for Alex at once, and deleting takes everything with it.
        share(nora, item, "me", 200);
        assertThat(sees(alex, circle, item, alexId)).isFalse();
        send(HttpMethod.DELETE, "/v1/things/" + item, nora, null, 204);
        assertThat(status("/v1/vault/items/" + item, nora)).isEqualTo(404);
        assertThat(jdbc.sql("select count(*) from vault_grants")
                        .query(Integer.class)
                        .single())
                .isZero();
    }

    @Test
    void sendingTheSameNewItemTwiceMakesOne() throws Exception {
        String nora = person("Nora");
        vault(nora);
        String circle = circle(nora, "solo", "Just me");
        String body = itemJson(circle, "Netflix", "login", ",\"site\":\"netflix.com\"");

        String first = send(HttpMethod.POST, "/v1/vault/items", nora, body, 201);
        String second = send(HttpMethod.POST, "/v1/vault/items", nora, body, 201);

        assertThat(JsonPath.<String>read(second, "$.id")).isEqualTo(JsonPath.<String>read(first, "$.id"));
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle + "/vault/items", nora), "$.items.length()"))
                .isEqualTo(1);
        assertThat(jdbc.sql("select count(*) from vault_grants")
                        .query(Integer.class)
                        .single())
                .isEqualTo(1);
    }

    @Test
    void someoneWhoLeavesLosesEveryGrantAndComingBackBringsNoneOfThemBack() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        vault(nora);
        vault(alex);
        String circle = circle(nora, "crew", "Lisbon crew");
        String alexId = join(nora, circle, alex);
        String forAll = passport(nora, circle, alexId);
        String named = item(nora, circle, "Bank", "login");
        share(nora, forAll, "circle", 200, with(alexId, "see"));
        share(nora, named, "some", 200, with(alexId, "see"));
        open(alex, forAll, 200);
        open(alex, named, 200);

        send(HttpMethod.DELETE, "/v1/members/" + alexId, nora, null, 204);

        assertThat(jdbc.sql("select count(*) from vault_grants where member_id = cast(:m as uuid)")
                        .param("m", alexId)
                        .query(Integer.class)
                        .single())
                .isZero();
        open(alex, forAll, 404);
        open(alex, named, 404);

        // Back through the link: he sees what everyone sees again, but holds no key until Nora's phone makes one.
        join(nora, circle, alex);
        assertThat(status("/v1/vault/items/" + forAll, alex)).isEqualTo(200);
        assertThat(status("/v1/vault/items/" + named, alex)).isEqualTo(404);
        assertThat(code(open(alex, forAll, 403))).isEqualTo("no_key_yet");
        assertThat(JsonPath.<List<String>>read(fetch("/v1/vault/waiting", nora), "$[*].title"))
                .containsExactly("Passport of Quentin");
    }

    @Test
    void theGeneralAudienceSheetWorksOnAnItemButHandsNobodyAKey() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        vault(nora);
        vault(alex);
        String circle = circle(nora, "couple", "Nora and Alex");
        String alexId = join(nora, circle, alex);
        String item = passport(nora, circle, alexId);

        // Widened through the sheet every thing has: Alex knows it is there, and waits.
        send(HttpMethod.PUT, "/v1/things/" + item + "/audience", nora, "{\"audience\":\"circle\"}", 200);
        assertThat(sees(alex, circle, item, alexId)).isTrue();
        assertThat(code(open(alex, item, 403))).isEqualTo("no_key_yet");
        assertThat(JsonPath.<String>read(fetch("/v1/vault/items/" + item, alex), "$.myState"))
                .isEqualTo("waiting");

        // Narrowed through it: his grant opens nothing any more, and it is gone the next time keys are handed out.
        share(nora, item, "some", 200, with(alexId, "see"));
        open(alex, item, 200);
        send(HttpMethod.PUT, "/v1/things/" + item + "/audience", nora, "{\"audience\":\"me\"}", 200);
        open(alex, item, 404);
        send(HttpMethod.PUT, "/v1/vault/items/" + item + "/keys", nora, "{\"keys\":[]}", 200);
        assertThat(jdbc.sql("select count(*) from vault_grants")
                        .query(Integer.class)
                        .single())
                .isEqualTo(1);
    }
}
