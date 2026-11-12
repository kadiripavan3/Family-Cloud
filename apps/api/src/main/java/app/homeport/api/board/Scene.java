package app.homeport.api.board;

import app.homeport.api.board.BoardStore.BoardRow;
import app.homeport.api.board.BoardStore.Tally;
import app.homeport.api.circle.CircleKind;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.circle.MemberStatus;
import app.homeport.api.circle.Role;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Names;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.media.MediaStore;
import app.homeport.api.media.MediaStore.MediaRow;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.node.ObjectNode;

/**
 * One board, for one viewer, on one day: everything a template's rules need to decide what that person sees
 * and to make a change. Made afresh for every request by {@link Boards}.
 *
 * <p>The viewer is the signed-in person's own member in the board's circle. On a guest's page and on a page
 * for someone outside the circle there is no viewer: {@link #me()} is null, and nothing is "mine".
 */
public final class Scene {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String LETTERS = "abcdefghjkmnpqrstuvwxyz23456789";

    private final ThingRow thing;
    private final BoardRow board;
    private final BoardRules rules;
    private final CircleKind circleKind;
    private final Map<UUID, Person> people;
    private final Person me;
    private final LocalDate today;
    private final Instant now = Instant.now();
    private final boolean isNew;
    private final BoardStore store;
    private final ThingStore things;
    private final MediaStore mediaStore;
    private final MediaService mediaService;

    private ObjectNode settings;
    private List<EntryRow> entries;
    private final Map<UUID, BoardMedia> media = new HashMap<>();

    Scene(
            ThingRow thing,
            BoardRow board,
            BoardRules rules,
            CircleKind circleKind,
            List<Person> people,
            UUID viewer,
            LocalDate today,
            boolean isNew,
            BoardStore store,
            ThingStore things,
            MediaStore mediaStore,
            MediaService mediaService) {
        this.thing = thing;
        this.board = board;
        this.rules = rules;
        this.circleKind = circleKind;
        this.people = new LinkedHashMap<>();
        people.forEach(p -> this.people.put(p.id(), p));
        this.me = viewer == null
                ? null
                : people.stream()
                        .filter(p -> viewer.equals(p.userId()) && p.status() == MemberStatus.JOINED)
                        .findFirst()
                        .orElse(null);
        this.today = today;
        this.isNew = isNew;
        this.store = store;
        this.things = things;
        this.mediaStore = mediaStore;
        this.mediaService = mediaService;
        this.settings = board.settings();
    }

    // ---------- the board ----------

    public UUID boardId() {
        return thing.id();
    }

    public UUID circleId() {
        return thing.circleId();
    }

    public CircleKind circleKind() {
        return circleKind;
    }

    public String title() {
        return thing.title();
    }

    public Template template() {
        return board.template();
    }

    public Instant createdAt() {
        return thing.createdAt();
    }

    /** Who the board is shared with, by the shared rule: only its owner, some people, or the whole circle. */
    public Audience audience() {
        return thing.audience();
    }

    /** The board's settings as the template's own record. */
    public <S> S settings(Class<S> type) {
        return Json.as(settings, type);
    }

    /** True for a board that is being made: nothing is stored for it yet. */
    public boolean isNew() {
        return isNew;
    }

    // ---------- when ----------

    /** The day to go by: the viewer's own day, as far as it can be true (see {@link Today}). */
    public LocalDate today() {
        return today;
    }

    /** This moment, by the API's clock. */
    public Instant now() {
        return now;
    }

    /**
     * A position for an entry that belongs to a day: entries are read in the order of their days, and on the
     * same day in the order they were written down.
     */
    public double positionOn(LocalDate day) {
        return day.toEpochDay() + (now.toEpochMilli() % 86_400_000L) / 86_400_000.0;
    }

    // ---------- who is looking ----------

    /** The viewer's own member in the board's circle, or null where there is no viewer. */
    public Person me() {
        return me;
    }

    public UUID myId() {
        return me == null ? null : me.id();
    }

    public boolean isMe(UUID memberId) {
        return me != null && me.id().equals(memberId);
    }

    /** True when the viewer may change the board, by the shared sharing rule. */
    public boolean canEdit() {
        return thing.canEdit();
    }

