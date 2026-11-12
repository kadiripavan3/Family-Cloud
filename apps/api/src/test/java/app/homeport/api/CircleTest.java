package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** Circles and the people in them: starting one, adding people with and without a phone, joining, roles, leaving. */
class CircleTest extends ApiTest {

    @Test
    void startingACircleMakesYouItsOwnerAndSendingItTwiceMakesItOnce() throws Exception {
        String nora = person("Nora");
        String body = "{\"clientId\":\"%s\",\"kind\":\"family\",\"name\":\" The Linds \"}".formatted(id());

        String first = send(HttpMethod.POST, "/v1/circles", nora, body, 201);
        String second = send(HttpMethod.POST, "/v1/circles", nora, body, 201);

        assertThat(JsonPath.<String>read(second, "$.id")).isEqualTo(JsonPath.<String>read(first, "$.id"));
        assertThat(JsonPath.<String>read(first, "$.name")).isEqualTo("The Linds");
        assertThat(JsonPath.<String>read(first, "$.myRole")).isEqualTo("owner");
        assertThat(JsonPath.<String>read(first, "$.startsAs")).isEqualTo("me");
        assertThat(JsonPath.<Boolean>read(first, "$.hasRoles")).isTrue();
        assertThat(JsonPath.<List<String>>read(first, "$.members[*].name")).containsExactly("Nora");
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles", nora), "$.length()"))
                .isEqualTo(1);
    }

    @Test
    void eachKindOfCircleStartsThingsItsOwnWay() throws Exception {
        String nora = person("Nora");
        assertThat(JsonPath.<String>read(fetch("/v1/circles/" + circle(nora, "couple", "Us"), nora), "$.startsAs"))
                .isEqualTo("circle");
        assertThat(JsonPath.<String>read(fetch("/v1/circles/" + circle(nora, "flat", "Flat"), nora), "$.startsAs"))
                .isEqualTo("circle");
        assertThat(JsonPath.<String>read(fetch("/v1/circles/" + circle(nora, "crew", "Crew"), nora), "$.startsAs"))
                .isEqualTo("circle");
        assertThat(JsonPath.<String>read(fetch("/v1/circles/" + circle(nora, "solo", "Just me"), nora), "$.startsAs"))
                .isEqualTo("me");
        send(
                HttpMethod.POST,
                "/v1/circles",
                nora,
                "{\"clientId\":\"%s\",\"kind\":\"club\",\"name\":\"X\"}".formatted(id()),
                400);
    }

    @Test
    void aChildAndAPetAreInTheCircleWithoutAPhone() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");

