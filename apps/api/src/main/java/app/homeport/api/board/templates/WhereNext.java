package app.homeport.api.board.templates;

import app.homeport.api.board.BoardMedia;
import app.homeport.api.board.BoardRules;
import app.homeport.api.board.BoardStore;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.Words;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.folder.FolderService;
import app.homeport.api.folder.FolderService.FolderResponse;
import app.homeport.api.home.TodaySource.FreshCard;
import app.homeport.api.home.TodaySource.TodayCard;
import app.homeport.api.media.MediaKind;
import app.homeport.api.money.Cash;
import app.homeport.api.page.PageService;
import app.homeport.api.page.PageService.NewPage;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Where next? Ideas for the next trip with the facts beside them (how many days, roughly what it costs
 * each), a vote, and a winner.
 *
 * <p><b>Who sees what.</b> It is decided in {@link #open}, and only there: the vote is private until it
 * closes. While it is open, a person sees the ideas, their own vote, and who has voted so far, never for
 * what and never how many votes an idea has. The ideas stand in the order they were added, not by votes. Once
 * it is closed, everyone sees the counts and who voted for what, and the ideas stand with the winner first.
 *
 * <p><b>Closing.</b> The vote closes by itself when the last person of the crew has voted, or the day after
 * the closing day when one was set; anyone who may change the board can also close it early. A closed vote
 * stays closed: a new round is a new board. The winner is the idea with the most votes; when two have the
 * same, the one that was added first.
 *
 * <p><b>Making it a trip</b> gives the winner a folder under "Trips" in Notes, with a page that holds the
 * facts, to plan in. The shared journey for the days away belongs to Journey, and is not made here.
 */
@Component
class WhereNext implements BoardRules {

    static final String IDEA = "idea";
    static final String VOTE = "vote";
    private static final int MOST_IDEAS = 30;

    // ---------- what is stored ----------

    record WhereNextSettings(
            @Schema(nullable = true, description = "When the trip would be, in the crew's words: Spring 2027")
            String when,

            @Schema(nullable = true, description = "The last day to vote, when one was set")
            LocalDate closesOn,

            @Schema(nullable = true, description = "The moment the vote closed")
            Instant closedAt,

            @Schema(nullable = true, description = "The folder the winner was given in Notes")
            UUID tripFolderId) {}

    record Idea(String name, Integer days, Long costCents, String currency, String note) {}

    // ---------- what a person sees ----------

    record WhereNextViewResponse(
            @Schema(nullable = true) String when,
            @Schema(nullable = true) LocalDate closesOn,
            boolean closed,

            @Schema(description = "How many people are asked to vote")
            int asked,

            @Schema(description = "How many of them have") int voted,

            @Schema(description = "Who hasn't voted yet") List<PersonBrief> waitingFor,

            boolean youVoted,

            @Schema(
                    description =
                            "The ideas: in the order they were added while the vote is open, the winner first after")
            List<WhereNextIdeaResponse> ideas,

            @Schema(nullable = true, description = "The winning idea. Null until the vote is closed.")
            UUID winnerId,

            @Schema(
                    description =
                            "True when the winner had as many votes as another idea, and won by being added first")
            boolean tied,

            @Schema(nullable = true, description = "The folder in Notes the winner was given, once it was made a trip")
            UUID tripFolderId) {}

    record WhereNextIdeaResponse(
            UUID id,
            String name,
            @Schema(nullable = true) Integer days,

            @Schema(nullable = true, description = "Roughly what it costs each person, in whole cents")
            Long costCents,

            String currency,
            @Schema(nullable = true) String note,
            @Schema(nullable = true) BoardMedia photo,
            @Schema(nullable = true) PersonBrief addedBy,
            boolean mine,

            @Schema(description = "True for the idea this person voted for")
            boolean yours,

            @Schema(nullable = true, description = "Its votes. Null until the vote is closed.")
            Integer votes,

            @Schema(
                    nullable = true,
                    description = "Its votes as a part of all votes, 0 to 100. Null until the vote is closed.")
            Integer percent,

            @Schema(description = "Who voted for it. Empty until the vote is closed.")
            List<PersonBrief> voters,

            boolean winner) {}

    private final BoardStore store;
    private final FolderService folders;
    private final PageService pages;

    WhereNext(BoardStore store, FolderService folders, PageService pages) {
        this.store = store;
        this.folders = folders;
        this.pages = pages;
    }

    @Override
    public Template template() {
        return Template.WHERE_NEXT;
    }

    @Override
    public Class<?> settingsType() {
        return WhereNextSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return WhereNextViewResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: when (words: Spring 2027), closesOn (the last day to vote; left out: until everyone has)",
                "entry idea: name, days, costCents (roughly, each), currency, note, mediaId (a photo upload). While"
                        + " the vote is open.",
                "verb vote: ideaId (your one vote; voting again moves it). The vote closes when everyone has voted.",
                "verb unvote: takes your vote back, while the vote is open",
                "verb close: closes the vote early",
                "verb make_trip: gives the winner a folder and a page in Notes, to plan in");
    }

    @Override
    public boolean viewersMay(String verb) {
        return verb.equals(VOTE) || verb.equals("unvote");
    }

    @Override
    public Object settings(Scene scene, Fields sent) {
        WhereNextSettings now =
                scene.isNew() ? new WhereNextSettings(null, null, null, null) : scene.settings(WhereNextSettings.class);
        LocalDate closesOn = sent.day("closesOn", now.closesOn());
        if (sent.has("closesOn") && closesOn != null && closesOn.isBefore(scene.today())) {
            throw ApiProblem.badRequest("invalid_day", "Choose a last day to vote that is still to come.");
        }
        if (sent.has("closesOn") && now.closedAt() != null) {
            throw closed();
        }
        return new WhereNextSettings(sent.text("when", 60, now.when()), closesOn, now.closedAt(), now.tripFolderId());
    }

    // ---------- who sees what ----------

    /** The one place that decides whether the votes are still private. */
    private static boolean open(Scene scene) {
        WhereNextSettings settings = scene.settings(WhereNextSettings.class);
        return settings.closedAt() == null
                && (settings.closesOn() == null || !scene.today().isAfter(settings.closesOn()));
    }

    private static ApiProblem closed() {
        return ApiProblem.conflict("closed", "The vote is closed. Start a new one for the next round.");
    }

    /** How many votes each idea has. Only ever shown once the vote is closed. */
    private static Map<UUID, List<UUID>> votes(Scene scene) {
        Map<UUID, List<UUID>> votes = new HashMap<>();
        for (EntryRow vote : scene.entries(VOTE)) {
            if (vote.parentId() != null && vote.authorId() != null) {
                votes.computeIfAbsent(vote.parentId(), idea -> new ArrayList<>())
                        .add(vote.authorId());
            }
        }
        return votes;
    }

    /** The idea with the most votes; of two with the same, the one added first. Null when nobody voted. */
    static <T> T winner(List<T> ideasAsAdded, Map<T, Integer> votes) {
        T winner = null;
        int most = 0;
        for (T idea : ideasAsAdded) {
            int count = votes.getOrDefault(idea, 0);
            if (count > most) {
                winner = idea;
                most = count;
            }
        }
        return winner;
    }

    private static EntryRow winner(Scene scene) {
        Map<UUID, Integer> counts = new HashMap<>();
        votes(scene).forEach((idea, who) -> counts.put(idea, who.size()));
        List<EntryRow> ideas = scene.entries(IDEA);
        UUID id = winner(ideas.stream().map(EntryRow::id).toList(), counts);
        return ideas.stream().filter(idea -> idea.id().equals(id)).findFirst().orElse(null);
    }

    private static List<UUID> voted(Scene scene) {
        return scene.entries(VOTE).stream().map(EntryRow::authorId).toList();
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        WhereNextSettings settings = scene.settings(WhereNextSettings.class);
        boolean open = open(scene);
        Map<UUID, List<UUID>> votes = votes(scene);
        int all = votes.values().stream().mapToInt(List::size).sum();
        EntryRow winner = open ? null : winner(scene);
        UUID mine = scene.entries(VOTE).stream()
                .filter(v -> scene.isMe(v.authorId()))
                .map(EntryRow::parentId)
                .findFirst()
                .orElse(null);
        List<UUID> voted = voted(scene);
        List<UUID> asked = Say.voiceIds(scene);
        List<WhereNextIdeaResponse> ideas = new ArrayList<>();
        for (EntryRow row : scene.entries(IDEA)) {
            Idea idea = row.as(Idea.class);
            List<UUID> who = votes.getOrDefault(row.id(), List.of());
            ideas.add(new WhereNextIdeaResponse(
                    row.id(),
                    idea.name(),
                    idea.days(),
                    idea.costCents(),
                    idea.currency() == null ? Cash.EUR : idea.currency(),
                    idea.note(),
                    scene.media(row.mediaId()),
                    scene.brief(row.authorId()),
                    scene.isMe(row.authorId()),
                    row.id().equals(mine),
                    open ? null : who.size(),
                    open ? null : all == 0 ? 0 : (int) Math.round(who.size() * 100.0 / all),
                    open
                            ? List.of()
                            : who.stream()
                                    .map(scene::brief)
                                    .filter(java.util.Objects::nonNull)
                                    .toList(),
                    winner != null && winner.id().equals(row.id())));
        }
        if (!open) {
            ideas.sort(Comparator.comparing((WhereNextIdeaResponse idea) -> !idea.winner())
                    .thenComparing(idea -> -idea.votes()));
        }
        int most =
                winner == null ? 0 : votes.getOrDefault(winner.id(), List.of()).size();
        return new WhereNextViewResponse(
                settings.when(),
                settings.closesOn(),
                !open,
                asked.size(),
                (int) asked.stream().filter(voted::contains).count(),
                asked.stream()
                        .filter(id -> !voted.contains(id))
                        .map(scene::brief)
                        .toList(),
                mine != null,
                ideas,
                winner == null ? null : winner.id(),
                winner != null
                        && votes.values().stream()
                                        .filter(who -> who.size() == most)
                                        .count()
                                > 1,
                settings.tripFolderId() != null && store.thingExists(settings.tripFolderId())
                        ? settings.tripFolderId()
                        : null);
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        if (!entry.is(IDEA)) {
            return null;
        }
        Idea idea = entry.as(Idea.class);
        return idea.name() + (idea.note() == null ? "" : " · " + idea.note());
    }

    // ---------- changing it ----------

    private static Idea idea(Fields sent, Idea now) {
        String name = sent.text("name", 80, now.name());
        if (name == null) {
            throw ApiProblem.badRequest("missing_name", "Say where to.");
        }
        return new Idea(
                name,
                sent.count("days", 1, 365, now.days()),
                sent.whole("costCents", 0, 100_000_000, now.costCents()),
                sent.has("currency") ? Cash.currency(sent.text("currency", 3)) : now.currency(),
                sent.text("note", 200, now.note()));
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        if (!kind.equals(IDEA)) {
            throw BoardRules.unknownKind();
        }
        if (!open(scene)) {
            throw closed();
        }
        if (scene.entries(IDEA).size() >= MOST_IDEAS) {
            throw ApiProblem.conflict("too_many", "Thirty ideas is as many as one vote takes.");
        }
        return scene.add(
                EntryDraft.of(IDEA)
                        .by(scene.myId())
                        .media(scene.upload(sent.id("mediaId"), MediaKind.PHOTO))
                        .doc(idea(sent, new Idea(null, null, null, Cash.EUR, null))),
                clientId);
    }

    /** An idea is changed or taken out by whoever added it, while the vote is open. */
    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        mayChange(scene, entry);
        EntryDraft draft = EntryDraft.from(entry).doc(idea(sent, entry.as(Idea.class)));
        if (sent.has("mediaId")) {
            draft.media(scene.upload(sent.id("mediaId"), MediaKind.PHOTO));
        }
        scene.save(entry, draft);
    }

    @Override
    public void remove(Scene scene, EntryRow entry) {
        mayChange(scene, entry);
        scene.remove(entry.id());
    }

    private static void mayChange(Scene scene, EntryRow entry) {
        if (!entry.is(IDEA)) {
            throw Scene.entryGone(); // a vote isn't there for anyone to change by its id
        }
        if (!open(scene)) {
            throw closed();
        }
        if (!scene.isMe(entry.authorId())) {
            throw BoardRules.notYours();
        }
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        WhereNextSettings settings = scene.settings(WhereNextSettings.class);
        switch (verb) {
            case VOTE -> {
                if (!open(scene)) {
                    throw closed();
                }
                if (scene.myId() == null || !Say.voiceIds(scene).contains(scene.myId())) {
                    throw BoardRules.notYours();
                }
                EntryRow idea = scene.need(sent.id("ideaId"));
                if (!idea.is(IDEA)) {
                    throw Scene.entryGone();
                }
                EntryRow mine = scene.entries(VOTE).stream()
                        .filter(v -> scene.isMe(v.authorId()))
                        .findFirst()
                        .orElse(null);
                if (mine == null) {
                    scene.add(
                            EntryDraft.of(VOTE).under(idea.id()).by(scene.myId()),
                            Scene.derivedId(scene.boardId(), "vote of " + scene.myId()));
                } else if (!idea.id().equals(mine.parentId())) {
                    scene.save(mine, EntryDraft.from(mine).under(idea.id()));
                }
                // The last vote closes it.
                if (voted(scene).containsAll(Say.voiceIds(scene))) {
                    close(scene, settings);
                }
            }
            case "unvote" -> {
                if (!open(scene)) {
                    throw closed();
                }
                scene.entries(VOTE).stream()
                        .filter(v -> scene.isMe(v.authorId()))
                        .forEach(v -> scene.remove(v.id()));
            }
            case "close" -> {
                if (open(scene)) {
                    if (scene.entries(VOTE).isEmpty()) {
                        throw ApiProblem.conflict("no_votes", "Nobody has voted yet. There is nothing to close.");
                    }
                    close(scene, settings);
                }
            }
            case "make_trip" -> makeTrip(scene, settings);
            default -> throw BoardRules.unknownVerb();
        }
    }

    private static void close(Scene scene, WhereNextSettings settings) {
        scene.saveSettings(
                new WhereNextSettings(settings.when(), settings.closesOn(), scene.now(), settings.tripFolderId()));
    }

    /** The winner gets a folder under "Trips" (or at the top, where there is no such space) and a page with the facts. */
    private void makeTrip(Scene scene, WhereNextSettings settings) {
        EntryRow winner = open(scene) ? null : winner(scene);
        if (winner == null) {
            throw ApiProblem.conflict(
                    "no_winner", "There is no winner yet. It can be made a trip once the vote is closed.");
        }
        if (settings.tripFolderId() != null && store.thingExists(settings.tripFolderId())) {
            return;
        }
        UUID user = scene.me().userId();
        Idea idea = winner.as(Idea.class);
        Audience audience = scene.audience() == Audience.SOME ? Audience.ME : scene.audience();
        UUID trips = folders.spaces(scene.circleId(), user).stream()
                .filter(space -> space.title().equals("Trips") && space.canEdit())
                .map(FolderResponse::id)
                .findFirst()
                .orElse(null);
        UUID folder = folders.create(
                        user,
                        scene.circleId(),
                        trips,
                        idea.name(),
                        "🧳",
                        audience,
                        Scene.derivedId(scene.boardId(), "trip folder"))
                .id();
        List<String> facts = new ArrayList<>();
        if (settings.when() != null) {
            facts.add(settings.when());
        }
        if (idea.days() != null) {
            facts.add(Words.count(idea.days(), "day"));
        }
        if (idea.costCents() != null) {
            facts.add("about " + Cash.round(idea.costCents(), idea.currency() == null ? Cash.EUR : idea.currency())
                    + " each");
        }
        pages.create(
                user,
                scene.circleId(),
                new NewPage(
                        idea.name() + ": the plan",
                        "Voted in “" + scene.title() + "”.\n" + String.join(" · ", facts)
                                + (idea.note() == null ? "" : "\n" + idea.note()),
                        audience,
                        folder,
                        "🧳"),
                Scene.derivedId(scene.boardId(), "trip page"));
        scene.saveSettings(new WhereNextSettings(settings.when(), settings.closesOn(), settings.closedAt(), folder));
    }

    // ---------- what it brings to the rest ----------

    private static String howFar(Scene scene) {
        List<UUID> voted = voted(scene);
        List<UUID> asked = Say.voiceIds(scene);
        return asked.stream().filter(voted::contains).count() + " of " + asked.size() + " voted";
    }

    @Override
    public String glance(Scene scene) {
        if (open(scene)) {
            return Words.count(scene.entries(IDEA).size(), "idea") + " · " + howFar(scene);
        }
        EntryRow winner = winner(scene);
        return winner == null
                ? "Closed without a vote"
                : winner.as(Idea.class).name() + " it is · "
                        + Words.count(votes(scene).get(winner.id()).size(), "vote");
    }

    /** While the vote is open, for someone whose vote is missing. */
    @Override
    public List<TodayCard> cards(Scene scene) {
        if (scene.me() == null
                || !open(scene)
                || scene.entries(IDEA).size() < 2
                || !Say.voiceIds(scene).contains(scene.myId())
                || voted(scene).contains(scene.myId())) {
            return List.of();
        }
        return List.of(new TodayCard(
                scene.boardId(),
                ThingKind.BOARD,
                template().code(),
                template().emoji(),
                scene.title(),
                howFar(scene) + " · your vote is missing",
                null,
                null,
                "Vote",
                15));
    }

    /** "From the crew": how far the vote is while it is open, and the winner for two weeks after it closed. */
    @Override
    public List<FreshCard> fresh(Scene scene) {
        WhereNextSettings settings = scene.settings(WhereNextSettings.class);
        List<EntryRow> ideas = scene.entries(IDEA);
        if (ideas.isEmpty()) {
            return List.of();
        }
        if (open(scene)) {
            return List.of(new FreshCard(
                    scene.boardId(),
                    ThingKind.BOARD,
                    scene.title(),
                    howFar(scene),
                    picture(scene, ideas.get(0)),
                    null));
        }
        EntryRow winner = winner(scene);
        boolean lately = settings.closedAt() == null
                ? !scene.today().isAfter(settings.closesOn().plusDays(14))
                : settings.closedAt().isAfter(scene.now().minus(Duration.ofDays(14)));
        if (winner == null || !lately || settings.tripFolderId() != null) {
            return List.of();
        }
        return List.of(new FreshCard(
                scene.boardId(),
                ThingKind.BOARD,
                scene.title(),
                winner.as(Idea.class).name() + " it is",
                picture(scene, winner),
                Words.count(votes(scene).get(winner.id()).size(), "vote")));
    }

    private static String picture(Scene scene, EntryRow idea) {
        BoardMedia photo = scene.media(idea.mediaId());
        return photo == null ? null : photo.url();
    }

    @Override
    public String guest(Scene scene) {
        return scene.entries(IDEA).stream()
                .map(idea -> idea.as(Idea.class).name())
                .collect(java.util.stream.Collectors.joining("\n"));
    }
}