    /** True when the viewer made the board. */
    public boolean mine() {
        return thing.mine();
    }

    /** In a family the owner and the other adults run things; everywhere else everyone does, except a guest. */
    public boolean iRunTheCircle() {
        return me != null && me.role() != Role.GUEST && (!circleKind.hasRoles() || me.grownUp());
    }

    /**
     * True when the viewer may act for this member: it is them, or it is someone without a sign-in of their
     * own (a child, a pet) and the viewer is one of the people who look after them. What a child would do on
     * their own phone is done on a parent's.
     */
    public boolean iStandInFor(UUID memberId) {
        Person person = people.get(memberId);
        return person != null && (isMe(memberId) || (person.hasNoSignIn() && !person.left() && iRunTheCircle()));
    }

    public void requireEdit() {
        if (!thing.canEdit()) {
            throw new ApiProblem(HttpStatus.FORBIDDEN, "view_only", "You can look at this, but not change it.");
        }
    }

    // ---------- the people of the circle ----------

    /** Someone who is or was in the circle, or null. */
    public Person person(UUID memberId) {
        return memberId == null ? null : people.get(memberId);
    }

    /** Everyone who is or was in the circle, those who left included, in the circle's own order. */
    public List<Person> everyone() {
        return List.copyOf(people.values());
    }

    /** Everyone in the circle now: people, children and pets, in the circle's own order. */
    public List<Person> members() {
        return people.values().stream().filter(p -> !p.left()).toList();
    }

    /** The people of the circle, without its pets. */
    public List<Person> humans() {
        return members().stream().filter(p -> p.kind() != MemberKind.PET).toList();
    }

    /** A member the app named, checked to be in this circle now. Null stays null. */
    public UUID inCircle(UUID memberId) {
        if (memberId == null) {
            return null;
        }
        Person person = people.get(memberId);
        if (person == null || person.left()) {
            throw ApiProblem.badRequest("not_in_circle", "Choose someone from this circle.");
        }
        return memberId;
    }

    /** A name and a face for a row: first name, small picture. Null for nobody. */
    public PersonBrief brief(UUID memberId) {
        Person person = person(memberId);
        return person == null
                ? null
                : new PersonBrief(
                        person.id(),
                        Names.first(person.name()),
                        mediaService.urlFor(person.avatarKey(), MediaSize.SMALL));
    }

    /** The first name of a member, or "Someone" when they can't be named. */
    public String firstName(UUID memberId) {
        Person person = person(memberId);
        return person == null ? "Someone" : Names.first(person.name());
    }

    public String avatarUrl(UUID memberId) {
        Person person = person(memberId);
        return person == null ? null : mediaService.urlFor(person.avatarKey(), MediaSize.SMALL);
    }

    /** The pictures for a line on Today: the people it concerns, two at most. */
    public List<String> avatars(UUID... memberIds) {
        List<String> urls = new ArrayList<>();
        for (UUID id : memberIds) {
            String url = avatarUrl(id);
            if (url != null && urls.size() < 2) {
                urls.add(url);
            }
        }
        return urls;
    }

    // ---------- its entries ----------

    /** The board's entries, in their order (without the kinds the template only counts). */
    public List<EntryRow> entries() {
        if (entries == null) {
            entries = store.entries(thing.id(), rules.counted(), rules.ceiling());
        }
        return entries;
    }

    public List<EntryRow> entries(String kind) {
        return entries().stream().filter(e -> e.is(kind)).toList();
    }

    /** The entries that belong under another one, in their order. */
    public List<EntryRow> under(UUID parentId) {
        return entries().stream().filter(e -> parentId.equals(e.parentId())).toList();
    }

    /** An entry of this board by its id, or "not there" in the app's own words. */
    public EntryRow entry(UUID entryId) {
        return entryId == null
                ? null
                : store.entry(entryId)
                        .filter(e -> e.boardId().equals(thing.id()))
                        .orElseThrow(Scene::entryGone);
    }

    /** An entry the app named in a verb: it has to be sent, and to be on this board. */
    public EntryRow need(UUID entryId) {
        if (entryId == null) {
            throw entryGone();
        }
        return entry(entryId);
    }

