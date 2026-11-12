package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import app.homeport.api.VaultPhone.Shamir;
import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.MvcResult;

/**
 * The whole protocol of docs/07-vault-protocol.md, played against the API with real keys: {@link VaultPhone}
 * stands in for the app and does everything the document says a phone does. If these pass, the document can
 * be built: what one phone seals another can open, through nothing but the API's routes.
 *
 * <p>Every request of every test here is written down, and after each test neither any request nor any row
 * the API stored may hold a secret: no password, no note, no item key, no private key, no Vault key, in any
 * spelling. That is the promise "the API never receives it" made checkable.
 */
class VaultProtocolTest extends VaultTestBase {

    private final List<String> requests = new ArrayList<>();
    private final List<String> secrets = new ArrayList<>();

    @Override
    protected String send(HttpMethod method, String path, String token, String json, int expected) throws Exception {
        requests.add(method + " " + path + " " + (json == null ? "" : json));
        return super.send(method, path, token, json, expected);
    }

    /** Remembers something only a phone may know, and returns it. */
    private String secret(String text) {
        secrets.add(text);
        return text;
    }

    private byte[] secret(byte[] key) {
        secrets.addAll(VaultPhone.spellings(key));
        return key;
    }

    private VaultPhone phone(String token) throws Exception {
        VaultPhone phone = VaultPhone.create();
        secrets.addAll(phone.secrets());
        send(HttpMethod.PUT, "/v1/vault", token, phone.setUpJson(), 200);
        return phone;
    }

    @AfterEach
    void neitherARequestNorARowHoldsASecret() {
        assertThat(requests).isNotEmpty();
        assertThat(secrets).isNotEmpty();
        StringBuilder stored = new StringBuilder();
        for (String table : List.of(
                "vaults",
                "things",
                "vault_items",
                "vault_grants",
                "vault_emergencies",
                "vault_emergency_items",
                "vault_helpers",
                "vault_recoveries",
                "vault_recovery_shares",
                "pushes",
                "guest_passes",
                "guest_pass_cards")) {
            stored.append(jdbc.sql("select coalesce(string_agg(t::text, ' '), '') from " + table + " t")
                    .query(String.class)
                    .single());
        }
        for (String secret : secrets) {
            assertThat(requests).as("a request carried a secret").noneMatch(r -> r.contains(secret));
            assertThat(stored.toString()).as("the database holds a secret").doesNotContain(secret);
        }
    }

    /** An item as a phone makes it: the secret part sealed with a fresh item key, that key wrapped for its owner. */
    private record Made(String id, byte[] itemKey) {}

