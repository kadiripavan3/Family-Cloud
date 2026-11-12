package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.notify.LoggingPushSender;
import app.homeport.api.notify.PushMessage;
import app.homeport.api.vault.RecoveryService;
import app.homeport.api.vault.VaultNotices;
import com.jayway.jsonpath.JsonPath;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

/**
 * Helpers and getting back in: who can be a helper, who keeps a share, and that a share is handed to its
 * helper only while a recovery its owner started is open. Time is moved by writing dates into rows.
 */
class VaultRecoveryTest extends VaultTestBase {

    @Autowired
    RecoveryService recoveries;

    @Autowired
    VaultNotices notices;

    @Autowired
    LoggingPushSender pushes;

    private String nora;
    private String alex;
    private String astrid;
    private String family;
    private String alexId;
    private String astridId;

    @BeforeEach
    void theLinds() throws Exception {
        pushes.clear();
        nora = person("Nora");
        alex = person("Alex");
        astrid = person("Astrid");
        vault(nora);
        vault(alex);
        vault(astrid);
        family = circle(nora, "family", "The Linds");
        alexId = join(nora, family, alex);
        astridId = join(nora, family, astrid);
    }

    /** Asks someone to be a helper. Returns the id of the request. */
    private String ask(String owner, String memberId) throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/vault/helpers",
                        owner,
                        "{\"clientId\":\"%s\",\"memberId\":\"%s\"}".formatted(id(), memberId),
                        201),
                "$.id");
    }

    private String answer(String helper, String id, boolean accept, int expected) throws Exception {
        return send(HttpMethod.PUT, "/v1/vault/helping/" + id, helper, "{\"accept\":" + accept + "}", expected);
    }

    private String shares(String owner, int expected, String... helperIds) throws Exception {
        StringBuilder all = new StringBuilder();
        for (String helper : helperIds) {
            all.append(all.isEmpty() ? "" : ",")
                    .append("{\"helperId\":\"%s\",\"sealedShare\":\"%s\"}".formatted(helper, sealed(90)));
        }
        return send(HttpMethod.PUT, "/v1/vault/helpers/shares", owner, "{\"shares\":[" + all + "]}", expected);
    }

    private String start(String owner, int expected) throws Exception {
        return send(
                HttpMethod.POST,
                "/v1/vault/recoveries",
                owner,
                "{\"clientId\":\"%s\",\"tempPublicKey\":\"%s\"}".formatted(id(), sealed(32)),
                expected);
    }

    private String passOn(String helper, String id, String recovery, int expected) throws Exception {
        return send(
                HttpMethod.PUT,
                "/v1/vault/helping/" + id + "/share",
                helper,
                "{\"recoveryId\":\"%s\",\"resealedShare\":\"%s\"}".formatted(recovery, sealed(90)),
                expected);
    }

    /** Alex and Astrid said yes and each keeps a share. Returns the two request ids. */
    private String[] twoHelpers() throws Exception {
        String a = ask(nora, alexId);
        String b = ask(nora, astridId);
        answer(alex, a, true, 200);
        answer(astrid, b, true, 200);
        shares(nora, 200, a, b);
        return new String[] {a, b};
    }

    private void phone(String token, String name) throws Exception {
        send(
                HttpMethod.PUT,
                "/v1/me/devices",
                token,
                "{\"token\":\"ExponentPushToken[%s]\",\"platform\":\"ios\"}".formatted(name),
                204);
    }

    private List<String> pushedTo(String phoneName) {
        notices.deliverDue();
        return pushes.sent().stream()
                .filter(p -> p.token().contains(phoneName))
                .map(PushMessage::title)
                .toList();
    }

    @Test
    void aHelperIsAskedAndSaysYesOrNoAndOnlyThoseWhoSaidYesKeepAShare() throws Exception {
        phone(nora, "noras-phone");
        phone(alex, "alexs-phone");
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/vault/helpers", nora), "$.helpers"))
                .isEmpty();

        String a = ask(nora, alexId);
        // Asking the same person again asks once.
        assertThat(ask(nora, alexId)).isEqualTo(a);
        assertThat(pushedTo("alexs-phone")).containsExactly("Nora asks you to be a Vault helper");
        String asked = fetch("/v1/vault/helping", alex);
        assertThat(JsonPath.<List<String>>read(asked, "$[*].state")).containsExactly("asked");
        assertThat(JsonPath.<String>read(asked, "$[0].person.name")).isEqualTo("Nora");
        assertThat(JsonPath.<String>read(fetch("/v1/vault/attention", alex), "$.helperAsks[0].person.name"))
                .isEqualTo("Nora");
        // Nobody keeps a share before saying yes.
        assertThat(code(shares(nora, 400, a))).isEqualTo("not_a_helper");

        assertThat(JsonPath.<String>read(answer(alex, a, true, 200), "$.state")).isEqualTo("accepted");
        assertThat(pushedTo("noras-phone")).containsExactly("Alex said yes");
        // One helper alone must never be enough, so one share alone isn't taken.
        assertThat(code(shares(nora, 400, a))).isEqualTo("not_enough_helpers");

        String b = ask(nora, astridId);
        assertThat(JsonPath.<String>read(answer(astrid, b, false, 200), "$.state"))
                .isEqualTo("declined");
        assertThat(code(shares(nora, 400, a, b))).isEqualTo("not_a_helper");
        assertThat(fetch("/v1/vault/helping", astrid)).isEqualTo("[]");
        // A no stays a no until she is asked again.
        assertThat(code(answer(astrid, b, true, 409))).isEqualTo("already_declined");
        assertThat(ask(nora, astridId)).isEqualTo(b);
        answer(astrid, b, true, 200);

        // Two said yes: Nora's phone is told to split the key, and after that she could get back in.
        String due = fetch("/v1/vault/helpers", nora);
        assertThat(JsonPath.<List<String>>read(due, "$.helpers[*].person.name")).containsExactly("Alex", "Astrid");
        assertThat(JsonPath.<List<String>>read(due, "$.helpers[*].state")).containsExactly("accepted", "accepted");
        assertThat(JsonPath.<Boolean>read(due, "$.sharesDue")).isTrue();
        assertThat(JsonPath.<Boolean>read(due, "$.ready")).isFalse();
        assertThat(JsonPath.<Boolean>read(fetch("/v1/vault/attention", nora), "$.sharesDue"))
                .isTrue();
        String ready = shares(nora, 200, a, b);
        assertThat(JsonPath.<Boolean>read(ready, "$.ready")).isTrue();
        assertThat(JsonPath.<Boolean>read(ready, "$.sharesDue")).isFalse();
        assertThat(JsonPath.<List<Boolean>>read(ready, "$.helpers[*].hasShare")).containsExactly(true, true);
        assertThat(JsonPath.<Integer>read(ready, "$.needed")).isEqualTo(2);
        // The same helper twice, a share that isn't scrambled, someone else's helper: refused.
        assertThat(code(shares(nora, 400, a, a))).isEqualTo("not_a_helper");
        assertThat(code(send(
                        HttpMethod.PUT,
                        "/v1/vault/helpers/shares",
                        nora,
                        "{\"shares\":[{\"helperId\":\"%s\",\"sealedShare\":\"half of my key\"},{\"helperId\":\"%s\",\"sealedShare\":\"%s\"}]}"
                                .formatted(a, b, sealed(90)),
                        400)))
                .isEqualTo("not_sealed");
        send(HttpMethod.PUT, "/v1/vault/helpers/shares", alex, "{\"shares\":[]}", 400);

        // Astrid steps down later: her share is thrown away, and one helper is not enough.
        answer(astrid, b, false, 200);
        String after = fetch("/v1/vault/helpers", nora);
        assertThat(JsonPath.<List<Boolean>>read(after, "$.helpers[*].hasShare")).containsExactly(true, false);
        assertThat(JsonPath.<Boolean>read(after, "$.ready")).isFalse();
        // Only Nora removes a helper from her list.
        send(HttpMethod.DELETE, "/v1/vault/helpers/" + a, alex, null, 404);
        send(HttpMethod.DELETE, "/v1/vault/helpers/" + a, nora, null, 204);
        assertThat(fetch("/v1/vault/helping", alex)).isEqualTo("[]");
        answer(alex, a, true, 404);
    }

    @Test
    void onlySomeoneFromYourCirclesWithAVaultCanBeAHelperAndFiveIsTheMost() throws Exception {
        String kai = person("Kai");
        String kaiId = join(nora, family, kai); // no Vault
        String mia = addMember(nora, family, "Mia", "child");
        String noraId = JsonPath.read(fetch("/v1/circles/" + family, nora), "$.myMemberId");

        for (String notThem : List.of(mia, noraId, id())) {
            assertThat(code(send(
                            HttpMethod.POST,
                            "/v1/vault/helpers",
                            nora,
                            "{\"clientId\":\"%s\",\"memberId\":\"%s\"}".formatted(id(), notThem),
                            400)))
                    .isEqualTo("not_in_circle");
        }
        assertThat(code(send(
                        HttpMethod.POST,
                        "/v1/vault/helpers",
                        nora,
                        "{\"clientId\":\"%s\",\"memberId\":\"%s\"}".formatted(id(), kaiId),
                        409)))
                .isEqualTo("they_have_no_vault");
        // And someone without a Vault of their own asks nobody.
        send(
                HttpMethod.POST,
                "/v1/vault/helpers",
                kai,
                "{\"clientId\":\"%s\",\"memberId\":\"%s\"}".formatted(id(), alexId),
                409);

        ask(nora, alexId);
        ask(nora, astridId);
        for (String name : List.of("Lea", "Lena", "Ana")) {
            String more = person(name);
            vault(more);
            ask(nora, join(nora, family, more));
        }
        vault(kai);
        assertThat(code(send(
                        HttpMethod.POST,
                        "/v1/vault/helpers",
                        nora,
                        "{\"clientId\":\"%s\",\"memberId\":\"%s\"}".formatted(id(), kaiId),
                        409)))
                .isEqualTo("too_many_helpers");
        assertThat(JsonPath.<Integer>read(fetch("/v1/vault/helpers", nora), "$.helpers.length()"))
                .isEqualTo(5);
    }

    @Test
    void aShareIsHandedToItsHelperOnlyWhileARecoveryItsOwnerStartedIsOpen() throws Exception {
        phone(nora, "noras-old-phone");
        phone(nora, "noras-new-phone");
        phone(alex, "alexs-phone");
        String[] helpers = twoHelpers();
        String alexShare = jdbc.sql("select sealed_share from vault_helpers where id = cast(:id as uuid)")
                .param("id", helpers[0])
                .query(String.class)
                .single();

        // No recovery: the share stays where it is, whoever asks.
        assertThat(code(send(HttpMethod.GET, "/v1/vault/helping/" + helpers[0] + "/share", alex, null, 409)))
                .isEqualTo("no_recovery");
        assertThat(fetch("/v1/vault/helping", alex)).doesNotContain(alexShare);
        assertThat(fetch("/v1/vault/helpers", nora)).doesNotContain(alexShare);
        assertThat(JsonPath.<Object>read(fetch("/v1/vault/attention", nora), "$.recovery"))
                .isNull();

        String tempKey = sealed(32);
        String started = send(
                HttpMethod.POST,
                "/v1/vault/recoveries",
                nora,
                "{\"clientId\":\"%s\",\"tempPublicKey\":\"%s\"}".formatted(id(), tempKey),
                201);
        String recovery = JsonPath.read(started, "$.id");
        assertThat(JsonPath.<String>read(started, "$.state")).isEqualTo("open");
        assertThat(Duration.between(Instant.now(), Instant.parse(JsonPath.<String>read(started, "$.lapsesAt"))))
                .isBetween(Duration.ofDays(6), Duration.ofDays(8));
        assertThat(JsonPath.<Integer>read(started, "$.needed")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(started, "$.given")).isZero();

        // Nora is told on every phone, so a recovery she didn't start can't go unnoticed; and it shows in the app.
        assertThat(pushedTo("noras-old-phone")).contains("Someone is getting back into your Vault");
        assertThat(pushedTo("noras-new-phone")).contains("Someone is getting back into your Vault");
        assertThat(pushedTo("alexs-phone")).contains("Nora needs your help");
        assertThat(JsonPath.<String>read(fetch("/v1/vault/attention", nora), "$.recovery.id"))
                .isEqualTo(recovery);
        assertThat(JsonPath.<String>read(fetch("/v1/vault/attention", alex), "$.helpNeeded[0].recovery.recoveryId"))
                .isEqualTo(recovery);

        // Now the helper is handed their own share, and the temporary key to seal it to again. Nobody else is.
        String toPassOn = fetch("/v1/vault/helping/" + helpers[0] + "/share", alex);
        assertThat(JsonPath.<String>read(toPassOn, "$.sealedShare")).isEqualTo(alexShare);
        assertThat(JsonPath.<String>read(toPassOn, "$.tempPublicKey")).isEqualTo(tempKey);
        assertThat(JsonPath.<String>read(toPassOn, "$.recoveryId")).isEqualTo(recovery);
        send(HttpMethod.GET, "/v1/vault/helping/" + helpers[0] + "/share", astrid, null, 404);
        send(HttpMethod.GET, "/v1/vault/helping/" + helpers[0] + "/share", nora, null, 404);
        send(HttpMethod.GET, "/v1/vault/recoveries/" + recovery, alex, null, 404);

        // One helper has helped: not enough, and nothing is handed to the new phone yet.
        String alexs = sealed(90);
        send(
                HttpMethod.PUT,
                "/v1/vault/helping/" + helpers[0] + "/share",
                alex,
                "{\"recoveryId\":\"%s\",\"resealedShare\":\"%s\"}".formatted(recovery, alexs),
                200);
        String one = fetch("/v1/vault/recoveries/" + recovery, nora);
        assertThat(JsonPath.<Integer>read(one, "$.given")).isEqualTo(1);
        assertThat(JsonPath.<Boolean>read(one, "$.ready")).isFalse();
        assertThat(JsonPath.<List<Boolean>>read(one, "$.helpers[*].given")).containsExactly(true, false);
        assertThat(one).doesNotContain(alexs);
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/vault/attention", alex), "$.helpNeeded"))
                .isEmpty();

        // The second helps: the new phone fetches both.
        passOn(astrid, helpers[1], recovery, 200);
        String both = fetch("/v1/vault/recoveries/" + recovery, nora);
        assertThat(JsonPath.<Boolean>read(both, "$.ready")).isTrue();
        assertThat(JsonPath.<String>read(both, "$.helpers[0].resealedShare")).isEqualTo(alexs);
        assertThat(JsonPath.<String>read(both, "$.helpers[1].resealedShare")).isNotEmpty();
        assertThat(JsonPath.<String>read(both, "$.tempPublicKey")).isEqualTo(tempKey);
        assertThat(pushedTo("noras-new-phone")).contains("Your helpers have helped");

        // Finished: closed, the passed-on shares are thrown away, and the helpers' shares stay put again.
        String done = send(HttpMethod.POST, "/v1/vault/recoveries/" + recovery + "/finish", nora, null, 200);
        assertThat(JsonPath.<String>read(done, "$.state")).isEqualTo("done");
        assertThat(done).doesNotContain(alexs);
        assertThat(jdbc.sql("select count(*) from vault_recovery_shares")
                        .query(Integer.class)
                        .single())
                .isZero();
        assertThat(code(send(HttpMethod.GET, "/v1/vault/helping/" + helpers[0] + "/share", alex, null, 409)))
                .isEqualTo("no_recovery");
        assertThat(code(passOn(alex, helpers[0], recovery, 409))).isEqualTo("recovery_over");
        // Finishing twice is fine; cancelling what is finished isn't a thing.
        send(HttpMethod.POST, "/v1/vault/recoveries/" + recovery + "/finish", nora, null, 200);
        assertThat(code(send(HttpMethod.DELETE, "/v1/vault/recoveries/" + recovery, nora, null, 409)))
                .isEqualTo("recovery_over");
    }

    @Test
    void itTakesTwoHelpersAndOnlyOneRecoveryCanBeOpenAndItsOwnerCanCancelItFromAnyPhone() throws Exception {
        // Without two helpers who keep a share there is no way in, and it says so.
        assertThat(code(start(nora, 409))).isEqualTo("not_enough_helpers");
        String a = ask(nora, alexId);
        answer(alex, a, true, 200);
        assertThat(code(start(nora, 409))).isEqualTo("not_enough_helpers");
        String b = ask(nora, astridId);
        answer(astrid, b, true, 200);
        assertThat(code(start(nora, 409))).isEqualTo("not_enough_helpers"); // they said yes, but hold no share yet
        shares(nora, 200, a, b);

        String body = "{\"clientId\":\"%s\",\"tempPublicKey\":\"%s\"}".formatted(id(), sealed(32));
        String first = JsonPath.read(send(HttpMethod.POST, "/v1/vault/recoveries", nora, body, 201), "$.id");
        // The same request again is the same recovery; another one is refused while this one is open.
        assertThat(JsonPath.<String>read(send(HttpMethod.POST, "/v1/vault/recoveries", nora, body, 201), "$.id"))
                .isEqualTo(first);
        assertThat(code(start(nora, 409))).isEqualTo("recovery_open");
        assertThat(jdbc.sql("select count(*) from vault_recoveries")
                        .query(Integer.class)
                        .single())
                .isEqualTo(1);
        // A key that isn't a key, and someone with no Vault at all.
        send(
                HttpMethod.POST,
                "/v1/vault/recoveries",
                alex,
                "{\"clientId\":\"%s\",\"tempPublicKey\":\"mine\"}".formatted(id()),
                400);
        String kai = person("Kai");
        assertThat(code(start(kai, 409))).isEqualTo("no_vault");

        // A share is passed on for the recovery the helper was shown, not for any other.
        assertThat(code(passOn(alex, a, id(), 409))).isEqualTo("no_recovery");
        passOn(alex, a, first, 200);

        // Only its owner cancels it. Cancelled, it hands out nothing and takes nothing.
        send(HttpMethod.DELETE, "/v1/vault/recoveries/" + first, alex, null, 404);
        send(HttpMethod.DELETE, "/v1/vault/recoveries/" + first, nora, null, 204);
        send(HttpMethod.DELETE, "/v1/vault/recoveries/" + first, nora, null, 204);
        assertThat(JsonPath.<String>read(fetch("/v1/vault/recoveries/" + first, nora), "$.state"))
                .isEqualTo("cancelled");
        assertThat(jdbc.sql("select count(*) from vault_recovery_shares")
                        .query(Integer.class)
                        .single())
                .isZero();
        assertThat(code(passOn(astrid, b, first, 409))).isEqualTo("recovery_over");
        assertThat(code(send(HttpMethod.GET, "/v1/vault/helping/" + b + "/share", astrid, null, 409)))
                .isEqualTo("no_recovery");
        assertThat(code(send(HttpMethod.POST, "/v1/vault/recoveries/" + first + "/finish", nora, null, 409)))
                .isEqualTo("recovery_over");

        // And a new one can be started.
        String second = JsonPath.read(start(nora, 201), "$.id");
        assertThat(second).isNotEqualTo(first);
        assertThat(JsonPath.<Integer>read(fetch("/v1/vault/recoveries/" + second, nora), "$.given"))
                .isZero();
    }

    @Test
    void aRecoveryLapsesAfterSevenDays() throws Exception {
        String[] helpers = twoHelpers();
        String recovery = JsonPath.read(start(nora, 201), "$.id");
        passOn(alex, helpers[0], recovery, 200);

        // Six days in, it is still open.
        jdbc.sql("update vault_recoveries set lapses_at = now() + interval '1 day'")
                .update();
        assertThat(recoveries.lapseDue()).isZero();
        fetch("/v1/vault/helping/" + helpers[1] + "/share", astrid);

        // Seven days: it ends by itself, whoever looks first, or nobody.
        jdbc.sql("update vault_recoveries set lapses_at = now() - interval '1 minute'")
                .update();
        assertThat(recoveries.lapseDue()).isEqualTo(1);
        assertThat(recoveries.lapseDue()).isZero();
        String lapsed = fetch("/v1/vault/recoveries/" + recovery, nora);
        assertThat(JsonPath.<String>read(lapsed, "$.state")).isEqualTo("lapsed");
        assertThat(JsonPath.<Integer>read(lapsed, "$.given")).isZero();
        assertThat(code(send(HttpMethod.GET, "/v1/vault/helping/" + helpers[1] + "/share", astrid, null, 409)))
                .isEqualTo("no_recovery");
        assertThat(code(passOn(astrid, helpers[1], recovery, 409))).isEqualTo("recovery_over");
        assertThat(code(send(HttpMethod.POST, "/v1/vault/recoveries/" + recovery + "/finish", nora, null, 409)))
                .isEqualTo("recovery_over");
        assertThat(code(send(HttpMethod.DELETE, "/v1/vault/recoveries/" + recovery, nora, null, 409)))
                .isEqualTo("recovery_over");
        assertThat(JsonPath.<Object>read(fetch("/v1/vault/attention", nora), "$.recovery"))
                .isNull();

        // Reading one is enough to notice the time is up: no job has to have run.
        String again = JsonPath.read(start(nora, 201), "$.id");
        jdbc.sql("update vault_recoveries set lapses_at = now() - interval '1 minute' where state = 'open'")
                .update();
        assertThat(JsonPath.<String>read(fetch("/v1/vault/recoveries/" + again, nora), "$.state"))
                .isEqualTo("lapsed");
    }

    @Test
    void aNewVaultKeyThrowsEveryShareAwayAndClosesTheRecovery() throws Exception {
        String[] helpers = twoHelpers();
        String recovery = JsonPath.read(start(nora, 201), "$.id");
        passOn(alex, helpers[0], recovery, 200);
        passOn(astrid, helpers[1], recovery, 200);

        send(
                HttpMethod.PUT,
                "/v1/vault/key",
                nora,
                "{\"wrappedPrivateKey\":\"%s\",\"salt\":\"%s\",\"kdf\":{\"n\":32768,\"r\":8,\"p\":1}}"
                        .formatted(sealed(73), sealed(16)),
                200);

        assertThat(JsonPath.<String>read(fetch("/v1/vault/recoveries/" + recovery, nora), "$.state"))
                .isEqualTo("done");
        assertThat(jdbc.sql("select count(*) from vault_helpers where sealed_share is not null")
                        .query(Integer.class)
                        .single())
                .isZero();
        assertThat(jdbc.sql("select count(*) from vault_recovery_shares")
                        .query(Integer.class)
                        .single())
                .isZero();
        // The helpers are still helpers; Nora's phone is told to split the new key for them.
        String after = fetch("/v1/vault/helpers", nora);
        assertThat(JsonPath.<List<String>>read(after, "$.helpers[*].state")).containsExactly("accepted", "accepted");
        assertThat(JsonPath.<Boolean>read(after, "$.sharesDue")).isTrue();
        assertThat(JsonPath.<Boolean>read(after, "$.ready")).isFalse();
        assertThat(code(start(nora, 409))).isEqualTo("not_enough_helpers");
    }

    @Test
    void aHelperWhoLeavesEveryCircleTheyShareCanNoLongerHelpAndADeletedAccountTakesItsPartAlong() throws Exception {
        String kai = person("Kai");
        vault(kai);
        String kaiId = join(nora, family, kai);
        String[] helpers = twoHelpers();
        String k = ask(nora, kaiId);
        answer(kai, k, true, 200);
        shares(nora, 200, helpers[0], helpers[1], k);
        String recovery = JsonPath.read(start(nora, 201), "$.id");

        // Kai is taken out of the family: to him it isn't there any more.
        send(HttpMethod.DELETE, "/v1/members/" + kaiId, nora, null, 204);
        send(HttpMethod.GET, "/v1/vault/helping/" + k + "/share", kai, null, 404);
        assertThat(code(passOn(kai, k, recovery, 404))).isEqualTo("not_found");
        assertThat(fetch("/v1/vault/helping", kai)).isEqualTo("[]");
        // Two others still count.
        assertThat(JsonPath.<Boolean>read(fetch("/v1/vault/helpers", nora), "$.ready"))
                .isTrue();

        // Astrid deletes her account: her share and her place on the list go with it.
        send(HttpMethod.DELETE, "/v1/me", astrid, null, 200);
        String left = fetch("/v1/vault/helpers", nora);
        assertThat(JsonPath.<List<String>>read(left, "$.helpers[*].person.name"))
                .containsExactly("Alex", "Kai");
        assertThat(JsonPath.<Boolean>read(left, "$.ready")).isFalse();

        // Nora deletes hers: nothing of it is left for anyone.
        send(HttpMethod.DELETE, "/v1/me", nora, null, 200);
        assertThat(fetch("/v1/vault/helping", alex)).isEqualTo("[]");
        for (String table : List.of("vault_helpers", "vault_recoveries", "vault_recovery_shares")) {
            assertThat(jdbc.sql("select count(*) from " + table)
                            .query(Integer.class)
                            .single())
                    .as(table)
                    .isZero();
        }
    }
}
