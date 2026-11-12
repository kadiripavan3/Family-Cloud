package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.money.sheet.SheetService;
import app.homeport.api.money.sheet.SheetService.NamedTotalResponse;
import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

/**
 * Sheets: typed columns, rows that open as cards, formulas the API works out and words back. The engine
 * itself is tested without the API in {@code FormulaTest}; here it is the sheet as the app uses it.
 */
class SheetTest extends ApiTest {

    @Autowired
    SheetService sheets;

    /** Starts a sheet. {@code more} is the rest of the request, starting with a comma, or empty. Returns the answer. */
    private String sheet(String token, String circle, String title, String more) throws Exception {
        return send(
                HttpMethod.POST,
                "/v1/sheets",
                token,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\"%s}".formatted(id(), circle, title, more),
                201);
    }

    private String column(String token, String tab, String name, String kind, String more) throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/sheet-tabs/" + tab + "/columns",
                        token,
                        "{\"clientId\":\"%s\",\"name\":\"%s\",\"kind\":\"%s\"%s}".formatted(id(), name, kind, more),
                        201),
                "$.id");
    }

    private String row(String token, String tab, String cells) throws Exception {
        return send(
                HttpMethod.POST,
                "/v1/sheet-tabs/" + tab + "/rows",
                token,
                "{\"clientId\":\"%s\",\"cells\":%s}".formatted(id(), cells),
                201);
    }

    private String tile(String token, String tab, String name, String formula) throws Exception {
        return send(
                HttpMethod.POST,
                "/v1/sheet-tabs/" + tab + "/tiles",
                token,
                "{\"clientId\":\"%s\",\"name\":\"%s\",\"formula\":\"%s\"}"
                        .formatted(id(), name, formula.replace("\"", "\\\"")),
                201);
    }

    /** A party budget made by hand: Item, Price, Qty and a Total that is worked out. Returns tab, item, price, qty, total. */
    private String[] party(String token, String circle) throws Exception {
        String sheet = sheet(token, circle, "Party budget", ",\"audience\":\"circle\"");
        String tab = JsonPath.read(sheet, "$.tab.id");
        // A blank sheet starts with Item and Amount; the amount isn't needed here.
        String item = JsonPath.read(sheet, "$.tab.columns[0].id");
        send(
                HttpMethod.DELETE,
                "/v1/sheet-columns/" + JsonPath.<String>read(sheet, "$.tab.columns[1].id"),
                token,
                null,
                204);
        String price = column(token, tab, "Price", "money", "");
        String qty = column(token, tab, "Qty", "number", "");
        String total = column(token, tab, "Total", "formula", ",\"formula\":\"[Price] * [Qty]\",\"summary\":\"sum\"");
        return new String[] {tab, item, price, qty, total, JsonPath.read(sheet, "$.id")};
    }

    private String userId(String memberId) {
        return jdbc.sql("select user_id from members where id = cast(:id as uuid)")
                .param("id", memberId)
                .query(UUID.class)
                .single()
                .toString();
    }

    @Test
    void aSheetStartsFromATemplateWithItsFormulasItsTilesAndSampleRows() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");

        String templates = fetch("/v1/sheet-templates", nora);
        assertThat(JsonPath.<List<String>>read(templates, "$[*].title"))
                .containsExactly(
                        "Monthly budget",
                        "Trip budget",
                        "Party budget",
                        "Loan planner",
                        "Savings plan",
                        "Tax checklist",
                        "Car costs");
        assertThat(JsonPath.<List<String>>read(templates, "$[?(@.live == true)].code"))
                .containsExactly("loan", "savings");

        // Every template makes a sheet in which everything works out: no cell, total or tile has a problem.
        for (String code : JsonPath.<List<String>>read(templates, "$[*].code")) {
            String made = send(
                    HttpMethod.POST,
                    "/v1/sheets",
                    nora,
                    "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"%s\",\"day\":\"2026-11-11\"}"
                            .formatted(id(), circle, code),
                    201);
            assertThat(JsonPath.<String>read(made, "$.template")).isEqualTo(code);
            assertThat(JsonPath.<Integer>read(made, "$.tab.rowCount")).as(code).isPositive();
            assertThat(JsonPath.<Integer>read(made, "$.tab.tiles.length()"))
                    .as(code)
                    .isGreaterThanOrEqualTo(3);
            assertThat(made).as(code).doesNotContain("\"kind\":\"problem\"");
            assertThat(JsonPath.<List<Integer>>read(made, "$.tab.tiles[*].leftOut"))
                    .as(code)
                    .containsOnly(0);
        }

        String party = send(
                HttpMethod.POST,
                "/v1/sheets",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"party_budget\"}".formatted(id(), circle),
                201);
        // Named after its template when no name was given, and yours alone in a family.
        assertThat(JsonPath.<String>read(party, "$.title")).isEqualTo("Party budget");
        assertThat(JsonPath.<String>read(party, "$.tag")).isEqualTo("Party");
        assertThat(JsonPath.<String>read(party, "$.chip.audience")).isEqualTo("me");
        assertThat(JsonPath.<List<String>>read(party, "$.tab.columns[*].name"))
                .containsExactly("Item", "Price", "Qty", "Total", "Bought");
        assertThat(JsonPath.<List<String>>read(party, "$.tab.columns[*].kind"))
                .containsExactly("text", "money", "number", "formula", "tick");
        assertThat(JsonPath.<String>read(party, "$.tab.columns[3].formula")).isEqualTo("[Price] * [Qty]");
        assertThat(JsonPath.<String>read(party, "$.tab.columns[3].says")).isEqualTo("Price times Qty.");
        // Cake 30, food 6 × 10, decorations 15, bags 4 × 10: €145 planned of the €250 set aside.
        assertThat(JsonPath.<Integer>read(party, "$.tab.columns[3].total.cell.cents"))
                .isEqualTo(14_500);
        assertThat(JsonPath.<List<String>>read(party, "$.tab.tiles[*].name"))
                .containsExactly("Planned", "Budget", "Left");
        assertThat(JsonPath.<List<Integer>>read(party, "$.tab.tiles[*].cell.cents"))
                .containsExactly(14_500, 25_000, 10_500);
        assertThat(JsonPath.<String>read(party, "$.tab.tiles[0].ofName")).isEqualTo("Budget");
        assertThat(JsonPath.<Integer>read(party, "$.tab.tiles[0].ofCell.cents")).isEqualTo(25_000);

        // A sheet with no template is blank: one tab, something to write in, a name of its own.
        String blank = sheet(nora, circle, "Notes with numbers", "");
        assertThat(JsonPath.<Object>read(blank, "$.template")).isNull();
        assertThat(JsonPath.<String>read(blank, "$.tag")).isEmpty();
        assertThat(JsonPath.<List<String>>read(blank, "$.tabs[*].name")).containsExactly("Sheet 1");
        assertThat(JsonPath.<List<String>>read(blank, "$.tab.columns[*].name")).containsExactly("Item", "Amount");
        send(
                HttpMethod.POST,
                "/v1/sheets",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\"}".formatted(id(), circle),
                400);
        send(
                HttpMethod.POST,
                "/v1/sheets",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"horoscope\"}".formatted(id(), circle),
                400);
    }

    @Test
    void aSheetARowAColumnATileAndATabSentTwiceAreEachMadeOnce() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String body =
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"trip_budget\",\"title\":\"Norway budget\"}"
                        .formatted(id(), circle);

        String first = send(HttpMethod.POST, "/v1/sheets", nora, body, 201);
        String second = send(HttpMethod.POST, "/v1/sheets", nora, body, 201);

        String sheet = JsonPath.read(first, "$.id");
        String tab = JsonPath.read(first, "$.tab.id");
        assertThat(JsonPath.<String>read(second, "$.id")).isEqualTo(sheet);
        assertThat(JsonPath.<Integer>read(second, "$.tab.rowCount")).isEqualTo(5);
        assertThat(JsonPath.<Integer>read(second, "$.tab.columns.length()")).isEqualTo(5);
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle + "/sheets", nora), "$.items.length()"))
                .isEqualTo(1);

        String item = JsonPath.read(first, "$.tab.columns[0].id");
        String row = "{\"clientId\":\"%s\",\"cells\":{\"%s\":\"Souvenirs\"}}".formatted(id(), item);
        String added = send(HttpMethod.POST, "/v1/sheet-tabs/" + tab + "/rows", nora, row, 201);
        String addedAgain = send(HttpMethod.POST, "/v1/sheet-tabs/" + tab + "/rows", nora, row, 201);
        assertThat(JsonPath.<String>read(addedAgain, "$.row.id")).isEqualTo(JsonPath.<String>read(added, "$.row.id"));
        assertThat(JsonPath.<Integer>read(addedAgain, "$.rowCount")).isEqualTo(6);

        String column =
                "{\"clientId\":\"%s\",\"name\":\"Booked\",\"kind\":\"tick\",\"summary\":\"ticked\"}".formatted(id());
        String col = send(HttpMethod.POST, "/v1/sheet-tabs/" + tab + "/columns", nora, column, 201);
        String colAgain = send(HttpMethod.POST, "/v1/sheet-tabs/" + tab + "/columns", nora, column, 201);
        assertThat(JsonPath.<String>read(colAgain, "$.id")).isEqualTo(JsonPath.<String>read(col, "$.id"));

        String tile = "{\"clientId\":\"%s\",\"name\":\"Dearest\",\"formula\":\"MAX([Cost])\"}".formatted(id());
        String made = send(HttpMethod.POST, "/v1/sheet-tabs/" + tab + "/tiles", nora, tile, 201);
        String madeAgain = send(HttpMethod.POST, "/v1/sheet-tabs/" + tab + "/tiles", nora, tile, 201);
        assertThat(JsonPath.<String>read(madeAgain, "$.id")).isEqualTo(JsonPath.<String>read(made, "$.id"));
        assertThat(JsonPath.<Integer>read(made, "$.cell.cents")).isEqualTo(90_000);

        String newTab = "{\"clientId\":\"%s\",\"name\":\"Day by day\"}".formatted(id());
        send(HttpMethod.POST, "/v1/sheets/" + sheet + "/tabs", nora, newTab, 201);
        send(HttpMethod.POST, "/v1/sheets/" + sheet + "/tabs", nora, newTab, 201);

        String now = fetch("/v1/sheets/" + sheet, nora);
        assertThat(JsonPath.<List<String>>read(now, "$.tabs[*].name")).containsExactly("Budget", "Day by day");
        assertThat(JsonPath.<Integer>read(now, "$.tab.columns.length()")).isEqualTo(6);
        assertThat(JsonPath.<Integer>read(now, "$.tab.tiles.length()")).isEqualTo(4);
        assertThat(JsonPath.<Integer>read(now, "$.tab.rowCount")).isEqualTo(6);
    }

    @Test
    void aColumnHasAKindSoACostCantBeTypedAsAWord() throws Exception {
        String nora = person("Nora");
        String kai = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        String mia = addMember(nora, circle, "Mia", "child");
        String noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        String elsewhere = JsonPath.read(fetch("/v1/circles/" + circle(kai, "solo", "Kai alone"), kai), "$.myMemberId");
        String sheet = sheet(nora, circle, "Everything", "");
        String tab = JsonPath.read(sheet, "$.tab.id");
        String text = JsonPath.read(sheet, "$.tab.columns[0].id");
        String money = JsonPath.read(sheet, "$.tab.columns[1].id");
        String number = column(nora, tab, "Nights", "number", "");
        String date = column(nora, tab, "Due", "date", "");
        String tick = column(nora, tab, "Paid", "tick", "");
        String choice = column(nora, tab, "Kind", "choice", ",\"options\":[\"Travel\",\"Food\",\"Fun\"]");
        String person = column(nora, tab, "Who", "person", "");

        String added = row(
                nora,
                tab,
                "{\"%s\":\" Cabins \",\"%s\":235000,\"%s\":\"9.5\",\"%s\":\"2027-01-15\",\"%s\":true,\"%s\":\"food\",\"%s\":[\"%s\",\"%s\"]}"
                        .formatted(text, money, number, date, tick, choice, person, noraId, mia));

        String rowId = JsonPath.read(added, "$.row.id");
        assertThat(JsonPath.<String>read(added, "$.row.cells['" + text + "'].text"))
                .isEqualTo("Cabins");
        assertThat(JsonPath.<String>read(added, "$.row.cells['" + text + "'].kind"))
                .isEqualTo("text");
        assertThat(JsonPath.<Integer>read(added, "$.row.cells['" + money + "'].cents"))
                .isEqualTo(235_000);
        assertThat(JsonPath.<Double>read(added, "$.row.cells['" + number + "'].number"))
                .isEqualTo(9.5);
        assertThat(JsonPath.<String>read(added, "$.row.cells['" + date + "'].date"))
                .isEqualTo("2027-01-15");
        assertThat(JsonPath.<Boolean>read(added, "$.row.cells['" + tick + "'].ticked"))
                .isTrue();
        // A choice is kept as the tab spells it.
        assertThat(JsonPath.<String>read(added, "$.row.cells['" + choice + "'].text"))
                .isEqualTo("Food");
        assertThat(JsonPath.<List<String>>read(added, "$.row.cells['" + person + "'].people[*].name"))
                .containsExactly("Nora", "Mia");
        assertThat(JsonPath.<Integer>read(added, "$.row.number")).isEqualTo(1);

        // Each kind refuses what it can't hold, in a sentence that names the column.
        Map<String, String> wrong = Map.of(
                "{\"%s\":\"a lot\"}".formatted(money), "Amount takes money, sent as whole cents.",
                "{\"%s\":12.5}".formatted(money), "Amount takes money, sent as whole cents.",
                "{\"%s\":\"nine\"}".formatted(number), "Nights takes a number.",
                "{\"%s\":\"15 Jan\"}".formatted(date), "Due takes a date.",
                "{\"%s\":\"yes\"}".formatted(tick), "Paid is ticked or not.",
                "{\"%s\":\"Drinks\"}".formatted(choice), "Kind is one of: Travel, Food, Fun.",
                "{\"%s\":42}".formatted(text), "Item takes words, 2,000 characters at most.",
                "{\"%s\":\"%s\"}".formatted(person, elsewhere), "Choose people from this circle.",
                "{\"%s\":\"x\"}".formatted(UUID.randomUUID()), "One of those columns isn't in this tab.");
        for (Map.Entry<String, String> one : wrong.entrySet()) {
            assertThat(send(HttpMethod.PATCH, "/v1/sheet-rows/" + rowId, nora, "{\"cells\":" + one.getKey() + "}", 400))
                    .contains(one.getValue());
        }

        // A number can be sent as a number or as text, with a dot or a comma; one person as one id; null empties.
        String changed = send(
                HttpMethod.PATCH,
                "/v1/sheet-rows/" + rowId,
                nora,
                "{\"cells\":{\"%s\":\"3,5\",\"%s\":\"%s\",\"%s\":null,\"%s\":false,\"%s\":\"\"}}"
                        .formatted(number, person, mia, date, tick, text),
                200);
        assertThat(JsonPath.<Double>read(changed, "$.row.cells['" + number + "'].number"))
                .isEqualTo(3.5);
        assertThat(JsonPath.<List<String>>read(changed, "$.row.cells['" + person + "'].people[*].name"))
                .containsExactly("Mia");
        assertThat(JsonPath.<String>read(changed, "$.row.cells['" + date + "'].kind"))
                .isEqualTo("empty");
        assertThat(JsonPath.<Boolean>read(changed, "$.row.cells['" + tick + "'].ticked"))
                .isFalse();
        assertThat(JsonPath.<String>read(changed, "$.row.cells['" + text + "'].kind"))
                .isEqualTo("empty");
        // What wasn't sent is as it was.
        assertThat(JsonPath.<Integer>read(changed, "$.row.cells['" + money + "'].cents"))
                .isEqualTo(235_000);

        // Column names: no two alike, no square brackets; a choice needs something to choose from.
        send(
                HttpMethod.POST,
                "/v1/sheet-tabs/" + tab + "/columns",
                nora,
                "{\"clientId\":\"%s\",\"name\":\"due\"}".formatted(id()),
                409);
        send(
                HttpMethod.POST,
                "/v1/sheet-tabs/" + tab + "/columns",
                nora,
                "{\"clientId\":\"%s\",\"name\":\"[Cost]\"}".formatted(id()),
                400);
        send(
                HttpMethod.POST,
                "/v1/sheet-tabs/" + tab + "/columns",
                nora,
                "{\"clientId\":\"%s\",\"name\":\"Size\",\"kind\":\"choice\"}".formatted(id()),
                400);
        assertThat(send(
                        HttpMethod.POST,
                        "/v1/sheet-tabs/" + tab + "/columns",
                        nora,
                        "{\"clientId\":\"%s\",\"name\":\"Notes\",\"kind\":\"text\",\"summary\":\"sum\"}"
                                .formatted(id()),
                        400))
                .contains("That total needs a column of numbers, money or dates.");
    }

    @Test
    void aFormulaColumnIsWorkedOutByTheApiAndSaysWhyWhenItCant() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String[] party = party(nora, circle);
        String tab = party[0];
        String item = party[1];
        String price = party[2];
        String qty = party[3];
        String total = party[4];

        String cake = row(nora, tab, "{\"%s\":\"Cake\",\"%s\":3800,\"%s\":1}".formatted(item, price, qty));
        String pizza = row(nora, tab, "{\"%s\":\"Pizza for eight\",\"%s\":650,\"%s\":8}".formatted(item, price, qty));
        String balloons = row(nora, tab, "{\"%s\":\"Balloons\",\"%s\":20}".formatted(item, qty));
        String blank = row(nora, tab, "{}");

        assertThat(JsonPath.<Integer>read(cake, "$.row.cells['" + total + "'].cents"))
                .isEqualTo(3800);
        assertThat(JsonPath.<String>read(cake, "$.row.cells['" + total + "'].kind"))
                .isEqualTo("money");
        assertThat(JsonPath.<Integer>read(pizza, "$.row.cells['" + total + "'].cents"))
                .isEqualTo(5200);
        // The price isn't known yet: the cell says so, in words.
        assertThat(JsonPath.<String>read(balloons, "$.row.cells['" + total + "'].kind"))
                .isEqualTo("problem");
        assertThat(JsonPath.<String>read(balloons, "$.row.cells['" + total + "'].problem"))
                .isEqualTo("Price is empty");
        // A row with nothing in it yet is quiet.
        assertThat(JsonPath.<String>read(blank, "$.row.cells['" + total + "'].kind"))
                .isEqualTo("empty");
        // The total counts what can be counted and says what it left out.
        assertThat(JsonPath.<Integer>read(blank, "$.totals['" + total + "'].cell.cents"))
                .isEqualTo(9000);
        assertThat(JsonPath.<Integer>read(blank, "$.totals['" + total + "'].leftOut"))
                .isEqualTo(1);
        assertThat(JsonPath.<String>read(blank, "$.totals['" + total + "'].leftOutSays"))
                .isEqualTo("1 row left out: Price is empty");
        assertThat(JsonPath.<String>read(blank, "$.totals['" + total + "'].says"))
                .isEqualTo("Adds up every row in Total.");

        // A formula column can't be typed into.
        String balloonsId = JsonPath.read(balloons, "$.row.id");
        assertThat(send(
                        HttpMethod.PATCH,
                        "/v1/sheet-rows/" + balloonsId,
                        nora,
                        "{\"cells\":{\"%s\":100}}".formatted(total),
                        400))
                .contains("Total is worked out by its formula. Change the formula instead.");

        // Filling in the price works the row out, and the totals follow in the same answer.
        tile(nora, tab, "Planned", "SUM([Total])");
        String priced = send(
                HttpMethod.PATCH,
                "/v1/sheet-rows/" + balloonsId,
                nora,
                "{\"cells\":{\"%s\":75}}".formatted(price),
                200);
        assertThat(JsonPath.<Integer>read(priced, "$.row.cells['" + total + "'].cents"))
                .isEqualTo(1500);
        assertThat(JsonPath.<Integer>read(priced, "$.totals['" + total + "'].cell.cents"))
                .isEqualTo(10_500);
        assertThat(JsonPath.<Integer>read(priced, "$.totals['" + total + "'].leftOut"))
                .isZero();
        assertThat(JsonPath.<Integer>read(priced, "$.tiles[0].cell.cents")).isEqualTo(10_500);

        // A formula column on a formula column, with a total inside it.
        String share = column(nora, tab, "Share", "formula", ",\"formula\":\"ROUND([Total] / SUM([Total]) * 100)\"");
        String all = fetch("/v1/sheets/" + party[5], nora);
        assertThat(JsonPath.<List<Integer>>read(all, "$.tab.rows[0:3].cells['" + share + "'].number"))
                .containsExactly(36, 50, 14);
        assertThat(JsonPath.<String>read(all, "$.tab.rows[3].cells['" + share + "'].kind"))
                .isEqualTo("empty");
        assertThat(JsonPath.<String>read(all, "$.tab.columns[4].says"))
                .isEqualTo("Total, divided by everything in Total times 100, rounded to a whole number.");
    }

    @Test
    void aFormulaThatCantBeReadOrGoesRoundInACircleIsRefusedWithASentence() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String[] party = party(nora, circle);
        String tab = party[0];
        String total = party[4];

        String noSuchColumn = send(
                HttpMethod.POST,
                "/v1/sheet-tabs/" + tab + "/columns",
                nora,
                "{\"clientId\":\"%s\",\"name\":\"Tax\",\"kind\":\"formula\",\"formula\":\"[Prise] * 0.22\"}"
                        .formatted(id()),
                400);
        assertThat(JsonPath.<String>read(noSuchColumn, "$.code")).isEqualTo("bad_formula");
        assertThat(JsonPath.<String>read(noSuchColumn, "$.detail"))
                .isEqualTo("There is no column called \"Prise\". This tab has: Item, Price, Qty, Total, Tax.");
        send(
                HttpMethod.POST,
                "/v1/sheet-tabs/" + tab + "/columns",
                nora,
                "{\"clientId\":\"%s\",\"name\":\"Tax\",\"kind\":\"formula\"}".formatted(id()),
                400);

        // Total uses Price. Making Price a formula that uses Total would go round in a circle.
        String withTax = column(nora, tab, "With tax", "formula", ",\"formula\":\"[Total] * 1.22\"");
        String circleOfTwo =
                send(HttpMethod.PATCH, "/v1/sheet-columns/" + total, nora, "{\"formula\":\"[With tax] / 1.22\"}", 400);
        assertThat(JsonPath.<String>read(circleOfTwo, "$.detail"))
                .isEqualTo(
                        "That would go round in a circle: With tax uses Total and Total uses With tax. One of them has to stand on its own.");
        assertThat(send(
                        HttpMethod.PATCH,
                        "/v1/sheet-columns/" + withTax,
                        nora,
                        "{\"formula\":\"[With tax] + 1\"}",
                        400))
                .contains("With tax can't use itself in its own formula.");
        // Nothing was kept of either: both still work.
        String sheet = fetch("/v1/sheets/" + party[5], nora);
        assertThat(JsonPath.<String>read(sheet, "$.tab.columns[3].formula")).isEqualTo("[Price] * [Qty]");
        assertThat(JsonPath.<String>read(sheet, "$.tab.columns[4].formula")).isEqualTo("[Total] * 1.22");

        // A tile is one number: a bare column in it is refused, and so is a total inside a total.
        assertThat(send(
                        HttpMethod.POST,
                        "/v1/sheet-tabs/" + tab + "/tiles",
                        nora,
                        "{\"clientId\":\"%s\",\"name\":\"Odd\",\"formula\":\"[Price] * 2\"}".formatted(id()),
                        400))
                .contains("[Price] is a whole column, and a tile shows one number.");
        assertThat(send(
                        HttpMethod.POST,
                        "/v1/sheet-tabs/" + tab + "/tiles",
                        nora,
                        "{\"clientId\":\"%s\",\"name\":\"Odder\",\"formula\":\"SUM(COUNT([Price]))\"}".formatted(id()),
                        400))
                .contains("COUNT is inside another total.");
        assertThat(JsonPath.<Integer>read(fetch("/v1/sheets/" + party[5], nora), "$.tab.tiles.length()"))
                .isZero();
    }

    @Test
    void twoPeopleChangingDifferentCellsOfARowBothKeepWhatTheyDid() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String sheet = send(
                HttpMethod.POST,
                "/v1/sheets",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"trip_budget\",\"title\":\"Norway budget\"}"
                        .formatted(id(), circle),
                201);
        String id = JsonPath.read(sheet, "$.id");
        String cost = JsonPath.read(sheet, "$.tab.columns[2].id");
        String paid = JsonPath.read(sheet, "$.tab.columns[3].id");
        String due = JsonPath.read(sheet, "$.tab.columns[4].id");
        String row = JsonPath.read(sheet, "$.tab.rows[1].id");
        String other = JsonPath.read(sheet, "$.tab.rows[2].id");

        // Both have the sheet open. Nora corrects the cost while Alex ticks it as paid and writes a note.
        send(HttpMethod.PATCH, "/v1/sheet-rows/" + row, nora, "{\"cells\":{\"%s\":235000}}".formatted(cost), 200);
        send(HttpMethod.PATCH, "/v1/sheet-rows/" + row, alex, "{\"cells\":{\"%s\":true}}".formatted(paid), 200);
        send(HttpMethod.PATCH, "/v1/sheet-rows/" + row, alex, "{\"note\":\"Deposit paid\"}", 200);
        send(HttpMethod.PATCH, "/v1/sheet-rows/" + row, nora, "{\"cells\":{\"%s\":null}}".formatted(due), 200);

        String now = fetch("/v1/sheets/" + id, alex);
        assertThat(JsonPath.<Integer>read(now, "$.tab.rows[1].cells['" + cost + "'].cents"))
                .isEqualTo(235_000);
        assertThat(JsonPath.<Boolean>read(now, "$.tab.rows[1].cells['" + paid + "'].ticked"))
                .isTrue();
        assertThat(JsonPath.<String>read(now, "$.tab.rows[1].note")).isEqualTo("Deposit paid");
        assertThat(JsonPath.<String>read(now, "$.tab.rows[1].cells['" + due + "'].kind"))
                .isEqualTo("empty");
        // Paid: the first row's 600 and this one's 2,350.
        assertThat(JsonPath.<Integer>read(now, "$.tab.tiles[1].cell.cents")).isEqualTo(295_000);
        assertThat(JsonPath.<Integer>read(now, "$.tab.columns[3].total.cell.number"))
                .isEqualTo(2);
        assertThat(JsonPath.<Integer>read(now, "$.tab.columns[3].total.of")).isEqualTo(5);
        // It says who changed it last, and who else has it open.
        assertThat(JsonPath.<String>read(now, "$.editedBy.name")).isEqualTo("Nora");
        assertThat(JsonPath.<List<String>>read(fetch("/v1/sheets/" + id, nora), "$.here[*].name"))
                .containsExactly("Alex");

        // Both remove the same row: fine. A row that is gone can't be changed any more.
        send(HttpMethod.DELETE, "/v1/sheet-rows/" + other, nora, null, 204);
        send(HttpMethod.DELETE, "/v1/sheet-rows/" + other, alex, null, 204);
        assertThat(send(HttpMethod.PATCH, "/v1/sheet-rows/" + other, alex, "{\"note\":\"Too late\"}", 404))
                .contains("That row isn't there any more.");
        assertThat(JsonPath.<Integer>read(fetch("/v1/sheets/" + id, nora), "$.tab.rowCount"))
                .isEqualTo(4);
    }

    @Test
    void rowsAreReadInPagesAndATabHoldsTwoThousand() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String sheet = sheet(nora, circle, "Every receipt", "");
        String id = JsonPath.read(sheet, "$.id");
        String tab = JsonPath.read(sheet, "$.tab.id");
        String item = JsonPath.read(sheet, "$.tab.columns[0].id");
        String amount = JsonPath.read(sheet, "$.tab.columns[1].id");
        // 1,999 rows put there directly: a euro each, numbered.
        jdbc.sql("""
            insert into sheet_rows (id, tab_id, cells, position)
            select gen_random_uuid(), cast(:tab as uuid),
              jsonb_build_object(cast(:item as text), 'Receipt ' || n, cast(:amount as text), 100), n
            from generate_series(1, 1999) n
            """)
                .param("tab", tab)
                .param("item", item)
                .param("amount", amount)
                .update();

        String last = row(nora, tab, "{\"%s\":\"The last one\",\"%s\":100}".formatted(item, amount));
        assertThat(JsonPath.<Integer>read(last, "$.row.number")).isEqualTo(2000);
        assertThat(JsonPath.<Integer>read(last, "$.totals['" + amount + "'].cell.cents"))
                .isEqualTo(200_000);
        assertThat(send(
                        HttpMethod.POST,
                        "/v1/sheet-tabs/" + tab + "/rows",
                        nora,
                        "{\"clientId\":\"%s\",\"cells\":{}}".formatted(id()),
                        409))
                .contains("A tab holds 2,000 rows at most.");

        // The sheet comes with its first rows and every total; the rest are read a page at a time.
        String first = fetch("/v1/sheets/" + id + "?limit=50", nora);
        assertThat(JsonPath.<Integer>read(first, "$.tab.rowCount")).isEqualTo(2000);
        assertThat(JsonPath.<Integer>read(first, "$.tab.rows.length()")).isEqualTo(50);
        assertThat(JsonPath.<Integer>read(first, "$.tab.columns[1].total.cell.cents"))
                .isEqualTo(200_000);
        String next = fetch(
                "/v1/sheets/" + id + "/rows?limit=100&cursor=" + JsonPath.<String>read(first, "$.tab.nextRows"), nora);
        assertThat(JsonPath.<Integer>read(next, "$.items.length()")).isEqualTo(100);
        assertThat(JsonPath.<Integer>read(next, "$.items[0].number")).isEqualTo(51);
        assertThat(JsonPath.<String>read(next, "$.items[0].cells['" + item + "'].text"))
                .isEqualTo("Receipt 51");
        String cursor = JsonPath.read(next, "$.nextCursor");
        int seen = 150;
        while (cursor != null) {
            String page = fetch("/v1/sheets/" + id + "/rows?limit=100&cursor=" + cursor, nora);
            seen += JsonPath.<Integer>read(page, "$.items.length()");
            cursor = JsonPath.read(page, "$.nextCursor");
        }
        assertThat(seen).isEqualTo(2000);
        send(HttpMethod.GET, "/v1/sheets/" + id + "/rows?cursor=nonsense", nora, null, 400);

        // And forty columns.
        for (int n = 3; n <= 40; n++) {
            column(nora, tab, "Column " + n, "text", "");
        }
        assertThat(send(
                        HttpMethod.POST,
                        "/v1/sheet-tabs/" + tab + "/columns",
                        nora,
                        "{\"clientId\":\"%s\",\"name\":\"One too many\"}".formatted(id()),
                        409))
                .contains("A tab holds 40 columns at most.");
    }

    @Test
    void aRowOpensAsACardWithItsNeighboursItsNoteAndItsPapers() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String sheet = send(
                HttpMethod.POST,
                "/v1/sheets",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"trip_budget\",\"title\":\"Norway budget\"}"
                        .formatted(id(), circle),
                201);
        List<String> rows = JsonPath.read(sheet, "$.tab.rows[*].id");
        String cost = JsonPath.read(sheet, "$.tab.columns[2].id");
        send(
                HttpMethod.PATCH,
                "/v1/sheet-rows/" + rows.get(2),
                nora,
                "{\"note\":\"The rest is due six weeks before we go.\"}",
                200);

        String card = fetch("/v1/sheet-rows/" + rows.get(2), alex);

        // "Row 3 of 5 · Norway budget", every column as a field, and the rows either side by name.
        assertThat(JsonPath.<String>read(card, "$.sheetTitle")).isEqualTo("Norway budget");
        assertThat(JsonPath.<String>read(card, "$.tabName")).isEqualTo("Budget");
        assertThat(JsonPath.<Integer>read(card, "$.row.number")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(card, "$.of")).isEqualTo(5);
        assertThat(JsonPath.<List<String>>read(card, "$.columns[*].name"))
                .containsExactly("Item", "Who", "Cost", "Paid", "Due");
        assertThat(JsonPath.<Integer>read(card, "$.row.cells['" + cost + "'].cents"))
                .isEqualTo(15_000);
        assertThat(JsonPath.<String>read(card, "$.row.note")).isEqualTo("The rest is due six weeks before we go.");
        assertThat(JsonPath.<String>read(card, "$.previous.label")).isEqualTo("Somewhere to stay");
        assertThat(JsonPath.<String>read(card, "$.previous.id")).isEqualTo(rows.get(1));
        assertThat(JsonPath.<String>read(card, "$.next.label")).isEqualTo("Food");
        assertThat(JsonPath.<Boolean>read(card, "$.canEdit")).isTrue();
        assertThat(JsonPath.<Object>read(fetch("/v1/sheet-rows/" + rows.get(0), alex), "$.previous"))
                .isNull();
        assertThat(JsonPath.<Object>read(fetch("/v1/sheet-rows/" + rows.get(4), alex), "$.next"))
                .isNull();

        // A receipt is kept with the row: once, however often the phone sends it, and only your own upload.
        String receipt = uploadPhoto(nora);
        String paper = "{\"clientId\":\"%s\",\"mediaId\":\"%s\"}".formatted(id(), receipt);
        send(HttpMethod.POST, "/v1/sheet-rows/" + rows.get(2) + "/papers", nora, paper, 201);
        String kept = send(HttpMethod.POST, "/v1/sheet-rows/" + rows.get(2) + "/papers", nora, paper, 201);
        assertThat(JsonPath.<Integer>read(kept, "$.papers.length()")).isEqualTo(1);
        assertThat(JsonPath.<String>read(kept, "$.papers[0].id")).isEqualTo(receipt);
        assertThat(JsonPath.<String>read(kept, "$.papers[0].thumbUrl")).isNotBlank();
        assertThat(JsonPath.<Integer>read(kept, "$.row.papers")).isEqualTo(1);
        send(HttpMethod.POST, "/v1/sheet-rows/" + rows.get(2) + "/papers", alex, paper, 400);
        assertThat(JsonPath.<Integer>read(
                        fetch("/v1/sheets/" + JsonPath.<String>read(sheet, "$.id"), alex), "$.tab.rows[2].papers"))
                .isEqualTo(1);

        // Taken off again, its file goes with it; so does the receipt of a row that is removed.
        send(HttpMethod.DELETE, "/v1/sheet-rows/" + rows.get(2) + "/papers/" + receipt, alex, null, 204);
        send(HttpMethod.DELETE, "/v1/sheet-rows/" + rows.get(2) + "/papers/" + receipt, alex, null, 204);
        assertThat(JsonPath.<Integer>read(fetch("/v1/sheet-rows/" + rows.get(2), nora), "$.papers.length()"))
                .isZero();
        assertThat(jdbc.sql("select count(*) from media where id = cast(:id as uuid)")
                        .param("id", receipt)
                        .query(Integer.class)
                        .single())
                .isZero();
        String another = uploadPhoto(alex);
        send(
                HttpMethod.POST,
                "/v1/sheet-rows/" + rows.get(3) + "/papers",
                alex,
                "{\"clientId\":\"%s\",\"mediaId\":\"%s\"}".formatted(id(), another),
                201);
        send(HttpMethod.DELETE, "/v1/sheet-rows/" + rows.get(3), nora, null, 204);
        assertThat(jdbc.sql("select count(*) from media where id = cast(:id as uuid)")
                        .param("id", another)
                        .query(Integer.class)
                        .single())
                .isZero();
    }

    @Test
    void renamingAColumnBreaksNothingAndAColumnAFormulaUsesStays() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String[] party = party(nora, circle);
        String tab = party[0];
        String price = party[2];
        String qty = party[3];
        String total = party[4];
        row(nora, tab, "{\"%s\":\"Cake\",\"%s\":3800,\"%s\":2}".formatted(party[1], price, qty));
        String planned = JsonPath.read(tile(nora, tab, "Planned", "SUM([Price] * [Qty])"), "$.id");

        // Formulas keep columns by id: a new name shows up in them by itself.
        String renamed = send(HttpMethod.PATCH, "/v1/sheet-columns/" + price, nora, "{\"name\":\"Cost each\"}", 200);
        assertThat(JsonPath.<String>read(renamed, "$.name")).isEqualTo("Cost each");
        String sheet = fetch("/v1/sheets/" + party[5], nora);
        assertThat(JsonPath.<String>read(sheet, "$.tab.columns[3].formula")).isEqualTo("[Cost each] * [Qty]");
        assertThat(JsonPath.<Integer>read(sheet, "$.tab.rows[0].cells['" + total + "'].cents"))
                .isEqualTo(7600);
        assertThat(JsonPath.<String>read(sheet, "$.tab.tiles[0].formula")).isEqualTo("SUM([Cost each] * [Qty])");
        assertThat(JsonPath.<Integer>read(sheet, "$.tab.tiles[0].cell.cents")).isEqualTo(7600);

        // A column that a formula or a tile uses can't be removed from under it.
        assertThat(send(HttpMethod.DELETE, "/v1/sheet-columns/" + price, nora, null, 409))
                .contains("Total and the tile Planned use Cost each. Change them first.");
        send(HttpMethod.DELETE, "/v1/sheet-tiles/" + planned, nora, null, 204);
        send(HttpMethod.DELETE, "/v1/sheet-tiles/" + planned, nora, null, 204);
        assertThat(send(HttpMethod.DELETE, "/v1/sheet-columns/" + price, nora, null, 409))
                .contains("Total uses Cost each. Change it first.");
        send(HttpMethod.PATCH, "/v1/sheet-columns/" + total, nora, "{\"formula\":\"[Qty] * 2\"}", 200);
        send(HttpMethod.DELETE, "/v1/sheet-columns/" + price, nora, null, 204);
        send(HttpMethod.DELETE, "/v1/sheet-columns/" + price, nora, null, 204);
        String without = fetch("/v1/sheets/" + party[5], nora);
        assertThat(JsonPath.<List<String>>read(without, "$.tab.columns[*].name"))
                .containsExactly("Item", "Qty", "Total");
        assertThat(JsonPath.<Integer>read(without, "$.tab.rows[0].cells['" + total + "'].number"))
                .isEqualTo(4);

        // A column that holds values keeps its kind, except between text and a choice.
        assertThat(send(HttpMethod.PATCH, "/v1/sheet-columns/" + qty, nora, "{\"kind\":\"date\"}", 409))
                .contains("Qty already holds values that wouldn't fit. Add a new column of that kind instead.");
        String asChoice = send(
                HttpMethod.PATCH,
                "/v1/sheet-columns/" + party[1],
                nora,
                "{\"kind\":\"choice\",\"options\":[\"Cake\",\"Drinks\"]}",
                200);
        assertThat(JsonPath.<String>read(asChoice, "$.kind")).isEqualTo("choice");

        // A column can be moved, and given a total.
        String moved = send(
                HttpMethod.PATCH,
                "/v1/sheet-columns/" + total,
                nora,
                "{\"before\":\"%s\",\"summary\":\"max\"}".formatted(party[1]),
                200);
        assertThat(JsonPath.<Integer>read(moved, "$.total.cell.number")).isEqualTo(4);
        assertThat(JsonPath.<List<String>>read(fetch("/v1/sheets/" + party[5], nora), "$.tab.columns[*].name"))
                .containsExactly("Total", "Item", "Qty");
    }

    @Test
    void tabsCanBeAddedCopiedRenamedMovedAndRemovedButNotTheLast() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String sheet = send(
                HttpMethod.POST,
                "/v1/sheets",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"monthly_budget\",\"title\":\"Budget 2026\"}"
                        .formatted(id(), circle),
                201);
        String id = JsonPath.read(sheet, "$.id");
        String november = JsonPath.read(sheet, "$.tab.id");
        send(HttpMethod.PATCH, "/v1/sheet-tabs/" + november, nora, "{\"name\":\"Nov\"}", 200);

        // Next month: the same columns and tiles, with their formulas pointing at its own columns, and no rows.
        String december = send(
                HttpMethod.POST,
                "/v1/sheets/" + id + "/tabs",
                nora,
                "{\"clientId\":\"%s\",\"name\":\"Dec\",\"copyColumnsOf\":\"%s\"}".formatted(id(), november),
                201);
        String dec = JsonPath.read(december, "$.tab.id");
        assertThat(dec).isNotEqualTo(november);
        assertThat(JsonPath.<List<String>>read(december, "$.tabs[*].name")).containsExactly("Nov", "Dec");
        assertThat(JsonPath.<List<Integer>>read(december, "$.tabs[*].rows")).containsExactly(5, 0);
        assertThat(JsonPath.<List<String>>read(december, "$.tab.columns[*].name"))
                .containsExactly("Item", "Kind", "Amount", "Done");
        assertThat(JsonPath.<List<String>>read(december, "$.tab.tiles[*].name"))
                .containsExactly("Money in", "Going out", "What's left");
        assertThat(JsonPath.<List<Integer>>read(december, "$.tab.tiles[*].cell.cents"))
                .containsExactly(0, 0, 0);
        String kind = JsonPath.read(december, "$.tab.columns[1].id");
        String amount = JsonPath.read(december, "$.tab.columns[2].id");
        String added = row(nora, dec, "{\"%s\":\"Money in\",\"%s\":240000}".formatted(kind, amount));
        assertThat(JsonPath.<List<Integer>>read(added, "$.tiles[*].cell.cents")).containsExactly(240_000, 0, 240_000);
        // November is as it was: 2,400 in, 1,710 out.
        assertThat(JsonPath.<List<Integer>>read(
                        fetch("/v1/sheets/" + id + "?tab=" + november, nora), "$.tab.tiles[*].cell.cents"))
                .containsExactly(240_000, 171_000, 69_000);

        // A plain new tab starts with one column to write in. Tabs can be put in another order.
        String notes = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/sheets/" + id + "/tabs",
                        nora,
                        "{\"clientId\":\"%s\",\"name\":\"Notes\"}".formatted(id()),
                        201),
                "$.tab.id");
        String moved =
                send(HttpMethod.PATCH, "/v1/sheet-tabs/" + notes, nora, "{\"before\":\"%s\"}".formatted(november), 200);
        assertThat(JsonPath.<List<String>>read(moved, "$.tabs[*].name")).containsExactly("Notes", "Nov", "Dec");
        assertThat(JsonPath.<String>read(fetch("/v1/sheets/" + id, nora), "$.tab.name"))
                .isEqualTo("Notes");

        // Removing a tab takes its rows with it; the last tab stays.
        send(HttpMethod.DELETE, "/v1/sheet-tabs/" + november, nora, null, 204);
        send(HttpMethod.DELETE, "/v1/sheet-tabs/" + november, nora, null, 204);
        send(HttpMethod.DELETE, "/v1/sheet-tabs/" + notes, nora, null, 204);
        assertThat(send(HttpMethod.DELETE, "/v1/sheet-tabs/" + dec, nora, null, 409))
                .contains("A sheet keeps at least one tab.");
        send(HttpMethod.GET, "/v1/sheets/" + id + "?tab=" + november, nora, null, 404);

        // The sheet itself can be renamed and count in another currency.
        String renamed =
                send(HttpMethod.PATCH, "/v1/sheets/" + id, nora, "{\"title\":\"Budget\",\"currency\":\"usd\"}", 200);
        assertThat(JsonPath.<String>read(renamed, "$.title")).isEqualTo("Budget");
        assertThat(JsonPath.<String>read(renamed, "$.currency")).isEqualTo("USD");
    }

    @Test
    void aFormulaIsReadBackAsChipsASentenceAndItsAnswerBeforeItIsKept() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        String alexId = join(nora, circle, alex);
        String sheet = send(
                HttpMethod.POST,
                "/v1/sheets",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"trip_budget\",\"title\":\"Norway budget\"}"
                        .formatted(id(), circle),
                201);
        String tab = JsonPath.read(sheet, "$.tab.id");
        String who = JsonPath.read(sheet, "$.tab.columns[1].id");
        String firstRow = JsonPath.read(sheet, "$.tab.rows[0].id");
        send(
                HttpMethod.PATCH,
                "/v1/sheet-rows/" + firstRow,
                nora,
                "{\"cells\":{\"%s\":\"%s\"}}".formatted(who, alexId),
                200);

        // The formula sheet of the screen: "Still to pay".
        String read = send(
                HttpMethod.POST,
                "/v1/sheet-tabs/" + tab + "/formula",
                nora,
                "{\"formula\":\"sum([cost]) − sumif([paid],[cost])\"}",
                200);
        assertThat(JsonPath.<Boolean>read(read, "$.understood")).isTrue();
        assertThat(JsonPath.<String>read(read, "$.formula")).isEqualTo("SUM([Cost]) - SUMIF([Paid], [Cost])");
        assertThat(JsonPath.<Boolean>read(read, "$.oneAnswer")).isTrue();
        assertThat(JsonPath.<List<String>>read(read, "$.parts[*].text"))
                .containsExactly("SUM", "Cost", "−", "SUM IF", "Paid", "is ticked", "Cost");
        assertThat(JsonPath.<List<String>>read(read, "$.parts[*].kind"))
                .containsExactly("function", "column", "sign", "function", "column", "words", "column");
        assertThat(JsonPath.<String>read(read, "$.says"))
                .isEqualTo("Everything in Cost, minus the Cost of rows where Paid is ticked.");
        // 2,250 planned, 600 of it paid.
        assertThat(JsonPath.<Integer>read(read, "$.answer.cents")).isEqualTo(165_000);
        // What the chips are picked from.
        assertThat(JsonPath.<List<String>>read(read, "$.columns[*].name"))
                .containsExactly("Item", "Who", "Cost", "Paid", "Due");
        assertThat(JsonPath.<List<String>>read(read, "$.functions[*].label"))
                .startsWith("SUM", "SUM IF", "AVERAGE", "COUNT", "IF", "PAYMENT");

        // A formula for each row is answered with the first row that has an answer.
        String each =
                send(HttpMethod.POST, "/v1/sheet-tabs/" + tab + "/formula", nora, "{\"formula\":\"[Cost] / 4\"}", 200);
        assertThat(JsonPath.<Boolean>read(each, "$.oneAnswer")).isFalse();
        assertThat(JsonPath.<Integer>read(each, "$.answer.cents")).isEqualTo(15_000);
        assertThat(JsonPath.<String>read(each, "$.says")).isEqualTo("Cost divided by 4.");

        // What can't be read comes back with the reason, not as a failure.
        String broken =
                send(HttpMethod.POST, "/v1/sheet-tabs/" + tab + "/formula", nora, "{\"formula\":\"SUM([Cost]\"}", 200);
        assertThat(JsonPath.<Boolean>read(broken, "$.understood")).isFalse();
        assertThat(JsonPath.<String>read(broken, "$.problem"))
                .isEqualTo("A bracket was opened after SUM and never closed.");
        assertThat(JsonPath.<Object>read(broken, "$.formula")).isNull();
        assertThat(JsonPath.<Integer>read(broken, "$.columns.length()")).isEqualTo(5);

        // "Or ask": the question of the screen.
        String asked = send(
                HttpMethod.POST,
                "/v1/sheet-tabs/" + tab + "/ask",
                nora,
                "{\"question\":\"How much has Alex paid?\"}",
                200);
        assertThat(JsonPath.<Boolean>read(asked, "$.understood")).isTrue();
        assertThat(JsonPath.<String>read(asked, "$.formula")).isEqualTo("SUMIF(AND([Who] = \"Alex\", [Paid]), [Cost])");
        assertThat(JsonPath.<String>read(asked, "$.says"))
                .isEqualTo("The Cost of rows where Who is “Alex” and Paid is ticked.");
        assertThat(JsonPath.<Integer>read(asked, "$.answer.cents")).isEqualTo(60_000);
        // "I" is whoever asks.
        assertThat(JsonPath.<String>read(
                        send(
                                HttpMethod.POST,
                                "/v1/sheet-tabs/" + tab + "/ask",
                                alex,
                                "{\"question\":\"How much have I paid?\"}",
                                200),
                        "$.formula"))
                .isEqualTo("SUMIF(AND([Who] = \"Alex\", [Paid]), [Cost])");

        String lost = send(
                HttpMethod.POST,
                "/v1/sheet-tabs/" + tab + "/ask",
                nora,
                "{\"question\":\"Should we go to Norway or Sicily?\"}",
                200);
        assertThat(JsonPath.<Boolean>read(lost, "$.understood")).isFalse();
        assertThat(JsonPath.<String>read(lost, "$.problem"))
                .startsWith("I didn't understand that; here is how to write it");
        assertThat(JsonPath.<List<String>>read(lost, "$.examples"))
                .contains("How much is left to pay?", "How much has Nora paid?", "Total Cost");
        assertThat(JsonPath.<Object>read(lost, "$.formula")).isNull();

        // Reading and asking keep nothing.
        assertThat(JsonPath.<Integer>read(
                        fetch("/v1/sheets/" + JsonPath.<String>read(sheet, "$.id"), nora), "$.tab.tiles.length()"))
                .isEqualTo(3);
    }

    @Test
    void aLoanIsWorkedOutWithoutSavingAnythingAndCanBeKeptAsASheet() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");

        // The loan planner's own screen: €240,000 at 3.4% over 25 years, and €100 more a month.
        String plan =
                fetch("/v1/money/loan-plan?principalCents=24000000&ratePercent=3.4&years=25&extraCents=10000", nora);
        assertThat(JsonPath.<Integer>read(plan, "$.plan.paymentCents")).isEqualTo(118_866);
        assertThat(JsonPath.<Integer>read(plan, "$.plan.interestCents")).isEqualTo(11_659_963);
        assertThat(JsonPath.<Integer>read(plan, "$.plan.payments")).isEqualTo(300);
        assertThat(JsonPath.<Integer>read(plan, "$.withExtra.payments")).isEqualTo(266);
        assertThat(JsonPath.<Integer>read(plan, "$.monthsSooner")).isEqualTo(35);
        assertThat(JsonPath.<Integer>read(plan, "$.interestSavedCents")).isEqualTo(1_495_567);
        // The chart: what is still owed at the end of each year, with and without the extra.
        assertThat(JsonPath.<Integer>read(plan, "$.chart.length()")).isEqualTo(26);
        assertThat(JsonPath.<Integer>read(plan, "$.chart[0].owedCents")).isEqualTo(24_000_000);
        assertThat(JsonPath.<Integer>read(plan, "$.chart[25].owedCents")).isZero();
        assertThat(JsonPath.<Integer>read(plan, "$.chart[22].owedWithExtraCents"))
                .isEqualTo(143_324);
        assertThat(JsonPath.<Integer>read(plan, "$.chart[23].owedWithExtraCents"))
                .isZero();
        assertThat(JsonPath.<Integer>read(plan, "$.schedule.length()")).isEqualTo(23);

        String plain = fetch("/v1/money/loan-plan?principalCents=24000000&ratePercent=3.4&years=25", nora);
        assertThat(JsonPath.<Object>read(plain, "$.withExtra")).isNull();
        assertThat(JsonPath.<Integer>read(plain, "$.monthsSooner")).isZero();
        assertThat(JsonPath.<Integer>read(plain, "$.schedule.length()")).isEqualTo(25);
        assertThat(send(
                        HttpMethod.GET,
                        "/v1/money/loan-plan?principalCents=24000000&ratePercent=3.4&years=80",
                        nora,
                        null,
                        400))
                .contains("A loan runs for 1 to 50 years.");
        send(HttpMethod.GET, "/v1/money/loan-plan?principalCents=0&ratePercent=3.4&years=25", nora, null, 400);
        send(HttpMethod.GET, "/v1/money/loan-plan?principalCents=24000000&ratePercent=-1&years=25", nora, null, 400);
        send(HttpMethod.GET, "/v1/money/loan-plan?principalCents=24000000&years=25", nora, null, 400);

        // "Keep as a sheet": a row for each year, and the payment as a tile that works itself out.
        String kept = sheet(
                nora, circle, "Loan plan", ",\"loan\":{\"principalCents\":24000000,\"ratePercent\":3.4,\"years\":25}");
        assertThat(JsonPath.<String>read(kept, "$.template")).isEqualTo("loan");
        assertThat(JsonPath.<Integer>read(kept, "$.tab.rowCount")).isEqualTo(25);
        assertThat(JsonPath.<List<String>>read(kept, "$.tab.tiles[*].name"))
                .containsExactly("Each month", "Interest in all", "Paid in all");
        assertThat(JsonPath.<List<Integer>>read(kept, "$.tab.tiles[*].cell.cents"))
                .containsExactly(118_866, 11_659_963, 35_659_963);
        assertThat(JsonPath.<String>read(kept, "$.tab.tiles[0].formula")).isEqualTo("PAYMENT(€240000, 3.4, 25)");
        assertThat(JsonPath.<String>read(kept, "$.tab.tiles[0].says"))
                .isEqualTo("The monthly payment on €240000 at 3.4% a year over 25 years.");
        send(
                HttpMethod.POST,
                "/v1/sheets",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"loan\":{\"principalCents\":24000000,\"ratePercent\":3.4,\"years\":90}}"
                        .formatted(id(), circle),
                400);

        // The savings plan has sliders too: €5,600 of €8,000 saved, €480 a month, is five months.
        String savings = fetch("/v1/money/savings-plan?goalCents=800000&savedCents=560000&monthlyCents=48000", nora);
        assertThat(JsonPath.<Boolean>read(savings, "$.reached")).isTrue();
        assertThat(JsonPath.<Integer>read(savings, "$.months")).isEqualTo(5);
        assertThat(JsonPath.<Boolean>read(
                        fetch("/v1/money/savings-plan?goalCents=800000&monthlyCents=0", nora), "$.reached"))
                .isFalse();
    }

    @Test
    void aSheetsNamedTotalsCanBeReadByOtherPlacesForWhoeverMaySeeIt() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        String sheet = send(
                HttpMethod.POST,
                "/v1/sheets",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"savings\",\"title\":\"Norway savings\",\"day\":\"2026-11-11\"}"
                        .formatted(id(), circle),
                201);
        UUID id = UUID.fromString(JsonPath.read(sheet, "$.id"));
        UUID noraUser = UUID.fromString(userId(noraId));
        UUID alexUser = UUID.fromString(userId(alexId));

        // What a goal reads: the tile called "Saved". €500 of €8,000 in the template's sample rows.
        NamedTotalResponse saved = sheets.total(id, "saved", noraUser).orElseThrow();
        assertThat(saved.name()).isEqualTo("Saved");
        assertThat(saved.cents()).isEqualTo(50_000);
        assertThat(saved.currency()).isEqualTo("EUR");
        assertThat(sheets.total(id, "Goal", noraUser).orElseThrow().cents()).isEqualTo(800_000);
        // The total under a column has the column's name.
        assertThat(sheets.total(id, "Put in", noraUser).orElseThrow().cents()).isEqualTo(50_000);
        assertThat(sheets.totals(id, noraUser))
                .extracting(NamedTotalResponse::name)
                .containsExactly("Saved", "Goal", "To go", "Put in");
        assertThat(sheets.total(id, "Spent", noraUser)).isEmpty();

        // Nothing for someone it isn't shared with, or for an id that is no sheet.
        assertThat(sheets.total(id, "Saved", alexUser)).isEmpty();
        assertThat(sheets.totals(id, alexUser)).isEmpty();
        assertThat(sheets.total(UUID.fromString(circle), "Saved", noraUser)).isEmpty();
        send(
                HttpMethod.PUT,
                "/v1/things/" + id + "/audience",
                nora,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(alexId),
                200);
        assertThat(sheets.total(id, "Saved", alexUser).orElseThrow().cents()).isEqualTo(50_000);
    }

    @Test
    void aListOfSheetsShowsEachOnesHeadlineAndASheetSaysWhereItStands() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String blank = JsonPath.read(sheet(nora, circle, "Ideas", ""), "$.id");
        String party = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/sheets",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"party_budget\"}"
                                .formatted(id(), circle),
                        201),
                "$.id");
        String trip = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/sheets",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"trip_budget\",\"title\":\"Norway budget\"}"
                                .formatted(id(), circle),
                        201),
                "$.id");

        // The last one changed first, each with its first tile.
        String list = fetch("/v1/circles/" + circle + "/sheets", nora);
        assertThat(JsonPath.<List<String>>read(list, "$.items[*].title"))
                .containsExactly("Norway budget", "Party budget", "Ideas");
        assertThat(JsonPath.<List<String>>read(list, "$.items[*].tag")).containsExactly("Trip", "Party", "");
        assertThat(JsonPath.<List<Integer>>read(list, "$.items[*].tabs")).containsExactly(1, 1, 1);
        assertThat(JsonPath.<String>read(list, "$.items[0].headlineName")).isEqualTo("Planned");
        assertThat(JsonPath.<Integer>read(list, "$.items[0].headline.cents")).isEqualTo(225_000);
        assertThat(JsonPath.<Object>read(list, "$.items[2].headline")).isNull();
        assertThat(JsonPath.<String>read(list, "$.items[0].editedBy.name")).isEqualTo("Nora");
        String page = fetch("/v1/circles/" + circle + "/sheets?limit=1", nora);
        assertThat(JsonPath.<Integer>read(page, "$.items.length()")).isEqualTo(1);
        assertThat(JsonPath.<String>read(page, "$.nextCursor")).isNotBlank();

        // Among other things, a sheet says where it stands: a tile against another, a first tile, or its rows.
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + party, nora), "$.glance"))
                .isEqualTo("€145 of €250");
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + trip, nora), "$.glance"))
                .isEqualTo("€600 of €2,250");
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + blank, nora), "$.glance"))
                .isEqualTo("0 rows");
        // And the Money page lists them.
        assertThat(JsonPath.<List<String>>read(fetch("/v1/circles/" + circle + "/money", nora), "$.sheets[*].title"))
                .containsExactly("Norway budget", "Party budget", "Ideas");

        // Words inside a sheet are found: a cell, a note, a column's name.
        assertThat(fetch("/v1/circles/" + circle + "/search?q=somewhere to stay", nora))
                .contains(trip);
        assertThat(JsonPath.<String>read(
                        fetch("/v1/circles/" + circle + "/search?q=party bags", nora), "$.hits[0].snippet"))
                .isEqualTo("Party bags");
        assertThat(fetch("/v1/circles/" + circle + "/search?q=bought", nora))
                .contains(party)
                .doesNotContain(trip);
    }
}
