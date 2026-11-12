package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Who sees what in Notes. A folder is a thing and follows the one rule; and a folder never changes who sees
 * what is filed in it: a page or a list is seen by exactly whoever its own audience says, through every
 * list Notes has.
 */
class NotesSharingTest extends NotesApiTest {

    /** True when this person can reach the folder by any of the ways there are. They must all agree. */
    private boolean seesFolder(String token, String circle, String folder, String title) throws Exception {
        boolean byId = status("/v1/folders/" + folder, token) == 200;
        boolean itsItems = status("/v1/folders/" + folder + "/items", token) == 200;
        boolean asThing = status("/v1/things/" + folder, token) == 200;
        boolean whereItIs = status("/v1/things/" + folder + "/folder", token) == 200;
        boolean audience = status("/v1/things/" + folder + "/audience", token) == 200;
        boolean atTheTop = JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/notes", token), "$.spaces[*].id")
                .contains(folder);
        boolean inSearch = fetch("/v1/circles/" + circle + "/search?q=" + title.split(" ")[0], token)
                .contains(folder);
        boolean inThePicker =
                fetch("/v1/circles/" + circle + "/linkable?kind=folder", token).contains(folder);
        List<Boolean> all = List.of(byId, itsItems, asThing, whereItIs, audience, atTheTop, inSearch, inThePicker);
        assertThat(all)
                .as("every way to reach the folder \"" + title + "\" gives the same answer")
                .containsOnly(byId);
        return byId;
    }

