package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationRunner;
import org.springframework.test.context.TestPropertySource;

/**
 * The sample data of Notes: whoever opens the app as one of the people of the screens finds what the screens
 * draw, made through the same rules as everything else.
 */
@TestPropertySource(properties = "homeport.seed.enabled=true")
class NotesSeedTest extends NotesApiTest {

    @Autowired
    List<ApplicationRunner> runners;

    /** The sample data is added when the database is empty, as on the first start in local mode. */
    @BeforeEach
    void addTheSampleData() throws Exception {
        for (ApplicationRunner runner : runners) {
            if (runner.getClass().getSimpleName().equals("LocalSeed")) {
                runner.run(null);
            }
        }
    }

    private String circleOf(String token, String name) throws Exception {
        return JsonPath.<List<String>>read(fetch("/v1/circles", token), "$[?(@.name == '" + name + "')].id")
                .get(0);
    }

    private String idOf(String json, String title) {
        return JsonPath.<List<String>>read(json, "$..[?(@.title == \"" + title + "\")].id")
                .get(0);
    }

    private <T> T of(String json, String title, String field) {
        return JsonPath.<List<T>>read(json, "$..[?(@.title == \"" + title + "\")]." + field)
                .get(0);
    }

    @Test
    void noraFindsTheNotesOfTheLindsAsTheScreensDrawThem() throws Exception {
        String nora = signIn("nora@example.com");
        String alex = signIn("alex@example.com");
        String linds = circleOf(nora, "The Linds");

        // 5.1 Notes: pinned first, then the spaces with who they are shared with.
        String notes = fetch("/v1/circles/" + linds + "/notes", nora);
        assertThat(titles(notes, "$.spaces[*].title")).containsSubsequence("Home", "Kids", "Trips", "Nora's work");
        assertThat(titles(notes, "$.spaces[*].emoji")).containsSubsequence("🏠", "🧒", "✈️", "💼");
        assertThat(this.<String>of(notes, "Home", "chip.audience")).isEqualTo("circle");
        assertThat(this.<String>of(notes, "Kids", "chip.audience")).isEqualTo("some");
        assertThat(this.<String>of(notes, "Nora's work", "chip.audience")).isEqualTo("me");
        assertThat(this.<Integer>of(notes, "Home", "folders")).isEqualTo(6);
        assertThat(this.<Integer>of(notes, "Home", "pages")).isGreaterThanOrEqualTo(18);
        assertThat(this.<Integer>of(notes, "Kids", "folders")).isEqualTo(4);
        assertThat(this.<Integer>of(notes, "Trips", "folders")).isEqualTo(3);
        assertThat(titles(notes, "$.pinned[*].title")).containsSubsequence("Groceries", "Wi‑Fi and smart home");
        assertThat(JsonPath.<Integer>read(notes, "$.pinned[0].left")).isEqualTo(7);
        assertThat(titles(notes, "$.pinned[0].here[*].who.name")).containsExactly("Alex");
        assertThat(JsonPath.<String>read(notes, "$.pinned[0].emoji")).isEqualTo("🛒");
        assertThat(titles(notes, "$.recent[*].title"))
                .startsWith("Groceries", "Wi‑Fi and smart home", "Mia's 10th birthday");

        // 5.2 A space: folders with their counts, the live list, the page that is hidden from the kids.
        String home = fetch("/v1/folders/" + idOf(notes, "Home") + "/items", nora);
        assertThat(titles(home, "$.items[*].title"))
                .containsSubsequence(
                        "House manual",
                        "Meals",
                        "Garden",
                        "Groceries",
                        "Babysitter notes",
                        "Christmas plan",
                        "Emergency numbers");
        assertThat(this.<Integer>of(home, "House manual", "pages")).isEqualTo(6);
        assertThat(this.<Integer>of(home, "Meals", "pages")).isEqualTo(3);
        assertThat(this.<Integer>of(home, "Garden", "pages")).isEqualTo(5);
        assertThat(this.<Integer>of(home, "Groceries", "left")).isEqualTo(7);
        assertThat(this.<List<String>>of(home, "Christmas plan", "chip.hiddenFrom"))
                .containsExactly("Mia", "Leo");
        String manual = fetch("/v1/folders/" + idOf(home, "House manual") + "/items", nora);
        assertThat(titles(manual, "$.items[*].title"))
                .containsExactly("Wi‑Fi and smart home", "Bins and recycling days", "Appliances and manuals");
        assertThat(this.<Integer>of(manual, "Appliances and manuals", "pages")).isEqualTo(4);
        assertThat(this.<String>of(manual, "Wi‑Fi and smart home", "editedBy.name"))
                .isEqualTo("Alex");

        // 5.3 A page, and 4.3 behind its chip: Alex can edit, Mia can view, Leo can't see it.
        String wifiId = idOf(manual, "Wi‑Fi and smart home");
        String wifi = fetch("/v1/pages/" + wifiId, nora);
        assertThat(titles(wifi, "$.breadcrumb[*].title")).containsExactly("Home", "House manual");
        assertThat(JsonPath.<String>read(wifi, "$.emoji")).isEqualTo("📶");
        assertThat(JsonPath.<String>read(wifi, "$.editedBy.name")).isEqualTo("Alex");
        assertThat(titles(wifi, "$.chip.people[*].name")).containsExactly("Alex Strand", "Mia");
        assertThat(titles(wifi, "$.blocks[*].kind")).containsSubsequence("heading", "checklist", "photo", "paragraph");
        assertThat(titles(wifi, "$.blocks[?(@.kind == 'checklist')].checklist.items[*].text"))
                .containsExactly("Unplug the white box for 10 seconds", "Still nothing? Call Telemach, 080 12 34");
        assertThat(JsonPath.<List<Boolean>>read(wifi, "$.blocks[?(@.kind == 'checklist')].checklist.items[*].done"))
                .containsExactly(true, false);
        assertThat(titles(wifi, "$.blocks[?(@.kind == 'photo')].text")).containsExactly("Where the router lives");
        assertThat(JsonPath.<List<String>>read(wifi, "$.blocks[?(@.kind == 'photo')].media.url"))
                .doesNotContainNull();
        assertThat(titles(wifi, "$.blocks[?(@.kind == 'paragraph')].marks[*].kind"))
                .containsExactly("mention");
        String sheet = fetch("/v1/things/" + wifiId + "/audience", nora);
        assertThat(titles(sheet, "$.people[*].name")).containsExactly("Alex Strand", "Mia", "Leo");
        assertThat(titles(sheet, "$.people[*].access")).containsExactly("edit", "view", "none");

        // 4.4 Keep it a surprise: in Kids / Birthdays, hidden from Mia, with the gift ideas and the party.
        String kids = fetch("/v1/folders/" + idOf(notes, "Kids") + "/items", nora);
        String birthdays = fetch("/v1/folders/" + idOf(kids, "Birthdays") + "/items", nora);
        String plan = fetch("/v1/pages/" + idOf(birthdays, "Mia's 10th birthday"), nora);
        assertThat(titles(plan, "$.breadcrumb[*].title")).containsExactly("Kids", "Birthdays");
        assertThat(titles(plan, "$.chip.hiddenFrom")).containsExactly("Mia");
        assertThat(titles(plan, "$.blocks[*].kind")).containsSubsequence("heading", "checklist", "heading", "live");
        assertThat(titles(plan, "$.blocks[?(@.kind == 'checklist')].checklist.items[*].text"))
                .containsExactly("Roller skates, size 33", "Watercolour set", "Climbing course, 5 lessons");
        assertThat(titles(plan, "$.blocks[?(@.kind == 'checklist')].checklist.items[*].note"))
                .containsExactly("Alex bought them", "Grandma Astrid wants this one", "From both of us");
        assertThat(JsonPath.<List<Integer>>read(
                        plan, "$.blocks[?(@.kind == 'checklist')].checklist.items[*].amountCents"))
                .containsExactly(4500, 2800, 9000);
        assertThat(titles(plan, "$.blocks[?(@.kind == 'checklist')].checklist.chip.hiddenFrom[*]"))
                .containsExactly("Mia");
        assertThat(titles(plan, "$.blocks[?(@.kind == 'live')].thing.title")).contains("Party prep");
        assertThat(this.<String>of(plan, "Party prep", "glance")).isEqualTo("4 of 9 done");
        // Nora's own gift list for Alex is filed next to it, and Alex, who shares the folder, doesn't get it.
        assertThat(titles(birthdays, "$.items[*].title")).contains("Gift list for Alex");
        String forAlex = fetch("/v1/folders/" + idOf(kids, "Birthdays") + "/items", alex);
        assertThat(titles(forAlex, "$.items[*].title"))
                .contains("Mia's 10th birthday")
                .doesNotContain("Gift list for Alex");
        assertThat(titles(fetch("/v1/circles/" + linds + "/notes", alex), "$.spaces[*].title"))
                .contains("Home", "Kids", "Trips")
                .doesNotContain("Nora's work");

        // 5.5 A shared list: seven left of twelve, by aisle, Alex in the shop, and what to add again.
        String groceries = fetch("/v1/checklists/" + idOf(home, "Groceries"), nora);
        assertThat(JsonPath.<Integer>read(groceries, "$.left")).isEqualTo(7);
        assertThat(JsonPath.<Integer>read(groceries, "$.done")).isEqualTo(5);
        assertThat(JsonPath.<String>read(groceries, "$.chip.audience")).isEqualTo("circle");
        assertThat(titles(groceries, "$.sections[*].name")).containsExactly("Fruit and veg", "Fridge", "Other");
        assertThat(titles(groceries, "$.items[?(@.section == 'Fruit and veg')].text"))
                .containsExactly("Bananas", "Red onions", "Strawberries, 2 boxes");
        assertThat(titles(groceries, "$.items[?(@.section == 'Fridge')].text"))
                .containsExactly("Milk, 2 litres", "Butter");
        assertThat(titles(groceries, "$.items[?(@.done == true)].text"))
                .containsExactly("Red onions", "Butter", "Toothpaste", "Kitchen roll", "Washing-up liquid");
        assertThat(titles(groceries, "$.here[*].who.name")).containsExactly("Alex");
        assertThat(titles(groceries, "$.suggestions[*].text")).containsExactly("Eggs", "Bread", "Coffee", "Yoghurt");
        assertThat(titles(groceries, "$.items[?(@.text == 'Milk, 2 litres')].repeats"))
                .containsExactly("weekly");
        assertThat(titles(groceries, "$.items[?(@.text == 'Birthday candles')].hiddenFrom[*]"))
                .containsExactly("Mia");
        assertThat(titles(groceries, "$.items[?(@.text == 'Strawberries, 2 boxes')].addedBy.name"))
                .containsExactly("Mia");

        // Home: the recipe shows once, with its photo (the Library and Notes both know it), and the search finds words
        // inside a page.
        String today = fetch("/v1/circles/" + linds + "/today", nora);
        assertThat(this.<String>of(today, "Grandma's cookies", "imageUrl")).isNotNull();
        String found = fetch("/v1/circles/" + linds + "/search?q=passports", nora);
        assertThat(JsonPath.<String>read(found, "$.hits[0].thing.title")).isEqualTo("What to bring to Norway");
        assertThat(JsonPath.<String>read(found, "$.hits[0].snippet")).contains("all four passports");
    }

