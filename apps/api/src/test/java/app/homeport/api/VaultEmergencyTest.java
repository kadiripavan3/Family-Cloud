package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.notify.LoggingPushSender;
import app.homeport.api.notify.PushMessage;
import app.homeport.api.vault.EmergencyService;
import app.homeport.api.vault.VaultNotices;
import com.jayway.jsonpath.JsonPath;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

/**
 * "If something happens", through the API: every step of {@code EmergencyState} that is allowed and every one
 * that is not, for the owner, the trusted person and the clock. Time is moved by writing dates into rows.
 */
class VaultEmergencyTest extends VaultTestBase {

    @Autowired
    EmergencyService emergencies;

    @Autowired
    VaultNotices notices;

    @Autowired
    LoggingPushSender pushes;

    private String nora;
    private String alex;
    private String family;
    private String alexId;
    private String bank;
    private String will;

    /** Nora and Alex, each with a Vault, in a family. Nora keeps two things nobody else can see. */
    @BeforeEach
    void theLinds() throws Exception {
        pushes.clear();
        nora = person("Nora");
        alex = person("Alex");
        vault(nora);
        vault(alex);
        family = circle(nora, "family", "The Linds");
        alexId = join(nora, family, alex);
        bank = item(nora, family, "Bank", "login", ",\"site\":\"bank.example\"");
        will = item(nora, family, "Where the will is", "secret");
    }

    private static String escrow(String... items) {
        List<String> keys = new ArrayList<>();
        for (String item : items) {
            keys.add("{\"id\":\"%s\",\"wrappedKey\":\"%s\"}".formatted(item, sealed(105)));
        }
        return "[" + String.join(",", keys) + "]";
    }

    /** Turns it on for Nora with Alex as the person who can ask. Returns Nora's view. */
    private String turnOn(String... items) throws Exception {
        return send(
                HttpMethod.PUT,
                "/v1/vault/emergency",
                nora,
                "{\"trustedMemberId\":\"%s\",\"items\":%s,\"note\":\"%s\",\"noteMine\":\"%s\"}"
                        .formatted(alexId, escrow(items), sealed(300), sealed(300)),
                200);
    }

    /** The id of Nora's emergency access, as Alex finds it. */
    private String entrusted() throws Exception {
        return JsonPath.read(fetch("/v1/vault/entrusted", alex), "$[0].id");
    }

