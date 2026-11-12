package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.common.Sealed;
import app.homeport.api.vault.VaultItemService;
import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/**
 * The Vault's own rules: a person's Vault record, what the API hands out and to whom (a grant that is ready,
 * used up, stopped or still waiting), saving changes, the bounds on everything a phone sends, and what the
 * Vault's home, search and Today say about an item without knowing what is in it.
 */
class VaultItemTest extends VaultTestBase {

    @Autowired
    VaultItemService items;

    private int count(String sql) {
        return jdbc.sql(sql).query(Integer.class).single();
    }

    // ---------- a person's Vault ----------

    @Test
    void aPersonHasOneVaultAndNothingIsKeptWithoutIt() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");

        assertThat(JsonPath.<Boolean>read(fetch("/v1/vault", nora), "$.setUp")).isFalse();
        assertThat(code(send(HttpMethod.POST, "/v1/vault/items", nora, itemJson(circle, "Bank", "login", ""), 409)))
                .isEqualTo("no_vault");

        String publicKey = sealed(32);
        String body = vaultJson(publicKey);
        String made = send(HttpMethod.PUT, "/v1/vault", nora, body, 200);
        assertThat(JsonPath.<String>read(made, "$.publicKey")).isEqualTo(publicKey);
        assertThat(JsonPath.<Integer>read(made, "$.kdf.n")).isEqualTo(32768);
        assertThat(JsonPath.<Boolean>read(made, "$.keySaved")).isFalse();
        // A new phone asks for exactly what was stored, to open it with the Vault key typed in.
        assertThat(JsonPath.<String>read(fetch("/v1/vault", nora), "$.wrappedPrivateKey"))
                .isEqualTo(JsonPath.<String>read(body, "$.wrappedPrivateKey"));
        assertThat(JsonPath.<String>read(fetch("/v1/vault", nora), "$.salt"))
                .isEqualTo(JsonPath.<String>read(body, "$.salt"));

        // The same again is fine (a phone that sent it twice); another key pair is refused.
        send(HttpMethod.PUT, "/v1/vault", nora, body, 200);
        assertThat(code(send(HttpMethod.PUT, "/v1/vault", nora, vaultJson(sealed(32)), 409)))
                .isEqualTo("vault_exists");
        assertThat(JsonPath.<String>read(fetch("/v1/vault", nora), "$.publicKey"))
                .isEqualTo(publicKey);

        assertThat(JsonPath.<Boolean>read(send(HttpMethod.PUT, "/v1/vault/key-saved", nora, null, 200), "$.keySaved"))
                .isTrue();

