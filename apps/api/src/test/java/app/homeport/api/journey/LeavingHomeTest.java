package app.homeport.api.journey;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.journey.LeavingHome.Candidate;
import app.homeport.api.journey.LeavingHome.Checked;
import app.homeport.api.journey.LeavingHome.DayWords;
import app.homeport.api.journey.LeavingHome.Home;
import app.homeport.api.journey.LeavingHome.LeavingFlag;
import app.homeport.api.journey.LeavingHome.LeftOut;
import app.homeport.api.journey.LeavingHome.Outcome;
import app.homeport.api.journey.LeavingHome.Switches;
import app.homeport.api.journey.LeavingHome.Verdict;
import app.homeport.api.media.MediaKind;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import java.io.IOException;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.function.IntConsumer;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * "Before it leaves home": what is left out, what is flagged, what a day says of its place; and that there is
 * no way round it, because Journey only takes what this check made.
 */
class LeavingHomeTest {

    private static final LocalDate SATURDAY = LocalDate.of(2026, 11, 7);
    private static final Home HOME = new Home(46.0569, 14.5058, 150);
    private static final double LAKE_LAT = 46.36254;
    private static final double LAKE_LNG = 14.09381;

    private final List<Candidate> draft = new ArrayList<>();

    /** A photo at the lake, the writer's own, shared with the circle. Each test changes what it is about. */
    private static Candidate photo() {
        return new Candidate(
                UUID.randomUUID(),
                ThingKind.PHOTO,
                SATURDAY,
                1,
                Audience.CIRCLE,
                false,
                true,
                false,
                LAKE_LAT,
                LAKE_LNG,
                "Lake Bled",
                MediaKind.PHOTO,
                "photos/2026-11/abc.jpg",
                "image/jpeg",
                2048,
                1536,
                null,
                false,
                false);
    }

    private static Candidate with(
            Candidate c,
            ThingKind kind,
            MediaKind mediaKind,
            Audience audience,
            boolean hidden,
            boolean mine,
            boolean aboutChild,
            Double lat,
            Double lng,
            Integer seconds,
            boolean dropped,
            boolean backOn) {
        return new Candidate(
                c.itemId(),
                kind,
                c.day(),
                c.position(),
                audience,
                hidden,
                mine,
                aboutChild,
                lat,
                lng,
                c.place(),
                mediaKind,
                c.storageKey(),
                c.contentType(),
                c.width(),
                c.height(),
                seconds,
                dropped,
                backOn);
    }

    private static Candidate aboutAChild(boolean backOn) {
        Candidate c = photo();
        return with(c, c.kind(), c.mediaKind(), c.audience(), false, true, true, c.lat(), c.lng(), null, false, backOn);
    }

    private static Candidate atHome(boolean backOn) {
        Candidate c = photo();
        return with(
                c, c.kind(), c.mediaKind(), c.audience(), false, true, false, 46.0570, 14.5059, null, false, backOn);
    }

    private static Candidate video(Integer seconds) {
        Candidate c = photo();
        return with(
                c,
                ThingKind.VIDEO,
                MediaKind.VIDEO,
                c.audience(),
                false,
                true,
                false,
                c.lat(),
                c.lng(),
                seconds,
                false,
                false);
    }

    private Outcome check(Switches switches, Home home) {
        return LeavingHome.check(
                UUID.randomUUID(),
                "A weekend at Lake Bled",
                JourneyVisibility.PRIVATE,
                List.of(new DayWords(SATURDAY, "Saturday at Lake Bled", null, null, null)),
                draft,
                switches,
                home,
                List.of(),
                null,
                false);
    }

    private Verdict verdict(Outcome outcome, Candidate candidate) {
        return outcome.verdicts().stream()
                .filter(v -> v.itemId().equals(candidate.itemId()))
                .findFirst()
                .orElseThrow();
    }

    private static List<UUID> going(Outcome outcome) {
        return outcome.draft().days().stream()
                .flatMap(day -> day.shots().stream())
                .map(Checked.Leaving::itemId)
                .toList();
    }

    // ---------- what is left out ----------

