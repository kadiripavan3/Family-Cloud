package app.homeport.api.home;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.CircleService.MemberResponse;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.Keyset;
import app.homeport.api.home.SearchSource.Found;
import app.homeport.api.home.TodaySource.FreshCard;
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

    private final CircleService circles;
    private final ThingStore thingStore;
    private final ThingService things;
    private final List<TodaySource> todaySources;
    private final List<SearchSource> searchSources;

    HomeService(
            CircleService circles,
            ThingStore thingStore,
            ThingService things,
            List<TodaySource> todaySources,
            List<SearchSource> searchSources) {
        this.circles = circles;
        this.thingStore = thingStore;
        this.things = things;
        this.todaySources = todaySources;
        this.searchSources = searchSources;
    }

    public TodayResponse today(UUID circleId, UUID me, LocalDate day) {
        circles.require(circleId, me);
        LocalDate on = day == null ? LocalDate.now() : day;
        List<TodayItem> items = new ArrayList<>();
        List<FreshCard> fresh = new ArrayList<>();
        for (TodaySource source : todaySources) {
            items.addAll(source.today(me, circleId, on));
            fresh.addAll(source.fresh(me, circleId));
        }
        items.sort(Comparator.comparingInt(TodayItem::minute).thenComparing(TodayItem::title));
        int done =
                (int) items.stream().filter(i -> Boolean.TRUE.equals(i.done())).count();
        return new TodayResponse(
                on,
                items.size() - done,
                done,
                items,
                fresh.stream().limit(MAX_FRESH).toList(),
                thingStore.onlyMine(me));
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
                for (Found found : source.find(circleId, typed, MAX_FOUND)) {
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