    private void theWaitIsOver() {
        jdbc.sql("update vault_emergencies set opens_at = now() - interval '1 minute' where state = 'asked'")
                .update();
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
    void itIsOffUntilItsOwnerTurnsItOnAndThenTheTrustedPersonKnowsOfItAndSeesNoneOfIt() throws Exception {
        // Off: nothing to switch off twice, nothing to refuse, nothing for Alex.
        String off = fetch("/v1/vault/emergency", nora);
        assertThat(JsonPath.<String>read(off, "$.state")).isEqualTo("off");
        assertThat(JsonPath.<Integer>read(off, "$.waitHours")).isEqualTo(48);
        assertThat(JsonPath.<Object>read(off, "$.trusted")).isNull();
        send(HttpMethod.DELETE, "/v1/vault/emergency", nora, null, 204);
        assertThat(code(send(HttpMethod.POST, "/v1/vault/emergency/refusal", nora, null, 409)))
                .isEqualTo("nothing_asked");
        assertThat(fetch("/v1/vault/entrusted", alex)).isEqualTo("[]");

        String on = turnOn(bank, will);

        assertThat(JsonPath.<String>read(on, "$.state")).isEqualTo("ready");
        assertThat(JsonPath.<String>read(on, "$.trusted.name")).isEqualTo("Alex");
        assertThat(JsonPath.<Integer>read(on, "$.waitHours")).isEqualTo(48);
        assertThat(JsonPath.<List<String>>read(on, "$.items[*].title")).containsExactly("Bank", "Where the will is");
        assertThat(JsonPath.<String>read(on, "$.noteMine")).isNotEmpty();
        assertThat(code(send(HttpMethod.POST, "/v1/vault/emergency/refusal", nora, null, 409)))
                .isEqualTo("nothing_asked");

        // Alex knows he is the one who can ask, and nothing else: no titles, no count, no note.
        String theirs = fetch("/v1/vault/entrusted/" + entrusted(), alex);
        assertThat(JsonPath.<String>read(theirs, "$.state")).isEqualTo("ready");
        assertThat(JsonPath.<String>read(theirs, "$.owner.name")).isEqualTo("Nora");
        assertThat(JsonPath.<List<Object>>read(theirs, "$.items")).isEmpty();
        assertThat(JsonPath.<Object>read(theirs, "$.note")).isNull();
        assertThat(theirs).doesNotContain("Bank", "will");
        assertThat(code(send(
                        HttpMethod.POST,
                        "/v1/vault/entrusted/" + entrusted() + "/items/" + bank + "/open",
                        alex,
                        null,
                        403)))
                .isEqualTo("ask_first");
        // And Nora's own things stay hers: emergency access changes nothing about who sees them.
        assertThat(status("/v1/vault/items/" + bank, alex)).isEqualTo(404);
        // It is Nora's to read, not Alex's; and Alex has none of his own.
        assertThat(JsonPath.<String>read(fetch("/v1/vault/emergency", alex), "$.state"))
                .isEqualTo("off");
    }

    @Test
    void theTrustedPersonAsksTheOwnerIsToldOnEveryPhoneAndCanSayNoUntilTheWaitIsOver() throws Exception {
        phone(nora, "noras-phone");
        phone(nora, "noras-tablet");
        phone(alex, "alexs-phone");
        turnOn(bank);
        String id = entrusted();
        assertThat(pushedTo("alexs-phone")).containsExactly("Nora trusts you");

        Instant before = Instant.now();
        String asked = send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/ask", alex, null, 200);

        assertThat(JsonPath.<String>read(asked, "$.state")).isEqualTo("asked");
        Instant opensAt = Instant.parse(JsonPath.read(asked, "$.opensAt"));
        assertThat(Duration.between(before, opensAt)).isBetween(Duration.ofHours(47), Duration.ofHours(49));
        assertThat(pushedTo("noras-phone")).containsExactly("Alex asked to open your Vault");
        assertThat(pushedTo("noras-tablet")).containsExactly("Alex asked to open your Vault");
        // It also shows in the app, whether or not a push arrived.
        String attention = fetch("/v1/vault/attention", nora);
        assertThat(JsonPath.<String>read(attention, "$.emergency.state")).isEqualTo("asked");
        assertThat(JsonPath.<String>read(attention, "$.emergency.trusted.name")).isEqualTo("Alex");
        assertThat(JsonPath.<String>read(fetch("/v1/vault/attention", alex), "$.entrusted[0].owner.name"))
                .isEqualTo("Nora");

        // Before the time, Alex reads nothing, and still sees none of what would open.
        assertThat(code(send(
                        HttpMethod.POST, "/v1/vault/entrusted/" + id + "/items/" + bank + "/open", alex, null, 403)))
                .isEqualTo("not_yet");
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/vault/entrusted/" + id, alex), "$.items"))
                .isEmpty();

        // Asking again doesn't start the clock again, and doesn't tell Nora again.
        jdbc.sql("update vault_emergencies set opens_at = opens_at - interval '10 hours'")
                .update();
        String again = send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/ask", alex, null, 200);
        assertThat(Instant.parse(JsonPath.<String>read(again, "$.opensAt"))).isBefore(opensAt.minusSeconds(9 * 3600));
        assertThat(pushedTo("noras-phone")).hasSize(1);

        // Nora says no: the request is over, Alex is told, and nothing opens when the time comes.
        String refused = send(HttpMethod.POST, "/v1/vault/emergency/refusal", nora, null, 200);
        assertThat(JsonPath.<String>read(refused, "$.state")).isEqualTo("ready");
        assertThat(JsonPath.<String>read(refused, "$.refusedAt")).isNotNull();
        assertThat(JsonPath.<Object>read(refused, "$.opensAt")).isNull();
        assertThat(pushedTo("alexs-phone")).containsExactly("Nora trusts you", "Nora said no");
        assertThat(emergencies.openDue()).isZero();
        assertThat(code(send(
                        HttpMethod.POST, "/v1/vault/entrusted/" + id + "/items/" + bank + "/open", alex, null, 403)))
                .isEqualTo("ask_first");
        assertThat(JsonPath.<String>read(fetch("/v1/vault/entrusted/" + id, alex), "$.refusedAt"))
                .isNotNull();
        assertThat(code(send(HttpMethod.POST, "/v1/vault/emergency/refusal", nora, null, 409)))
                .isEqualTo("nothing_asked");
        assertThat(JsonPath.<Object>read(fetch("/v1/vault/attention", nora), "$.emergency"))
                .isNull();

        // A no ends that request, not the arrangement: Alex can ask again another day, and the wait starts afresh.
        String anew = send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/ask", alex, null, 200);
        assertThat(JsonPath.<String>read(anew, "$.state")).isEqualTo("asked");
        assertThat(Instant.parse(JsonPath.<String>read(anew, "$.opensAt"))).isAfter(opensAt.minusSeconds(60));
        assertThat(pushedTo("noras-phone")).hasSize(2);
    }

    @Test
    void whenTheWaitIsOverWithoutANoTheEscrowIsHandedToTheTrustedPersonAndToNobodyElse() throws Exception {
        String kai = person("Kai");
        vault(kai);
        join(nora, family, kai);
        phone(nora, "noras-phone");
        phone(alex, "alexs-phone");
        String on = send(
                HttpMethod.PUT,
                "/v1/vault/emergency",
                nora,
                "{\"trustedMemberId\":\"%s\",\"waitHours\":24,\"items\":%s,\"note\":\"%s\",\"noteMine\":\"%s\"}"
                        .formatted(alexId, escrow(bank, will), sealed(300), sealed(300)),
                200);
        assertThat(JsonPath.<Integer>read(on, "$.waitHours")).isEqualTo(24);
        String escrowKey = jdbc.sql("select wrapped_key from vault_emergency_items where thing_id = cast(:id as uuid)")
                .param("id", bank)
                .query(String.class)
                .single();
        String note = jdbc.sql("select note from vault_emergencies")
                .query(String.class)
                .single();
        String id = entrusted();
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/ask", alex, null, 200);

        // A minute before the time: nothing.
        jdbc.sql("update vault_emergencies set opens_at = now() + interval '1 minute'")
                .update();
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/items/" + bank + "/open", alex, null, 403);
        assertThat(emergencies.openDue()).isZero();

        theWaitIsOver();

        String open = fetch("/v1/vault/entrusted/" + id, alex);
        assertThat(JsonPath.<String>read(open, "$.state")).isEqualTo("open");
        assertThat(JsonPath.<String>read(open, "$.note")).isEqualTo(note);
        assertThat(JsonPath.<List<String>>read(open, "$.items[*].title")).containsExactly("Bank", "Where the will is");
        assertThat(JsonPath.<String>read(open, "$.items[0].site")).isEqualTo("bank.example");
        assertThat(pushedTo("alexs-phone")).contains("Nora's Vault has opened to you");
        assertThat(pushedTo("noras-phone")).contains("Your Vault has opened to Alex");

        // Each item: its ciphertext as it stands now, and its key as Nora's phone wrapped it for Alex.
        String current = JsonPath.read(open(nora, bank, 200), "$.ciphertext");
        String handed =
                send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/items/" + bank + "/open", alex, null, 200);
        assertThat(JsonPath.<String>read(handed, "$.ciphertext")).isEqualTo(current);
        assertThat(JsonPath.<String>read(handed, "$.wrappedKey")).isEqualTo(escrowKey);
        assertThat(JsonPath.<String>read(handed, "$.title")).isEqualTo("Bank");
        // That it was handed over is written down.
        assertThat(JsonPath.<String>read(fetch("/v1/vault/entrusted/" + id, alex), "$.items[0].openedAt"))
                .isNotNull();
        assertThat(JsonPath.<Object>read(fetch("/v1/vault/entrusted/" + id, alex), "$.items[1].openedAt"))
                .isNull();
        assertThat(JsonPath.<String>read(fetch("/v1/vault/emergency", nora), "$.openedAt"))
                .isNotNull();

        // Nobody else: not someone else in the family, not for a thing that wasn't chosen.
        send(HttpMethod.GET, "/v1/vault/entrusted/" + id, kai, null, 404);
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/ask", kai, null, 404);
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/items/" + bank + "/open", kai, null, 404);
        String other = item(nora, family, "Diary", "secret");
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/items/" + other + "/open", alex, null, 404);
        // It opens what was chosen, through this door only: the item itself is still not shared with Alex.
        assertThat(status("/v1/vault/items/" + bank, alex)).isEqualTo(404);

        // Too late for a no; asking again changes nothing; switching it off stops it from here on.
        assertThat(code(send(HttpMethod.POST, "/v1/vault/emergency/refusal", nora, null, 409)))
                .isEqualTo("already_open");
        assertThat(JsonPath.<String>read(
                        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/ask", alex, null, 200), "$.state"))
                .isEqualTo("open");
        send(HttpMethod.DELETE, "/v1/vault/emergency", nora, null, 204);
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/items/" + will + "/open", alex, null, 404);
        assertThat(fetch("/v1/vault/entrusted", alex)).isEqualTo("[]");
        assertThat(jdbc.sql("select count(*) from vault_emergency_items")
                        .query(Integer.class)
                        .single())
                .isZero();
        assertThat(pushedTo("alexs-phone")).contains("Nora switched it off");
    }

    @Test
    void anythingTheOwnerChangesEndsARunningRequestAndThrowsTheOldEscrowAway() throws Exception {
        String kai = person("Kai");
        vault(kai);
        String kaiId = join(nora, family, kai);
        phone(alex, "alexs-phone");
        turnOn(bank, will);
        String id = entrusted();
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/ask", alex, null, 200);

        // Nora is at her phone and changes what opens: the request is over, the clock is gone.
        String changed = turnOn(will);
        assertThat(JsonPath.<String>read(changed, "$.state")).isEqualTo("ready");
        assertThat(JsonPath.<Object>read(changed, "$.askedAt")).isNull();
        assertThat(JsonPath.<List<String>>read(changed, "$.items[*].title")).containsExactly("Where the will is");
        assertThat(pushedTo("alexs-phone")).contains("Nora changed their plans");
        theWaitIsOver();
        assertThat(emergencies.openDue()).isZero();
        assertThat(code(send(
                        HttpMethod.POST, "/v1/vault/entrusted/" + id + "/items/" + will + "/open", alex, null, 403)))
                .isEqualTo("ask_first");

        // The same once it has opened: a change closes it again, and what was not yet handed over never is.
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/ask", alex, null, 200);
        theWaitIsOver();
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/items/" + will + "/open", alex, null, 200);
        send(
                HttpMethod.PUT,
                "/v1/vault/emergency",
                nora,
                "{\"trustedMemberId\":\"%s\",\"items\":%s}".formatted(kaiId, escrow(bank)),
                200);
        // Another person now: to Alex it isn't there any more, and Kai starts from "ready".
        send(HttpMethod.GET, "/v1/vault/entrusted/" + id, alex, null, 404);
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/items/" + will + "/open", alex, null, 404);
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/ask", alex, null, 404);
        String kais = fetch("/v1/vault/entrusted", kai);
        assertThat(JsonPath.<List<String>>read(kais, "$[*].state")).containsExactly("ready");
        assertThat(JsonPath.<String>read(fetch("/v1/vault/emergency", nora), "$.trusted.name"))
                .isEqualTo("Kai");
    }

    @Test
    void theClockOpensOnlyWhatWasAskedForAndTheJobDoesItWithNobodyLooking() throws Exception {
        turnOn(bank);
        String id = entrusted();

        // Time alone opens nothing.
        jdbc.sql("update vault_emergencies set created_at = now() - interval '90 days'")
                .update();
        assertThat(emergencies.openDue()).isZero();
        assertThat(JsonPath.<String>read(fetch("/v1/vault/emergency", nora), "$.state"))
                .isEqualTo("ready");

        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/ask", alex, null, 200);
        assertThat(emergencies.openDue()).isZero();
        theWaitIsOver();
        assertThat(emergencies.openDue()).isEqualTo(1);
        assertThat(emergencies.openDue()).isZero();
        assertThat(jdbc.sql("select state from vault_emergencies")
                        .query(String.class)
                        .single())
                .isEqualTo("open");
        assertThat(jdbc.sql("select count(*) from pushes where kind = 'vault_emergency_open'")
                        .query(Integer.class)
                        .single())
                .isEqualTo(2);
    }

    @Test
    void onlySomeoneFromYourCirclesWithAVaultCanBeTrustedAndOnlyYourOwnThingsOpen() throws Exception {
        String kai = person("Kai");
        String kaiId = join(nora, family, kai); // no Vault yet
        String stranger = person("Stranger");
        vault(stranger);
        String elsewhere = circle(stranger, "solo", "Elsewhere");
        String strangerId = JsonPath.read(fetch("/v1/circles/" + elsewhere, stranger), "$.myMemberId");
        String noraId = JsonPath.read(fetch("/v1/circles/" + family, nora), "$.myMemberId");
        String mia = addMember(nora, family, "Mia", "child");
        String alexs = item(alex, family, "Alex's bank", "login");
        share(alex, alexs, "some", 200, with(noraId, "change"));
        String body = "{\"trustedMemberId\":\"%s\",\"items\":%s%s}";

        for (String notThem : List.of(strangerId, noraId, mia, id())) {
            assertThat(code(send(
                            HttpMethod.PUT,
                            "/v1/vault/emergency",
                            nora,
                            body.formatted(notThem, escrow(bank), ""),
                            400)))
                    .isEqualTo("not_in_circle");
        }
        String noVault =
                send(HttpMethod.PUT, "/v1/vault/emergency", nora, body.formatted(kaiId, escrow(bank), ""), 409);
        assertThat(code(noVault)).isEqualTo("they_have_no_vault");
        assertThat(noVault).contains("Kai");

        // Only her own items: not one Alex shared with her, not one that isn't there, not the same one twice.
        for (String items : List.of(escrow(alexs), escrow(id()), escrow(bank, bank))) {
            assertThat(code(send(HttpMethod.PUT, "/v1/vault/emergency", nora, body.formatted(alexId, items, ""), 400)))
                    .isEqualTo("invalid_items");
        }
        assertThat(code(send(
                        HttpMethod.PUT,
                        "/v1/vault/emergency",
                        nora,
                        body.formatted(alexId, "[{\"id\":\"" + bank + "\",\"wrappedKey\":\"the key itself\"}]", ""),
                        400)))
                .isEqualTo("not_sealed");
        // Between a day and a week to say no.
        for (int hours : List.of(23, 169, 0)) {
            send(
                    HttpMethod.PUT,
                    "/v1/vault/emergency",
                    nora,
                    body.formatted(alexId, escrow(bank), ",\"waitHours\":" + hours),
                    400);
        }
        // The note is sealed twice or not at all, and something has to open.
        assertThat(code(send(
                        HttpMethod.PUT,
                        "/v1/vault/emergency",
                        nora,
                        body.formatted(alexId, escrow(bank), ",\"note\":\"" + sealed(40) + "\""),
                        400)))
                .isEqualTo("invalid_note");
        assertThat(code(send(
                        HttpMethod.PUT,
                        "/v1/vault/emergency",
                        nora,
                        body.formatted(alexId, escrow(bank), ",\"note\":\"Dear Alex\",\"noteMine\":\"Dear Alex\""),
                        400)))
                .isEqualTo("not_sealed");
        assertThat(code(send(HttpMethod.PUT, "/v1/vault/emergency", nora, body.formatted(alexId, "[]", ""), 400)))
                .isEqualTo("nothing_chosen");
        assertThat(JsonPath.<String>read(fetch("/v1/vault/emergency", nora), "$.state"))
                .isEqualTo("off");

        // Someone without a Vault can't keep an escrow either.
        send(HttpMethod.PUT, "/v1/vault/emergency", kai, body.formatted(alexId, "[]", ""), 409);
        // A week is fine, and so is a note alone.
        String on = send(
                HttpMethod.PUT,
                "/v1/vault/emergency",
                nora,
                "{\"trustedMemberId\":\"%s\",\"waitHours\":168,\"note\":\"%s\",\"noteMine\":\"%s\"}"
                        .formatted(alexId, sealed(40), sealed(40)),
                200);
        assertThat(JsonPath.<Integer>read(on, "$.waitHours")).isEqualTo(168);
    }

    @Test
    void whenTheOwnerDeletesTheirAccountEverythingEnds() throws Exception {
        turnOn(bank, will);
        String id = entrusted();
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/ask", alex, null, 200);
        theWaitIsOver();
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/items/" + bank + "/open", alex, null, 200);

        send(HttpMethod.DELETE, "/v1/me", nora, null, 200);

        assertThat(fetch("/v1/vault/entrusted", alex)).isEqualTo("[]");
        send(HttpMethod.GET, "/v1/vault/entrusted/" + id, alex, null, 404);
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/items/" + will + "/open", alex, null, 404);
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/ask", alex, null, 404);
        for (String table : List.of("vault_emergencies", "vault_emergency_items", "vault_items", "vault_grants")) {
            assertThat(jdbc.sql("select count(*) from " + table)
                            .query(Integer.class)
                            .single())
                    .as(table)
                    .isZero();
        }
        assertThat(jdbc.sql("select count(*) from vaults").query(Integer.class).single())
                .isEqualTo(1);
    }

    @Test
    void whenTheTrustedPersonLeavesOrDeletesTheirAccountTheyCanNeitherAskNorRead() throws Exception {
        turnOn(bank);
        String id = entrusted();
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/ask", alex, null, 200);
        theWaitIsOver();

        // Alex is taken out of the only circle the two share: the open escrow is no longer handed to him.
        send(HttpMethod.DELETE, "/v1/members/" + alexId, nora, null, 204);
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/items/" + bank + "/open", alex, null, 404);
        send(HttpMethod.GET, "/v1/vault/entrusted/" + id, alex, null, 404);
        assertThat(fetch("/v1/vault/entrusted", alex)).isEqualTo("[]");
        // Nora sees that the person she chose is out of reach.
        assertThat(JsonPath.<Object>read(fetch("/v1/vault/emergency", nora), "$.trusted.memberId"))
                .isNull();

        // And with his account gone, the arrangement is gone.
        send(HttpMethod.DELETE, "/v1/me", alex, null, 200);
        assertThat(JsonPath.<String>read(fetch("/v1/vault/emergency", nora), "$.state"))
                .isEqualTo("off");
    }

    @Test
    void anItemThatGetsANewKeyHasToBringItsNewEscrowKeyAlong() throws Exception {
        String kai = person("Kai");
        vault(kai);
        String kaiId = join(nora, family, kai);
        share(nora, bank, "some", 200, with(alexId, "see"), with(kaiId, "see"));
        turnOn(bank);
        String id = entrusted();
        String newCiphertext = sealed(200);
        String newEscrowKey = sealed(105);
        String forKai = sealed(105);
        String rotation =
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"see\",\"wrappedKey\":\"%s\"}],"
                        + "\"rotation\":{\"version\":%d,\"ciphertext\":\"%s\",\"myWrappedKey\":\"%s\"%s}}";

        // Alex is removed and the item gets a new key. Without the escrow's share of it, it is refused whole.
        assertThat(code(send(
                        HttpMethod.PUT,
                        "/v1/vault/items/" + bank + "/sharing",
                        nora,
                        rotation.formatted(kaiId, forKai, 1, newCiphertext, sealed(105), ""),
                        400)))
                .isEqualTo("escrow_key_needed");
        assertThat(JsonPath.<Integer>read(fetch("/v1/vault/items/" + bank, nora), "$.version"))
                .isEqualTo(1);
        open(alex, bank, 200);
        // Built on a version that is no longer the latest, too.
        assertThat(code(send(
                        HttpMethod.PUT,
                        "/v1/vault/items/" + bank + "/sharing",
                        nora,
                        rotation.formatted(
                                kaiId,
                                forKai,
                                7,
                                newCiphertext,
                                sealed(105),
                                ",\"emergencyWrappedKey\":\"" + newEscrowKey + "\""),
                        409)))
                .isEqualTo("changed_meanwhile");

        String myNewKey = sealed(105);
        send(
                HttpMethod.PUT,
                "/v1/vault/items/" + bank + "/sharing",
                nora,
                rotation.formatted(
                        kaiId, forKai, 1, newCiphertext, myNewKey, ",\"emergencyWrappedKey\":\"" + newEscrowKey + "\""),
                200);

        // Everyone who keeps access holds the new key; Alex holds nothing.
        String noras = open(nora, bank, 200);
        assertThat(JsonPath.<String>read(noras, "$.ciphertext")).isEqualTo(newCiphertext);
        assertThat(JsonPath.<String>read(noras, "$.wrappedKey")).isEqualTo(myNewKey);
        assertThat(JsonPath.<Integer>read(noras, "$.version")).isEqualTo(2);
        assertThat(JsonPath.<String>read(open(kai, bank, 200), "$.wrappedKey")).isEqualTo(forKai);
        open(alex, bank, 404);

        // And the escrow opens the item as it is now.
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/ask", alex, null, 200);
        theWaitIsOver();
        String handed =
                send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/items/" + bank + "/open", alex, null, 200);
        assertThat(JsonPath.<String>read(handed, "$.ciphertext")).isEqualTo(newCiphertext);
        assertThat(JsonPath.<String>read(handed, "$.wrappedKey")).isEqualTo(newEscrowKey);

        // Someone who keeps access but got no new key waits for one: the old one opens nothing.
        String second = item(nora, family, "Insurance", "login");
        share(nora, second, "some", 200, with(kaiId, "see"));
        send(
                HttpMethod.PUT,
                "/v1/vault/items/" + second + "/sharing",
                nora,
                "{\"audience\":\"some\",\"people\":[%s],\"rotation\":{\"version\":1,\"ciphertext\":\"%s\",\"myWrappedKey\":\"%s\"}}"
                        .formatted(named(kaiId, "see"), sealed(200), sealed(105)),
                200);
        assertThat(code(open(kai, second, 403))).isEqualTo("no_key_yet");
        assertThat(JsonPath.<List<String>>read(fetch("/v1/vault/waiting", nora), "$[*].title"))
                .containsExactly("Insurance");
    }
}
