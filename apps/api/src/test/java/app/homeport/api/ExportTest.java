package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import app.homeport.api.export.ExportService;
import com.jayway.jsonpath.JsonPath;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

/**
 * "Export everything": the zip is asked for, made in the background, fetched from its address and opened
 * here, file by file. It holds what the person may see and nothing else, in formats any computer opens.
 */
class ExportTest extends TiesTestBase {

    @Autowired
    ExportService exports;

    /** Nora's and Alex's things, of every kind an export holds, and some it must not. */
    private void aCircleWithOneOfEverything() throws Exception {
        theLinds();
        vault(nora);
        page(nora, circle, "Packing for Norway", "circle");
        page(nora, circle, "Nora's diary", "me");
        page(alex, circle, "Alex's notes", "circle");
        page(alex, circle, "Alex's secret plan", "me");
        String list = checklist(alex, "Party prep", "circle", "Balloons", "Cake");
        tick(alex, JsonPath.<String>read(fetch("/v1/checklists/" + list, alex), "$.items[0].id"));
        // A line that is kept from Nora: the candles for her own birthday.
        send(
                HttpMethod.POST,
                "/v1/checklists/" + list + "/items",
                alex,
                "{\"clientId\":\"%s\",\"text\":\"Candles for Nora\",\"hideFrom\":[\"%s\"]}".formatted(id(), noraId),
                201);
        photos(nora, "me", 2);
        photos(alex, "circle", 1);
        make(
                nora,
                "/v1/sheets",
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"trip_budget\",\"title\":\"Norway budget\",\"audience\":\"circle\"}"
                        .formatted(id(), circle));
        event(
                nora,
                "Swimming, Mia",
                "2026-11-12",
                "17:00",
                ",\"audience\":\"circle\",\"place\":\"Pool; Tivoli\",\"repeat\":{\"unit\":\"week\",\"days\":[\"thu\"]}");
        event(nora, "Holiday", "2026-12-24", null, ",\"audience\":\"circle\"");
        reminder(nora, "Take the bins out", ",\"dueOn\":\"2026-11-13\",\"dueTime\":\"19:00\"");
        bill(nora, "Electricity", 8420, "2026-11-13", ",\"audience\":\"circle\",\"payee\":\"Elektro, Ljubljana\"");
        vaultItem(nora, "Bank card PIN");
        quiet();
    }