    private Made keep(String token, VaultPhone phone, String circle, String title, String category, String inside)
            throws Exception {
        byte[] itemKey = secret(VaultPhone.newKey());
        // Not only the whole text is secret: every password or phrase inside it is.
        for (String part : inside.split("[\"{}:,]")) {
            if (part.length() >= 10) {
                secrets.add(part);
            }
        }
        String id = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/vault/items",
                        token,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\",\"category\":\"%s\",\"ciphertext\":\"%s\",\"wrappedKey\":\"%s\"}"
                                .formatted(
                                        id(),
                                        circle,
                                        title,
                                        category,
                                        VaultPhone.seal(
                                                itemKey, secret(inside).getBytes(StandardCharsets.UTF_8), "item"),
                                        VaultPhone.sealTo(phone.publicKey, itemKey, "item-key")),
                        201),
                "$.id");
        return new Made(id, itemKey);
    }

    /** What a phone does to read an item: be handed it, unwrap the item key with its private key, open the ciphertext. */
    private String read(String token, VaultPhone phone, String item) throws Exception {
        String opened = open(token, item, 200);
        byte[] itemKey = phone.open(JsonPath.read(opened, "$.wrappedKey"), "item-key");
        return new String(
                VaultPhone.open(itemKey, JsonPath.read(opened, "$.ciphertext"), "item"), StandardCharsets.UTF_8);
    }

    /** The public key of a member, as a phone gets it before sealing something for them. */
    private String keyOf(String token, String circle, String memberId) throws Exception {
        String keys = fetch("/v1/circles/" + circle + "/vault-keys", token);
        return JsonPath.<List<String>>read(keys, "$.people[?(@.memberId == '" + memberId + "')].publicKey")
                .get(0);
    }

    private static String person(String memberId, String access, String wrappedKey, String more) {
        return "{\"memberId\":\"%s\",\"access\":\"%s\",\"wrappedKey\":\"%s\"%s}"
                .formatted(memberId, access, wrappedKey, more);
    }

    // ---------- a person's Vault ----------

    @Test
    void aNewPhoneOpensTheVaultWithTheVaultKeyTypedInAndWithNothingElse() throws Exception {
        String nora = person("Nora");
        VaultPhone first = phone(nora);
        String circle = circle(nora, "solo", "Just me");
        Made netflix = keep(nora, first, circle, "Netflix", "login", "{\"password\":\"tr0ub4dor-and-3-horses\"}");

        // A new phone knows the sign-in and the 24 characters the person typed. That is all it needs.
        VaultPhone second = VaultPhone.unlock(first.vaultKey, fetch("/v1/vault", nora));
        assertThat(second.publicKey).isEqualTo(first.publicKey);
        assertThat(read(nora, second, netflix.id())).contains("tr0ub4dor-and-3-horses");

        // The same record with any other Vault key opens nothing: there is no "forgot my key".
        assertThatThrownBy(() -> VaultPhone.unlock(VaultPhone.newVaultKey(), fetch("/v1/vault", nora)))
                .hasMessageContaining("doesn't open");

        // A new Vault key wraps the same private key afresh. The old one stops working, the items stay readable.
        VaultPhone rekeyed = first.withNewVaultKey();
        secrets.addAll(rekeyed.secrets());
        send(HttpMethod.PUT, "/v1/vault/key", nora, "{" + rekeyed.wrappedKeyJson() + "}", 200);
        VaultPhone third = VaultPhone.unlock(rekeyed.vaultKey, fetch("/v1/vault", nora));
        assertThat(read(nora, third, netflix.id())).contains("tr0ub4dor-and-3-horses");
        assertThatThrownBy(() -> VaultPhone.unlock(first.vaultKey, fetch("/v1/vault", nora)))
                .hasMessageContaining("doesn't open");
    }

    // ---------- sharing ----------

    @Test
    void twoPeopleShareAnItemTheSecondOpensItAndARemovedGrantStopsWorking() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        VaultPhone noras = phone(nora);
        VaultPhone alexs = phone(alex);
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        Made netflix = keep(
                nora,
                noras,
                circle,
                "Netflix",
                "login",
                "{\"email\":\"linds.home@example.com\",\"password\":\"p0pcorn!Friday#night\"}");

        // Nora's phone wraps the item key for Alex with his public key and shares it: he may change it.
        send(
                HttpMethod.PUT,
                "/v1/vault/items/" + netflix.id() + "/sharing",
                nora,
                "{\"audience\":\"some\",\"people\":[%s]}"
                        .formatted(person(
                                alexId,
                                "change",
                                VaultPhone.sealTo(keyOf(nora, circle, alexId), netflix.itemKey(), "item-key"),
                                "")),
                200);

        // Alex's phone opens it with nothing but his own private key.
        assertThat(read(alex, alexs, netflix.id())).contains("p0pcorn!Friday#night");
        // What was wrapped for Alex opens for nobody else, and not as anything but an item key.
        String alexWrapped = JsonPath.read(open(alex, netflix.id(), 200), "$.wrappedKey");
        assertThatThrownBy(() -> noras.open(alexWrapped, "item-key")).hasMessageContaining("doesn't open");
        assertThatThrownBy(() -> alexs.open(alexWrapped, "escrow-key")).hasMessageContaining("doesn't open");

        // Alex changes the password: the same item key, a new ciphertext. Nora reads the new one.
        byte[] itemKey = alexs.open(alexWrapped, "item-key");
        send(
                HttpMethod.PATCH,
                "/v1/vault/items/" + netflix.id(),
                alex,
                "{\"version\":1,\"ciphertext\":\"%s\"}"
                        .formatted(VaultPhone.seal(
                                itemKey,
                                secret("{\"email\":\"linds.home@example.com\",\"password\":\"n3w-After-the-leak\"}")
                                        .getBytes(StandardCharsets.UTF_8),
                                "item")),
                200);
        assertThat(read(nora, noras, netflix.id())).contains("n3w-After-the-leak");

        // Nora takes it back and gives the item a new key in the same step. Alex is handed nothing any more,
        // and the key he once held doesn't open what the item holds now.
        byte[] newKey = secret(VaultPhone.newKey());
        String afterwards = VaultPhone.seal(
                newKey, secret("{\"password\":\"only-Nora-knows-this-1\"}").getBytes(StandardCharsets.UTF_8), "item");
        send(
                HttpMethod.PUT,
                "/v1/vault/items/" + netflix.id() + "/sharing",
                nora,
                "{\"audience\":\"me\",\"rotation\":{\"version\":2,\"ciphertext\":\"%s\",\"myWrappedKey\":\"%s\"}}"
                        .formatted(afterwards, VaultPhone.sealTo(noras.publicKey, newKey, "item-key")),
                200);
        open(alex, netflix.id(), 404);
        assertThatThrownBy(() -> VaultPhone.open(itemKey, afterwards, "item")).hasMessageContaining("doesn't open");
        assertThat(read(nora, noras, netflix.id())).contains("only-Nora-knows-this-1");
    }

    @Test
    void sharedForOneLookOrUntilSundayOrWithSomeoneWhoSetsUpTheirVaultLater() throws Exception {
        String nora = person("Nora");
        String lea = person("Lea");
        String kai = person("Kai");
        VaultPhone noras = phone(nora);
        VaultPhone leas = phone(lea);
        String circle = circle(nora, "crew", "Lisbon crew");
        String leaId = join(nora, circle, lea);
        String kaiId = join(nora, circle, kai);
        Made door = keep(nora, noras, circle, "Front door code", "code", "4821, then the star key");
        Made wifi = keep(nora, noras, circle, "Home Wi-Fi", "wifi", "Lind-Home / sm0rrebrod-and-rain");
        String leaKey = keyOf(nora, circle, leaId);

        // Gone after it's opened once.
        send(
                HttpMethod.PUT,
                "/v1/vault/items/" + door.id() + "/sharing",
                nora,
                "{\"audience\":\"some\",\"people\":[%s]}"
                        .formatted(person(
                                leaId, "use", VaultPhone.sealTo(leaKey, door.itemKey(), "item-key"), ",\"once\":true")),
                200);
        assertThat(read(lea, leas, door.id())).isEqualTo("4821, then the star key");
        assertThat(code(open(lea, door.id(), 403))).isEqualTo("opened_once");

        // Stops working on Sunday evening.
        send(
                HttpMethod.PUT,
                "/v1/vault/items/" + wifi.id() + "/sharing",
                nora,
                "{\"audience\":\"circle\",\"everyone\":\"use\",\"people\":[%s]}"
                        .formatted(person(
                                leaId,
                                "see",
                                VaultPhone.sealTo(leaKey, wifi.itemKey(), "item-key"),
                                ",\"stopsAt\":\"" + Instant.now().plusSeconds(4 * 24 * 3600) + "\"")),
                200);
        assertThat(read(lea, leas, wifi.id())).contains("sm0rrebrod-and-rain");
        jdbc.sql("update vault_grants set stops_at = now() - interval '1 second' where stops_at is not null")
                .update();
        assertThat(code(open(lea, wifi.id(), 403))).isEqualTo("stopped_working");

        // Kai is in "everyone" but has no Vault yet. He sets one up; the next time Nora's phone is open it finds
        // him waiting, wraps the key with the public key the API reports, and he can read it.
        assertThat(fetch("/v1/vault/waiting", nora)).isEqualTo("[]");
        VaultPhone kais = phone(kai);
        String waiting = fetch("/v1/vault/waiting", nora);
        assertThat(JsonPath.<List<String>>read(waiting, "$[*].memberId")).containsExactly(kaiId);
        assertThat(JsonPath.<String>read(waiting, "$[0].publicKey")).isEqualTo(kais.publicKey);
        byte[] wifiKey = noras.open(JsonPath.read(open(nora, wifi.id(), 200), "$.wrappedKey"), "item-key");
        send(
                HttpMethod.PUT,
                "/v1/vault/items/" + wifi.id() + "/keys",
                nora,
                "{\"keys\":[{\"memberId\":\"%s\",\"wrappedKey\":\"%s\"}]}"
                        .formatted(
                                kaiId,
                                VaultPhone.sealTo(JsonPath.read(waiting, "$[0].publicKey"), wifiKey, "item-key")),
                200);
        assertThat(read(kai, kais, wifi.id())).contains("sm0rrebrod-and-rain");
        assertThat(JsonPath.<String>read(open(kai, wifi.id(), 200), "$.access")).isEqualTo("use");
    }

    // ---------- if something happens ----------

    @Test
    void emergencyAccessFromTurningItOnToTheTrustedPersonReadingTheNote() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        VaultPhone noras = phone(nora);
        VaultPhone alexs = phone(alex);
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        Made bank = keep(nora, noras, circle, "Bank", "login", "{\"password\":\"gr4nite-Kitchen-island\"}");
        Made insurance = keep(nora, noras, circle, "Insurance", "login", "{\"policy\":\"LV-2219-7730-A\"}");
        keep(nora, noras, circle, "Diary", "secret", "Not for anyone, ever. Really.");
        String theNote = secret("The will is in the blue folder. Call Jonas at the notary first.");

        // Nora's phone: each chosen item's key wrapped for Alex, the note sealed for him, and once more for herself.
        String alexKey = JsonPath.<List<String>>read(
                        fetch("/v1/vault/people", nora), "$[?(@.memberId == '" + alexId + "')].publicKey")
                .get(0);
        send(
                HttpMethod.PUT,
                "/v1/vault/emergency",
                nora,
                "{\"trustedMemberId\":\"%s\",\"waitHours\":48,\"items\":[{\"id\":\"%s\",\"wrappedKey\":\"%s\"},{\"id\":\"%s\",\"wrappedKey\":\"%s\"}],\"note\":\"%s\",\"noteMine\":\"%s\"}"
                        .formatted(
                                alexId,
                                bank.id(),
                                VaultPhone.sealTo(alexKey, bank.itemKey(), "escrow-key"),
                                insurance.id(),
                                VaultPhone.sealTo(alexKey, insurance.itemKey(), "escrow-key"),
                                VaultPhone.sealTo(alexKey, theNote.getBytes(StandardCharsets.UTF_8), "escrow-note"),
                                VaultPhone.sealTo(
                                        noras.publicKey, theNote.getBytes(StandardCharsets.UTF_8), "own-note")),
                200);
        // Her own phone can read her note again later.
        assertThat(new String(
                        noras.open(JsonPath.read(fetch("/v1/vault/emergency", nora), "$.noteMine"), "own-note"),
                        StandardCharsets.UTF_8))
                .isEqualTo(theNote);

        // Alex asks. Nothing is handed over while Nora can still say no.
        String id = JsonPath.read(fetch("/v1/vault/entrusted", alex), "$[0].id");
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/ask", alex, null, 200);
        send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/items/" + bank.id() + "/open", alex, null, 403);
        assertThat(JsonPath.<Object>read(fetch("/v1/vault/entrusted/" + id, alex), "$.note"))
                .isNull();

        // 48 hours pass without a no.
        jdbc.sql("update vault_emergencies set opens_at = now() - interval '1 minute'")
                .update();

        String open = fetch("/v1/vault/entrusted/" + id, alex);
        assertThat(new String(alexs.open(JsonPath.read(open, "$.note"), "escrow-note"), StandardCharsets.UTF_8))
                .isEqualTo(theNote);
        assertThat(JsonPath.<List<String>>read(open, "$.items[*].title")).containsExactly("Bank", "Insurance");
        for (String item : List.of(bank.id(), insurance.id())) {
            String handed =
                    send(HttpMethod.POST, "/v1/vault/entrusted/" + id + "/items/" + item + "/open", alex, null, 200);
            byte[] itemKey = alexs.open(JsonPath.read(handed, "$.wrappedKey"), "escrow-key");
            String inside = new String(
                    VaultPhone.open(itemKey, JsonPath.read(handed, "$.ciphertext"), "item"), StandardCharsets.UTF_8);
            assertThat(inside).contains(item.equals(bank.id()) ? "gr4nite-Kitchen-island" : "LV-2219-7730-A");
        }
        // What wasn't chosen stays shut, and nobody else could have opened what was.
        assertThat(open).doesNotContain("Diary");
        assertThatThrownBy(() -> noras.open(JsonPath.read(open, "$.note"), "escrow-note"))
                .hasMessageContaining("doesn't open");
    }

    // ---------- helpers ----------

    @Test
    void anyTwoSharesRebuildTheSecretAndTheWrongPairDoesNot() {
        byte[] vaultKey = VaultPhone.normalized(secret(VaultPhone.newVaultKey()));
        secrets.addAll(VaultPhone.spellings(vaultKey));
        requests.add("(no request: this test is arithmetic)");
        for (int helpers = 2; helpers <= 5; helpers++) {
            List<byte[]> shares = Shamir.split(vaultKey, helpers);
            for (int a = 0; a < helpers; a++) {
                assertThat(shares.get(a)).hasSize(vaultKey.length + 1);
                assertThat(new String(shares.get(a), 1, vaultKey.length, StandardCharsets.ISO_8859_1))
                        .isNotEqualTo(new String(vaultKey, StandardCharsets.ISO_8859_1));
                for (int b = 0; b < helpers; b++) {
                    if (a != b) {
                        assertThat(Shamir.join(shares.get(a), shares.get(b))).isEqualTo(vaultKey);
                    }
                }
            }
            // Shares from two different splits don't fit together.
            byte[] fromAnotherSplit = Shamir.split(vaultKey, helpers).get(1);
            assertThat(Shamir.join(shares.get(0), fromAnotherSplit)).isNotEqualTo(vaultKey);
        }
        // The arithmetic underneath: every number but 0 has an inverse, and multiplying is the same either way round.
        for (int n = 1; n < 256; n++) {
            assertThat(Shamir.multiply(n, Shamir.inverse(n))).isEqualTo(1);
            assertThat(Shamir.multiply(n, 0x53)).isEqualTo(Shamir.multiply(0x53, n));
        }
        assertThat(Shamir.multiply(0x53, 0xca)).isEqualTo(1); // the worked example in the AES standard
        assertThatThrownBy(() -> Shamir.join(
                        Shamir.split(vaultKey, 2).get(0),
                        Shamir.split(vaultKey, 2).get(0)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void twoHelpersLetSomeoneBackInOnANewPhoneWithoutTheVaultKey() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String astrid = person("Astrid");
        String kai = person("Kai");
        VaultPhone noras = phone(nora);
        VaultPhone alexs = phone(alex);
        phone(astrid);
        VaultPhone kais = phone(kai);
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String astridId = join(nora, circle, astrid);
        String kaiId = join(nora, circle, kai);
        Made bank = keep(nora, noras, circle, "Bank", "login", "{\"password\":\"harbour-Lights-at-0600\"}");

        // Three helpers say yes. Nora's phone splits her Vault key so that any two rebuild it, and seals one
        // share to each helper's public key.
        List<String> rows = new ArrayList<>();
        List<String> keys = new ArrayList<>();
        for (String[] helper : new String[][] {{alexId, alex}, {astridId, astrid}, {kaiId, kai}}) {
            String asked = send(
                    HttpMethod.POST,
                    "/v1/vault/helpers",
                    nora,
                    "{\"clientId\":\"%s\",\"memberId\":\"%s\"}".formatted(id(), helper[0]),
                    201);
            rows.add(JsonPath.read(asked, "$.id"));
            keys.add(JsonPath.read(asked, "$.person.publicKey"));
            send(HttpMethod.PUT, "/v1/vault/helping/" + rows.getLast(), helper[1], "{\"accept\":true}", 200);
        }
        List<byte[]> shares = Shamir.split(VaultPhone.normalized(noras.vaultKey), 3);
        StringBuilder sealedShares = new StringBuilder();
        for (int i = 0; i < 3; i++) {
            secret(shares.get(i));
            sealedShares
                    .append(i == 0 ? "" : ",")
                    .append("{\"helperId\":\"%s\",\"sealedShare\":\"%s\"}"
                            .formatted(rows.get(i), VaultPhone.sealTo(keys.get(i), shares.get(i), "helper-share")));
        }
        send(HttpMethod.PUT, "/v1/vault/helpers/shares", nora, "{\"shares\":[" + sealedShares + "]}", 200);

        // Nora's phone is lost, and the paper with the key too. A new phone, signed in as her, makes a
        // temporary key pair and starts a recovery.
        VaultPhone newPhone = VaultPhone.temporary();
        secrets.addAll(newPhone.secrets());
        String recovery = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/vault/recoveries",
                        nora,
                        "{\"clientId\":\"%s\",\"tempPublicKey\":\"%s\"}".formatted(id(), newPhone.publicKey),
                        201),
                "$.id");

        // Alex and Kai help (Astrid is on holiday): each phone opens its own share and seals it again for the
        // temporary key.
        for (Object[] helper : new Object[][] {{alex, alexs, rows.get(0)}, {kai, kais, rows.get(2)}}) {
            String toPassOn = fetch("/v1/vault/helping/" + helper[2] + "/share", (String) helper[0]);
            byte[] share = ((VaultPhone) helper[1]).open(JsonPath.read(toPassOn, "$.sealedShare"), "helper-share");
            send(
                    HttpMethod.PUT,
                    "/v1/vault/helping/" + helper[2] + "/share",
                    (String) helper[0],
                    "{\"recoveryId\":\"%s\",\"resealedShare\":\"%s\"}"
                            .formatted(
                                    JsonPath.<String>read(toPassOn, "$.recoveryId"),
                                    VaultPhone.sealTo(
                                            JsonPath.read(toPassOn, "$.tempPublicKey"), share, "recovery-share")),
                    200);
        }

        // The new phone fetches the two, rebuilds the Vault key, and is back in.
        String ready = fetch("/v1/vault/recoveries/" + recovery, nora);
        assertThat(JsonPath.<Boolean>read(ready, "$.ready")).isTrue();
        List<String> passedOn = JsonPath.<List<String>>read(ready, "$.helpers[*].resealedShare").stream()
                .filter(share -> share != null)
                .toList();
        assertThat(passedOn).hasSize(2);
        byte[] rebuilt = Shamir.join(
                newPhone.open(passedOn.get(0), "recovery-share"), newPhone.open(passedOn.get(1), "recovery-share"));
        String vaultKey = VaultPhone.grouped(rebuilt);
        assertThat(vaultKey).isEqualTo(noras.vaultKey);
        VaultPhone back = VaultPhone.unlock(vaultKey, fetch("/v1/vault", nora));
        send(HttpMethod.POST, "/v1/vault/recoveries/" + recovery + "/finish", nora, null, 200);
        assertThat(read(nora, back, bank.id())).contains("harbour-Lights-at-0600");

        // What a helper held was sealed for that helper: nobody else opens it, the new phone included.
        String alexSealed = JsonPath.<List<String>>read(
                        sealedShares.insert(0, "[").append("]").toString(), "$[*].sealedShare")
                .get(0);
        assertThatThrownBy(() -> newPhone.open(alexSealed, "helper-share")).hasMessageContaining("doesn't open");
        assertThatThrownBy(() -> kais.open(alexSealed, "helper-share")).hasMessageContaining("doesn't open");

        // Back in, she chooses a new Vault key. The old shares are thrown away; her phone splits the new key.
        VaultPhone rekeyed = back.withNewVaultKey();
        secrets.addAll(rekeyed.secrets());
        send(HttpMethod.PUT, "/v1/vault/key", nora, "{" + rekeyed.wrappedKeyJson() + "}", 200);
        assertThat(JsonPath.<Boolean>read(fetch("/v1/vault/helpers", nora), "$.sharesDue"))
                .isTrue();
        assertThat(read(nora, VaultPhone.unlock(rekeyed.vaultKey, fetch("/v1/vault", nora)), bank.id()))
                .contains("harbour-Lights-at-0600");
    }

    // ---------- a guest pass ----------

    private static final Pattern SEALED = Pattern.compile("data-sealed=\"([A-Za-z0-9_-]+)\"");

    @Test
    void aDoorCodeOnAGuestPassOpensOnlyWithTheKeyThatTravelsAfterTheHash() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        VaultPhone noras = phone(nora);
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        Made door = keep(nora, noras, circle, "Front door code", "code", "4821, then the star key");

        // Nora's phone: a fresh key for this pass. It seals what the sitter may read, and keeps the key for
        // Nora's other phone by sealing it to her own Vault.
        byte[] passKey = secret(VaultPhone.newKey());
        String code = secret("4821, then the star key");
        String wifi = secret("Network Lind-Home, password sm0rrebrod-and-rain");
        String pass = send(
                HttpMethod.POST,
                "/v1/circles/" + circle + "/guest-passes",
                nora,
                "{\"clientId\":\"%s\",\"guestName\":\"Ines\",\"endsAt\":\"%s\",\"thingIds\":[\"%s\"],\"keyForMaker\":\"%s\",\"cards\":[{\"label\":\"Front door code\",\"ciphertext\":\"%s\",\"once\":true,\"thingId\":\"%s\"},{\"label\":\"Home Wi-Fi\",\"ciphertext\":\"%s\"}]}"
                        .formatted(
                                id(),
                                Instant.now().plusSeconds(3600),
                                door.id(),
                                VaultPhone.sealTo(noras.publicKey, passKey, "pass-key"),
                                VaultPhone.sealForGuest(passKey, code),
                                door.id(),
                                VaultPhone.sealForGuest(passKey, wifi)),
                201);
        String path = JsonPath.<String>read(pass, "$.url").replaceFirst("^https?://[^/]+", "");
        // The link the API knows ends before the #. The phone adds the key; it is what Nora sends to Ines.
        assertThat(JsonPath.<String>read(pass, "$.url")).doesNotContain("#");
        String keyInTheLink = VaultPhone.b64(passKey);
        // Nora's other phone gets the pass's key back by opening what was sealed to her Vault; Alex gets nothing.
        assertThat(noras.open(JsonPath.read(pass, "$.keyForMaker"), "pass-key")).isEqualTo(passKey);
        assertThat(JsonPath.<Object>read(
                        fetch("/v1/guest-passes/" + JsonPath.<String>read(pass, "$.id"), alex), "$.keyForMaker"))
                .isNull();

        // Ines opens the link and types the code. The request carries no key: a browser never sends what is after the
        // #.
        requests.add("POST " + path + " code=" + JsonPath.<String>read(pass, "$.code"));
        MvcResult opened = mvc.perform(post(path).param("code", JsonPath.<String>read(pass, "$.code")))
                .andReturn();
        Cookie phone = opened.getResponse().getCookie("homeport_guest");
        String page = opened.getResponse().getContentAsString();
        assertThat(page).contains("Front door code", "Home Wi-Fi").doesNotContain("then the star key", "sm0rrebrod");

        // What the page's script does: open each sealed card with the key from the link.
        Matcher sealed = SEALED.matcher(page);
        List<String> shown = new ArrayList<>();
        while (sealed.find()) {
            shown.add(VaultPhone.openAsTheBrowserDoes(keyInTheLink, sealed.group(1)));
        }
        assertThat(shown).containsExactly(code, wifi);
        // With another key, or none, nothing opens: the page says the link is incomplete.
        Matcher first = SEALED.matcher(page);
        assertThat(first.find()).isTrue();
        assertThatThrownBy(() -> VaultPhone.openAsTheBrowserDoes(VaultPhone.b64(VaultPhone.newKey()), first.group(1)))
                .isInstanceOf(java.security.GeneralSecurityException.class);

        // The door code shows once: the script says so, and the API has nothing left to hand out.
        String cardId = JsonPath.read(pass, "$.cards[0].id");
        requests.add("POST " + path + "/cards/" + cardId + "/shown");
        mvc.perform(post(path + "/cards/" + cardId + "/shown").cookie(phone))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status()
                        .isNoContent());
        String again =
                mvc.perform(get(path).cookie(phone)).andReturn().getResponse().getContentAsString();
        Matcher left = SEALED.matcher(again);
        assertThat(left.find()).isTrue();
        assertThat(VaultPhone.openAsTheBrowserDoes(keyInTheLink, left.group(1))).isEqualTo(wifi);
        assertThat(left.find()).isFalse();
        assertThat(again).contains("shown once and is hidden for good");
    }
}