    @Test
    void aPhotoAboutAChildStaysHomeUnlessItIsSwitchedBackOn() {
        Candidate plain = photo();
        Candidate child = aboutAChild(false);
        Candidate childAfterAll = aboutAChild(true);
        draft.addAll(List.of(plain, child, childAfterAll));

        Outcome careful = check(Switches.CAREFUL, HOME);
        assertThat(going(careful)).containsExactlyInAnyOrder(plain.itemId(), childAfterAll.itemId());
        assertThat(verdict(careful, child).leftOut()).containsExactly(LeftOut.CHILD);
        assertThat(verdict(careful, childAfterAll).goes()).isTrue();

        // With the switch off, all three go.
        assertThat(going(check(new Switches(false, true, true), HOME))).hasSize(3);
    }

    @Test
    void whatWasTakenAtHomeStaysHomeUnlessItIsSwitchedBackOn() {
        Candidate lake = photo();
        Candidate kitchen = atHome(false);
        Candidate kitchenAfterAll = atHome(true);
        draft.addAll(List.of(lake, kitchen, kitchenAfterAll));

        Outcome careful = check(Switches.CAREFUL, HOME);
        assertThat(going(careful)).containsExactlyInAnyOrder(lake.itemId(), kitchenAfterAll.itemId());
        assertThat(verdict(careful, kitchen).leftOut()).containsExactly(LeftOut.HOME);
        assertThat(going(check(new Switches(true, true, false), HOME))).hasSize(3);
        // A circle that hasn't said where home is has nothing to go by: nothing is recognised as taken there.
        assertThat(going(check(Switches.CAREFUL, null))).hasSize(3);
    }

    @Test
    void homeIsAPlaceWithAnEdge() {
        // 150 metres around the house. A degree of latitude is about 111 km.
        assertThat(LeavingHome.atHome(46.0569 + 0.0010, 14.5058, HOME)).isTrue(); // about 110 m north
        assertThat(LeavingHome.atHome(46.0569 + 0.0020, 14.5058, HOME)).isFalse(); // about 220 m north
        assertThat(LeavingHome.atHome(LAKE_LAT, LAKE_LNG, HOME)).isFalse();
        assertThat(LeavingHome.atHome(null, null, HOME)).isFalse();
        assertThat(LeavingHome.metres(46.0569, 14.5058, LAKE_LAT, LAKE_LNG)).isBetween(45_000.0, 47_000.0);
    }

    @Test
    void onlyPhotosAndVideosEverGoAndNoSwitchBringsAnythingElseBack() {
        Candidate ok = photo();
        List<Candidate> never = new ArrayList<>();
        for (ThingKind kind : ThingKind.values()) {
            if (kind == ThingKind.PHOTO || kind == ThingKind.VIDEO) {
                continue;
            }
            Candidate c = photo();
            // Switched back on, as if someone had found a way to ask for it.
            never.add(with(
                    c, kind, MediaKind.PHOTO, c.audience(), false, true, false, c.lat(), c.lng(), null, false, true));
        }
        Candidate scanOfABill = photo();
        never.add(with(
                scanOfABill,
                ThingKind.PHOTO,
                MediaKind.FILE,
                scanOfABill.audience(),
                false,
                true,
                false,
                null,
                null,
                null,
                false,
                true));
        draft.add(ok);
        draft.addAll(never);

        Outcome outcome = check(new Switches(false, false, false), HOME);

        assertThat(going(outcome)).containsExactly(ok.itemId());
        assertThat(never)
                .as("every other kind of thing, the Vault's and Money's among them")
                .hasSizeGreaterThan(10)
                .allSatisfy(c -> assertThat(verdict(outcome, c).leftOut()).containsExactly(LeftOut.NOT_A_PHOTO));
    }

