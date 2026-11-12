package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.TextStyle;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * A flat's templates, tried as the three people who live there: the kitty's sums, a split that only counts
 * once everyone agreed, heads-ups and the nights they take off a bill, what was heard in the kitchen, and the
 * roll of everyone who has lived here. (The guest book has its own test: {@code GuestBookTest}.)
 */
class FlatTemplatesTest extends BoardTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);

    private String kai;
    private String lea;
    private String lena;
    private String flat;
    private String kaiId;
    private String leaId;
    private String lenaId;

    @BeforeEach
    void threeHousemates() throws Exception {
        kai = person("Kai");
        lea = person("Lea");
        lena = person("Lena");
        flat = circle(kai, "flat", "Trubarjeva 9");
        kaiId = memberOf(kai, flat);
        leaId = join(kai, flat, lea);
        lenaId = join(kai, flat, lena);
    }

    private String today(String token) throws Exception {
        return fetch("/v1/circles/" + flat + "/today?day=" + TODAY, token);
    }

    private List<String> cardTitles(String token) throws Exception {
        return JsonPath.read(today(token), "$.cards[*].title");
    }

    // ---------- 18.3 the kitty ----------

    @Test
    void theKittyAddsUpWhatWasPaidInAndBoughtAndSaysWhoseTurnItIsToShop() throws Exception {
        String kitty = board(kai, flat, "kitty", null, "{\"eachCents\":1000}");
        String empty = view(lena, kitty);
        assertThat(JsonPath.<List<String>>read(empty, "$.view.items[*].name"))
                .containsExactly("Loo roll", "Bin bags", "Oil", "Dish soap");
        assertThat(JsonPath.<Integer>read(empty, "$.view.balanceCents")).isZero();
        assertThat(JsonPath.<List<String>>read(empty, "$.view.notPaidIn[*].name"))
                .containsExactly("Kai", "Lea", "Lena");
        assertThat(JsonPath.<String>read(empty, "$.view.shopper.name")).isEqualTo("Kai");
        // In a flat a thing starts shared, and everyone may change it.
        assertThat(JsonPath.<Boolean>read(empty, "$.canEdit")).isTrue();

        // Kai and Lea pay in. Sending the same paying-in twice is one.
        add(kai, kitty, "in", "{}");
        String twice = "{\"clientId\":\"%s\",\"kind\":\"in\",\"fields\":{\"cents\":1000}}".formatted(id());
        send(HttpMethod.POST, "/v1/boards/" + kitty + "/entries", lea, twice, 201);
        send(HttpMethod.POST, "/v1/boards/" + kitty + "/entries", lea, twice, 201);
        String shop = add(lea, kitty, "out", "{\"what\":\"Loo roll, bin bags\",\"cents\":890}");

        String seen = view(kai, kitty);
        assertThat(JsonPath.<Integer>read(seen, "$.view.balanceCents")).isEqualTo(1110);
        assertThat(JsonPath.<Integer>read(seen, "$.view.paidInCents")).isEqualTo(2000);
        assertThat(JsonPath.<Integer>read(seen, "$.view.leftOverCents")).isZero();
        assertThat(JsonPath.<Boolean>read(seen, "$.view.low")).isFalse();
        assertThat(JsonPath.<List<String>>read(seen, "$.view.paidIn[*].name")).containsExactly("Kai", "Lea");
        assertThat(JsonPath.<List<String>>read(seen, "$.view.notPaidIn[*].name"))
                .containsExactly("Lena");
        assertThat(JsonPath.<Boolean>read(seen, "$.view.youPaidIn")).isTrue();
        assertThat(JsonPath.<List<Integer>>read(seen, "$.view.lines[*].cents")).containsExactly(-890, 1000, 1000);
        assertThat(JsonPath.<String>read(seen, "$.view.lines[0].title")).isEqualTo("Loo roll, bin bags");
        assertThat(JsonPath.<String>read(seen, "$.view.lines[0].who.name")).isEqualTo("Lea");
        assertThat(JsonPath.<String>read(seen, "$.view.lines[1].title"))
                .isEqualTo("Paid in for " + TODAY.getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH));
        // Lea shopped last, so it is Lena's turn.
        assertThat(JsonPath.<String>read(seen, "$.view.shopper.name")).isEqualTo("Lena");
        assertThat(JsonPath.<Boolean>read(view(lena, kitty), "$.view.yourTurn")).isTrue();
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + kitty, kai), "$.glance"))
                .isEqualTo("€11.10 left · Lena hasn't paid in yet");

        // A line is its writer's: the others can't change it or take it out.
        assertThat(change(kai, shop, "{\"cents\":1}", 403)).contains("Only the person who wrote this");
        send(HttpMethod.DELETE, "/v1/board-entries/" + shop, lena, null, 403);
        change(lea, shop, "{\"cents\":900}", 200);
        assertThat(JsonPath.<Integer>read(view(kai, kitty), "$.view.balanceCents"))
                .isEqualTo(1100);
        assertThat(add(lea, kitty, "out", "{\"what\":\"Sponges\"}", 400)).contains("Say what it cost");
        assertThat(add(lea, kitty, "out", "{\"cents\":120}", 400)).contains("Say what was bought");
        add(
                lea,
                kitty,
                "out",
                "{\"what\":\"Tomorrow's bread\",\"cents\":120,\"day\":\"%s\"}".formatted(TODAY.plusDays(2)),
                400);

        // Something is running low: it is on the Today of everyone, with whose turn it is. Lena also owes her share.
        String looRoll = JsonPath.read(seen, "$.view.items[0].id");
        act(kai, kitty, "low", "{\"itemId\":\"%s\"}".formatted(looRoll), 200);
        String kaisToday = today(kai);
        assertThat(JsonPath.<List<String>>read(kaisToday, "$.cards[*].title"))
                .containsExactly("The kitty holds €11.00");
        assertThat(JsonPath.<String>read(kaisToday, "$.cards[0].line"))
                .isEqualTo("Running low: loo roll · Lena's turn to shop");
        assertThat(JsonPath.<Object>read(kaisToday, "$.cards[0].action")).isNull();
        String lenasToday = today(lena);
        assertThat(JsonPath.<String>read(lenasToday, "$.cards[0].line"))
                .startsWith("You haven't paid in for ")
                .endsWith("Running low: loo roll · your turn to shop");
        assertThat(JsonPath.<String>read(lenasToday, "$.cards[0].action")).isEqualTo("Pay in");
        assertThat(JsonPath.<String>read(lenasToday, "$.cards[0].look")).isEqualTo("kitty");

        // Lena shops, and what she bought stops running low. The shop cost more than the pot held: it is short.
        add(
                lena,
                kitty,
                "out",
                "{\"what\":\"Loo roll, a lot of it\",\"cents\":1500,\"itemIds\":[\"%s\"]}".formatted(looRoll));
        String after = view(kai, kitty);
        assertThat(JsonPath.<Boolean>read(after, "$.view.items[0].low")).isFalse();
        assertThat(JsonPath.<Integer>read(after, "$.view.balanceCents")).isEqualTo(-400);
        assertThat(JsonPath.<String>read(after, "$.view.shopper.name")).isEqualTo("Kai");
        assertThat(cardTitles(kai)).containsExactly("The kitty is €4.00 short");

        // What was bought is found by its words, and every line is read a page at a time.
        assertThat(fetch("/v1/circles/" + flat + "/search?q=bin bags", lena)).contains(kitty);
        assertThat(JsonPath.<Integer>read(fetch("/v1/boards/" + kitty + "/entries?kind=out", lena), "$.items.length()"))
                .isEqualTo(2);
        assertThat(JsonPath.<Integer>read(fetch("/v1/boards/" + kitty + "/entries", lena), "$.items.length()"))
                .isEqualTo(4);
    }

    // ---------- 18.4 a fairer split ----------

    private static String rent(String kaiId, String leaId, String lenaId, String cents) {
        String[] own = cents == null ? new String[] {"", "", ""} : cents.split(",");
        return ("\"way\":\"room\",\"totalCents\":95000,\"shared\":20,\"parts\":["
                        + "{\"memberId\":\"%s\",\"measure\":18,\"note\":\"the big room\"%s},"
                        + "{\"memberId\":\"%s\",\"measure\":14%s},{\"memberId\":\"%s\",\"measure\":11%s}]")
                .formatted(
                        kaiId,
                        cents == null ? "" : ",\"cents\":" + own[0],
                        leaId,
                        cents == null ? "" : ",\"cents\":" + own[1],
                        lenaId,
                        cents == null ? "" : ",\"cents\":" + own[2]);
    }

    @Test
    void aSplitOnlyCountsOnceEveryHousemateHasAgreedAndChangingItAsksEveryoneAgain() throws Exception {
        String board = board(kai, flat, "fairer_split", null, null);
        String split = add(
                kai, board, "split", "{\"name\":\"Rent\",\"group\":\"rent\"," + rent(kaiId, leaId, lenaId, null) + "}");

        // Proposed, by room size with the shared space split evenly. It doesn't count yet.
        String proposed = view(lea, board);
        assertThat(JsonPath.<Object>read(proposed, "$.view.splits[0].agreed")).isNull();
        assertThat(JsonPath.<List<Integer>>read(proposed, "$.view.splits[0].proposed.shares[*].cents"))
                .containsExactly(37196, 31164, 26640);
        assertThat(JsonPath.<List<String>>read(proposed, "$.view.splits[0].proposed.agreedBy[*].name"))
                .containsExactly("Kai");
        assertThat(JsonPath.<List<String>>read(proposed, "$.view.splits[0].proposed.waitingFor[*].name"))
                .containsExactly("Lea", "Lena");
        assertThat(JsonPath.<Boolean>read(proposed, "$.view.splits[0].proposed.needsYou"))
                .isTrue();
        assertThat(JsonPath.<Integer>read(proposed, "$.view.waitingForYou")).isEqualTo(1);
        assertThat(JsonPath.<Boolean>read(view(kai, board), "$.view.splits[0].proposed.needsYou"))
                .isFalse();
        assertThat(cardTitles(lea)).containsExactly("Rent: a new split needs your yes");
        assertThat(cardTitles(kai)).isEmpty();
        String first = JsonPath.read(proposed, "$.view.splits[0].proposed.id");

        // Two of three isn't everyone.
        act(lea, board, "agree", "{\"proposalId\":\"%s\"}".formatted(first), 200);
        act(lea, board, "agree", "{\"proposalId\":\"%s\"}".formatted(first), 200);
        String twoOfThree = view(kai, board);
        assertThat(JsonPath.<Object>read(twoOfThree, "$.view.splits[0].agreed")).isNull();
        assertThat(JsonPath.<List<String>>read(twoOfThree, "$.view.splits[0].proposed.waitingFor[*].name"))
                .containsExactly("Lena");
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + board, kai), "$.glance"))
                .isEqualTo("0 splits agreed · 1 waiting for a yes");

        // The third yes makes it count.
        String agreed = act(lena, board, "agree", "{\"proposalId\":\"%s\"}".formatted(first), 200);
        assertThat(JsonPath.<Object>read(agreed, "$.view.splits[0].proposed")).isNull();
        assertThat(JsonPath.<String>read(agreed, "$.view.splits[0].agreed.id")).isEqualTo(first);
        assertThat(JsonPath.<String>read(agreed, "$.view.splits[0].agreed.agreedOn"))
                .isEqualTo(TODAY.toString());
        assertThat(JsonPath.<List<String>>read(agreed, "$.view.splits[0].agreed.agreedBy[*].name"))
                .containsExactly("Kai", "Lea", "Lena");
        assertThat(cardTitles(lea)).isEmpty();

        // Lena moves the numbers by hand. They have to add up; then everyone is asked again, and until all
        // three have said yes the split that was agreed stays in force.
        assertThat(act(
                        lena,
                        board,
                        "propose",
                        "{\"splitId\":\"%s\",%s}".formatted(split, rent(kaiId, leaId, lenaId, "37200,31000,25800")),
                        400))
                .contains("The shares add up to €940.00, but there is €950.00 to split.");
        String again = act(
                lena,
                board,
                "propose",
                "{\"splitId\":\"%s\",%s}".formatted(split, rent(kaiId, leaId, lenaId, "37200,31000,26800")),
                200);
        assertThat(JsonPath.<List<Integer>>read(again, "$.view.splits[0].agreed.shares[*].cents"))
                .containsExactly(37196, 31164, 26640);
        assertThat(JsonPath.<List<Integer>>read(again, "$.view.splits[0].proposed.shares[*].cents"))
                .containsExactly(37200, 31000, 26800);
        assertThat(JsonPath.<List<Integer>>read(again, "$.view.splits[0].proposed.shares[*].byRuleCents"))
                .containsExactly(37196, 31164, 26640);
        assertThat(JsonPath.<List<String>>read(again, "$.view.splits[0].proposed.waitingFor[*].name"))
                .containsExactly("Kai", "Lea");
        String second = JsonPath.read(again, "$.view.splits[0].proposed.id");
        act(lea, board, "agree", "{\"proposalId\":\"%s\"}".formatted(second), 200);

        // Kai changes it once more: that replaces what was waiting, and Lea's yes to the old numbers is gone.
        String third = JsonPath.read(
                act(kai, board, "propose", "{\"splitId\":\"%s\",\"totalCents\":96000}".formatted(split), 200),
                "$.view.splits[0].proposed.id");
        act(lea, board, "agree", "{\"proposalId\":\"%s\"}".formatted(second), 404);
        String replaced = view(lea, board);
        assertThat(JsonPath.<Integer>read(replaced, "$.view.splits[0].proposed.totalCents"))
                .isEqualTo(96000);
        assertThat(JsonPath.<List<String>>read(replaced, "$.view.splits[0].proposed.waitingFor[*].name"))
                .containsExactly("Lea", "Lena");
        assertThat(JsonPath.<Integer>read(replaced, "$.view.splits[0].agreed.totalCents"))
                .isEqualTo(95000);

        // Nobody changes agreed numbers any other way, and only its proposer takes a proposal back.
        assertThat(change(lea, first, "{\"totalCents\":1}", 409)).contains("it counts once everyone says yes");
        assertThat(send(HttpMethod.DELETE, "/v1/board-entries/" + split, kai, null, 409))
                .contains("Everyone agreed to this");
        send(HttpMethod.DELETE, "/v1/board-entries/" + third, lea, null, 403);
        send(HttpMethod.DELETE, "/v1/board-entries/" + third, kai, null, 204);
        assertThat(JsonPath.<Object>read(view(kai, board), "$.view.splits[0].proposed"))
                .isNull();

        // What a split needs is asked for in plain words.
        assertThat(add(kai, board, "split", "{\"name\":\"Internet\",\"way\":\"dice\",\"totalCents\":3000}", 400))
                .contains("Choose how to split it");
        assertThat(add(kai, board, "split", "{\"name\":\"Internet\",\"way\":\"room\",\"totalCents\":3000}", 400))
                .contains("Say how big each person's room is");
        assertThat(add(kai, board, "split", "{\"name\":\"Internet\",\"way\":\"nights\",\"totalCents\":3000}", 400))
                .contains("Say which days the bill is for");
        assertThat(add(kai, board, "split", "{\"name\":\"Internet\",\"way\":\"equal\"}", 400))
                .contains("Say how much there is to split");
        // Equally, with nothing else said: everyone, and the odd cent to the first.
        add(kai, board, "split", "{\"name\":\"Internet\",\"way\":\"equal\",\"totalCents\":3001}");
        assertThat(JsonPath.<List<Integer>>read(view(kai, board), "$.view.splits[1].proposed.shares[*].cents"))
                .containsExactly(1001, 1000, 1000);
    }

    @Test
    void aBillFollowsTheNightsEachPersonWasAtHomeCountedFromTheirHeadsUps() throws Exception {
        // The 31 nights that ended ten days ago. Lea was away one of them, Kai five, Lena nineteen.
        LocalDate first = TODAY.minusDays(40);
        String headsUp = board(kai, flat, "heads_up", null, null);
        String away = "{\"text\":\"Away\",\"what\":\"away\",\"from\":\"%s\",\"until\":\"%s\"}";
        add(lea, headsUp, "notice", away.formatted(first.plusDays(9), first.plusDays(10)));
        String kaisNotice = add(kai, headsUp, "notice", away.formatted(first.plusDays(12), first.plusDays(17)));
        add(lena, headsUp, "notice", away.formatted(first.minusDays(3), first.plusDays(19)));
        assertThat(JsonPath.<List<Integer>>read(
                        fetch("/v1/boards/" + headsUp + "/entries?kind=notice", kai),
                        "$.items[?(@.id == '" + kaisNotice + "')].nightsAway"))
                .containsExactly(5);

        String board = board(kai, flat, "fairer_split", null, null);
        String bill = add(
                lea,
                board,
                "split",
                "{\"name\":\"Electricity\",\"way\":\"nights\",\"totalCents\":15900,\"from\":\"%s\",\"to\":\"%s\",\"payerMemberId\":\"%s\"}"
                        .formatted(first, first.plusDays(30), leaId));
        String proposed = view(kai, board);
        assertThat(JsonPath.<List<String>>read(proposed, "$.view.splits[0].proposed.shares[*].person.name"))
                .containsExactly("Kai", "Lea", "Lena");
        assertThat(JsonPath.<List<Integer>>read(proposed, "$.view.splits[0].proposed.shares[*].measure"))
                .containsExactly(26, 30, 12);
        assertThat(JsonPath.<List<Integer>>read(proposed, "$.view.splits[0].proposed.shares[*].cents"))
                .containsExactly(6079, 7015, 2806);
        assertThat(JsonPath.<String>read(proposed, "$.view.splits[0].title"))
                .isEqualTo(first.plusDays(30).getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH)
                        + "'s electricity");
        assertThat(JsonPath.<String>read(proposed, "$.view.splits[0].payer.name"))
                .isEqualTo("Lea");

        // Nothing is owed until everyone agreed.
        assertThat(cardTitles(kai)).singleElement().asString().endsWith("electricity: a new split needs your yes");
        assertThat(act(kai, board, "paid", "{\"splitId\":\"%s\"}".formatted(bill), 409))
                .contains("it counts once everyone agreed");
        String proposal = JsonPath.read(proposed, "$.view.splits[0].proposed.id");
        act(kai, board, "agree", "{\"proposalId\":\"%s\"}".formatted(proposal), 200);
        act(lena, board, "agree", "{\"proposalId\":\"%s\"}".formatted(proposal), 200);

        // Now it is on Kai's and Lena's Today, each with their own share. Lea paid the bill: nothing for her.
        String kaisToday = today(kai);
        assertThat(JsonPath.<List<String>>read(kaisToday, "$.cards[*].title"))
                .containsExactly("Your share of the electricity");
        assertThat(JsonPath.<String>read(kaisToday, "$.cards[0].figure")).isEqualTo("€61");
        assertThat(JsonPath.<String>read(kaisToday, "$.cards[0].line")).isEqualTo("€159, split by nights at home");
        assertThat(JsonPath.<String>read(kaisToday, "$.cards[0].action")).isEqualTo("Pay");
        assertThat(JsonPath.<String>read(today(lena), "$.cards[0].figure")).isEqualTo("€28");
        assertThat(cardTitles(lea)).isEmpty();

        // Kai ticks his own share. Lena can't tick his or be ticked by him; Lea, who is owed, ticks Lena's.
        act(lena, board, "paid", "{\"splitId\":\"%s\",\"memberId\":\"%s\"}".formatted(bill, kaiId), 403);
        act(kai, board, "paid", "{\"splitId\":\"%s\",\"memberId\":\"%s\"}".formatted(bill, lenaId), 403);
        String kaiPaid = act(kai, board, "paid", "{\"splitId\":\"%s\"}".formatted(bill), 200);
        assertThat(JsonPath.<List<Boolean>>read(kaiPaid, "$.view.splits[0].agreed.shares[*].paid"))
                .containsExactly(true, true, false);
        assertThat(JsonPath.<Boolean>read(kaiPaid, "$.view.splits[0].settled")).isFalse();
        assertThat(cardTitles(kai)).isEmpty();
        String settled =
                act(lea, board, "paid", "{\"splitId\":\"%s\",\"memberId\":\"%s\"}".formatted(bill, lenaId), 200);
        assertThat(JsonPath.<Boolean>read(settled, "$.view.splits[0].settled")).isTrue();
        assertThat(cardTitles(lena)).isEmpty();
        // And it can be unticked.
        act(kai, board, "paid", "{\"splitId\":\"%s\",\"paid\":false}".formatted(bill), 200);
        assertThat(cardTitles(kai)).containsExactly("Your share of the electricity");

        // Nights can be typed in instead, but nobody was at home for more nights than the bill has.
        String typed =
                "{\"name\":\"Gas\",\"way\":\"nights\",\"totalCents\":6000,\"from\":\"%s\",\"to\":\"%s\",\"parts\":["
                        + "{\"memberId\":\"%s\",\"measure\":%d},{\"memberId\":\"%s\",\"measure\":10}]}";
        assertThat(add(kai, board, "split", typed.formatted(first, first.plusDays(30), kaiId, 32, leaId), 400))
                .contains("The bill is for 31 nights");
        add(kai, board, "split", typed.formatted(first, first.plusDays(30), kaiId, 20, leaId));
        assertThat(JsonPath.<List<Integer>>read(view(kai, board), "$.view.splits[1].proposed.shares[*].cents"))
                .containsExactly(4000, 2000);
    }

    // ---------- 18.5 heads-up ----------

    @Test
    void aHeadsUpIsAnsweredByEachOfTheOthersAndChangingItAsksThemAgain() throws Exception {
        String board = board(kai, flat, "heads_up", null, "{\"standing\":\"Quiet after 23:00 on weeknights\"}");
        LocalDate soon = TODAY.plusDays(2);
        String notice = add(
                lea,
                board,
                "notice",
                "{\"text\":\"Six people over, done by midnight\",\"what\":\"guests\",\"from\":\"%s\"}".formatted(soon));

        // It waits for Kai and Lena. For each of them it is a card on Today with a button; for Lea it is a line.
        String waiting = view(kai, board);
        assertThat(JsonPath.<String>read(waiting, "$.view.standing")).isEqualTo("Quiet after 23:00 on weeknights");
        assertThat(JsonPath.<Boolean>read(waiting, "$.view.notices[0].needsYou"))
                .isTrue();
        assertThat(JsonPath.<Integer>read(waiting, "$.view.needYou")).isEqualTo(1);
        assertThat(JsonPath.<List<String>>read(waiting, "$.view.notices[0].waitingFor[*].name"))
                .containsExactly("Kai", "Lena");
        assertThat(JsonPath.<Boolean>read(view(lea, board), "$.view.notices[0].needsYou"))
                .isFalse();
        String kaisToday = today(kai);
        assertThat(JsonPath.<List<String>>read(kaisToday, "$.cards[*].title"))
                .containsExactly("Six people over, done by midnight");
        assertThat(JsonPath.<String>read(kaisToday, "$.cards[0].line")).isEqualTo("Lea · waiting for your answer");
        assertThat(JsonPath.<String>read(kaisToday, "$.cards[0].action")).isEqualTo("Answer");
        assertThat(JsonPath.<List<Object>>read(kaisToday, "$.items")).isEmpty();
        assertThat(JsonPath.<List<String>>read(today(lea), "$.items[*].note"))
                .containsExactly("You · waiting for Kai and Lena");
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + board, kai), "$.glance"))
                .isEqualTo("1 notice · 1 waits for your answer");

        // Lena is fine; Kai would like to talk, then comes round. Answering twice is one answer.
        String answer = "{\"noticeId\":\"%s\",\"says\":\"%s\"}";
        act(lena, board, "answer", answer.formatted(notice, "fine"), 200);
        act(
                kai,
                board,
                "answer",
                "{\"noticeId\":\"%s\",\"says\":\"talk\",\"text\":\"my exam is on Monday\"}".formatted(notice),
                200);
        String talk = view(lea, board);
        assertThat(JsonPath.<List<String>>read(talk, "$.view.notices[0].replies[*].says"))
                .containsExactly("fine", "talk");
        assertThat(JsonPath.<String>read(talk, "$.view.notices[0].replies[1].text"))
                .isEqualTo("my exam is on Monday");
        assertThat(JsonPath.<Boolean>read(talk, "$.view.notices[0].everyoneFine"))
                .isFalse();
        assertThat(JsonPath.<List<String>>read(today(lea), "$.items[*].note"))
                .containsExactly("You · Kai wants to talk");
        String fine = act(kai, board, "answer", answer.formatted(notice, "fine"), 200);
        assertThat(JsonPath.<Integer>read(fine, "$.view.notices[0].replies.length()"))
                .isEqualTo(2);
        assertThat(JsonPath.<Boolean>read(fine, "$.view.notices[0].everyoneFine"))
                .isTrue();
        assertThat(JsonPath.<String>read(fine, "$.view.notices[0].yourAnswer")).isEqualTo("fine");
        // Answered, it is a line of the day for everyone, with the weekday in front.
        String settled = today(kai);
        assertThat(JsonPath.<List<Object>>read(settled, "$.cards")).isEmpty();
        assertThat(JsonPath.<List<String>>read(settled, "$.items[*].title"))
                .containsExactly("Six people over, done by midnight");
        assertThat(JsonPath.<String>read(settled, "$.items[0].note")).isEqualTo("Lea · everyone said fine");
        assertThat(JsonPath.<String>read(settled, "$.items[0].lead"))
                .isEqualTo(soon.getDayOfWeek().getDisplayName(TextStyle.SHORT, Locale.ENGLISH));
        // And it stays on the calendar, on its day.
        assertThat(fetch("/v1/circles/" + flat + "/plan?day=" + soon + "&days=1", lena))
                .contains("Six people over, done by midnight");

        // Nobody answers their own, and only its writer changes a notice. New words are a new question.
        assertThat(act(lea, board, "answer", answer.formatted(notice, "fine"), 409))
                .contains("It's your own notice");
        act(kai, board, "answer", answer.formatted(notice, "whatever"), 400);
        change(kai, notice, "{\"text\":\"Nobody over\"}", 403);
        send(HttpMethod.DELETE, "/v1/board-entries/" + notice, lena, null, 403);
        String changed = change(lea, notice, "{\"text\":\"Ten people over, done by two\"}", 200);
        assertThat(JsonPath.<List<Object>>read(changed, "$.view.notices[0].replies"))
                .isEmpty();
        assertThat(JsonPath.<Boolean>read(view(kai, board), "$.view.notices[0].needsYou"))
                .isTrue();

        // Time away says how many nights, and needs both days. A notice that is over leaves the board.
        assertThat(add(
                        kai,
                        board,
                        "notice",
                        "{\"text\":\"Away\",\"what\":\"away\",\"from\":\"%s\"}".formatted(soon),
                        400))
                .contains("Say the day you leave and the day you're back");
        add(kai, board, "notice", "{\"text\":\"Hello\",\"what\":\"party\"}", 400);
        add(
                kai,
                board,
                "notice",
                "{\"text\":\"I'm away\",\"what\":\"away\",\"from\":\"%s\",\"until\":\"%s\"}"
                        .formatted(TODAY.plusDays(8), TODAY.plusDays(15)));
        add(
                lena,
                board,
                "notice",
                "{\"text\":\"Was away last week\",\"what\":\"away\",\"from\":\"%s\",\"until\":\"%s\"}"
                        .formatted(TODAY.minusDays(9), TODAY.minusDays(3)));
        String all = view(lea, board);
        assertThat(JsonPath.<List<String>>read(all, "$.view.notices[*].text"))
                .containsExactly("I'm away", "Ten people over, done by two");
        assertThat(JsonPath.<Integer>read(all, "$.view.notices[0].nightsAway")).isEqualTo(7);
        assertThat(JsonPath.<Integer>read(all, "$.view.earlier")).isEqualTo(1);
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/boards/" + board + "/entries?kind=notice&q=last week", lea), "$.items[*].text"))
                .containsExactly("Was away last week");
        assertThat(fetch("/v1/circles/" + flat + "/search?q=Ten people", kai)).contains(board);
    }

    // ---------- 18.6 heard in the kitchen, 18.8 everyone who's lived here ----------

    @Test
    void whatWasHeardInTheKitchenKeepsWhoSaidItAlsoAfterTheyMovedOut() throws Exception {
        String ana = person("Ana");
        String anaId = join(kai, flat, ana);
        String board = board(lea, flat, "heard", null, null);
        add(
                ana,
                board,
                "quote",
                "{\"text\":\"The boiler works if you believe in it.\",\"saidByMemberId\":\"%s\",\"day\":\"%s\"}"
                        .formatted(anaId, TODAY.minusDays(30)));
        add(
                kai,
                board,
                "quote",
                "{\"text\":\"That's not mould. That's character.\",\"saidByMemberId\":\"%s\",\"about\":\"about the bathroom ceiling\",\"day\":\"%s\"}"
                        .formatted(kaiId, TODAY.minusDays(2)));
        String newest = add(
                kai,
                board,
                "quote",
                "{\"text\":\"I'm not hungover. I'm buffering.\",\"saidByMemberId\":\"%s\"}".formatted(leaId));
        add(
                lea,
                board,
                "quote",
                "{\"text\":\"Is this the famous sofa?\",\"saidByName\":\"The plumber\",\"day\":\"%s\"}"
                        .formatted(TODAY.minusDays(60)));
        add(kai, board, "quote", "{\"saidByMemberId\":\"%s\"}".formatted(leaId), 400);
        add(kai, board, "quote", "{\"text\":\"Tomorrow's line\",\"day\":\"%s\"}".formatted(TODAY.plusDays(1)), 400);
        add(kai, board, "quote", "{\"text\":\"Said by nobody here\",\"saidByMemberId\":\"%s\"}".formatted(id()), 400);

        // Ana moves out. Her line stays, with her name.
        send(HttpMethod.DELETE, "/v1/members/" + anaId, ana, null, 204);
        String seen = view(kai, board);
        assertThat(JsonPath.<Integer>read(seen, "$.view.total")).isEqualTo(4);
        assertThat(JsonPath.<List<String>>read(seen, "$.view.latest[*].text"))
                .containsExactly(
                        "I'm not hungover. I'm buffering.",
                        "That's not mould. That's character.",
                        "The boiler works if you believe in it.",
                        "Is this the famous sofa?");
        assertThat(JsonPath.<String>read(seen, "$.view.latest[0].id")).isEqualTo(newest);
        assertThat(JsonPath.<String>read(seen, "$.view.latest[1].about")).isEqualTo("about the bathroom ceiling");
        assertThat(JsonPath.<Boolean>read(seen, "$.view.latest[1].you")).isTrue();
        assertThat(JsonPath.<String>read(seen, "$.view.latest[2].who.name")).isEqualTo("Ana");
        assertThat(JsonPath.<String>read(seen, "$.view.latest[3].whoName")).isEqualTo("The plumber");
        assertThat(JsonPath.<List<String>>read(seen, "$.view.people[*].person.name"))
                .containsExactlyInAnyOrder("Lea", "Kai", "Ana");
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + board, lena), "$.glance"))
                .isEqualTo("4 lines · latest from Lea");
        // By person, and by words.
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/boards/" + board + "/entries?member=" + anaId, lena), "$.items[*].text"))
                .containsExactly("The boiler works if you believe in it.");
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/boards/" + board + "/entries?q=bathroom", lena), "$.items[*].text"))
                .containsExactly("That's not mould. That's character.");
        assertThat(fetch("/v1/circles/" + flat + "/search?q=buffering", lena)).contains(board);
    }

    @Test
    void theRollIsBuiltFromEveryoneWhoIsOrWasInTheFlatPlusWhatTheFlatAddsByHand() throws Exception {
        String ana = person("Ana");
        String anaId = join(kai, flat, ana);
        String rules = page(kai, flat, "House rules", null);
        String kaisOwn = page(kai, flat, "Kai's own notes", "me");
        send(HttpMethod.DELETE, "/v1/members/" + anaId, ana, null, 204);
        int year = TODAY.getYear();

        String board = board(kai, flat, "lived_here", null, null);
        // With nothing typed, the roll is the circle: three here since this year, and Ana, who left this year.
        String plain = view(lea, board);
        assertThat(JsonPath.<List<String>>read(plain, "$.view.hereNow[*].name"))
                .containsExactlyInAnyOrder("Kai", "Lea", "Lena");
        assertThat(JsonPath.<List<Integer>>read(plain, "$.view.hereNow[*].fromYear"))
                .containsOnly(year);
        assertThat(JsonPath.<List<String>>read(plain, "$.view.before[*].name")).containsExactly("Ana");
        assertThat(JsonPath.<Integer>read(plain, "$.view.before[0].untilYear")).isEqualTo(year);
        assertThat(JsonPath.<Boolean>read(plain, "$.view.before[0].byHand")).isFalse();
        assertThat(JsonPath.<String>read(plain, "$.view.before[0].person.name")).isEqualTo("Ana");

        // The flat writes what the app can't know: when people really moved in, and who was here before it.
        String resident = "{\"memberId\":\"%s\",\"fromYear\":%d%s}";
        add(kai, board, "resident", resident.formatted(kaiId, year - 3, ""));
        add(kai, board, "resident", resident.formatted(leaId, year - 2, ""));
        String lenasRow = add(kai, board, "resident", resident.formatted(lenaId, year, ",\"note\":\"The small room\""));
        // Adding the same person again changes their row instead of making a second one.
        assertThat(add(
                        lea,
                        board,
                        "resident",
                        resident.formatted(lenaId, year, ",\"note\":\"The small room, facing the street\"")))
                .isEqualTo(lenasRow);
        add(
                kai,
                board,
                "resident",
                "{\"memberId\":\"%s\",\"fromYear\":%d,\"untilYear\":%d,\"note\":\"Moved to Lisbon.\"}"
                        .formatted(anaId, year - 3, year - 1));
        String two = add(
                kai,
                board,
                "before",
                "{\"name\":\"Two people before you\",\"count\":2,\"fromYear\":%d,\"untilYear\":%d,\"note\":\"Left a cactus\"}"
                        .formatted(year - 5, year - 3));
        add(kai, board, "before", "{\"name\":\"Nobody\"}", 400);
        add(
                kai,
                board,
                "resident",
                "{\"memberId\":\"%s\",\"fromYear\":%d,\"untilYear\":%d}".formatted(anaId, year, year - 2),
                400);
        add(kai, board, "resident", "{\"memberId\":\"%s\",\"fromYear\":2020}".formatted(id()), 400);

        String roll = view(kai, board);
        assertThat(JsonPath.<List<String>>read(roll, "$.view.hereNow[*].name")).containsExactly("Lena", "Lea", "Kai");
        assertThat(JsonPath.<List<Integer>>read(roll, "$.view.hereNow[*].fromYear"))
                .containsExactly(year, year - 2, year - 3);
        assertThat(JsonPath.<String>read(roll, "$.view.hereNow[0].note"))
                .isEqualTo("The small room, facing the street");
        assertThat(JsonPath.<Boolean>read(roll, "$.view.hereNow[2].you")).isTrue();
        assertThat(JsonPath.<List<String>>read(roll, "$.view.before[*].name"))
                .containsExactly("Ana", "Two people before you");
        assertThat(JsonPath.<List<Integer>>read(roll, "$.view.before[*].untilYear"))
                .containsExactly(year - 1, year - 3);
        assertThat(JsonPath.<Integer>read(roll, "$.view.before[1].count")).isEqualTo(2);
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + board, kai), "$.glance"))
                .isEqualTo("3 here now · 3 before");
        change(lea, two, "{\"note\":\"Left the house manual and a cactus\"}", 200);
        assertThat(view(lena, board)).contains("Left the house manual and a cactus");

        // What is handed on is ordinary things: each person is shown the ones they may see.
        add(kai, board, "handed_on", "{\"thingId\":\"%s\"}".formatted(rules));
        add(kai, board, "handed_on", "{\"thingId\":\"%s\"}".formatted(kaisOwn));
        add(lea, board, "handed_on", "{\"thingId\":\"%s\"}".formatted(kaisOwn), 400);
        add(kai, board, "handed_on", "{\"thingId\":\"%s\"}".formatted(id()), 400);
        assertThat(JsonPath.<List<String>>read(view(kai, board), "$.view.handedOn[*].thing.title"))
                .containsExactly("House rules", "Kai's own notes");
        assertThat(JsonPath.<List<String>>read(view(lena, board), "$.view.handedOn[*].thing.title"))
                .containsExactly("House rules");
        assertThat(view(lena, board)).doesNotContain("Kai's own notes");

        // Taking away what was typed leaves the circle's own years again.
        send(HttpMethod.DELETE, "/v1/board-entries/" + lenasRow, lea, null, 204);
        assertThat(JsonPath.<List<Object>>read(view(kai, board), "$.view.hereNow[?(@.name == 'Lena')].note"))
                .containsExactly((Object) null);
    }
}