    public static ApiProblem entryGone() {
        return new ApiProblem(HttpStatus.NOT_FOUND, "not_found", "That isn't there any more.");
    }

    /** Entries of one kind whose day lies between two days, both counted: for the kinds a template only counts. */
    public List<EntryRow> between(String kind, LocalDate from, LocalDate to) {
        return store.between(thing.id(), kind, from, to);
    }

    /** For each member a kind of entry is for: how many there are and what their numbers add up to. */
    public Map<UUID, Tally> tallies(String kind) {
        return store.tallies(thing.id(), kind);
    }

    // ---------- photos and recordings ----------

    /** The photo or recording behind an id, ready to show. Null when there is none, or it isn't ready. */
    public BoardMedia media(UUID mediaId) {
        if (mediaId == null) {
            return null;
        }
        if (!media.containsKey(mediaId)) {
            // One question for every file on the board, the first time one is asked for.
            List<UUID> wanted = new ArrayList<>();
            wanted.add(mediaId);
            if (entries != null) {
                entries.stream()
                        .map(EntryRow::mediaId)
                        .filter(Objects::nonNull)
                        .filter(id -> !media.containsKey(id))
                        .forEach(wanted::add);
            }
            wanted.forEach(id -> media.put(id, null));
            for (MediaRow row : mediaStore.findAll(wanted.stream().distinct().toList())) {
                if (row.ready()) {
                    boolean photo = row.kind() == MediaKind.PHOTO;
                    media.put(
                            row.id(),
                            new BoardMedia(
                                    row.id(),
                                    row.kind(),
                                    photo
                                            ? mediaService.urlFor(row.storageKey(), MediaSize.MEDIUM)
                                            : mediaService.urlFor(row.storageKey()),
                                    photo ? mediaService.urlFor(row.storageKey(), MediaSize.SMALL) : null,
                                    row.durationS()));
                }
            }
        }
        return media.get(mediaId);
    }

    /**
     * An upload the app wants to put on an entry: it has to be the viewer's own, finished, and of one of these
     * kinds. Null stays null.
     */
    public UUID upload(UUID mediaId, MediaKind... kinds) {
        if (mediaId == null) {
            return null;
        }
        if (me == null || me.userId() == null) {
            throw ApiProblem.badRequest("media_not_ready", "A file didn't finish uploading. Add it again.");
        }
        MediaRow row = mediaService.requireOwn(mediaId, me.userId(), null);
        if (!Set.of(kinds).contains(row.kind())) {
            throw ApiProblem.badRequest("wrong_file", "That kind of file doesn't go here.");
        }
        return mediaId;
    }

    // ---------- writing ----------

    /** Adds an entry and returns its id. Sending the same clientId again returns the entry added the first time. */
    public UUID add(EntryDraft draft, UUID clientId) {
        if (store.count(thing.id()) >= rules.ceiling()) {
            throw ApiProblem.conflict("board_full", "This is as full as it gets. Remove something, or start another.");
        }
        UUID id = store.add(thing.id(), draft, clientId);
        changed();
        return id;
    }

    public void save(EntryRow entry, EntryDraft draft) {
        store.save(entry.id(), draft);
        changed();
    }

    public void remove(UUID entryId) {
        store.delete(entryId);
        changed();
    }

    /** Stores the board's settings (the template's own record). */
    public void saveSettings(Object record) {
        settings = Json.tree(record);
        store.saveSettings(thing.id(), settings);
        things.touch(thing.id());
    }

    private void changed() {
        entries = null;
        things.touch(thing.id());
    }

    /**
     * An id made from another id and a word, the same every time: the clientId for something a template adds
     * by itself (a line on the shopping list for one ingredient), so doing it twice adds it once.
     */
    public static UUID derivedId(UUID from, String part) {
        return UUID.nameUUIDFromBytes((from + " " + part).getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    /** The unguessable end of a link for someone outside the circle. */
    public static String newToken() {
        StringBuilder token = new StringBuilder();
        for (int i = 0; i < 20; i++) {
            if (i > 0 && i % 5 == 0) {
                token.append('-');
            }
            token.append(LETTERS.charAt(RANDOM.nextInt(LETTERS.length())));
        }
        return token.toString();
    }
}