    @Test
    void aVideoLongerThanJourneyTakesStaysAndADroppedPhotoStaysDropped() {
        Candidate shortClip = video(42);
        Candidate exactlyAMinute = video(60);
        Candidate homeVideo = video(61);
        Candidate lengthUnknown = video(null);
        Candidate c = photo();
        Candidate dropped =
                with(c, c.kind(), c.mediaKind(), c.audience(), false, true, false, c.lat(), c.lng(), null, true, true);
        draft.addAll(List.of(shortClip, exactlyAMinute, homeVideo, lengthUnknown, dropped));

        Outcome outcome = check(Switches.CAREFUL, HOME);

        assertThat(going(outcome))
                .containsExactlyInAnyOrder(shortClip.itemId(), exactlyAMinute.itemId(), lengthUnknown.itemId());
        assertThat(verdict(outcome, homeVideo).leftOut()).containsExactly(LeftOut.TOO_LONG);
        assertThat(verdict(outcome, dropped).leftOut()).containsExactly(LeftOut.DROPPED);
    }

    // ---------- what is flagged ----------

    @Test
    void whatIsOnlyYoursHiddenFromSomeoneOrSomeoneElsesIsFlaggedAndStillGoes() {
        Candidate c = photo();
        Candidate onlyYou =
                with(c, c.kind(), c.mediaKind(), Audience.ME, false, true, false, c.lat(), c.lng(), null, false, false);
        Candidate c2 = photo();
        Candidate surprise = with(
                c2,
                c2.kind(),
                c2.mediaKind(),
                Audience.CIRCLE,
                true,
                true,
                false,
                c2.lat(),
                c2.lng(),
                null,
                false,
                false);
        Candidate c3 = photo();
        Candidate alexs = with(
                c3,
                c3.kind(),
                c3.mediaKind(),
                Audience.SOME,
                false,
                false,
                false,
                c3.lat(),
                c3.lng(),
                null,
                false,
                false);
        Candidate plain = photo();
        draft.addAll(List.of(onlyYou, surprise, alexs, plain));

        Outcome outcome = check(Switches.CAREFUL, HOME);

        assertThat(verdict(outcome, onlyYou).flags()).containsExactly(LeavingFlag.ONLY_YOU);
        assertThat(verdict(outcome, surprise).flags()).containsExactly(LeavingFlag.HIDDEN);
        assertThat(verdict(outcome, alexs).flags()).containsExactly(LeavingFlag.SOMEONE_ELSES);
        assertThat(verdict(outcome, plain).flags()).isEmpty();
        assertThat(going(outcome)).as("a flag leaves nothing out by itself").hasSize(4);
    }

    // ---------- what a day says ----------

    @Test
    void theTownNotTheSpot() {
        draft.add(photo());

        Checked.Day town = check(Switches.CAREFUL, HOME).draft().days().get(0);
        assertThat(town.place()).isEqualTo("Lake Bled");
        // Rounded to about a kilometre, and Journey is told to show a town.
        assertThat(town.lat()).isEqualTo(46.36);
        assertThat(town.lng()).isEqualTo(14.09);
        assertThat(town.exact()).isFalse();

        Checked.Day spot =
                check(new Switches(true, false, true), HOME).draft().days().get(0);
        assertThat(spot.lat()).isEqualTo(LAKE_LAT);
        assertThat(spot.lng()).isEqualTo(LAKE_LNG);
        assertThat(spot.exact()).isTrue();
    }

    @Test
    void aDaysPointComesOnlyFromWhatGoesAndADayWithNothingGoingIsNotTold() {
        Candidate lake = photo();
        Candidate kitchen = atHome(false);
        draft.addAll(List.of(lake, kitchen));

        // The photo taken at home stays, and so does where home is: the day's point is the lake's alone.
        Checked.Day day =
                check(new Switches(true, false, true), HOME).draft().days().get(0);
        assertThat(day.shots()).hasSize(1);
        assertThat(day.lat()).isEqualTo(LAKE_LAT);

        draft.clear();
        draft.add(kitchen);
        Outcome nothing = check(Switches.CAREFUL, HOME);
        assertThat(nothing.draft().days()).isEmpty();
        assertThat(nothing.draft().shots()).isZero();
        assertThat(nothing.draft().startsOn()).isNull();
    }