    private String ask(String token, String scope) throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/circles/" + circle + "/exports",
                        token,
                        "{\"clientId\":\"%s\",\"scope\":\"%s\"}".formatted(id(), scope),
                        201),
                "$.id");
    }

    /** Fetches a finished export from its address and opens it: every file's name with its text. */
    private Map<String, String> open(String token, String id) throws Exception {
        String url = JsonPath.read(fetch("/v1/exports/" + id, token), "$.url");
        // Whoever holds the address fetches the file: no sign-in is sent.
        byte[] zip = mvc.perform(get(url.replaceFirst("^https?://[^/]+", "")))
                .andReturn()
                .getResponse()
                .getContentAsByteArray();
        Map<String, String> files = new LinkedHashMap<>();
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip), StandardCharsets.UTF_8)) {
            for (ZipEntry entry = in.getNextEntry(); entry != null; entry = in.getNextEntry()) {
                files.put(entry.getName(), new String(in.readAllBytes(), StandardCharsets.UTF_8));
            }
        }
        return files;
    }

    @Test
    void everythingYouCanSeeComesAsOrdinaryFilesAndNothingYouCant() throws Exception {
        aCircleWithOneOfEverything();

        String id = ask(nora, "everything");

        // Asked for: it waits, with no address yet. Then the job makes it.
        String waiting = fetch("/v1/exports/" + id, nora);
        assertThat(JsonPath.<String>read(waiting, "$.state")).isEqualTo("waiting");
        assertThat(JsonPath.<Object>read(waiting, "$.url")).isNull();
        assertThat(exports.makeWaiting()).isEqualTo(1);
        assertThat(exports.makeWaiting()).isZero();
        String ready = fetch("/v1/exports/" + id, nora);
        assertThat(JsonPath.<String>read(ready, "$.state")).isEqualTo("ready");
        assertThat(JsonPath.<Integer>read(ready, "$.bytes")).isPositive();
        assertThat(JsonPath.<List<String>>read(ready, "$.leftOut")).isEmpty();
        assertThat(JsonPath.<String>read(ready, "$.url"))
                .matches(".*/media/exports/[0-9a-f]{32}/homeport-export-.*\\.zip");
        assertThat(JsonPath.<String>read(ready, "$.expiresAt")).isNotNull();

        Map<String, String> files = open(nora, id);

        assertThat(JsonPath.<Integer>read(ready, "$.files")).isEqualTo(files.size());
        // Pages: hers and what Alex shared, each as text and as a web page. Not his secret plan.
        assertThat(files.keySet())
                .contains(
                        "Notes/Packing for Norway.txt",
                        "Notes/Packing for Norway.html",
                        "Notes/Nora's diary.txt",
                        "Notes/Alex's notes.html",
                        "Lists/Party prep.txt",
                        "Plan/calendar.ics",
                        "Money/bills.csv",
                        "README.txt")
                .noneMatch(name -> name.contains("secret plan"));
        assertThat(files.get("Notes/Packing for Norway.txt"))
                .contains("Packing for Norway", "Words about Packing for Norway");
        assertThat(files.get("Notes/Packing for Norway.html"))
                .startsWith("<!doctype html>")
                .contains("<h1>Packing for Norway</h1>");
        // The list, with its tick, and without the line that is kept from her.
        assertThat(files.get("Lists/Party prep.txt"))
                .contains("[x] Balloons", "[ ] Cake")
                .doesNotContain("Candles");
        // Photos as their originals, in a folder for the day they were taken. Hers and the one Alex shared.
        assertThat(files.keySet().stream().filter(name -> name.startsWith("Library/2026/2026-11-07/")))
                .hasSize(3);
        // The sheet: a CSV per tab, and its formulas written out.
        assertThat(files.keySet()).anyMatch(name -> name.startsWith("Sheets/Norway budget/") && name.endsWith(".csv"));
        assertThat(files.keySet())
                .anyMatch(name -> name.startsWith("Sheets/Norway budget/") && name.endsWith(" formulas.txt"));
        // The calendar: an event that repeats, an all-day one, and the reminder as something to do.
        String calendar = files.get("Plan/calendar.ics");
        assertThat(calendar)
                .startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")
                .contains(
                        "SUMMARY:Swimming\\, Mia\r\n",
                        "DTSTART;TZID=Europe/Ljubljana:20261112T170000\r\n",
                        "LOCATION:Pool\\; Tivoli\r\n",
                        "RRULE:FREQ=WEEKLY;BYDAY=TH\r\n",
                        "DTSTART;VALUE=DATE:20261224\r\nDTEND;VALUE=DATE:20261225\r\n",
                        "BEGIN:VTODO",
                        "SUMMARY:Take the bins out\r\n",
                        "DUE;TZID=Europe/Ljubljana:20261113T190000\r\n")
                .endsWith("END:VCALENDAR\r\n");
        // The bill, with a name that has a comma in it kept as one value.
        assertThat(files.get("Money/bills.csv"))
                .startsWith("Bill,Paid to,Due on,Amount,Currency,Paid,Comes round,Your share\r\n")
                .contains("Electricity,\"Elektro, Ljubljana\",2026-11-13,84.20,EUR,no,once,");
        // The Vault is not in it, and the README says so and says what is what.
        assertThat(files.values()).noneMatch(text -> text.contains("Bank card PIN"));
        assertThat(files.get("README.txt"))
                .contains(
                        "Circle:   The Linds",
                        "everything in this circle you can see",
                        "Notes/      3 pages",
                        "The Vault. Passwords, cards and codes are scrambled on your phone",
                        "Export the Vault from the app itself")
                .doesNotContain("Left out because of its size");

        // She is told: a line in Activity only she gets, and a push.
        assertThat(sentences(nora)).containsExactly("Your export is ready");
        assertThat(lines(alex)).isEmpty();
        assertThat(pushed())
                .containsExactly(
                        "nora: Your export is ready | It is kept for 7 days. Open Export and leaving to save it.");
        // It is hers alone: to Alex, and to a stranger, it isn't there.
        send(HttpMethod.GET, "/v1/exports/" + id, alex, null, 404);
        send(HttpMethod.DELETE, "/v1/exports/" + id, alex, null, 204);
        assertThat(JsonPath.<List<String>>read(fetch("/v1/circles/" + circle + "/exports", nora), "$[*].id"))
                .containsExactly(id);
        assertThat(fetch("/v1/circles/" + circle + "/exports", alex)).isEqualTo("[]");
    }

    @Test
    void mineHoldsOnlyWhatYouMadeAndSendingTheRequestTwiceMakesOne() throws Exception {
        aCircleWithOneOfEverything();
        String body = "{\"clientId\":\"%s\",\"scope\":\"mine\"}".formatted(id());
        String id = JsonPath.read(send(HttpMethod.POST, "/v1/circles/" + circle + "/exports", alex, body, 201), "$.id");
        assertThat(JsonPath.<String>read(
                        send(HttpMethod.POST, "/v1/circles/" + circle + "/exports", alex, body, 201), "$.id"))
                .isEqualTo(id);
        ask(alex, "everything");
        // Two at a time is the most: a third has to wait for one of them.
        assertThat(JsonPath.<String>read(
                        send(
                                HttpMethod.POST,
                                "/v1/circles/" + circle + "/exports",
                                alex,
                                "{\"clientId\":\"%s\"}".formatted(id()),
                                409),
                        "$.code"))
                .isEqualTo("export_under_way");

        assertThat(exports.makeWaiting()).isEqualTo(2);
        Map<String, String> files = open(alex, id);

        // His own pages (also the secret one), his list with the line he keeps from Nora, his photo. Nothing of Nora's.
        assertThat(files.keySet())
                .contains("Notes/Alex's notes.txt", "Notes/Alex's secret plan.txt", "Lists/Party prep.txt")
                .noneMatch(name -> name.contains("Nora") || name.contains("Packing") || name.startsWith("Money/"));
        assertThat(files.get("Lists/Party prep.txt")).contains("Candles for Nora");
        assertThat(files.keySet().stream().filter(name -> name.startsWith("Library/")))
                .hasSize(1);
        assertThat(files.get("README.txt")).contains("what you made in this circle");
    }

    @Test
    void anExportIsRemovedAfterSevenDaysWithItsFile() throws Exception {
        aCircleWithOneOfEverything();
        String id = ask(nora, "mine");
        exports.makeWaiting();
        String key =
                jdbc.sql("select storage_key from exports").query(String.class).single();
        assertThat(exports.forgetExpired()).isZero();

        jdbc.sql("update exports set expires_at = now() - interval '1 minute'").update();

        assertThat(exports.forgetExpired()).isEqualTo(1);
        send(HttpMethod.GET, "/v1/exports/" + id, nora, null, 404);
        assertThat(jdbc.sql("select count(*) from removed_files where storage_key = :key")
                        .param("key", key)
                        .query(Integer.class)
                        .single())
                .isEqualTo(1);
        // Someone who has left the circle since gets no export of it.
        String late = ask(alex, "everything");
        send(HttpMethod.DELETE, "/v1/members/" + alexId, alex, null, 204);
        assertThat(exports.makeWaiting()).isZero();
        assertThat(jdbc.sql("select state from exports where id = cast(:id as uuid)")
                        .param("id", late)
                        .query(String.class)
                        .single())
                .isEqualTo("failed");
    }
}
