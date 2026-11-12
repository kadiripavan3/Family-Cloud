package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** Spaces and folders: where things are filed, in what order, and what happens to them when a folder goes. */
class FoldersTest extends NotesApiTest {

    private void move(String token, String thing, String body, int expected) throws Exception {
        send(HttpMethod.PUT, "/v1/things/" + thing + "/folder", token, body, expected);
    }

    @Test
    void aCircleStartsWithTheSpacesItsKindNamesMadeOnceAndGoneForGoodWhenDeleted() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String family = circle(nora, "family", "The Linds");
        join(nora, family, alex);
        addMember(nora, family, "Mia", "child");

        // Alex opens Notes first. The spaces are there, and they are the owner's.
        String asAlex = fetch("/v1/circles/" + family + "/notes", alex);
        assertThat(titles(asAlex, "$.spaces[*].title")).containsExactly("Home", "Kids", "Trips");
        assertThat(titles(asAlex, "$.spaces[*].emoji")).containsExactly("🏠", "🧒", "✈️");
        assertThat(JsonPath.<List<Boolean>>read(asAlex, "$.spaces[*].mine")).containsOnly(false);
        assertThat(JsonPath.<List<Boolean>>read(asAlex, "$.spaces[*].space")).containsOnly(true);
        // Home and Trips are everyone's shelves; Kids is for the adults.
        assertThat(titles(asAlex, "$.spaces[*].chip.audience")).containsExactly("circle", "some", "circle");
        assertThat(titles(asAlex, "$.spaces[1].chip.people[*].name")).containsExactly("Alex");

        String asNora = fetch("/v1/circles/" + family + "/notes", nora);
        assertThat(titles(asNora, "$.spaces[*].title")).containsExactly("Home", "Kids", "Trips");
        assertThat(JsonPath.<List<Boolean>>read(asNora, "$.spaces[*].mine")).containsOnly(true);

        // Deleted is deleted: opening Notes again doesn't bring a starter space back.
        send(HttpMethod.DELETE, "/v1/things/" + JsonPath.<String>read(asNora, "$.spaces[2].id"), nora, null, 204);
        assertThat(titles(fetch("/v1/circles/" + family + "/notes", alex), "$.spaces[*].title"))
                .containsExactly("Home", "Kids");