        String mia = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/circles/" + circle + "/members",
                        nora,
                        "{\"clientId\":\"%s\",\"name\":\"Mia\",\"kind\":\"child\",\"birthday\":\"2016-12-04\"}"
                                .formatted(id()),
                        201),
                "$.id");
        addMember(nora, circle, "Biscuit", "pet");
        send(
                HttpMethod.PATCH,
                "/v1/members/" + mia,
                nora,
                "{\"facts\":[\"Shoes 33\",\" Class 4B \",\"\"],\"seesPlan\":false}",
                200);

        String people = fetch("/v1/circles/" + circle, nora);
        assertThat(JsonPath.<List<String>>read(people, "$.members[*].name")).containsExactly("Nora", "Mia", "Biscuit");
        assertThat(JsonPath.<List<String>>read(people, "$.members[*].status"))
                .containsExactly("joined", "no_phone", "no_phone");
        String page = fetch("/v1/members/" + mia, nora);
        assertThat(JsonPath.<List<String>>read(page, "$.member.facts")).containsExactly("Shoes 33", "Class 4B");
        assertThat(JsonPath.<String>read(page, "$.member.birthday")).isEqualTo("2016-12-04");
        assertThat(JsonPath.<Boolean>read(page, "$.member.seesPlan")).isFalse();
    }

    @Test
    void someoneInvitedByEmailTakesThePlaceKeptForThem() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String kept = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/circles/" + circle + "/members",
                        nora,
                        "{\"clientId\":\"%s\",\"name\":\"Alex Strand\",\"email\":\"Alex@Example.com\",\"role\":\"teen\"}"
                                .formatted(id()),
                        201),
                "$.id");
        assertThat(JsonPath.<String>read(fetch("/v1/members/" + kept, nora), "$.member.status"))
                .isEqualTo("invited");

        String alex = person("Alex");
        String mine = join(nora, circle, alex);

        assertThat(mine).isEqualTo(kept);
        String member = fetch("/v1/members/" + kept, alex);
        assertThat(JsonPath.<String>read(member, "$.member.status")).isEqualTo("joined");
        assertThat(JsonPath.<String>read(member, "$.member.role")).isEqualTo("teen");
        assertThat(JsonPath.<Boolean>read(member, "$.member.you")).isTrue();
        // Joining twice changes nothing.
        assertThat(join(nora, circle, alex)).isEqualTo(kept);
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle, nora), "$.members.length()"))
                .isEqualTo(2);
    }

    @Test
    void aNewJoinLinkStopsTheOldOne() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "crew", "Lisbon crew");
        String old = JsonPath.<String>read(fetch("/v1/circles/" + circle, nora), "$.joinUrl")
                .replaceFirst(".*/", "");
        assertThat(old).startsWith("lisbon-crew-");

        send(HttpMethod.PUT, "/v1/circles/" + circle + "/join-link", nora, null, 200);

        send(HttpMethod.GET, "/v1/join/" + old, alex, null, 404);
        send(HttpMethod.PUT, "/v1/join/" + old, alex, null, 404);
        join(nora, circle, alex);
        assertThat(JsonPath.<Boolean>read(
                        fetch(
                                "/v1/join/"
                                        + JsonPath.<String>read(fetch("/v1/circles/" + circle, nora), "$.joinUrl")
                                                .replaceFirst(".*/", ""),
                                alex),
                        "$.alreadyIn"))
                .isTrue();
    }

    @Test
    void inAFamilyOnlyTheAdultsRunThingsAndAmongEqualsEveryoneDoes() throws Exception {
        String nora = person("Nora");
        String mia = person("Mia");
        String family = circle(nora, "family", "The Linds");
        String miaId = join(nora, family, mia);
        send(HttpMethod.PATCH, "/v1/members/" + miaId, nora, "{\"role\":\"teen\"}", 200);

        assertThat(JsonPath.<Boolean>read(fetch("/v1/circles/" + family, mia), "$.iRunIt"))
                .isFalse();
        assertThat(JsonPath.<String>read(fetch("/v1/circles/" + family, mia), "$.joinUrl"))
                .isNull();
        send(HttpMethod.PATCH, "/v1/circles/" + family, mia, "{\"name\":\"Mia's house\"}", 403);
        send(
                HttpMethod.POST,
                "/v1/circles/" + family + "/members",
                mia,
                "{\"clientId\":\"%s\",\"name\":\"A friend\"}".formatted(id()),
                403);
        send(HttpMethod.PUT, "/v1/circles/" + family + "/join-link", mia, null, 403);

        String crew = circle(nora, "crew", "Lisbon crew");
        String miaInCrew = join(nora, crew, mia);
        send(HttpMethod.PATCH, "/v1/circles/" + crew, mia, "{\"name\":\"Lisbon and Porto\"}", 200);
        // No roles among equals: nobody is made a teen or a child there.
        send(HttpMethod.PATCH, "/v1/members/" + miaInCrew, nora, "{\"role\":\"teen\"}", 400);
    }

    @Test
    void theOwnerStaysUntilSomeoneElseIsAndTheLastOneOutTakesTheCircleAlong() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        String alexId = join(nora, circle, alex);

        send(HttpMethod.DELETE, "/v1/members/" + noraId, alex, null, 409);
        send(HttpMethod.PUT, "/v1/members/" + alexId + "/owner", alex, null, 403);

        send(HttpMethod.PUT, "/v1/members/" + alexId + "/owner", nora, null, 200);
        assertThat(JsonPath.<String>read(fetch("/v1/circles/" + circle, alex), "$.myRole"))
                .isEqualTo("owner");
        assertThat(JsonPath.<String>read(fetch("/v1/circles/" + circle, nora), "$.myRole"))
                .isEqualTo("adult");

        // Nora leaves; then Alex, the last one, leaves and the circle is gone.
        send(HttpMethod.DELETE, "/v1/members/" + noraId, nora, null, 204);
        assertThat(fetch("/v1/circles", nora)).isEqualTo("[]");
        send(HttpMethod.DELETE, "/v1/members/" + alexId, alex, null, 204);
        assertThat(jdbc.sql("select count(*) from circles").query(Integer.class).single())
                .isZero();
    }

    @Test
    void anOwnerWhoLeavesHandsTheCircleToWhoeverHasBeenThereLongest() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "crew", "Lisbon crew");
        String noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        join(nora, circle, alex);
        join(nora, circle, kai);

        send(HttpMethod.DELETE, "/v1/members/" + noraId, nora, null, 204);

        assertThat(JsonPath.<String>read(fetch("/v1/circles/" + circle, alex), "$.myRole"))
                .isEqualTo("owner");
        assertThat(JsonPath.<List<String>>read(fetch("/v1/circles/" + circle, kai), "$.members[*].name"))
                .containsExactly("Alex", "Kai");
    }

    @Test
    void aNameAndPictureFollowAPersonIntoTheirCircles() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String photo = uploadPhoto(nora);

        send(
                HttpMethod.PUT,
                "/v1/me/profile",
                nora,
                "{\"displayName\":\"Nora Lind\",\"avatarMediaId\":\"%s\"}".formatted(photo),
                200);

        String me = fetch("/v1/circles/" + circle, nora);
        assertThat(JsonPath.<String>read(me, "$.members[0].name")).isEqualTo("Nora Lind");
        assertThat(JsonPath.<String>read(me, "$.members[0].avatarUrl")).contains(".w320.jpg");
        // Her own name in a circle can't be changed there: it is her profile's.
        String noraId = JsonPath.read(me, "$.myMemberId");
        send(HttpMethod.PATCH, "/v1/members/" + noraId, nora, "{\"name\":\"Mum\"}", 200);
        assertThat(JsonPath.<String>read(fetch("/v1/circles/" + circle, nora), "$.members[0].name"))
                .isEqualTo("Nora Lind");
    }
}