    /** True when this person finds the page or list through any list Notes has. They must all agree with reading it by id. */
    private boolean findsInNotes(String token, String circle, String thing, String kind) throws Exception {
        boolean byId = status("/v1/" + kind + "/" + thing, token) == 200;
        boolean whereItIs = status("/v1/things/" + thing + "/folder", token) == 200;
        String notes = fetch("/v1/circles/" + circle + "/notes", token);
        boolean lately = JsonPath.<List<String>>read(notes, "$.recent[*].id").contains(thing);
        boolean inThePicker =
                fetch("/v1/circles/" + circle + "/linkable", token).contains(thing);
        // In one folder or with what isn't filed: wherever it is, it is somewhere to be found, or nowhere.
        boolean somewhere =
                fetch("/v1/circles/" + circle + "/notes/unfiled", token).contains(thing);
        for (String space : JsonPath.<List<String>>read(notes, "$.spaces[*].id")) {
            somewhere |= inTree(space, token, thing);
        }
        boolean pinnable = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(
                                        "/v1/things/" + thing + "/pin")
                                .header("Authorization", token))
                        .andReturn()
                        .getResponse()
                        .getStatus()
                == 204;
        boolean amongPins = JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/notes", token), "$.pinned[*].id")
                .contains(thing);
        List<Boolean> all = List.of(byId, whereItIs, lately, inThePicker, somewhere, pinnable, amongPins);
        assertThat(all)
                .as("every way to it through Notes gives the same answer")
                .containsOnly(byId);
        return byId;
    }

    /** True when the thing is in this folder, or in a folder inside it, as far as this person is shown them. */
    private boolean inTree(String folder, String token, String thing) throws Exception {
        String items = fetch("/v1/folders/" + folder + "/items", token);
        if (JsonPath.<List<String>>read(items, "$.items[*].id").contains(thing)) {
            return true;
        }
        for (String inner : JsonPath.<List<String>>read(items, "$.items[?(@.kind == 'folder')].id")) {
            if (inTree(inner, token, thing)) {
                return true;
            }
        }
        return false;
    }

    @Test
    void aFolderIsSeenByWhoeverItIsSharedWithAndByNobodyElse() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String stranger = person("Stranger");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String kaiId = join(nora, circle, kai);

        // In a family a folder is yours alone until you share it, like everything else.
        String work = folder(nora, circle, null, "Workshop notes", null);
        assertThat(JsonPath.<String>read(fetch("/v1/folders/" + work, nora), "$.chip.audience"))
                .isEqualTo("me");
        assertThat(seesFolder(nora, circle, work, "Workshop notes")).isTrue();
        assertThat(seesFolder(alex, circle, work, "Workshop notes")).isFalse();

        // Someone outside the circle gets nothing from any of its ids.
        for (String path : List.of(
                "/v1/folders/" + work,
                "/v1/folders/" + work + "/items",
                "/v1/things/" + work + "/folder",
                "/v1/circles/" + circle + "/notes",
                "/v1/circles/" + circle + "/notes/unfiled",
                "/v1/circles/" + circle + "/linkable")) {
            assertThat(status(path, stranger)).as(path).isEqualTo(404);
        }
        send(HttpMethod.PUT, "/v1/things/" + work + "/pin", stranger, null, 404);
        send(HttpMethod.POST, "/v1/folders/" + work + "/share-inside", stranger, null, 404);
        send(HttpMethod.PUT, "/v1/things/" + work + "/folder", stranger, "{\"folderId\":null}", 404);
        send(
                HttpMethod.POST,
                "/v1/folders",
                stranger,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Mine\"}".formatted(id(), circle),
                404);

        // Shared to look at: Alex sees it and can't change it. Kai, who wasn't named, still sees nothing.
        shareWith(nora, work, alexId, "view");
        assertThat(seesFolder(alex, circle, work, "Workshop notes")).isTrue();
        assertThat(seesFolder(kai, circle, work, "Workshop notes")).isFalse();
        send(HttpMethod.PATCH, "/v1/folders/" + work, alex, "{\"title\":\"Ours\"}", 403);
        send(HttpMethod.PATCH, "/v1/folders/" + work, kai, "{\"title\":\"Ours\"}", 404);
        shareWith(nora, work, alexId, "edit");
        send(HttpMethod.PATCH, "/v1/folders/" + work, alex, "{\"title\":\"Workshop notes, tidied\"}", 200);

        // With everyone, hidden from one person: it isn't there for that one.
        audience(nora, work, "{\"audience\":\"circle\",\"hiddenFrom\":[{\"memberId\":\"%s\"}]}".formatted(kaiId));
        assertThat(seesFolder(alex, circle, work, "Workshop notes")).isTrue();
        assertThat(seesFolder(kai, circle, work, "Workshop notes")).isFalse();
        assertThat(titles(fetch("/v1/folders/" + work, alex), "$.chip.hiddenFrom"))
                .containsExactly("Kai");

        // Only its owner decides who sees it, and only its owner deletes it.
        send(HttpMethod.PUT, "/v1/things/" + work + "/audience", alex, "{\"audience\":\"me\"}", 403);
        send(HttpMethod.DELETE, "/v1/things/" + work, alex, null, 403);
        send(HttpMethod.DELETE, "/v1/things/" + work, nora, null, 204);
        assertThat(status("/v1/folders/" + work, nora)).isEqualTo(404);
    }

    @Test
    void aPageOrListIsSeenByExactlyWhoeverItsOwnAudienceSaysWhereverItIsFiled() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String house = folder(nora, circle, null, "House", "circle");
        String hers = folder(nora, circle, null, "Nora's work", "me");

        // A folder for everyone doesn't open what is filed in it.
        String gifts = pageIn(nora, circle, house, "Gift list", "me");
        String prep = list(nora, circle, house, "Party prep", "me", "Cake");
        String numbers = pageIn(nora, circle, house, "Emergency numbers", "circle");
        assertThat(findsInNotes(nora, circle, gifts, "pages")).isTrue();
        assertThat(findsInNotes(alex, circle, gifts, "pages")).isFalse();
        assertThat(findsInNotes(alex, circle, prep, "checklists")).isFalse();
        assertThat(findsInNotes(alex, circle, numbers, "pages")).isTrue();
        assertThat(inFolder(house, alex)).containsExactly("Emergency numbers");
        assertThat(inFolder(house, nora)).containsExactly("Gift list", "Party prep", "Emergency numbers");

        // The folder's counts count only what the person asking may see, wherever a count is shown.
        assertThat(JsonPath.<Integer>read(fetch("/v1/folders/" + house, alex), "$.pages"))
                .isEqualTo(1);
        assertThat(JsonPath.<Integer>read(fetch("/v1/folders/" + house, nora), "$.pages"))
                .isEqualTo(3);
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + house, alex), "$.glance"))
                .isEqualTo("1 page");
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + house, nora), "$.glance"))
                .isEqualTo("3 pages");
        assertThat(JsonPath.<List<Integer>>read(
                        fetch("/v1/circles/" + circle + "/notes", alex), "$.spaces[?(@.title == 'House')].pages"))
                .containsExactly(1);

        // And a folder that is only hers doesn't close what is filed in it and shared: Alex reads the page, finds
        // it with what isn't filed, and learns nothing of the folder, not even from the way to the page.
        String open = pageIn(nora, circle, hers, "Opening hours", "circle");
        assertThat(findsInNotes(alex, circle, open, "pages")).isTrue();
        String his = fetch("/v1/pages/" + open, alex);
        assertThat(titles(his, "$.breadcrumb[*].title")).isEmpty();
        assertThat(JsonPath.<Object>read(his, "$.folderId")).isNull();
        assertThat(his).doesNotContain("Nora's work").doesNotContain(hers);
        assertThat(titles(fetch("/v1/circles/" + circle + "/notes/unfiled", alex), "$.items[*].title"))
                .containsExactly("Opening hours");
        assertThat(titles(fetch("/v1/pages/" + open, nora), "$.breadcrumb[*].title"))
                .containsExactly("Nora's work");
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle + "/notes", nora), "$.unfiled"))
                .isZero();

        // A shared folder inside the private one hangs at the top for him, with the way to it cut short.
        String shelf = folder(nora, circle, hers, "Open shelf", "circle");
        String onIt = pageIn(nora, circle, shelf, "On the open shelf", "circle");
        String shelfForAlex = fetch("/v1/folders/" + shelf, alex);
        assertThat(JsonPath.<Boolean>read(shelfForAlex, "$.space")).isTrue();
        assertThat(JsonPath.<Object>read(shelfForAlex, "$.parentId")).isNull();
        assertThat(titles(shelfForAlex, "$.breadcrumb[*].title")).isEmpty();
        assertThat(titles(fetch("/v1/pages/" + onIt, alex), "$.breadcrumb[*].title"))
                .containsExactly("Open shelf");
        assertThat(titles(fetch("/v1/pages/" + onIt, nora), "$.breadcrumb[*].title"))
                .containsExactly("Nora's work", "Open shelf");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/folders/" + shelf, nora), "$.space"))
                .isFalse();
        assertThat(findsInNotes(alex, circle, onIt, "pages")).isTrue();

        // Shared to look at: he reads the list in its folder and can change neither it nor where it is.
        shareWith(nora, prep, alexId, "view");
        assertThat(findsInNotes(alex, circle, prep, "checklists")).isTrue();
        assertThat(inFolder(house, alex)).containsExactly("Party prep", "Emergency numbers");
        send(HttpMethod.PUT, "/v1/things/" + prep + "/folder", alex, "{\"folderId\":null}", 403);
        send(HttpMethod.PATCH, "/v1/checklists/" + prep, alex, "{\"title\":\"Mine\"}", 403);
        send(
                HttpMethod.POST,
                "/v1/checklists/" + prep + "/items",
                alex,
                "{\"clientId\":\"%s\",\"text\":\"Peek\"}".formatted(id()),
                403);
    }

    @Test
    void whatIsHiddenFromSomeoneIsNeitherListedNorCountedForThem() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String mia = person("Mia");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String miaId = join(nora, circle, mia);
        String kids = folder(nora, circle, null, "Children", "circle");
        String birthdays = folder(nora, circle, kids, "Birthdays", "circle");
        String plan = pageIn(nora, circle, birthdays, "Mia's 10th birthday", "circle");
        String prep = list(nora, circle, birthdays, "Party prep", "circle", "Cake", "Balloons");
        String hide = "{\"audience\":\"circle\",\"hiddenFrom\":[{\"memberId\":\"%s\",\"through\":\"%s\"}]}"
                .formatted(miaId, java.time.LocalDate.now().plusDays(3));
        audience(nora, plan, hide);
        audience(nora, prep, hide);

        assertThat(findsInNotes(alex, circle, plan, "pages")).isTrue();
        assertThat(findsInNotes(mia, circle, plan, "pages")).isFalse();
        assertThat(findsInNotes(mia, circle, prep, "checklists")).isFalse();
        // The folder is there for her, and empty: nothing in it is counted that she may not see.
        assertThat(inFolder(birthdays, mia)).isEmpty();
        assertThat(JsonPath.<Integer>read(fetch("/v1/folders/" + kids, mia), "$.pages"))
                .isZero();
        assertThat(JsonPath.<Integer>read(fetch("/v1/folders/" + kids, mia), "$.folders"))
                .isEqualTo(1);
        assertThat(JsonPath.<Integer>read(fetch("/v1/folders/" + kids, alex), "$.pages"))
                .isEqualTo(2);
        assertThat(JsonPath.<String>read(
                        fetch("/v1/folders/" + birthdays + "/items", alex), "$.items[0].chip.hiddenFrom[0]"))
                .isEqualTo("Mia");
        assertThat(fetch("/v1/circles/" + circle + "/notes", mia))
                .doesNotContain("Mia's 10th")
                .doesNotContain("Party prep");

        // The day after the last hidden day it is simply there, in its folder.
        jdbc.sql("update thing_hides set through = current_date - 1").update();
        assertThat(findsInNotes(mia, circle, plan, "pages")).isTrue();
        assertThat(inFolder(birthdays, mia)).containsExactly("Mia's 10th birthday", "Party prep");
        assertThat(JsonPath.<Integer>read(fetch("/v1/folders/" + kids, mia), "$.pages"))
                .isEqualTo(2);
    }
}