        // A new Vault key: the same public key, a new wrapping, and "saved" has to be said again.
        String replaced = send(
                HttpMethod.PUT,
                "/v1/vault/key",
                nora,
                "{\"wrappedPrivateKey\":\"%s\",\"salt\":\"%s\",\"kdf\":{\"n\":65536,\"r\":8,\"p\":1}}"
                        .formatted(sealed(73), sealed(16)),
                200);
        assertThat(JsonPath.<String>read(replaced, "$.publicKey")).isEqualTo(publicKey);
        assertThat(JsonPath.<Integer>read(replaced, "$.keyVersion")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(replaced, "$.kdf.n")).isEqualTo(65536);
        assertThat(JsonPath.<Boolean>read(replaced, "$.keySaved")).isFalse();
    }

    @Test
    void aVaultIsSetUpOnlyWithWhatLooksLikeKeys() throws Exception {
        String nora = person("Nora");
        String ok = sealed(32);
        String kdf = "\"kdf\":{\"n\":32768,\"r\":8,\"p\":1}";

        for (String publicKey : List.of(sealed(31), sealed(33), "not a key at all, just some words in a row!!!")) {
            assertThat(code(send(
                            HttpMethod.PUT,
                            "/v1/vault",
                            nora,
                            "{\"publicKey\":\"%s\",\"wrappedPrivateKey\":\"%s\",\"salt\":\"%s\",%s}"
                                    .formatted(publicKey, sealed(73), sealed(16), kdf),
                            400)))
                    .isEqualTo("not_a_key");
        }
        assertThat(code(send(
                        HttpMethod.PUT,
                        "/v1/vault",
                        nora,
                        "{\"publicKey\":\"%s\",\"wrappedPrivateKey\":\"my private key\",\"salt\":\"%s\",%s}"
                                .formatted(ok, sealed(16), kdf),
                        400)))
                .isEqualTo("not_sealed");
        assertThat(code(send(
                        HttpMethod.PUT,
                        "/v1/vault",
                        nora,
                        "{\"publicKey\":\"%s\",\"wrappedPrivateKey\":\"%s\",\"salt\":\"%s\",%s}"
                                .formatted(ok, sealed(400), sealed(16), kdf),
                        413)))
                .isEqualTo("too_large");
        for (String numbers : List.of(
                "{\"n\":1024,\"r\":8,\"p\":1}",
                "{\"n\":40000,\"r\":8,\"p\":1}",
                "{\"n\":8388608,\"r\":8,\"p\":1}",
                "{\"n\":32768,\"r\":0,\"p\":1}",
                "{\"n\":32768,\"r\":8,\"p\":99}")) {
            assertThat(code(send(
                            HttpMethod.PUT,
                            "/v1/vault",
                            nora,
                            "{\"publicKey\":\"%s\",\"wrappedPrivateKey\":\"%s\",\"salt\":\"%s\",\"kdf\":%s}"
                                    .formatted(ok, sealed(73), sealed(16), numbers),
                            400)))
                    .as(numbers)
                    .isEqualTo("invalid_kdf");
        }
        assertThat(JsonPath.<Boolean>read(fetch("/v1/vault", nora), "$.setUp")).isFalse();
    }

    @Test
    void aCircleSaysWhoHasAVaultToSealForAndWhoCantBeSharedWithYet() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String noraKey = vault(nora);
        String kaiKey = vault(kai);
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        join(nora, circle, kai);
        addMember(nora, circle, "Mia", "child");
        addMember(nora, circle, "Biscuit", "pet");

        String keys = fetch("/v1/circles/" + circle + "/vault-keys", alex);

        assertThat(JsonPath.<List<String>>read(keys, "$.people[*].name")).containsExactly("Nora", "Kai");
        assertThat(JsonPath.<List<String>>read(keys, "$.people[*].publicKey")).containsExactly(noraKey, kaiKey);
        assertThat(JsonPath.<List<String>>read(keys, "$.without[*].name")).containsExactly("Alex", "Mia");
        assertThat(JsonPath.<List<String>>read(keys, "$.without[*].missing")).containsExactly("no_vault", "no_phone");
        assertThat(JsonPath.<List<Boolean>>read(keys, "$.without[*].you")).containsExactly(true, false);

        // Across all your circles: everyone with their own sign-in, for choosing a trusted person or a helper.
        String around = fetch("/v1/vault/people", nora);
        assertThat(JsonPath.<List<String>>read(around, "$[*].name")).containsExactly("Alex", "Kai");
        assertThat(JsonPath.<List<Boolean>>read(around, "$[*].hasVault")).containsExactly(false, true);
    }

    // ---------- being handed an item ----------

    @Test
    void anItemIsHandedOnlyToSomeoneWhoHoldsAGrantAndEachGetsTheirOwnWrappedKey() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        vault(nora);
        vault(alex);
        vault(kai);
        String circle = circle(nora, "crew", "Lisbon crew");
        String alexId = join(nora, circle, alex);
        String kaiId = join(nora, circle, kai);
        String ciphertext = sealed(300);
        String mine = sealed(105);
        String forAlex = sealed(105);
        String item = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/vault/items",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Netflix\",\"category\":\"login\",\"site\":\"netflix.com\",\"ciphertext\":\"%s\",\"wrappedKey\":\"%s\"}"
                                .formatted(id(), circle, ciphertext, mine),
                        201),
                "$.id");

        send(
                HttpMethod.PUT,
                "/v1/vault/items/" + item + "/sharing",
                nora,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"use\",\"wrappedKey\":\"%s\"},%s]}"
                        .formatted(alexId, forAlex, named(kaiId, "see")),
                200);

        // Nothing that describes the item carries its ciphertext or anyone's key.
        for (String answer : List.of(
                fetch("/v1/vault/items/" + item, alex),
                fetch("/v1/vault/items/" + item + "/sharing", alex),
                fetch("/v1/circles/" + circle + "/vault/items", alex),
                fetch("/v1/circles/" + circle + "/vault", alex),
                fetch("/v1/things/" + item, alex),
                fetch("/v1/circles/" + circle + "/search?q=netflix", alex))) {
            assertThat(answer).contains("Netflix").doesNotContain(ciphertext, mine, forAlex);
        }

        String opened = open(alex, item, 200);
        assertThat(JsonPath.<String>read(opened, "$.ciphertext")).isEqualTo(ciphertext);
        assertThat(JsonPath.<String>read(opened, "$.wrappedKey")).isEqualTo(forAlex);
        assertThat(JsonPath.<String>read(opened, "$.access")).isEqualTo("use");
        assertThat(JsonPath.<String>read(open(nora, item, 200), "$.wrappedKey")).isEqualTo(mine);

        // Kai is named but has no key yet: he knows it is there and can't have it.
        assertThat(JsonPath.<String>read(fetch("/v1/vault/items/" + item, kai), "$.myState"))
                .isEqualTo("waiting");
        String refused = open(kai, item, 403);
        assertThat(code(refused)).isEqualTo("no_key_yet");
        assertThat(refused).contains("Nora").doesNotContain(ciphertext);

        // Being handed it is written down, for its owner to see.
        String people = fetch("/v1/vault/items/" + item, nora);
        assertThat(JsonPath.<List<String>>read(people, "$.people[*].name")).containsExactly("Nora", "Alex", "Kai");
        assertThat(JsonPath.<List<String>>read(people, "$.people[*].access")).containsExactly("change", "use", "see");
        assertThat(JsonPath.<List<String>>read(people, "$.people[*].state"))
                .containsExactly("ready", "ready", "waiting");
        assertThat(JsonPath.<String>read(people, "$.people[1].openedAt")).isNotNull();
        assertThat(JsonPath.<Object>read(people, "$.people[2].openedAt")).isNull();
        assertThat(count("select opened_times from vault_grants where wrapped_key = '" + forAlex + "'"))
                .isEqualTo(1);

        // A removed grant stops working at once.
        share(nora, item, "some", 200, named(kaiId, "see"));
        open(alex, item, 404);
        assertThat(count("select count(*) from vault_grants where wrapped_key = '" + forAlex + "'"))
                .isZero();
    }

    @Test
    void aGrantForOneLookIsGoneAsItIsHandedOutAndTwoPhonesAskingAtOnceGetItOnce() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        vault(nora);
        vault(alex);
        String circle = circle(nora, "couple", "Nora and Alex");
        String alexId = join(nora, circle, alex);
        String item = item(nora, circle, "Front door code", "code", ",\"site\":\"home\"");

        // Something that vanishes after one look can't also be changed.
        assertThat(code(share(nora, item, "some", 400, with(alexId, "change", ",\"once\":true"))))
                .isEqualTo("once_cant_change");
        share(nora, item, "some", 200, with(alexId, "see", ",\"once\":true"));
        assertThat(JsonPath.<Boolean>read(fetch("/v1/vault/items/" + item, alex), "$.once"))
                .isTrue();

        // Two phones ask in the same moment.
        CountDownLatch together = new CountDownLatch(1);
        List<CompletableFuture<Integer>> asks = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            asks.add(CompletableFuture.supplyAsync(() -> {
                try {
                    together.await();
                    return mvc.perform(MockMvcRequestBuilders.post("/v1/vault/items/" + item + "/open")
                                    .header("Authorization", alex))
                            .andReturn()
                            .getResponse()
                            .getStatus();
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
            }));
        }
        together.countDown();
        assertThat(List.of(asks.get(0).get(), asks.get(1).get())).containsExactlyInAnyOrder(200, 403);

        // From here on it is gone: the key was erased with the handing out, in the database too.
        assertThat(code(open(alex, item, 403))).isEqualTo("opened_once");
        assertThat(count(
                        "select count(*) from vault_grants where once and wrapped_key is null and used_at is not null"))
                .isEqualTo(1);
        assertThat(JsonPath.<String>read(fetch("/v1/vault/items/" + item, alex), "$.myState"))
                .isEqualTo("used");
        // It doesn't count as waiting for a key, and a key handed out by the way doesn't bring it back.
        assertThat(fetch("/v1/vault/waiting", nora)).isEqualTo("[]");
        send(
                HttpMethod.PUT,
                "/v1/vault/items/" + item + "/keys",
                nora,
                "{\"keys\":[{\"memberId\":\"%s\",\"wrappedKey\":\"%s\"}]}".formatted(alexId, sealed(105)),
                200);
        open(alex, item, 403);
        // Sharing it again, on purpose, does.
        share(nora, item, "some", 200, with(alexId, "see", ",\"once\":true"));
        assertThat(JsonPath.<Boolean>read(open(alex, item, 200), "$.once")).isTrue();
        open(alex, item, 403);
        // The owner's own key is never once.
        open(nora, item, 200);
        open(nora, item, 200);
    }

    @Test
    void aGrantStopsWorkingAtItsTimeAndItsKeyIsErased() throws Exception {
        String nora = person("Nora");
        String lea = person("Lea");
        vault(nora);
        vault(lea);
        String circle = circle(nora, "crew", "Lisbon crew");
        String leaId = join(nora, circle, lea);
        String item = item(nora, circle, "Front door code", "code");

        assertThat(code(share(
                        nora,
                        item,
                        "some",
                        400,
                        with(leaId, "use", ",\"stopsAt\":\"" + Instant.now().minusSeconds(5) + "\""))))
                .isEqualTo("invalid_time");
        Instant sunday = Instant.now().plusSeconds(3 * 24 * 3600);
        share(nora, item, "some", 200, with(leaId, "use", ",\"stopsAt\":\"" + sunday + "\""));
        open(lea, item, 200);
        assertThat(JsonPath.<String>read(fetch("/v1/vault/items/" + item, lea), "$.stopsAt"))
                .isNotNull();

        // Sunday evening comes.
        jdbc.sql("update vault_grants set stops_at = now() - interval '1 minute' where stops_at is not null")
                .update();

        assertThat(code(open(lea, item, 403))).isEqualTo("stopped_working");
        assertThat(JsonPath.<String>read(fetch("/v1/vault/items/" + item, lea), "$.myState"))
                .isEqualTo("stopped");
        // The clock's job erases the key itself; it stays stopped, and nobody is asked to make a new one.
        assertThat(items.eraseStopped()).isEqualTo(1);
        assertThat(count("select count(*) from vault_grants where stops_at is not null and wrapped_key is null"))
                .isEqualTo(1);
        assertThat(code(open(lea, item, 403))).isEqualTo("stopped_working");
        assertThat(fetch("/v1/vault/waiting", nora)).isEqualTo("[]");
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/vault/items/" + item + "/sharing", nora), "$.people[*].state"))
                .containsExactly("ready", "stopped");
    }

    @Test
    void someoneWhoJoinsOrSetsUpTheirVaultLaterWaitsForAKeyUntilTheOwnersPhoneMakesOne() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        vault(nora);
        String circle = circle(nora, "crew", "Lisbon crew");
        String alexId = join(nora, circle, alex);
        String mia = addMember(nora, circle, "Mia", "child");
        String item = item(nora, circle, "Home Wi-Fi", "wifi", ",\"site\":\"Lind-Home\"");

        // A key can't be sealed for someone without a Vault, or without a sign-in of their own.
        String noVault = share(nora, item, "some", 400, with(alexId, "see"));
        assertThat(code(noVault)).isEqualTo("no_vault");
        assertThat(noVault).contains("Alex");
        assertThat(code(share(nora, item, "some", 400, with(mia, "use")))).isEqualTo("no_vault");

        // Shared with everyone, with "can use" for whoever wasn't given something else.
        send(
                HttpMethod.PUT,
                "/v1/vault/items/" + item + "/sharing",
                nora,
                "{\"audience\":\"circle\",\"everyone\":\"use\"}",
                200);
        String sheet = fetch("/v1/vault/items/" + item + "/sharing", nora);
        assertThat(JsonPath.<String>read(sheet, "$.everyone")).isEqualTo("use");
        assertThat(JsonPath.<List<String>>read(sheet, "$.people[*].name")).containsExactly("Nora", "Alex", "Mia");
        // Mia is a child: "everyone" in the Vault doesn't include her.
        assertThat(JsonPath.<List<String>>read(sheet, "$.people[*].access")).containsExactly("change", "use", null);
        assertThat(JsonPath.<List<String>>read(sheet, "$.people[*].state")).containsExactly("ready", "waiting", null);
        assertThat(JsonPath.<List<String>>read(sheet, "$.people[*].missing"))
                .containsExactly(null, "no_vault", "no_phone");
        // Nobody a key could be made for yet.
        assertThat(fetch("/v1/vault/waiting", nora)).isEqualTo("[]");

        // Alex sets up his Vault, Kai joins with one: both now wait, and Nora's phone is told for whom to wrap.
        String alexKey = vault(alex);
        String kaiKey = vault(kai);
        String kaiId = join(nora, circle, kai);
        String waiting = fetch("/v1/vault/waiting", nora);
        assertThat(JsonPath.<List<String>>read(waiting, "$[*].name")).containsExactly("Alex", "Kai");
        assertThat(JsonPath.<List<String>>read(waiting, "$[*].publicKey")).containsExactly(alexKey, kaiKey);
        assertThat(JsonPath.<List<String>>read(waiting, "$[*].itemId")).containsOnly(item);
        assertThat(JsonPath.<Integer>read(fetch("/v1/vault/attention", nora), "$.waitingForKeys"))
                .isEqualTo(2);
        assertThat(code(open(alex, item, 403))).isEqualTo("no_key_yet");

        String forAlex = sealed(105);
        send(
                HttpMethod.PUT,
                "/v1/vault/items/" + item + "/keys",
                nora,
                "{\"keys\":[{\"memberId\":\"%s\",\"wrappedKey\":\"%s\"},{\"memberId\":\"%s\",\"wrappedKey\":\"%s\"}]}"
                        .formatted(alexId, forAlex, kaiId, sealed(105)),
                200);
        assertThat(fetch("/v1/vault/waiting", nora)).isEqualTo("[]");
        String opened = open(alex, item, 200);
        assertThat(JsonPath.<String>read(opened, "$.wrappedKey")).isEqualTo(forAlex);
        assertThat(JsonPath.<String>read(opened, "$.access")).isEqualTo("use");

        // Handing keys out again replaces nobody's key.
        send(
                HttpMethod.PUT,
                "/v1/vault/items/" + item + "/keys",
                nora,
                "{\"keys\":[{\"memberId\":\"%s\",\"wrappedKey\":\"%s\"}]}".formatted(alexId, sealed(105)),
                200);
        assertThat(JsonPath.<String>read(open(alex, item, 200), "$.wrappedKey")).isEqualTo(forAlex);

        // What everyone gets can change later; people keep their keys.
        send(
                HttpMethod.PUT,
                "/v1/vault/items/" + item + "/sharing",
                nora,
                "{\"audience\":\"circle\",\"everyone\":\"see\"}",
                200);
        assertThat(JsonPath.<String>read(open(alex, item, 200), "$.access")).isEqualTo("see");
    }

    // ---------- saving a change ----------

    @Test
    void savingANewCiphertextNeedsTheVersionThePhoneReadSoTwoPeopleCantUndoEachOther() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        vault(nora);
        vault(alex);
        String circle = circle(nora, "couple", "Nora and Alex");
        String alexId = join(nora, circle, alex);
        String item = item(nora, circle, "Netflix", "login", ",\"site\":\"netflix.com\",\"health\":\"weak\"");
        share(nora, item, "some", 200, with(alexId, "change"));
        assertThat(JsonPath.<Integer>read(fetch("/v1/vault/items/" + item, nora), "$.version"))
                .isEqualTo(1);

        // Both have it open at version 1. Alex saves first.
        String alexs = sealed(200);
        String saved = send(
                HttpMethod.PATCH,
                "/v1/vault/items/" + item,
                alex,
                "{\"ciphertext\":\"%s\",\"version\":1,\"health\":\"ok\"}".formatted(alexs),
                200);
        assertThat(JsonPath.<Integer>read(saved, "$.version")).isEqualTo(2);
        assertThat(JsonPath.<String>read(saved, "$.health")).isEqualTo("ok");

        assertThat(code(send(
                        HttpMethod.PATCH,
                        "/v1/vault/items/" + item,
                        nora,
                        "{\"ciphertext\":\"%s\",\"version\":1}".formatted(sealed(200)),
                        409)))
                .isEqualTo("changed_meanwhile");
        assertThat(code(send(
                        HttpMethod.PATCH,
                        "/v1/vault/items/" + item,
                        nora,
                        "{\"ciphertext\":\"%s\"}".formatted(sealed(200)),
                        409)))
                .isEqualTo("changed_meanwhile");
        assertThat(JsonPath.<String>read(open(nora, item, 200), "$.ciphertext")).isEqualTo(alexs);

        // "Changed it 3 weeks ago": who last saved a change is kept with each person.
        String people = fetch("/v1/vault/items/" + item, nora);
        assertThat(JsonPath.<String>read(people, "$.people[1].changedAt")).isNotNull();
        assertThat(JsonPath.<Object>read(people, "$.people[0].changedAt")).isNull();

        // What is kept in the clear changes without a version.
        String renamed = send(
                HttpMethod.PATCH,
                "/v1/vault/items/" + item,
                nora,
                "{\"title\":\"  Netflix, family plan \",\"site\":\"netflix.com/login\",\"health\":\"reused\"}",
                200);
        assertThat(JsonPath.<String>read(renamed, "$.title")).isEqualTo("Netflix, family plan");
        assertThat(JsonPath.<String>read(renamed, "$.glance")).isEqualTo("Login · netflix.com/login");
        assertThat(JsonPath.<Integer>read(renamed, "$.version")).isEqualTo(2);
    }

    @Test
    void onlyAnIdHasADayItRunsOut() throws Exception {
        String nora = person("Nora");
        vault(nora);
        String circle = circle(nora, "solo", "Just me");
        String soon = LocalDate.now().plusDays(200).toString();

        assertThat(code(send(
                        HttpMethod.POST,
                        "/v1/vault/items",
                        nora,
                        itemJson(circle, "Netflix", "login", ",\"expiresOn\":\"" + soon + "\""),
                        400)))
                .isEqualTo("no_expiry");
        String id = item(nora, circle, "Passport", "id", ",\"expiresOn\":\"" + soon + "\"");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/vault/items/" + id, nora), "$.renewSoon"))
                .isTrue();

        send(HttpMethod.PATCH, "/v1/vault/items/" + id, nora, "{\"removeExpiry\":true}", 200);
        assertThat(JsonPath.<Object>read(fetch("/v1/vault/items/" + id, nora), "$.expiresOn"))
                .isNull();
        send(HttpMethod.PATCH, "/v1/vault/items/" + id, nora, "{\"expiresOn\":\"" + soon + "\"}", 200);
        // Filed in another drawer, the date goes with it.
        String moved = send(HttpMethod.PATCH, "/v1/vault/items/" + id, nora, "{\"category\":\"secret\"}", 200);
        assertThat(JsonPath.<Object>read(moved, "$.expiresOn")).isNull();
        assertThat(JsonPath.<String>read(moved, "$.glance")).isEqualTo("Secret");
    }

    // ---------- bounds ----------

    @Test
    void whatAPhoneSendsHasToBeScrambledTextWithinItsBounds() throws Exception {
        String nora = person("Nora");
        vault(nora);
        String circle = circle(nora, "solo", "Just me");
        String start = "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Bank\",\"category\":\"login\",";

        // A password in the clear, JSON, padded base64, anything with a space: refused, with a sentence.
        for (String plain :
                List.of("hunter2!", "correct horse battery staple", "c2VjcmV0cw==", "ab+/cd", Sealed.SAMPLE)) {
            String refused = send(
                    HttpMethod.POST,
                    "/v1/vault/items",
                    nora,
                    (start + "\"ciphertext\":\"%s\",\"wrappedKey\":\"%s\"}")
                            .formatted(id(), circle, plain, sealed(105)),
                    400);
            assertThat(code(refused)).as(plain).isEqualTo("not_sealed");
            assertThat(JsonPath.<String>read(refused, "$.detail")).contains("scrambled");
            assertThat(code(send(
                            HttpMethod.POST,
                            "/v1/vault/items",
                            nora,
                            (start + "\"ciphertext\":\"%s\",\"wrappedKey\":\"%s\"}")
                                    .formatted(id(), circle, sealed(50), plain),
                            400)))
                    .as(plain)
                    .isEqualTo("not_sealed");
        }

        // 64 KB of ciphertext is taken, although that is more than any other request may carry; a byte more is not.
        String id = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/vault/items",
                        nora,
                        (start + "\"ciphertext\":\"%s\",\"wrappedKey\":\"%s\"}")
                                .formatted(id(), circle, sealed(64 * 1024), sealed(105)),
                        201),
                "$.id");
        assertThat(JsonPath.<String>read(open(nora, id, 200), "$.ciphertext")).hasSize(Sealed.ITEM_CHARS);
        assertThat(code(send(
                        HttpMethod.POST,
                        "/v1/vault/items",
                        nora,
                        (start + "\"ciphertext\":\"%s\",\"wrappedKey\":\"%s\"}")
                                .formatted(id(), circle, sealed(64 * 1024 + 1), sealed(105)),
                        413)))
                .isEqualTo("too_large");
        assertThat(code(send(
                        HttpMethod.PATCH,
                        "/v1/vault/items/" + id,
                        nora,
                        "{\"version\":1,\"ciphertext\":\"%s\"}".formatted(sealed(64 * 1024 + 1)),
                        413)))
                .isEqualTo("too_large");
        // A wrapped key holds 512 characters at most.
        send(
                HttpMethod.POST,
                "/v1/vault/items",
                nora,
                (start + "\"ciphertext\":\"%s\",\"wrappedKey\":\"%s\"}")
                        .formatted(id(), circle, sealed(50), sealed(384)),
                201);
        assertThat(code(send(
                        HttpMethod.POST,
                        "/v1/vault/items",
                        nora,
                        (start + "\"ciphertext\":\"%s\",\"wrappedKey\":\"%s\"}")
                                .formatted(id(), circle, sealed(50), sealed(386)),
                        413)))
                .isEqualTo("too_large");
        // And a request that is simply huge never reaches any of this.
        mvc.perform(MockMvcRequestBuilders.post("/v1/vault/items")
                        .header("Authorization", nora)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content((start + "\"ciphertext\":\"%s\",\"wrappedKey\":\"x\"}")
                                .formatted(id(), circle, sealed(100 * 1024))))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status()
                        .is(413));
        // Outside the Vault the ceiling for a request stays where it was.
        mvc.perform(MockMvcRequestBuilders.post("/v1/pages")
                        .header("Authorization", nora)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Long\",\"body\":\"%s\"}"
                                .formatted(id(), circle, "a".repeat(70 * 1024))))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status()
                        .is(413));
    }

    @Test
    void aVaultHoldsTwoThousandItemsAndAnItemIsSharedWithFiftyPeopleAtMost() throws Exception {
        String nora = person("Nora");
        vault(nora);
        String circle = circle(nora, "solo", "Just me");
        String first = item(nora, circle, "The first", "login");
        // 1,999 more, written straight into the database.
        jdbc.sql("""
            insert into things (id, circle_id, owner_id, kind, place, title)
            select gen_random_uuid(), t.circle_id, t.owner_id, 'vault_item', 'vault', 'Item ' || n
            from things t, generate_series(2, 2000) n where t.id = cast(:first as uuid)
            """).param("first", first).update();
        jdbc.sql("""
            insert into vault_items (thing_id, category, ciphertext)
            select t.id, 'secret', 'AAAA' from things t where t.kind = 'vault_item'
              and not exists (select 1 from vault_items v where v.thing_id = t.id)
            """).update();

        String full =
                send(HttpMethod.POST, "/v1/vault/items", nora, itemJson(circle, "One too many", "login", ""), 409);
        assertThat(code(full)).isEqualTo("vault_full");
        assertThat(count("select count(*) from things where kind = 'vault_item'"))
                .isEqualTo(2000);
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle + "/vault", nora), "$.drawers[5].items"))
                .isEqualTo(1999);

        List<String> people = new ArrayList<>();
        for (int i = 0; i < 51; i++) {
            people.add(with(id(), "see"));
        }
        assertThat(code(share(nora, first, "some", 400, people.toArray(String[]::new))))
                .isEqualTo("too_many_people");
    }

    // ---------- the Vault's home, search, Today ----------

    @Test
    void theVaultsHomeCountsWhatYouMaySeeAndWhatNeedsALook() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        vault(nora);
        vault(alex);
        String circle = circle(nora, "family", "The Linds");
        String noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        String alexId = join(nora, circle, alex);
        item(nora, circle, "Bank", "login", ",\"health\":\"reused\"");
        item(nora, circle, "Old email", "login", ",\"health\":\"leaked\"");
        item(nora, circle, "Electricity", "login");
        item(nora, circle, "Debit card", "card");
        item(nora, circle, "Bike lock", "code");
        String netflix = item(alex, circle, "Netflix", "login", ",\"site\":\"netflix.com\",\"health\":\"weak\"");
        String door = item(alex, circle, "Front door code", "code", ",\"site\":\"home\"");
        item(alex, circle, "Alex's own", "secret");
        share(alex, netflix, "some", 200, with(noraId, "see"));
        share(alex, door, "circle", 200, with(noraId, "use"));

        String home = fetch("/v1/circles/" + circle + "/vault", nora);

        assertThat(JsonPath.<List<String>>read(home, "$.drawers[*].category"))
                .containsExactly("login", "card", "id", "wifi", "code", "secret");
        assertThat(JsonPath.<List<Integer>>read(home, "$.drawers[*].items")).containsExactly(4, 1, 0, 0, 2, 0);
        assertThat(JsonPath.<Integer>read(home, "$.needsALook.total")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(home, "$.needsALook.reused")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(home, "$.needsALook.leaked")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(home, "$.needsALook.weak")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(home, "$.sharedWithYouCount")).isEqualTo(2);
        assertThat(JsonPath.<List<String>>read(home, "$.sharedWithYou[*].title"))
                .containsExactly("Front door code", "Netflix");
        assertThat(JsonPath.<List<String>>read(home, "$.sharedWithYou[*].owner.name"))
                .containsOnly("Alex");
        assertThat(JsonPath.<List<String>>read(home, "$.sharedWithYou[*].myAccess"))
                .containsExactly("use", "see");
        assertThat(JsonPath.<List<String>>read(home, "$.sharedWithYou[*].chip.audience"))
                .containsExactly("circle", "some");
        assertThat(JsonPath.<List<String>>read(home, "$.sharedWithYou[*].glance"))
                .containsExactly("Code · home", "Login · netflix.com");

        // The drawers, and the three ways to narrow a list.
        String items = "/v1/circles/" + circle + "/vault/items";
        assertThat(JsonPath.<List<String>>read(fetch(items + "?category=code", nora), "$.items[*].title"))
                .containsExactly("Front door code", "Bike lock");
        assertThat(JsonPath.<List<String>>read(fetch(items + "?mine=false", nora), "$.items[*].title"))
                .containsExactly("Front door code", "Netflix");
        assertThat(JsonPath.<Integer>read(fetch(items + "?mine=true", nora), "$.items.length()"))
                .isEqualTo(5);
        assertThat(JsonPath.<List<String>>read(fetch(items + "?look=true", nora), "$.items[*].title"))
                .containsExactlyInAnyOrder("Netflix", "Old email", "Bank");
        send(HttpMethod.GET, items + "?category=passwords", nora, null, 400);

        // Everything that is yours, across your circles, in one list: the starting point for "what opens".
        String couple = circle(nora, "couple", "Nora and Alex");
        item(nora, couple, "Our savings", "login");
        String own = fetch("/v1/vault/items?limit=100", nora);
        assertThat(JsonPath.<List<String>>read(own, "$.items[*].title"))
                .containsExactly("Our savings", "Bike lock", "Debit card", "Electricity", "Old email", "Bank");
        assertThat(JsonPath.<List<Boolean>>read(own, "$.items[*].mine")).containsOnly(true);
        assertThat(JsonPath.<Object>read(own, "$.nextCursor")).isNull();
        String firstPage = fetch("/v1/vault/items?limit=4", nora);
        assertThat(JsonPath.<List<String>>read(
                        fetch(
                                "/v1/vault/items?limit=4&cursor=" + JsonPath.<String>read(firstPage, "$.nextCursor"),
                                nora),
                        "$.items[*].title"))
                .containsExactly("Old email", "Bank");

        // Alex's home is his own view of the same circle.
        assertThat(JsonPath.<List<Integer>>read(fetch("/v1/circles/" + circle + "/vault", alex), "$.drawers[*].items"))
                .containsExactly(1, 0, 0, 0, 1, 1);
        assertThat(alexId).isNotEmpty();
    }

    @Test
    void aListOfItemsComesInPagesThatNeitherRepeatNorSkip() throws Exception {
        String nora = person("Nora");
        vault(nora);
        String circle = circle(nora, "solo", "Just me");
        List<String> made = new ArrayList<>();
        for (int i = 1; i <= 5; i++) {
            made.add(item(nora, circle, "Login " + i, "login"));
        }

        List<String> seen = new ArrayList<>();
        String cursor = "";
        for (int page = 0; page < 4 && cursor != null; page++) {
            String answer = fetch("/v1/circles/" + circle + "/vault/items?limit=2" + cursor, nora);
            seen.addAll(JsonPath.<List<String>>read(answer, "$.items[*].id"));
            String next = JsonPath.read(answer, "$.nextCursor");
            cursor = next == null ? null : "&cursor=" + next;
        }

        assertThat(seen).containsExactlyInAnyOrderElementsOf(made).hasSize(5);
    }

    @Test
    void searchTodayAndAPersonsPageSayInAFewWordsWhatAnItemIs() throws Exception {
        String nora = person("Nora");
        vault(nora);
        String circle = circle(nora, "family", "The Linds");
        String mia = addMember(nora, circle, "Mia", "child");
        LocalDate today = LocalDate.now();
        DateTimeFormatter day = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);
        item(nora, circle, "Netflix", "login", ",\"site\":\"netflix.com\"");
        item(nora, circle, "Nora's passport", "id", ",\"expiresOn\":\"" + today.plusDays(1584) + "\"");
        String mias = item(
                nora,
                circle,
                "Mia's passport",
                "id",
                ",\"expiresOn\":\"%s\",\"about\":[\"%s\"]".formatted(today.plusDays(264), mia));
        String leos = item(nora, circle, "Leo's passport", "id", ",\"expiresOn\":\"" + today.plusDays(23) + "\"");

        // Search finds by title and by site, and says what each is.
        String passports = fetch("/v1/circles/" + circle + "/search?q=passport", nora);
        assertThat(JsonPath.<List<String>>read(passports, "$.hits[*].thing.glance"))
                .containsExactlyInAnyOrder(
                        "ID · expires " + day.format(today.plusDays(1584)),
                        "Expires " + day.format(today.plusDays(264)) + " · renew soon",
                        "Expires " + day.format(today.plusDays(23)) + " · renew soon");
        assertThat(JsonPath.<List<String>>read(passports, "$.hits[*].thing.kind"))
                .containsOnly("vault_item");
        String bySite = fetch("/v1/circles/" + circle + "/search?q=netflix.c", nora);
        assertThat(JsonPath.<String>read(bySite, "$.hits[0].thing.glance")).isEqualTo("Login · netflix.com");
        assertThat(JsonPath.<String>read(bySite, "$.hits[0].snippet")).isEqualTo("netflix.com");
        assertThat(JsonPath.<Integer>read(
                        fetch("/v1/circles/" + circle + "/search?q=netflix&place=notes", nora), "$.hits.length()"))
                .isZero();

        // A person's page gathers the IDs about them.
        String kept = fetch("/v1/members/" + mia, nora);
        assertThat(JsonPath.<List<String>>read(kept, "$.kept[*].title")).containsExactly("Mia's passport");
        assertThat(JsonPath.<String>read(kept, "$.kept[0].glance")).endsWith("renew soon");
        assertThat(JsonPath.<List<String>>read(fetch("/v1/vault/items/" + mias, nora), "$.about[*].name"))
                .containsExactly("Mia");

        // Today brings an ID that runs out within 60 days, and keeps saying so for two weeks after.
        String now = fetch("/v1/circles/" + circle + "/today?day=" + today, nora);
        assertThat(JsonPath.<List<String>>read(now, "$.items[*].title")).containsExactly("Leo's passport");
        assertThat(JsonPath.<String>read(now, "$.items[0].note")).isEqualTo("Runs out in 23 days · renew it");
        assertThat(JsonPath.<String>read(now, "$.items[0].thingId")).isEqualTo(leos);
        assertThat(JsonPath.<String>read(now, "$.items[0].kind")).isEqualTo("vault_item");
        assertThat(JsonPath.<String>read(
                        fetch("/v1/circles/" + circle + "/today?day=" + today.plusDays(30), nora), "$.items[0].note"))
                .isEqualTo("Ran out 7 days ago · renew it");
        assertThat(JsonPath.<Integer>read(
                        fetch("/v1/circles/" + circle + "/today?day=" + today.plusDays(40), nora), "$.items.length()"))
                .isZero();
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/today?day=" + today.plusDays(210), nora), "$.items[*].title"))
                .containsExactly("Mia's passport");
    }

    // ---------- the sample data ----------

    @Test
    void anItemOfTheSampleDataIsMarkedAsOneAndThereIsNothingToOpenOrShare() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        vault(nora);
        vault(alex);
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String real = item(nora, circle, "Real", "login");
        // What the seed writes: an item with the marker in place of a ciphertext, shared, with no grants.
        String sample = id();
        jdbc.sql("""
            insert into things (id, circle_id, owner_id, kind, place, title, audience)
            select cast(:id as uuid), t.circle_id, t.owner_id, 'vault_item', 'vault', 'Netflix', 'circle'
            from things t where t.id = cast(:real as uuid)
            """).param("id", sample).param("real", real).update();
        jdbc.sql(
                        "insert into vault_items (thing_id, category, site, ciphertext) values (cast(:id as uuid), 'login', 'netflix.com', :marker)")
                .param("id", sample)
                .param("marker", Sealed.SAMPLE)
                .update();

        for (String who : List.of(nora, alex)) {
            String shown = fetch("/v1/vault/items/" + sample, who);
            assertThat(JsonPath.<Boolean>read(shown, "$.sample")).isTrue();
            assertThat(JsonPath.<String>read(shown, "$.glance")).isEqualTo("Login · netflix.com");
            assertThat(code(open(who, sample, 409))).isEqualTo("sample_item");
        }
        assertThat(JsonPath.<Boolean>read(fetch("/v1/vault/items/" + real, nora), "$.sample"))
                .isFalse();
        assertThat(code(share(nora, sample, "some", 409, with(alexId, "see")))).isEqualTo("sample_item");
        assertThat(code(send(HttpMethod.PATCH, "/v1/vault/items/" + sample, nora, "{\"title\":\"Mine\"}", 409)))
                .isEqualTo("sample_item");
        // Nobody waits for a key that can never be made.
        assertThat(fetch("/v1/vault/waiting", nora)).isEqualTo("[]");
        // It can be deleted like anything else.
        send(HttpMethod.DELETE, "/v1/things/" + sample, nora, null, 204);
    }
}