    @Test
    void aPlanGoesWithItsTitleAndItsFirstDayAndNothingElse() {
        Outcome trip = LeavingHome.check(
                UUID.randomUUID(),
                "Norway 2027",
                null,
                List.of(),
                List.of(),
                Switches.CAREFUL,
                HOME,
                List.of(UUID.randomUUID()),
                LocalDate.of(2027, 4, 3),
                true);
        assertThat(trip.draft().title()).isEqualTo("Norway 2027");
        assertThat(trip.draft().startsOn()).isEqualTo(LocalDate.of(2027, 4, 3));
        assertThat(trip.draft().visibility()).as("it starts as private").isEqualTo(JourneyVisibility.PRIVATE);
        assertThat(trip.draft().days()).isEmpty();
        assertThat(trip.draft().coAuthors()).hasSize(1);
    }

    // ---------- there is no way round it ----------

    @Test
    void aCheckedDraftCanOnlyBeMadeByTheCheck() {
        assertThat(Modifier.isFinal(Checked.class.getModifiers())).isTrue();
        assertThat(Checked.class.isRecord())
                .as("a record's constructor is as open as the record")
                .isFalse();
        for (Constructor<?> constructor : Checked.class.getDeclaredConstructors()) {
            assertThat(Modifier.isPrivate(constructor.getModifiers()))
                    .as("constructor %s", constructor)
                    .isTrue();
        }
        // Nothing but the check hands one out: no other method of this API returns a checked draft.
        List<Method> makers = Arrays.stream(LeavingHome.class.getDeclaredMethods())
                .filter(method -> !method.isSynthetic()
                        && (method.getReturnType() == Checked.class || method.getReturnType() == Outcome.class))
                .toList();
        assertThat(makers).extracting(Method::getName).containsExactly("check");
        assertThat(Arrays.stream(Checked.class.getDeclaredMethods())
                        .filter(m -> Modifier.isStatic(m.getModifiers()) && !m.isSynthetic()))
                .isEmpty();
    }

    @Test
    void journeyTakesNothingButACheckedDraft() throws Exception {
        Method post = Arrays.stream(JourneyPort.class.getDeclaredMethods())
                .filter(method -> method.getName().startsWith("post"))
                .reduce((a, b) -> {
                    throw new AssertionError("There is one way to hand something to Journey, not two: " + a + ", " + b);
                })
                .orElseThrow();
        assertThat(post.getParameterTypes()).containsExactly(Caller.class, Checked.class, IntConsumer.class);
        // And the one method of this API that calls it takes nothing else either.
        Method send = TellService.class.getDeclaredMethod("send", Caller.class, Checked.class, IntConsumer.class);
        assertThat(send.getParameterTypes()).contains(Checked.class);
    }

    @Test
    void oneMethodInTheWholeApiHandsAnythingToJourney() throws IOException {
        Pattern handsOver = Pattern.compile("\\.post\\s*\\(\\s*as\\b|\\bport\\s*\\.\\s*post\\s*\\(");
        List<String> callers = new ArrayList<>();
        try (Stream<Path> files = Files.walk(Path.of("src/main/java"))) {
            for (Path file :
                    files.filter(path -> path.toString().endsWith(".java")).toList()) {
                String name = file.getFileName().toString();
                List<String> lines = Files.readAllLines(file);
                for (int n = 0; n < lines.size(); n++) {
                    if (handsOver.matcher(lines.get(n)).find()) {
                        callers.add(name + ":" + (n + 1));
                    }
                }
            }
        }
        assertThat(callers)
                .as("calls of JourneyPort.post in the API's code")
                .hasSize(1)
                .allSatisfy(caller -> assertThat(caller).startsWith("TellService.java:"));
        // Every class that holds a JourneyPort is in the journey package: no other place can reach Journey at all.
        try (Stream<Path> files = Files.walk(Path.of("src/main/java"))) {
            List<String> holders = files.filter(path -> path.toString().endsWith(".java"))
                    .filter(path -> {
                        try {
                            return Files.readString(path).contains("JourneyPort");
                        } catch (IOException e) {
                            throw new java.io.UncheckedIOException(e);
                        }
                    })
                    .map(path -> path.getParent().getFileName().toString())
                    .distinct()
                    .toList();
            assertThat(holders).containsExactly("journey");
        }
    }
}