        // Each kind of circle has its own, shared with everyone in it.
        String couple = fetch("/v1/circles/" + circle(nora, "couple", "Nora and Alex") + "/notes", nora);
        assertThat(titles(couple, "$.spaces[*].title")).containsExactly("Our place", "Money", "Trips", "Someday");
        assertThat(titles(couple, "$.spaces[*].chip.audience")).containsOnly("circle");
        assertThat(titles(
                        fetch("/v1/circles/" + circle(nora, "flat", "Trubarjeva 9") + "/notes", nora),
                        "$.spaces[*].title"))
                .containsExactly("The flat", "Bills", "Landlord");
        assertThat(titles(
                        fetch("/v1/circles/" + circle(nora, "crew", "Lisbon crew") + "/notes", nora),
                        "$.spaces[*].title"))
                .containsExactly("Trips", "Plans", "The dictionary");
        assertThat(titles(
                        fetch("/v1/circles/" + circle(nora, "solo", "Just me") + "/notes", nora), "$.spaces[*].title"))
                .isEmpty();
        // A family of one adult so far: Kids is hers alone until another adult is there to share it with.
        String alone = fetch("/v1/circles/" + circle(alex, "family", "Alex and the kids") + "/notes", alex);
        assertThat(titles(alone, "$.spaces[*].chip.audience")).containsExactly("circle", "me", "circle");
    }

    @Test
    void aFolderSentTwiceIsMadeOnce() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String body = "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"  Nora's work \",\"emoji\":\"💼\"}"
                .formatted(id(), circle);

        String first = send(HttpMethod.POST, "/v1/folders", nora, body, 201);
        String second = send(HttpMethod.POST, "/v1/folders", nora, body, 201);

        assertThat(JsonPath.<String>read(second, "$.id")).isEqualTo(JsonPath.<String>read(first, "$.id"));
        assertThat(JsonPath.<String>read(first, "$.title")).isEqualTo("Nora's work");
        assertThat(JsonPath.<String>read(first, "$.emoji")).isEqualTo("💼");
        assertThat(JsonPath.<String>read(first, "$.chip.audience")).isEqualTo("me");
        assertThat(titles(fetch("/v1/circles/" + circle + "/notes", nora), "$.spaces[*].title"))
                .containsExactly("Nora's work");
        send(
                HttpMethod.POST,
                "/v1/folders",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\"}".formatted(id(), circle),
                400);
    }

    @Test
    void foldersNestAndTheWayToAThingComesWithIt() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String home = folder(nora, circle, null, "Home", null);
        String manual = folder(nora, circle, home, "House manual", null);
        String appliances = folder(nora, circle, manual, "Appliances and manuals", null);
        String wifi = pageIn(nora, circle, manual, "Wi-Fi and smart home", null);
        String boiler = pageIn(nora, circle, appliances, "Boiler", null);
        String groceries = list(nora, circle, home, "Groceries", null, "Milk");

        String page = fetch("/v1/pages/" + wifi, nora);
        assertThat(titles(page, "$.breadcrumb[*].title")).containsExactly("Home", "House manual");
        assertThat(JsonPath.<String>read(page, "$.folderId")).isEqualTo(manual);
        assertThat(titles(fetch("/v1/pages/" + boiler, nora), "$.breadcrumb[*].title"))
                .containsExactly("Home", "House manual", "Appliances and manuals");
        assertThat(titles(fetch("/v1/checklists/" + groceries, nora), "$.breadcrumb[*].title"))
                .containsExactly("Home");
        assertThat(titles(fetch("/v1/things/" + boiler + "/folder", nora), "$.breadcrumb[*].title"))
                .containsExactly("Home", "House manual", "Appliances and manuals");

        // A folder counts what is inside it at any depth: folders, and everything else.
        String inner = fetch("/v1/folders/" + manual, nora);
        assertThat(JsonPath.<Boolean>read(inner, "$.space")).isFalse();
        assertThat(JsonPath.<String>read(inner, "$.parentId")).isEqualTo(home);
        assertThat(titles(inner, "$.breadcrumb[*].title")).containsExactly("Home");
        assertThat(JsonPath.<Integer>read(inner, "$.folders")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(inner, "$.pages")).isEqualTo(2);
        String top = fetch("/v1/circles/" + circle + "/notes", nora);
        assertThat(JsonPath.<Integer>read(top, "$.spaces[0].folders")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(top, "$.spaces[0].pages")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(top, "$.unfiled")).isZero();

        // What is in a space: its folders and lists side by side, each with what it has to say.
        String items = fetch("/v1/folders/" + home + "/items", nora);
        assertThat(titles(items, "$.items[*].title")).containsExactly("House manual", "Groceries");
        assertThat(titles(items, "$.items[*].kind")).containsExactly("folder", "checklist");
        assertThat(JsonPath.<Integer>read(items, "$.items[0].pages")).isEqualTo(2);
        assertThat(JsonPath.<String>read(items, "$.items[0].glance")).isEqualTo("1 folder · 2 pages");
        assertThat(JsonPath.<Integer>read(items, "$.items[1].left")).isEqualTo(1);
        assertThat(JsonPath.<String>read(items, "$.items[1].glance")).isEqualTo("0 of 1 done");
        assertThat(JsonPath.<String>read(items, "$.items[1].editedBy.name")).isEqualTo("Nora");
        assertThat(JsonPath.<String>read(
                        fetch("/v1/circles/" + circle + "/search?q=House manual", nora), "$.hits[0].thing.glance"))
                .isEqualTo("1 folder · 2 pages");
    }

    @Test
    void thingsStandInTheOrderPeopleGaveThemAndCanBeMovedAnywhere() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String home = folder(nora, circle, null, "Home", null);
        String trips = folder(nora, circle, null, "Trips", null);
        String a = pageIn(nora, circle, home, "A", null);
        String b = pageIn(nora, circle, home, "B", null);
        String c = pageIn(nora, circle, home, "C", null);
        assertThat(inFolder(home, nora)).containsExactly("A", "B", "C");

        move(nora, c, "{\"folderId\":\"%s\",\"atStart\":true}".formatted(home), 200);
        assertThat(inFolder(home, nora)).containsExactly("C", "A", "B");
        move(nora, c, "{\"folderId\":\"%s\",\"after\":\"%s\"}".formatted(home, a), 200);
        assertThat(inFolder(home, nora)).containsExactly("A", "C", "B");
        // Saying only where it already is changes nothing.
        move(nora, a, "{\"folderId\":\"%s\"}".formatted(home), 200);
        assertThat(inFolder(home, nora)).containsExactly("A", "C", "B");

        // Into another space, and out of every folder.
        file(nora, b, trips);
        assertThat(inFolder(home, nora)).containsExactly("A", "C");
        assertThat(inFolder(trips, nora)).containsExactly("B");
        assertThat(titles(fetch("/v1/pages/" + b, nora), "$.breadcrumb[*].title"))
                .containsExactly("Trips");
        file(nora, b, null);
        assertThat(inFolder(trips, nora)).isEmpty();
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle + "/notes", nora), "$.unfiled"))
                .isEqualTo(1);
        assertThat(titles(fetch("/v1/circles/" + circle + "/notes/unfiled", nora), "$.items[*].title"))
                .containsExactly("B");
        assertThat(titles(fetch("/v1/pages/" + b, nora), "$.breadcrumb[*].title"))
                .isEmpty();

        // "After" something that isn't there any more: it goes to the end rather than nowhere.
        move(nora, a, "{\"folderId\":\"%s\",\"after\":\"%s\"}".formatted(home, id()), 200);
        assertThat(inFolder(home, nora)).containsExactly("C", "A");

        // A long folder is read a page at a time, in the same order.
        String first = fetch("/v1/folders/" + home + "/items?limit=1", nora);
        assertThat(titles(first, "$.items[*].title")).containsExactly("C");
        String next = fetch(
                "/v1/folders/" + home + "/items?limit=1&cursor=" + JsonPath.<String>read(first, "$.nextCursor"), nora);
        assertThat(titles(next, "$.items[*].title")).containsExactly("A");
        assertThat(JsonPath.<Object>read(next, "$.nextCursor")).isNull();
        // The spaces themselves have an order too.
        move(nora, trips, "{\"folderId\":null,\"atStart\":true}", 200);
        assertThat(titles(fetch("/v1/circles/" + circle + "/notes", nora), "$.spaces[*].title"))
                .containsExactly("Trips", "Home");
    }

    @Test
    void aFolderCannotGoInsideItselfNorIntoAnotherCircle() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String other = circle(nora, "crew", "Lisbon crew");
        String a = folder(nora, circle, null, "A", null);
        String b = folder(nora, circle, a, "B", null);
        String c = folder(nora, circle, b, "C", null);
        String elsewhere = folder(nora, other, null, "Elsewhere", null);
        String page = pageIn(nora, circle, a, "A page", null);

        move(nora, a, "{\"folderId\":\"%s\"}".formatted(c), 400);
        move(nora, a, "{\"folderId\":\"%s\"}".formatted(a), 400);
        move(nora, a, "{\"folderId\":\"%s\"}".formatted(elsewhere), 400);
        move(nora, page, "{\"folderId\":\"%s\"}".formatted(elsewhere), 400);
        move(nora, page, "{\"folderId\":\"%s\"}".formatted(page), 404);
        send(
                HttpMethod.POST,
                "/v1/folders",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"parentId\":\"%s\",\"title\":\"Lost\"}"
                        .formatted(id(), circle, elsewhere),
                400);
        send(
                HttpMethod.POST,
                "/v1/pages",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"folderId\":\"%s\",\"title\":\"Lost\"}"
                        .formatted(id(), circle, elsewhere),
                400);
        // Nothing was made by the refused tries, and the tree is as it was.
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle + "/pages", nora), "$.items.length()"))
                .isEqualTo(1);
        assertThat(titles(fetch("/v1/pages/" + page, nora), "$.breadcrumb[*].title"))
                .containsExactly("A");

        // A folder taken out of its folder is a space; a space put into a folder is a folder.
        move(nora, c, "{\"folderId\":null}", 200);
        assertThat(JsonPath.<Boolean>read(fetch("/v1/folders/" + c, nora), "$.space"))
                .isTrue();
        move(nora, a, "{\"folderId\":\"%s\"}".formatted(c), 200);
        assertThat(titles(fetch("/v1/pages/" + page, nora), "$.breadcrumb[*].title"))
                .containsExactly("C", "A");
    }

    @Test
    void deletingAFolderMovesWhatIsInItUpOneLevelAndDeletesNothing() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String home = folder(nora, circle, null, "Home", null);
        String manual = folder(nora, circle, home, "House manual", null);
        String inner = folder(nora, circle, manual, "Appliances", null);
        String page = pageIn(nora, circle, manual, "Wi-Fi", null);
        String deep = pageIn(nora, circle, inner, "Boiler", null);

        send(HttpMethod.DELETE, "/v1/things/" + manual, nora, null, 204);

        assertThat(inFolder(home, nora)).containsExactlyInAnyOrder("Appliances", "Wi-Fi");
        assertThat(titles(fetch("/v1/pages/" + page, nora), "$.breadcrumb[*].title"))
                .containsExactly("Home");
        assertThat(titles(fetch("/v1/pages/" + deep, nora), "$.breadcrumb[*].title"))
                .containsExactly("Home", "Appliances");

        // From a space: its folders become spaces, and its pages wait under "not filed".
        send(HttpMethod.DELETE, "/v1/things/" + home, nora, null, 204);
        String notes = fetch("/v1/circles/" + circle + "/notes", nora);
        assertThat(titles(notes, "$.spaces[*].title")).containsExactly("Appliances");
        assertThat(JsonPath.<Integer>read(notes, "$.unfiled")).isEqualTo(1);
        assertThat(titles(fetch("/v1/circles/" + circle + "/notes/unfiled", nora), "$.items[*].title"))
                .containsExactly("Wi-Fi");
        assertThat(titles(fetch("/v1/pages/" + deep, nora), "$.breadcrumb[*].title"))
                .containsExactly("Appliances");
    }

    @Test
    void aPinIsOnePersonsOwn() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String page = page(nora, circle, "Wi-Fi", null);
        String groceries = list(nora, circle, null, "Groceries", null, "Milk", "Bread");

        send(HttpMethod.PUT, "/v1/things/" + groceries + "/pin", nora, null, 204);
        send(HttpMethod.PUT, "/v1/things/" + page + "/pin", nora, null, 204);
        send(HttpMethod.PUT, "/v1/things/" + page + "/pin", nora, null, 204);

        String hers = fetch("/v1/circles/" + circle + "/notes", nora);
        assertThat(titles(hers, "$.pinned[*].title")).containsExactly("Groceries", "Wi-Fi");
        assertThat(JsonPath.<Integer>read(hers, "$.pinned[0].left")).isEqualTo(2);
        assertThat(JsonPath.<List<Boolean>>read(hers, "$.pinned[*].pinned")).containsOnly(true);
        assertThat(titles(fetch("/v1/circles/" + circle + "/notes", alex), "$.pinned[*].title"))
                .isEmpty();
        assertThat(JsonPath.<Boolean>read(fetch("/v1/pages/" + page, nora), "$.pinned"))
                .isTrue();
        assertThat(JsonPath.<Boolean>read(fetch("/v1/pages/" + page, alex), "$.pinned"))
                .isFalse();
        assertThat(JsonPath.<Boolean>read(fetch("/v1/checklists/" + groceries, nora), "$.pinned"))
                .isTrue();

        send(HttpMethod.DELETE, "/v1/things/" + page + "/pin", nora, null, 204);
        send(HttpMethod.DELETE, "/v1/things/" + page + "/pin", nora, null, 204);
        assertThat(titles(fetch("/v1/circles/" + circle + "/notes", nora), "$.pinned[*].title"))
                .containsExactly("Groceries");

        // Twenty at most, and what its owner takes back is no longer among someone else's pins.
        send(HttpMethod.PUT, "/v1/things/" + page + "/pin", alex, null, 204);
        audience(nora, page, "{\"audience\":\"me\"}");
        assertThat(titles(fetch("/v1/circles/" + circle + "/notes", alex), "$.pinned[*].title"))
                .isEmpty();
        for (int i = 0; i < 19; i++) {
            send(HttpMethod.PUT, "/v1/things/" + page(nora, circle, "Page " + i, null) + "/pin", nora, null, 204);
        }
        send(HttpMethod.PUT, "/v1/things/" + page + "/pin", nora, null, 409);
    }

    @Test
    void sharingEverythingInAFolderCopiesItsAudienceOntoWhatIsYoursInside() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String kaiId = join(nora, circle, kai);
        String space = folder(nora, circle, null, "House", null);
        String page = pageIn(nora, circle, space, "Boiler", null);
        String inner = folder(nora, circle, space, "Garden", null);
        String list = list(nora, circle, inner, "Seeds", null, "Tomatoes");
        shareWith(nora, space, alexId, "edit", kaiId, "view");
        String his = pageIn(alex, circle, space, "Bins", null);

        // Sharing the folder shared the shelf, not what stands on it.
        assertThat(inFolder(space, alex)).containsExactly("Bins");
        assertThat(JsonPath.<Integer>read(fetch("/v1/folders/" + space, alex), "$.pages"))
                .isEqualTo(1);

        // "And everything in it": what is hers gets the folder's audience. Alex's own page isn't hers to share
        // (and, being only his so far, she doesn't even see it).
        String done = send(HttpMethod.POST, "/v1/folders/" + space + "/share-inside", nora, null, 200);
        assertThat(JsonPath.<Integer>read(done, "$.changed")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(done, "$.notYours")).isZero();
        assertThat(inFolder(space, alex)).containsExactly("Boiler", "Garden", "Bins");
        assertThat(inFolder(inner, kai)).containsExactly("Seeds");
        assertThat(titles(fetch("/v1/pages/" + page, alex), "$.chip.people[*].name"))
                .containsExactly("Alex", "Kai");
        send(HttpMethod.PATCH, "/v1/pages/" + page, alex, "{\"title\":\"Boiler and heating\"}", 200);
        send(HttpMethod.PATCH, "/v1/pages/" + page, kai, "{\"title\":\"Mine\"}", 403);

        // Alex does the same for what is his: his page now has the folder's people, its owner among them.
        String alexDid = send(HttpMethod.POST, "/v1/folders/" + space + "/share-inside", alex, null, 200);
        assertThat(JsonPath.<Integer>read(alexDid, "$.changed")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(alexDid, "$.notYours")).isEqualTo(3);
        send(HttpMethod.PATCH, "/v1/pages/" + his, nora, "{\"title\":\"Bins and recycling\"}", 200);
        send(HttpMethod.PATCH, "/v1/pages/" + his, kai, "{\"title\":\"Mine\"}", 403);
        assertThat(status("/v1/pages/" + his, kai)).isEqualTo(200);

        // It was a copy, made once. When the folder is taken back, each thing keeps the audience it was given,
        // and whoever can still read a page finds it with what isn't filed.
        audience(nora, space, "{\"audience\":\"me\"}");
        assertThat(status("/v1/folders/" + space, alex)).isEqualTo(404);
        assertThat(status("/v1/pages/" + page, alex)).isEqualTo(200);
        assertThat(titles(fetch("/v1/pages/" + page, alex), "$.breadcrumb[*].title"))
                .isEmpty();
        assertThat(titles(fetch("/v1/circles/" + circle + "/notes/unfiled", alex), "$.items[*].title"))
                .containsExactlyInAnyOrder("Boiler and heating", "Bins and recycling");
        // "Garden" still is shared with him, so for him it now hangs at the top.
        assertThat(titles(fetch("/v1/circles/" + circle + "/notes", alex), "$.spaces[*].title"))
                .contains("Garden")
                .doesNotContain("House");
    }

    @Test
    void onlyWhoMayChangeAFolderPutsThingsIntoItOrChangesItsOrder() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String space = folder(nora, circle, null, "House", "circle");
        String first = pageIn(nora, circle, space, "First", "circle");
        String second = pageIn(nora, circle, space, "Second", "circle");
        audience(nora, space, "{\"audience\":\"circle\",\"everyoneEdits\":false}");
        String his = page(alex, circle, "His", "circle");

        // He can look into the folder. He can't rename it, add to it or reorder it.
        assertThat(inFolder(space, alex)).containsExactly("First", "Second");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/folders/" + space, alex), "$.canEdit"))
                .isFalse();
        send(HttpMethod.PATCH, "/v1/folders/" + space, alex, "{\"title\":\"Ours\"}", 403);
        move(alex, his, "{\"folderId\":\"%s\"}".formatted(space), 403);
        move(alex, second, "{\"folderId\":\"%s\",\"atStart\":true}".formatted(space), 403);
        send(
                HttpMethod.POST,
                "/v1/pages",
                alex,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"folderId\":\"%s\",\"title\":\"Sneaked in\"}"
                        .formatted(id(), circle, space),
                403);
        send(
                HttpMethod.POST,
                "/v1/folders",
                alex,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"parentId\":\"%s\",\"title\":\"Sneaked in\"}"
                        .formatted(id(), circle, space),
                403);
        assertThat(fetch("/v1/circles/" + circle + "/pages", alex)).doesNotContain("Sneaked in");

        // Nora changes it: its name, its emoji, its order.
        String changed =
                send(HttpMethod.PATCH, "/v1/folders/" + space, nora, "{\"title\":\"Our house\",\"emoji\":\"🏡\"}", 200);
        assertThat(JsonPath.<String>read(changed, "$.title")).isEqualTo("Our house");
        assertThat(JsonPath.<String>read(changed, "$.emoji")).isEqualTo("🏡");
        move(nora, second, "{\"folderId\":\"%s\",\"atStart\":true}".formatted(space), 200);
        assertThat(inFolder(space, alex)).containsExactly("Second", "First");

        // Moving a thing takes the right to change the thing: a page he may only look at stays where it is.
        audience(nora, first, "{\"audience\":\"circle\",\"everyoneEdits\":false}");
        move(alex, first, "{\"folderId\":null}", 403);
        // And a folder that is only someone else's can't be filed into: to him it isn't there.
        String hers = folder(nora, circle, null, "Nora's work", "me");
        move(alex, his, "{\"folderId\":\"%s\"}".formatted(hers), 404);
    }

    @Test
    void theBlockPickerSearchesTheCirclesThingsByKindAndWords() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        page(nora, circle, "Boiler manual", "circle");
        list(nora, circle, null, "Party prep", "circle", "Cake", "Balloons");
        page(nora, circle, "Gift list", "me");

        assertThat(titles(fetch("/v1/circles/" + circle + "/linkable", alex), "$.items[*].title"))
                .containsExactlyInAnyOrder("Boiler manual", "Party prep");
        String lists = fetch("/v1/circles/" + circle + "/linkable?kind=checklist", alex);
        assertThat(titles(lists, "$.items[*].title")).containsExactly("Party prep");
        assertThat(JsonPath.<String>read(lists, "$.items[0].glance")).isEqualTo("0 of 2 done");
        assertThat(titles(fetch("/v1/circles/" + circle + "/linkable?q=boiler", alex), "$.items[*].title"))
                .containsExactly("Boiler manual");
        assertThat(titles(fetch("/v1/circles/" + circle + "/linkable?q=gift", alex), "$.items[*].title"))
                .isEmpty();
        String first = fetch("/v1/circles/" + circle + "/linkable?limit=1", nora);
        assertThat(JsonPath.<String>read(first, "$.nextCursor")).isNotNull();
        send(HttpMethod.GET, "/v1/circles/" + circle + "/linkable?kind=spaceship", alex, null, 400);
    }

    @Test
    void foldersGoFiftyDeepAndAWholeCircleGoesWithEverythingFiledInIt() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String top = folder(nora, circle, null, "Level 1", null);
        String deepest = top;
        for (int level = 2; level <= 50; level++) {
            deepest = folder(nora, circle, deepest, "Level " + level, null);
        }
        String page = pageIn(nora, circle, deepest, "At the bottom", null);
        block(nora, page, "\"kind\":\"photo\",\"mediaId\":\"%s\"".formatted(uploadPhoto(nora)));

        assertThat(JsonPath.<Integer>read(fetch("/v1/folders/" + top, nora), "$.folders"))
                .isEqualTo(49);
        assertThat(JsonPath.<Integer>read(fetch("/v1/folders/" + top, nora), "$.pages"))
                .isEqualTo(1);
        assertThat(titles(fetch("/v1/pages/" + page, nora), "$.breadcrumb[*].title"))
                .hasSize(50)
                .startsWith("Level 1", "Level 2")
                .endsWith("Level 50");
        // No deeper: neither a new folder, nor one moved there.
        send(
                HttpMethod.POST,
                "/v1/folders",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"parentId\":\"%s\",\"title\":\"Level 51\"}"
                        .formatted(id(), circle, deepest),
                409);
        move(nora, folder(nora, circle, null, "Another", null), "{\"folderId\":\"%s\"}".formatted(deepest), 409);

        // The last person leaves: the circle goes, with every folder, page, block and upload in it.
        String me = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        send(HttpMethod.DELETE, "/v1/members/" + me, nora, null, 204);
        for (String table : List.of("things", "folders", "filed", "pages", "page_blocks", "media")) {
            assertThat(jdbc.sql("select count(*) from " + table)
                            .query(Integer.class)
                            .single())
                    .as(table)
                    .isZero();
        }
    }
}
