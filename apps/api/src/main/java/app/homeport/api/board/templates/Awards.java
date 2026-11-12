package app.homeport.api.board.templates;

import app.homeport.api.board.BoardMedia;
import app.homeport.api.board.BoardRules;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.home.TodaySource.TodayCard;
import app.homeport.api.home.TodaySource.TodayItem;
import app.homeport.api.media.MediaKind;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The awards: at the end of each year the crew votes its own awards, in categories it invents. Every year
 * stays on the shelf.
 *
 * <p><b>Who sees what.</b> It is decided in {@link #decided}, and only there: the vote for an award is
 * private until it closes. While it is open, a person sees the nominees, their own vote, and how many people
 * have voted, never for whom. Once it is decided, everyone sees how many votes each nominee had and who won.
 * Who voted for whom is never shown, with one exception the crew enjoys: whether a winner's own vote was
 * among theirs.
 *
 * <p><b>Closing.</b> An award is decided the moment the last person of the crew has voted for it. Whatever is
 * still open is decided on New Year's Eve, with the votes there are; anyone who may change the board can
 * decide one earlier. The winner is whoever has the most votes; with the same number of votes there are
 * several winners.
 *
 * <p>An award belongs to the year it was added in. Earlier years are read with {@code show}.
 */
@Component
class Awards implements BoardRules {

    static final String AWARD = "award";
    static final String NOMINEE = "nominee";
    static final String VOTE = "vote";
    private static final int MOST_AWARDS_A_YEAR = 30;
    private static final int MOST_NOMINEES = 20;

    // ---------- what is stored ----------

    record AwardsSettings() {}

    /** The entry's number is the year it belongs to; its tick is the moment it was decided before New Year's Eve. */
    record Award(String name, String emoji) {}

    /** The entry is for the member nominated; {@code what} says what for. */
    record Nominee(String what) {}

    // ---------- who sees what ----------

    /** The day a year's awards open: New Year's Eve. */
    static LocalDate opens(int year) {
        return LocalDate.of(year, 12, 31);
    }

    private static int year(EntryRow award) {
        return (int) award.amountOr(0);
    }

    /** The one place that decides whether an award's votes may be shown. */
    private static boolean decided(Scene scene, EntryRow award) {
        return award.done() || !scene.today().isBefore(opens(year(award)));
    }

    // ---------- what a person sees ----------

    record AwardsViewResponse(
            @Schema(description = "The year shown") int year,

            @Schema(description = "The day whatever is still open is decided: 31 December")
            LocalDate opensOn,

            @Schema(description = "True from that day on") boolean open,

            long daysToGo,
            List<AwardsAwardResponse> awards,

            @Schema(description = "The other years that have awards, newest first")
            List<Integer> years) {}

    record AwardsAwardResponse(
            UUID id,
            String name,
            @Schema(nullable = true) String emoji,

            @Schema(description = "True once its vote is closed and the result is shown")
            boolean decided,

            @Schema(description = "How many people have voted for it")
            int voted,

            @Schema(description = "How many people are asked to")
            int asked,

            boolean youVoted,

            @Schema(nullable = true, description = "The nominee this person voted for")
            UUID yourNomineeId,

            @Schema(nullable = true, description = "All votes it had. Null until it is decided.")
            Integer totalVotes,

            @Schema(description = "The nominees: in the order they were named while it is open, the winner first after")
            List<AwardsNomineeResponse> nominees,

            boolean mine) {}

    record AwardsNomineeResponse(
            UUID id,
            @Schema(nullable = true) PersonBrief person,

            @Schema(nullable = true, description = "What for: the tiled bar in Alfama")
            String what,

            @Schema(nullable = true) BoardMedia photo,

            @Schema(nullable = true, description = "Who named them")
            PersonBrief namedBy,

            boolean mine,

            @Schema(nullable = true, description = "Their votes. Null until the award is decided.")
            Integer votes,

            @Schema(description = "True for a winner. False until the award is decided.")
            boolean winner,

            @Schema(
                    description =
                            "True for a winner whose own vote was among theirs. False until the award is decided.")
            boolean ownVoteIncluded) {}

    @Override
    public Template template() {
        return Template.AWARDS;
    }

    @Override
    public Class<?> settingsType() {
        return AwardsSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return AwardsViewResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: none",
                "entry award: name, emoji. A category for this year.",
                "entry nominee: awardId, memberId, what (what for), mediaId (a photo upload). While the award is open.",
                "verb vote: nomineeId (your one vote for that award; voting again moves it). The award is decided"
                        + " when everyone has voted.",
                "verb unvote: awardId",
                "verb decide: awardId (closes its vote early)",
                "show: a year, to see that year's awards. Left out: this year.");
    }

    @Override
    public boolean viewersMay(String verb) {
        return verb.equals(VOTE) || verb.equals("unvote");
    }

    @Override
    public Object settings(Scene scene, Fields sent) {
        return new AwardsSettings();
    }

    // ---------- reading ----------

    private static List<EntryRow> nominees(Scene scene, EntryRow award) {
        return scene.under(award.id()).stream().filter(e -> e.is(NOMINEE)).toList();
    }

    /** For each nominee of an award, who voted for them. Only ever shown as numbers, and only once it is decided. */
    private static Map<UUID, List<UUID>> votes(Scene scene, EntryRow award) {
        Map<UUID, List<UUID>> votes = new HashMap<>();
        for (EntryRow nominee : nominees(scene, award)) {
            votes.put(
                    nominee.id(),
                    scene.under(nominee.id()).stream()
                            .filter(e -> e.is(VOTE) && e.authorId() != null)
                            .map(EntryRow::authorId)
                            .toList());
        }
        return votes;
    }

    private static EntryRow myVote(Scene scene, EntryRow award) {
        for (EntryRow nominee : nominees(scene, award)) {
            for (EntryRow vote : scene.under(nominee.id())) {
                if (vote.is(VOTE) && scene.isMe(vote.authorId())) {
                    return vote;
                }
            }
        }
        return null;
    }

    private static int year(String show) {
        try {
            return Math.clamp(Integer.parseInt(show), 1900, 9999);
        } catch (NumberFormatException notAYear) {
            throw ApiProblem.badRequest("invalid_show", "Choose a year.");
        }
    }

    @Override
    public Object view(Scene scene, String show) {
        int year = show == null ? scene.today().getYear() : year(show);
        List<EntryRow> all = scene.entries(AWARD);
        return new AwardsViewResponse(
                year,
                opens(year),
                !scene.today().isBefore(opens(year)),
                Math.max(0, ChronoUnit.DAYS.between(scene.today(), opens(year))),
                all.stream()
                        .filter(a -> year(a) == year)
                        .map(a -> award(scene, a))
                        .sorted(Comparator.comparing((AwardsAwardResponse a) -> !a.decided()))
                        .toList(),
                all.stream()
                        .map(Awards::year)
                        .filter(other -> other != year)
                        .distinct()
                        .sorted(Comparator.reverseOrder())
                        .toList());
    }

    private static AwardsAwardResponse award(Scene scene, EntryRow row) {
        Award award = row.as(Award.class);
        boolean decided = decided(scene, row);
        Map<UUID, List<UUID>> votes = votes(scene, row);
        List<UUID> voters = votes.values().stream().flatMap(List::stream).toList();
        int most = votes.values().stream().mapToInt(List::size).max().orElse(0);
        List<UUID> asked = Say.voiceIds(scene);
        EntryRow mine = myVote(scene, row);
        List<AwardsNomineeResponse> nominees = new ArrayList<>();
        for (EntryRow nominee : nominees(scene, row)) {
            List<UUID> who = votes.getOrDefault(nominee.id(), List.of());
            boolean winner = decided && most > 0 && who.size() == most;
            nominees.add(new AwardsNomineeResponse(
                    nominee.id(),
                    scene.brief(nominee.forId()),
                    nominee.as(Nominee.class).what(),
                    scene.media(nominee.mediaId()),
                    scene.brief(nominee.authorId()),
                    scene.isMe(nominee.authorId()),
                    decided ? who.size() : null,
                    winner,
                    winner && nominee.forId() != null && who.contains(nominee.forId())));
        }
        if (decided) {
            nominees.sort(Comparator.comparing((AwardsNomineeResponse n) -> -n.votes()));
        }
        return new AwardsAwardResponse(
                row.id(),
                award.name(),
                award.emoji(),
                decided,
                (int) asked.stream().filter(voters::contains).count(),
                asked.size(),
                mine != null,
                mine == null ? null : mine.parentId(),
                decided ? voters.size() : null,
                nominees,
                scene.isMe(row.authorId()));
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        return switch (entry.kind()) {
            case AWARD -> entry.as(Award.class).name();
            case NOMINEE -> entry.as(Nominee.class).what();
            default -> null;
        };
    }

    // ---------- changing it ----------

    private static ApiProblem decidedAlready() {
        return ApiProblem.conflict("decided", "This award is decided. It stays as it is.");
    }

    private static EntryRow openAward(Scene scene, UUID awardId) {
        EntryRow award = scene.need(awardId);
        if (!award.is(AWARD)) {
            throw Scene.entryGone();
        }
        if (decided(scene, award)) {
            throw decidedAlready();
        }
        return award;
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        switch (kind) {
            case AWARD -> {
                int year = scene.today().getYear();
                if (scene.entries(AWARD).stream().filter(a -> year(a) == year).count() >= MOST_AWARDS_A_YEAR) {
                    throw ApiProblem.conflict("too_many", "Thirty awards a year is as many as the shelf takes.");
                }
                return scene.add(
                        EntryDraft.of(AWARD)
                                .by(scene.myId())
                                .amount((long) year)
                                .doc(new Award(
                                        sent.need("name", 80, "Give the award a name."), sent.text("emoji", 16))),
                        clientId);
            }
            case NOMINEE -> {
                EntryRow award = openAward(scene, sent.id("awardId"));
                UUID member = scene.inCircle(sent.id("memberId"));
                if (member == null) {
                    throw ApiProblem.badRequest("nobody", "Choose who to nominate.");
                }
                if (nominees(scene, award).size() >= MOST_NOMINEES) {
                    throw ApiProblem.conflict("too_many", "Twenty nominees is as many as one award takes.");
                }
                return scene.add(
                        EntryDraft.of(NOMINEE)
                                .under(award.id())
                                .by(scene.myId())
                                .forMember(member)
                                .media(scene.upload(sent.id("mediaId"), MediaKind.PHOTO))
                                .doc(new Nominee(sent.text("what", 120))),
                        clientId);
            }
            default -> throw BoardRules.unknownKind();
        }
    }

    /** An award and a nomination are changed by whoever made them, while the award is open. */
    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        EntryRow award = awardOf(scene, entry);
        if (decided(scene, award)) {
            throw decidedAlready();
        }
        if (!scene.isMe(entry.authorId())) {
            throw BoardRules.notYours();
        }
        if (entry.is(AWARD)) {
            Award now = entry.as(Award.class);
            String name = sent.text("name", 80, now.name());
            if (name == null) {
                throw ApiProblem.badRequest("missing_name", "Give the award a name.");
            }
            scene.save(entry, EntryDraft.from(entry).doc(new Award(name, sent.text("emoji", 16, now.emoji()))));
        } else {
            EntryDraft draft = EntryDraft.from(entry)
                    .doc(new Nominee(
                            sent.text("what", 120, entry.as(Nominee.class).what())));
            if (sent.has("mediaId")) {
                draft.media(scene.upload(sent.id("mediaId"), MediaKind.PHOTO));
            }
            scene.save(entry, draft);
        }
    }

    @Override
    public void remove(Scene scene, EntryRow entry) {
        EntryRow award = awardOf(scene, entry);
        if (decided(scene, award)) {
            throw decidedAlready();
        }
        if (!scene.isMe(entry.authorId())) {
            throw BoardRules.notYours();
        }
        scene.remove(entry.id());
    }

    /** The award an entry is or belongs to. A vote isn't there for anyone to reach by its id. */
    private static EntryRow awardOf(Scene scene, EntryRow entry) {
        if (entry.is(AWARD)) {
            return entry;
        }
        if (entry.is(NOMINEE) && entry.parentId() != null) {
            return scene.need(entry.parentId());
        }
        throw Scene.entryGone();
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        switch (verb) {
            case VOTE -> {
                EntryRow nominee = scene.need(sent.id("nomineeId"));
                if (!nominee.is(NOMINEE)) {
                    throw Scene.entryGone();
                }
                EntryRow award = openAward(scene, nominee.parentId());
                if (scene.myId() == null || !Say.voiceIds(scene).contains(scene.myId())) {
                    throw BoardRules.notYours();
                }
                EntryRow mine = myVote(scene, award);
                if (mine == null) {
                    scene.add(
                            EntryDraft.of(VOTE).under(nominee.id()).by(scene.myId()),
                            Scene.derivedId(award.id(), "vote of " + scene.myId()));
                } else if (!nominee.id().equals(mine.parentId())) {
                    scene.save(mine, EntryDraft.from(mine).under(nominee.id()));
                }
                // The last vote decides it.
                List<UUID> voters = votes(scene, award).values().stream()
                        .flatMap(List::stream)
                        .toList();
                if (voters.containsAll(Say.voiceIds(scene))) {
                    scene.save(award, EntryDraft.from(award).done(scene.now(), scene.myId()));
                }
            }
            case "unvote" -> {
                EntryRow mine = myVote(scene, openAward(scene, sent.id("awardId")));
                if (mine != null) {
                    scene.remove(mine.id());
                }
            }
            case "decide" -> {
                EntryRow award = scene.need(sent.id("awardId"));
                if (!award.is(AWARD)) {
                    throw Scene.entryGone();
                }
                if (!decided(scene, award)) {
                    if (votes(scene, award).values().stream().allMatch(List::isEmpty)) {
                        throw ApiProblem.conflict("no_votes", "Nobody has voted yet. There is nothing to decide.");
                    }
                    scene.save(award, EntryDraft.from(award).done(scene.now(), scene.myId()));
                }
            }
            default -> throw BoardRules.unknownVerb();
        }
    }

    // ---------- what it brings to the rest ----------

    private static List<EntryRow> thisYears(Scene scene) {
        return scene.entries(AWARD).stream()
                .filter(a -> year(a) == scene.today().getYear())
                .toList();
    }

    @Override
    public String glance(Scene scene) {
        List<EntryRow> awards = thisYears(scene);
        long decided = awards.stream().filter(a -> decided(scene, a)).count();
        if (awards.isEmpty()) {
            return "No awards yet this year";
        }
        return decided == awards.size()
                ? decided + " decided"
                : decided + " decided · " + (awards.size() - decided) + " voting";
    }

    /** In the last week of the year, for someone whose vote is missing somewhere. */
    @Override
    public List<TodayCard> cards(Scene scene) {
        LocalDate opens = opens(scene.today().getYear());
        if (scene.me() == null
                || scene.today().isBefore(opens.minusDays(7))
                || !Say.voiceIds(scene).contains(scene.myId())) {
            return List.of();
        }
        long missing = thisYears(scene).stream()
                .filter(a -> !decided(scene, a) && !nominees(scene, a).isEmpty() && myVote(scene, a) == null)
                .count();
        if (missing == 0) {
            return List.of();
        }
        return List.of(new TodayCard(
                scene.boardId(),
                ThingKind.BOARD,
                template().code(),
                template().emoji(),
                scene.title(),
                missing + (missing == 1 ? " award still needs" : " awards still need")
                        + " your vote · decided on New Year's Eve",
                null,
                null,
                "Vote",
                35));
    }

    @Override
    public List<TodayItem> today(Scene scene) {
        if (!scene.today().equals(opens(scene.today().getYear()))
                || thisYears(scene).isEmpty()) {
            return List.of();
        }
        return List.of(new TodayItem(
                scene.boardId(),
                ThingKind.BOARD,
                scene.title(),
                "The awards are decided today",
                null,
                null,
                1440,
                List.of()));
    }

    @Override
    public String guest(Scene scene) {
        return thisYears(scene).stream()
                .map(a -> a.as(Award.class).name())
                .filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.joining("\n"));
    }
}
