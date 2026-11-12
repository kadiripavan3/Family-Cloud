package app.homeport.api.home;

import app.homeport.api.circle.CircleKind;
import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.CircleService.MemberResponse;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.Keyset;
import app.homeport.api.home.SearchSource.Found;
import app.homeport.api.home.TodaySource.FreshCard;
import app.homeport.api.home.TodaySource.TodayCard;
import app.homeport.api.home.TodaySource.TodayItem;
import app.homeport.api.thing.Place;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.ThingBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** What Home shows across every place: today, what is new, a search, and a person's page. */
@Service
public class HomeService {

    static final int MAX_FRESH = 12;
    static final int MAX_FOUND = 40;

    public record TodayResponse(
            LocalDate day,

            @Schema(description = "How many of today's things are still to do")
            int left,

            @Schema(description = "How many of today's things are done")
            int done,

            List<TodayItem> items,

            @Schema(description = "Cards above the day's list, from each place that has one for today")
            List<TodayCard> cards,

            List<FreshCard> fresh,

            @Schema(description = "How many things in all your circles only you can see")
            int onlyYou) {}

    public record SearchHit(
            ThingBrief thing,

            @Schema(nullable = true, description = "Where the words were found inside it")
            String snippet) {}

    public record SearchResponse(String words, List<SearchHit> hits) {}

    public record PersonPageResponse(
            MemberResponse member,

            @Schema(description = "What is kept for them that you may see")
            List<ThingBrief> kept) {}

    /** One circle in the switcher's sheet. */
    public record SwitcherCircle(
            UUID id,
            String name,
            CircleKind kind,
            @Schema(nullable = true) String coverUrl,

            @Schema(description = "The line under its name: Friends · 5 people · you're owed €64")
            String line) {}

    public record SwitcherResponse(
            @Schema(description = "Your circles, in the order you joined them. Twenty at most.")
            List<SwitcherCircle> circles,

            @Schema(description = "How many things in all your circles only you can see: what Just me counts")
            int onlyYou) {}

    private final CircleService circles;
    private final ThingStore thingStore;
    private final ThingService things;
    private final List<TodaySource> todaySources;
    private final List<SearchSource> searchSources;
    private final List<SwitcherSource> switcherSources;

    HomeService(
            CircleService circles,
            ThingStore thingStore,
            ThingService things,
            List<TodaySource> todaySources,
            List<SearchSource> searchSources,
            List<SwitcherSource> switcherSources) {
        this.circles = circles;
        this.thingStore = thingStore;
        this.things = things;
        this.todaySources = todaySources;
        this.searchSources = searchSources;
        this.switcherSources = switcherSources;
    }

    /**
     * The sheet behind the round button in the search pill: each of a person's circles with one short line
     * ("Family · 4 people and Biscuit", "Friends · 5 people · you're owed €64"), and how many things only
     * they can see. What a place has to add to a line it adds itself ({@link SwitcherSource}).
     */
    public SwitcherResponse switcher(UUID me) {
        List<SwitcherCircle> lines = circles.mine(me).stream()
                .map(circle -> {
                    List<String> pieces = new ArrayList<>();
                    pieces.add(kindWord(circle.kind()));
                    pieces.add(peopleWords(circle.members()));
                    for (SwitcherSource source : switcherSources) {
                        source.line(circle.id(), me).ifPresent(pieces::add);
                    }
                    return new SwitcherCircle(
                            circle.id(), circle.name(), circle.kind(), circle.coverUrl(), String.join(" · ", pieces));
                })
                .toList();
        return new SwitcherResponse(lines, thingStore.onlyMine(me));
    }

    static String kindWord(CircleKind kind) {
        return switch (kind) {
            case FAMILY -> "Family";
            case COUPLE -> "Couple";
            case FLAT -> "Housemates";
            case CREW -> "Friends";
            case SOLO -> "Just you";
        };
    }

