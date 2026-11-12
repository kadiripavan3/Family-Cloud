package app.homeport.api.jot;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.jot.LineReader.Context;
import app.homeport.api.jot.LineReader.FoundDate;
import app.homeport.api.jot.LineReader.Item;
import app.homeport.api.jot.LineReader.NamedList;
import app.homeport.api.jot.LineReader.Person;
import app.homeport.api.jot.LineReader.Piece;
import app.homeport.api.jot.LineReader.Reading;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * Reading a line. No database and no Spring: a sentence goes in, what it means comes out. "Today" is
 * Wednesday 11 November 2026 at 9:41, as on the screens, and the circle is The Linds.
 *
 * <p>Each reading is written out in one line, so a table of sentences reads like the app would show them:
 * {@code event "Haircut" on 2026-11-14 at 10:00-10:30 for Leo remind 60}.
 */
class LineReaderTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 11);
    private static final Person NORA = new Person(UUID.randomUUID(), "Nora");
    private static final Person ALEX = new Person(UUID.randomUUID(), "Alex");
    private static final Person MIA = new Person(UUID.randomUUID(), "Mia");
    private static final Person LEO = new Person(UUID.randomUUID(), "Leo");
    private static final NamedList PACKING = new NamedList(UUID.randomUUID(), "Packing list");
    private static final NamedList PARTY = new NamedList(UUID.randomUUID(), "Party prep");
    private static final Context LINDS = new Context(
            TODAY,
            LocalTime.of(9, 41),
            NORA.id(),
            List.of(NORA, ALEX, MIA, LEO),
            List.of(PACKING, PARTY),
            ReadAs.REMINDER);

    private static String read(String line) {
        return said(LineReader.read(line, LINDS));
    }

    private static String said(Reading reading) {
        return reading.items().stream().map(LineReaderTest::said).collect(Collectors.joining(" | "));
    }

    private static String said(Item item) {
        StringBuilder said = new StringBuilder(item.as().code())
                .append(" \"")
                .append(item.title())
                .append('"');
        if (item.day() != null) {
            said.append(" on ").append(item.day());
        }
        if (item.time() != null) {
            said.append(" at ").append(item.time());
            if (item.endTime() != null) {
                said.append('-').append(item.endTime());
            }
        }
        if (item.personId() != null) {
            String name = List.of(NORA, ALEX, MIA, LEO).stream()
                    .filter(p -> p.id().equals(item.personId()))
                    .map(p -> p.equals(NORA) ? "me" : p.name())
                    .findFirst()
                    .orElse("?");
            said.append(' ')
                    .append(item.personRole().code().replace('_', ' '))
                    .append(' ')
                    .append(name);
        }
        if (item.remindMinutes() != null) {
            said.append(" remind ").append(item.remindMinutes());
        }
        if (item.repeat() != null) {
            said.append(" repeats ").append(item.repeat().label());
        }
        if (item.as() == ReadAs.LIST_ITEM) {
            said.append(item.shopping() ? " shopping" : " list " + item.listName());
            if (item.quantity() != null) {
                said.append(" x").append(item.quantity());
            }
        }
        if (item.code() != null) {
            said.append(' ').append(item.code().code());
        }
        return said.toString();
    }

    // ---------- the sentences on the screens ----------

    @Test
    void theSentenceOfTypeItIsAnEventForLeoWithAReminderAnHourBefore() {
        Reading reading = LineReader.read("Haircut for Leo Saturday at 10, remind me an hour before", LINDS);

        assertThat(said(reading)).isEqualTo("event \"Haircut\" on 2026-11-14 at 10:00-10:30 for Leo remind 60");
        // How it was read: the pieces of the sentence, in the order they stand, and what each became.
        assertThat(reading.items().get(0).pieces().stream()
                        .sorted((a, b) -> a.start() - b.start())
                        .map(p -> p.text() + " → " + p.became()))
                .containsExactly(
                        "for Leo → For Leo",
                        "Saturday → Sat 14 Nov",
                        "at 10 → 10:00",
                        "remind me an hour before → 1 hour before");
        Piece day = reading.items().get(0).pieces().stream()
                .filter(p -> p.what() == PieceKind.DAY)
                .findFirst()
                .orElseThrow();
        assertThat("Haircut for Leo Saturday at 10, remind me an hour before".substring(day.start(), day.end()))
                .isEqualTo("Saturday");
    }

    @Test
    void everySentenceDrawnOnTheScreensReadsAsDrawn() {
        assertThat(read("Haircut for Leo, Saturday 10"))
                .isEqualTo("event \"Haircut\" on 2026-11-14 at 10:00-10:30 for Leo");
        assertThat(read("Eggs, and remind Alex about the car at 6"))
                .isEqualTo("list_item \"Eggs\" shopping | reminder \"The car\" on 2026-11-11 at 18:00 given to Alex");
        assertThat(read("Milk, bread")).isEqualTo("list_item \"Milk\" shopping | list_item \"Bread\" shopping");
        assertThat(read("Mia needs €5 for the class photo"))
                .isEqualTo("note \"Mia needs €5 for the class photo\" about Mia");
        assertThat(read("Call the plumber tomorrow at 9"))
                .isEqualTo("reminder \"Call the plumber\" on 2026-11-12 at 09:00");
        assertThat(read("Gate code 4471")).isEqualTo("code \"Gate code 4471\" code");
        assertThat(read("Eggs and flour, remind me to call Mum at six, and the gate code is 4471."))
                .isEqualTo("list_item \"Eggs\" shopping | list_item \"Flour\" shopping"
                        + " | reminder \"Call Mum\" on 2026-11-11 at 18:00 given to me | code \"Gate code 4471\" code");
        assertThat(read("dentist for Mia Tuesday at 3, buy plasters, and remind Alex about the bins"))
                .isEqualTo("event \"Dentist\" on 2026-11-17 at 15:00-15:30 for Mia | list_item \"Plasters\" shopping"
                        + " | reminder \"The bins\" given to Alex");
        assertThat(read("milk")).isEqualTo("list_item \"Milk\" shopping");
        assertThat(read("2x oat milk and eggs"))
                .isEqualTo("list_item \"Oat milk\" shopping x2 | list_item \"Eggs\" shopping");
        assertThat(read("Remind Alex about the car service at 6"))
                .isEqualTo("reminder \"The car service\" on 2026-11-11 at 18:00 given to Alex");
    }

    // ---------- days ----------

    @Test
    void aDayCanBeSaidInManyWays() {
        assertThat(read("Dentist today")).isEqualTo("event \"Dentist\" on 2026-11-11");
        assertThat(read("Dentist tomorrow")).isEqualTo("event \"Dentist\" on 2026-11-12");
        assertThat(read("Dentist the day after tomorrow")).isEqualTo("event \"Dentist\" on 2026-11-13");
        assertThat(read("Dentist on Friday")).isEqualTo("event \"Dentist\" on 2026-11-13");
        assertThat(read("Dentist fri")).isEqualTo("event \"Dentist\" on 2026-11-13");
        assertThat(read("Dentist Wednesday"))
                .as("a weekday is the next one, never today")
                .isEqualTo("event \"Dentist\" on 2026-11-18");
        assertThat(read("Dentist next Friday"))
                .as("next Friday is the Friday of next week")
                .isEqualTo("event \"Dentist\" on 2026-11-20");
        assertThat(read("Dentist next Monday")).isEqualTo("event \"Dentist\" on 2026-11-16");
        assertThat(read("Dentist next week")).isEqualTo("event \"Dentist\" on 2026-11-16");
        assertThat(read("Dentist in 3 days")).isEqualTo("event \"Dentist\" on 2026-11-14");
        assertThat(read("Dentist in two weeks")).isEqualTo("event \"Dentist\" on 2026-11-25");
        assertThat(read("Dentist in a month")).isEqualTo("event \"Dentist\" on 2026-12-11");
        assertThat(read("Dentist 4 Dec")).isEqualTo("event \"Dentist\" on 2026-12-04");
        assertThat(read("Dentist on the 4th of December")).isEqualTo("event \"Dentist\" on 2026-12-04");
        assertThat(read("Dentist December 4th")).isEqualTo("event \"Dentist\" on 2026-12-04");
        assertThat(read("Dentist Dec 4, 2027")).isEqualTo("event \"Dentist\" on 2027-12-04");
        assertThat(read("Dentist Friday, 4 December")).isEqualTo("event \"Dentist\" on 2026-12-04");
        assertThat(read("Dentist 12/4"))
                .as("day first: the 12th of April")
                .isEqualTo("event \"Dentist\" on 2027-04-12");
        assertThat(read("Dentist 12/4/2027")).isEqualTo("event \"Dentist\" on 2027-04-12");
        assertThat(read("Dentist on 3.12.")).isEqualTo("event \"Dentist\" on 2026-12-03");
        assertThat(read("Dentist 2026-12-04")).isEqualTo("event \"Dentist\" on 2026-12-04");
        assertThat(read("Dentist on the 15th")).isEqualTo("event \"Dentist\" on 2026-11-15");
        assertThat(read("Dentist 2 Jan"))
                .as("a day that has passed this year is next year's")
                .isEqualTo("event \"Dentist\" on 2027-01-02");
        assertThat(read("Party this weekend")).isEqualTo("event \"Party\" on 2026-11-14");
        assertThat(read("Party next weekend")).isEqualTo("event \"Party\" on 2026-11-21");
    }

    @Test
    void aDayThatDoesNotExistIsNotADayAndShortWordsThatAreAlsoWordsAreLeftAlone() {
        assertThat(read("Dentist 31/2")).isEqualTo("note \"Dentist 31/2\"");
        assertThat(read("Sun cream")).isEqualTo("list_item \"Sun cream\" shopping");
        assertThat(read("Sat nav needs an update")).isEqualTo("note \"Sat nav needs an update\"");
        assertThat(read("Football sat 10")).isEqualTo("event \"Football\" on 2026-11-14 at 10:00-10:30");
        assertThat(read("It may rain, bring 4 umbrellas"))
                .isEqualTo("note \"It may rain\" | reminder \"Bring 4 umbrellas\"");
    }

    // ---------- times ----------

    @Test
    void aTimeCanBeSaidInManyWays() {
        assertThat(read("Meeting tomorrow 15:30")).isEqualTo("event \"Meeting\" on 2026-11-12 at 15:30-16:00");
        assertThat(read("Meeting tomorrow at 3pm")).isEqualTo("event \"Meeting\" on 2026-11-12 at 15:00-15:30");
        assertThat(read("Meeting tomorrow 3 pm")).isEqualTo("event \"Meeting\" on 2026-11-12 at 15:00-15:30");
        assertThat(read("Meeting tomorrow at 9am")).isEqualTo("event \"Meeting\" on 2026-11-12 at 09:00-09:30");
        assertThat(read("Meeting tomorrow at 10.30")).isEqualTo("event \"Meeting\" on 2026-11-12 at 10:30-11:00");
        assertThat(read("Meeting tomorrow at 7:30"))
                .as("a time written out is taken as written")
                .isEqualTo("event \"Meeting\" on 2026-11-12 at 07:30-08:00");
        assertThat(read("Meeting tomorrow at 3"))
                .as("a bare hour from 1 to 7 is after noon")
                .isEqualTo("event \"Meeting\" on 2026-11-12 at 15:00-15:30");
        assertThat(read("Meeting tomorrow at 8")).isEqualTo("event \"Meeting\" on 2026-11-12 at 08:00-08:30");
        assertThat(read("Meeting tomorrow at noon")).isEqualTo("event \"Meeting\" on 2026-11-12 at 12:00-12:30");
        assertThat(read("Meeting tomorrow at half past six"))
                .isEqualTo("event \"Meeting\" on 2026-11-12 at 18:30-19:00");
        assertThat(read("Meeting tomorrow from 10 to 11:30"))
                .isEqualTo("event \"Meeting\" on 2026-11-12 at 10:00-11:30");
        assertThat(read("Meeting tomorrow 2-4pm")).isEqualTo("event \"Meeting\" on 2026-11-12 at 14:00-16:00");
        assertThat(read("Party Saturday 14:00 to 17:00")).isEqualTo("event \"Party\" on 2026-11-14 at 14:00-17:00");
        assertThat(read("Dinner tonight at 8")).isEqualTo("event \"Dinner\" on 2026-11-11 at 20:00-20:30");
        assertThat(read("Dinner tonight 7:30")).isEqualTo("event \"Dinner\" on 2026-11-11 at 19:30-20:00");
        assertThat(read("Bins tonight"))
                .as("tonight with no time is seven in the evening")
                .isEqualTo("reminder \"Bins\" on 2026-11-11 at 19:00");
        assertThat(read("Call Mum tomorrow morning")).isEqualTo("reminder \"Call Mum\" on 2026-11-12 at 09:00");
        assertThat(read("Run at 6 in the morning")).isEqualTo("event \"Run\" on 2026-11-12 at 06:00-06:30");
        assertThat(read("Call the school at 9"))
                .as("nine has passed today (it is 9:41), so it is tomorrow")
                .isEqualTo("reminder \"Call the school\" on 2026-11-12 at 09:00");
        assertThat(read("Call the school at 11")).isEqualTo("reminder \"Call the school\" on 2026-11-11 at 11:00");
        assertThat(read("Take the cake out in 30 minutes"))
                .isEqualTo("reminder \"Take the cake out\" on 2026-11-11 at 10:11");
    }

    // ---------- an event or a reminder ----------

    @Test
    void somethingToDoIsAReminderAndSomethingThatHappensIsAnEvent() {
        assertThat(read("Pay the electricity bill by Friday"))
                .isEqualTo("reminder \"Pay the electricity bill\" on 2026-11-13");
        assertThat(read("Renew Mia's passport 2 Jan"))
                .isEqualTo("reminder \"Renew Mia's passport\" on 2027-01-02 about Mia");
        assertThat(read("Don't forget to sign the form tomorrow"))
                .isEqualTo("reminder \"Sign the form\" on 2026-11-12");
        assertThat(read("Remember to water the plants")).isEqualTo("reminder \"Water the plants\"");
        assertThat(read("Book the car service"))
                .as("something to do with no day is a reminder for some time")
                .isEqualTo("reminder \"Book the car service\"");
        assertThat(read("Dinner at Grandma Astrid's Saturday 18:30"))
                .isEqualTo("event \"Dinner at Grandma Astrid's\" on 2026-11-14 at 18:30-19:00");
        assertThat(read("School trip Friday 8:00")).isEqualTo("event \"School trip\" on 2026-11-13 at 08:00-08:30");
        assertThat(read("Mia's birthday party 5 Dec"))
                .isEqualTo("event \"Mia's birthday party\" on 2026-12-05 about Mia");
        assertThat(read("Passport photos Friday"))
                .as("not obvious: what the person chose, a reminder")
                .isEqualTo("reminder \"Passport photos\" on 2026-11-13");
        Context asEvents = new Context(TODAY, null, NORA.id(), LINDS.people(), LINDS.lists(), ReadAs.EVENT);
        assertThat(said(LineReader.read("Passport photos Friday", asEvents)))
                .isEqualTo("event \"Passport photos\" on 2026-11-13");
        assertThat(read("Just a thought about the garden")).isEqualTo("note \"Just a thought about the garden\"");
    }

    @Test
    void repeatingIsReadAndStartsTheNextTimeItComesRound() {
        assertThat(read("Swimming every Thursday at 17:00"))
                .isEqualTo("event \"Swimming\" on 2026-11-12 at 17:00-17:30 repeats Thursdays");
        assertThat(read("Take the bins out every Tuesday and Friday at 7pm"))
                .isEqualTo("reminder \"Take the bins out\" on 2026-11-13 at 19:00 repeats Tue and Fri");
        assertThat(read("Football Mondays, Wednesdays and Fridays at 5"))
                .isEqualTo("event \"Football\" on 2026-11-11 at 17:00-17:30 repeats Mon, Wed and Fri");
        assertThat(read("School run weekdays at 8"))
                .isEqualTo("event \"School run\" on 2026-11-12 at 08:00-08:30 repeats Weekdays");
        assertThat(read("Feed Biscuit every day at 7:30"))
                .isEqualTo("reminder \"Feed Biscuit\" on 2026-11-12 at 07:30 repeats Every day");
        assertThat(read("Pay rent monthly")).isEqualTo("reminder \"Pay rent\" on 2026-11-11 repeats Every month");
        assertThat(read("Piano lesson every other Wednesday 16:00"))
                .isEqualTo("event \"Piano lesson\" on 2026-11-11 at 16:00-16:30 repeats Every other Wednesday");
        assertThat(read("Mia's birthday every year on 4 Dec"))
                .isEqualTo("event \"Mia's birthday\" on 2026-12-04 about Mia repeats Every year");
    }

    @Test
    void remindingBeforeIsReadInMinutes() {
        assertThat(read("Dentist tomorrow at 3, remind me 15 min before")).endsWith("remind 15");
        assertThat(read("Dentist tomorrow at 3 remind me 2 hours before")).endsWith("remind 120");
        assertThat(read("Flight Friday 6:40, remind me the day before")).endsWith("remind 1440");
        assertThat(read("Flight Friday 6:40 with a reminder a week before")).endsWith("remind 10080");
        assertThat(read("Dentist tomorrow at 3, remind me half an hour before"))
                .isEqualTo("event \"Dentist\" on 2026-11-12 at 15:00-15:30 remind 30");
    }

    // ---------- people ----------

    @Test
    void aNameSaysWhoItIsForOrWhoItIsGivenTo() {
        assertThat(read("Dentist Mia Tuesday 3pm")).isEqualTo("event \"Dentist\" on 2026-11-17 at 15:00-15:30 for Mia");
        assertThat(read("Remind Alex to book the car service"))
                .isEqualTo("reminder \"Book the car service\" given to Alex");
        assertThat(read("Tell Alex the plumber comes Tuesday"))
                .isEqualTo("reminder \"The plumber comes\" on 2026-11-17 given to Alex");
        assertThat(read("Alex: take the bins out tonight"))
                .isEqualTo("reminder \"Take the bins out\" on 2026-11-11 at 19:00 given to Alex");
        assertThat(read("Leo should tidy his room")).isEqualTo("reminder \"Tidy his room\" given to Leo");
        assertThat(read("Lunch with Alex Friday 12:30"))
                .isEqualTo("event \"Lunch with Alex\" on 2026-11-13 at 12:30-13:00 with Alex");
        assertThat(read("Sign Mia's school trip form by Friday"))
                .isEqualTo("reminder \"Sign Mia's school trip form\" on 2026-11-13 about Mia");
        assertThat(read("Buy a present for Leo on Saturday"))
                .isEqualTo("reminder \"Buy a present\" on 2026-11-14 for Leo");
        assertThat(read("Remind me to call Alex tomorrow"))
                .isEqualTo("reminder \"Call Alex\" on 2026-11-12 given to me");
        assertThat(read("Call Grandma Astrid tomorrow"))
                .as("a name that isn't in the circle is just a word")
                .isEqualTo("reminder \"Call Grandma Astrid\" on 2026-11-12");
    }

    // ---------- shopping and lists ----------

    @Test
    void whatReadsLikeShoppingGoesOnTheShoppingListOneLineEach() {
        assertThat(read("buy milk")).isEqualTo("list_item \"Milk\" shopping");
        assertThat(read("We need toilet paper and bin bags"))
                .isEqualTo("list_item \"Toilet paper\" shopping | list_item \"Bin bags\" shopping");
        assertThat(read("bananas, strawberries, butter"))
                .isEqualTo(
                        "list_item \"Bananas\" shopping | list_item \"Strawberries\" shopping | list_item \"Butter\" shopping");
        assertThat(read("500g flour")).isEqualTo("list_item \"Flour\" shopping x500 g");
        assertThat(read("two lemons")).isEqualTo("list_item \"Lemons\" shopping x2");
        assertThat(read("a dozen eggs")).isEqualTo("list_item \"Eggs\" shopping x1 dozen");
        assertThat(read("oat milk x3")).isEqualTo("list_item \"Oat milk\" shopping x3");
        assertThat(read("mac and cheese"))
                .as("not every 'and' is two things")
                .isEqualTo("list_item \"Mac and cheese\" shopping");
        assertThat(read("buy plasters, bandages"))
                .as("a list goes on after 'buy'")
                .isEqualTo("list_item \"Plasters\" shopping | list_item \"Bandages\" shopping");
        assertThat(read("Add batteries to the shopping list")).isEqualTo("list_item \"Batteries\" shopping");
        assertThat(read("Buy a present for Mia on Friday"))
                .as("buying on a day is a job, not a line on the list")
                .startsWith("reminder");
    }

    @Test
    void aLineForANamedListGoesToThatList() {
        Reading reading = LineReader.read("put sun cream on the packing list", LINDS);
        assertThat(said(reading)).isEqualTo("list_item \"Sun cream\" list Packing list");
        assertThat(reading.items().get(0).listId()).isEqualTo(PACKING.id());
        assertThat(read("packing list: torch, 2 batteries, passports"))
                .isEqualTo("list_item \"Torch\" list Packing list | list_item \"Batteries\" list Packing list x2"
                        + " | list_item \"Passports\" list Packing list");
        assertThat(read("add balloons to party prep")).isEqualTo("list_item \"Balloons\" list Party prep");
        Reading unknown = LineReader.read("add skis to the winter list", LINDS);
        assertThat(said(unknown)).isEqualTo("list_item \"Skis\" list Winter");
        assertThat(unknown.items().get(0).listId()).as("a list nobody has yet").isNull();
        assertThat(read("Put the bins out")).as("'put … out' names no list").isEqualTo("reminder \"Put the bins out\"");
    }

    // ---------- secrets ----------

    @Test
    void whatLooksLikeACodeOrAPasswordIsHeldBackForTheVault() {
        assertThat(read("wifi password is hunter2")).isEqualTo("code \"Wifi password hunter2\" password");
        assertThat(read("Netflix password: Tr0ub4dor&3")).isEqualTo("code \"Netflix password Tr0ub4dor&3\" password");
        assertThat(read("PIN 4471")).isEqualTo("code \"PIN 4471\" code");
        assertThat(read("the alarm code is 9911#")).isEqualTo("code \"Alarm code 9911#\" code");
        assertThat(read("4471")).isEqualTo("code \"4471\" code");
        assertThat(read("8842-1173")).isEqualTo("code \"8842-1173\" code");
        assertThat(read("Xk9#mP2$vL")).isEqualTo("code \"Xk9#mP2$vL\" password");
        assertThat(read("SI56 1910 0000 0123 438")).isEqualTo("code \"SI56 1910 0000 0123 438\" iban");
        assertThat(read("card 4111 1111 1111 1111")).isEqualTo("code \"Card 4111 1111 1111 1111\" card");
        assertThat(read("Milk, and the gate code is 4471"))
                .isEqualTo("list_item \"Milk\" shopping | code \"Gate code 4471\" code");
        // The whole secret is one piece, so the app can show what was held back and why.
        Item held = LineReader.read("Gate code 4471", LINDS).items().get(0);
        assertThat(held.pieces()).extracting(Piece::became).containsExactly("Looks like a code");
    }

    @Test
    void wordsAboutCodesAndPlainNumbersAreNotSecrets() {
        assertThat(read("Change the wifi password tomorrow"))
                .isEqualTo("reminder \"Change the wifi password\" on 2026-11-12");
        assertThat(read("Dress code is casual")).isEqualTo("note \"Dress code is casual\"");
        assertThat(read("Meeting tomorrow at 10:30")).startsWith("event");
        assertThat(read("12/4")).doesNotContain("code \"");
        assertThat(read("SI56 1910 0000 0123 439"))
                .as("an IBAN whose check doesn't add up is not one")
                .doesNotContain("iban");
        assertThat(read("Mia needs 20 euros")).isEqualTo("note \"Mia needs 20 euros\" about Mia");
        assertThat(LineReader.luhn("4111111111111111")).isTrue();
        assertThat(LineReader.luhn("4111111111111112")).isFalse();
        assertThat(LineReader.ibanAddsUp("GB82 WEST 1234 5698 7654 32")).isTrue();
    }

    // ---------- several things in one breath ----------

    @Test
    void oneSentenceComesApartIntoItsThings() {
        assertThat(read("eggs and flour remind me to call Mum at six and the gate code is 4471"))
                .as("spoken, with no commas at all")
                .isEqualTo("list_item \"Eggs\" shopping | list_item \"Flour\" shopping"
                        + " | reminder \"Call Mum\" on 2026-11-11 at 18:00 given to me | code \"Gate code 4471\" code");
        assertThat(read("Call the plumber and book the car service"))
                .isEqualTo("reminder \"Call the plumber\" | reminder \"Book the car service\"");
        assertThat(read("Dinner and a movie Saturday at 7"))
                .as("an 'and' inside one thing stays")
                .isEqualTo("event \"Dinner and a movie\" on 2026-11-14 at 19:00-19:30");
        assertThat(read("Swimming every Monday, Wednesday and Friday at 5"))
                .as("commas inside a list of days don't cut")
                .isEqualTo("event \"Swimming\" on 2026-11-11 at 17:00-17:30 repeats Mon, Wed and Fri");
        assertThat(read("Party on Saturday, 5 December 2026 at 14:00"))
                .isEqualTo("event \"Party\" on 2026-12-05 at 14:00-14:30");
        assertThat(read("Milk; dentist tomorrow 3pm; call Mum"))
                .isEqualTo(
                        "list_item \"Milk\" shopping | event \"Dentist\" on 2026-11-12 at 15:00-15:30 | reminder \"Call Mum\"");
        assertThat(read("Dr. Novak tomorrow at 3. Buy flowers."))
                .isEqualTo("reminder \"Dr. Novak\" on 2026-11-12 at 15:00 | list_item \"Flowers\" shopping");
        assertThat(read("")).isEmpty();
        assertThat(read("   ")).isEmpty();
    }

    // ---------- a letter ----------

    @Test
    void aLetterGivesBackTheDaysAndAmountsItHoldsWithTheWordsAroundThem() {
        String letter = """
            Class 4B · trip to the Postojna caves

            Dear parents,
            our class is going to the Postojna caves on Friday 20 November at 8:00. The bus leaves from the school gate.
            Please sign the attached form and return it by Wed 18 Nov.
            The trip costs €12, to be paid to the school with the form.
            Children should bring a warm jacket and a snack.

            Kind regards,
            Ms Kovač
            """;

        Reading reading = LineReader.read(letter, LINDS);

        assertThat(reading.letter()).isTrue();
        assertThat(reading.items()).isEmpty();
        assertThat(reading.dates())
                .extracting(FoundDate::day)
                .containsExactly(LocalDate.of(2026, 11, 20), LocalDate.of(2026, 11, 18));
        FoundDate trip = reading.dates().get(0);
        assertThat(trip.time()).isEqualTo(LocalTime.of(8, 0));
        assertThat(trip.deadline()).isFalse();
        assertThat(trip.around()).contains("Postojna caves on Friday 20 November at 8:00");
        assertThat(letter.substring(trip.start(), trip.end())).isEqualTo("on Friday 20 November");
        FoundDate form = reading.dates().get(1);
        assertThat(form.deadline()).as("'by' makes it something to do by then").isTrue();
        assertThat(form.title()).isEqualTo("Sign the attached form and return it");
        assertThat(reading.amounts()).hasSize(1);
        assertThat(reading.amounts().get(0).cents()).isEqualTo(1200);
        assertThat(reading.amounts().get(0).currency()).isEqualTo("EUR");
    }
}