    @Test
    void theOtherCirclesStartWithTheirSpacesAndAPageOrTwoEach() throws Exception {
        String nora = signIn("nora@example.com");
        String kai = signIn("kai@example.com");
        String lea = signIn("lea@example.com");

        String couple = fetch("/v1/circles/" + circleOf(nora, "Nora and Alex") + "/notes", nora);
        assertThat(titles(couple, "$.spaces[*].title")).containsSubsequence("Our place", "Money", "Trips", "Someday");
        assertThat(JsonPath.<List<Integer>>read(couple, "$.spaces[*].pages")).allMatch(pages -> pages >= 1);
        assertThat(inFolder(idOf(couple, "Someday"), nora)).contains("Someday");
        assertThat(inFolder(idOf(couple, "Our place"), nora)).contains("Before winter");

        String crew = fetch("/v1/circles/" + circleOf(lea, "Lisbon crew") + "/notes", lea);
        assertThat(titles(crew, "$.spaces[*].title")).containsSubsequence("Trips", "Plans", "The dictionary");
        assertThat(inFolder(idOf(crew, "Trips"), nora))
                .containsSubsequence("Who brings what", "Lisbon in May: the plan");

        String flat = fetch("/v1/circles/" + circleOf(kai, "Trubarjeva 9") + "/notes", kai);
        assertThat(titles(flat, "$.spaces[*].title")).containsSubsequence("The flat", "Bills", "Landlord");
        assertThat(inFolder(idOf(flat, "The flat"), kai)).containsSubsequence("House rules", "Bin days");
        // A page the first seeder wrote as plain words is a page of one block.
        String rules = fetch(
                "/v1/pages/" + idOf(fetch("/v1/folders/" + idOf(flat, "The flat") + "/items", kai), "House rules"),
                kai);
        assertThat(titles(rules, "$.blocks[*].kind")).containsExactly("paragraph");
        assertThat(JsonPath.<String>read(rules, "$.blocks[0].text")).isEqualTo(JsonPath.<String>read(rules, "$.body"));
    }
}