    /** "4 people and Biscuit": the people, then the pets by name (or how many, when there are several). */
    static String peopleWords(List<MemberResponse> members) {
        long people = members.stream().filter(m -> m.kind() != MemberKind.PET).count();
        List<String> pets = members.stream()
                .filter(m -> m.kind() == MemberKind.PET)
                .map(MemberResponse::name)
                .toList();
        String words = people == 1 ? "1 person" : people + " people";
        if (pets.isEmpty()) {
            return words;
        }
        return words + " and " + (pets.size() == 1 ? pets.get(0) : pets.size() + " pets");
    }

    public TodayResponse today(UUID circleId, UUID me, LocalDate day) {
        circles.require(circleId, me);
        LocalDate on = day == null ? LocalDate.now() : day;
        List<TodayItem> items = new ArrayList<>();
        List<FreshCard> fresh = new ArrayList<>();
        List<TodayCard> cards = new ArrayList<>();
        for (TodaySource source : todaySources) {
            items.addAll(source.today(me, circleId, on));
            fresh.addAll(source.fresh(me, circleId));
            cards.addAll(source.cards(me, circleId, on));
        }
        items.sort(Comparator.comparingInt(TodayItem::minute).thenComparing(TodayItem::title));
        int done =
                (int) items.stream().filter(i -> Boolean.TRUE.equals(i.done())).count();
        return new TodayResponse(
                on,
                items.size() - done,
                done,
                items,
                cards.stream()
                        .sorted(Comparator.comparingInt(TodayCard::order))
                        .limit(8)
                        .toList(),
                oncePerTitle(fresh),
                thingStore.onlyMine(me));
    }

    /**
     * Two places can know the same thing (a recipe is a page in Notes and a scan in the Library). It is shown
     * once: the card with a label on its picture wins, then the one with a picture.
     */
    private static List<FreshCard> oncePerTitle(List<FreshCard> cards) {
        Map<String, FreshCard> byTitle = new LinkedHashMap<>();
        for (FreshCard card : cards) {
            byTitle.merge(
                    card.title().trim().toLowerCase(java.util.Locale.ROOT),
                    card,
                    (kept, next) -> weight(next) > weight(kept) ? next : kept);
        }
        return byTitle.values().stream().limit(MAX_FRESH).toList();
    }

    private static int weight(FreshCard card) {
        return (card.pill() != null ? 2 : 0) + (card.imageUrl() != null ? 1 : 0);
    }

    /**
     * One search across every place of a circle: titles of every kind, and whatever each place can find
     * inside its things. Only what the person may see comes back.
     */
    public SearchResponse search(UUID circleId, UUID me, String words, Place place) {
        circles.require(circleId, me);
        String typed = words == null ? "" : words.trim();
        if (typed.length() < 2) {
            return new SearchResponse(typed, List.of());
        }
        Map<UUID, String> snippets = new LinkedHashMap<>();
        for (ThingRow row : thingStore.list(circleId, me, null, place, typed, Keyset.first(MAX_FOUND))) {
            snippets.put(row.id(), null);
        }
        for (SearchSource source : searchSources) {
            if (place == null || source.place() == place) {
                for (Found found : source.find(circleId, me, typed, MAX_FOUND)) {
                    snippets.merge(found.thingId(), found.snippet(), (title, inside) -> inside);
                }
            }
        }
        // One check of who may see what, for everything any place found.
        List<ThingRow> rows = thingStore.findAll(List.copyOf(snippets.keySet()), me).stream()
                .sorted(Comparator.comparing(ThingRow::updatedAt).reversed())
                .limit(MAX_FOUND)
                .toList();
        return new SearchResponse(
                typed,
                things.briefs(rows, me).stream()
                        .map(b -> new SearchHit(b, snippets.get(b.id())))
                        .toList());
    }

    public PersonPageResponse person(UUID memberId, UUID me) {
        MemberRow member = circles.member(memberId, me);
        return new PersonPageResponse(circles.view(member, me), things.briefs(thingStore.about(memberId, me, 30), me));
    }
}
