package app.homeport.api.circle;

import app.homeport.api.auth.CurrentUser;
import app.homeport.api.auth.Me;
import app.homeport.api.circle.CircleService.CircleResponse;
import app.homeport.api.circle.CircleService.JoinPreview;
import app.homeport.api.circle.CircleService.MemberChange;
import app.homeport.api.circle.CircleService.MemberResponse;
import app.homeport.api.circle.CircleService.NewMember;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "circles", description = "Circles and the people in them")
class CircleController {

    private final CircleService circles;

    CircleController(CircleService circles) {
        this.circles = circles;
    }

    record NewCircleRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "Choose who you're sharing with.")
            CircleKind kind,

            @NotBlank(message = "Give the circle a name.") @Size(max = 40, message = "Use 40 characters or fewer.")
            String name) {}

    record CircleChangeRequest(
            @Size(min = 1, max = 40, message = "Use 1 to 40 characters.")
            String name,

            CircleKind kind,

            @Schema(description = "A photo uploaded through /v1/media/uploads")
            UUID coverMediaId,

            Boolean removeCover) {}

    record NewMemberRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotBlank(message = "Add a name.") @Size(max = 50, message = "Use 50 characters or fewer.")
            String name,

            @Schema(description = "A person, a child or a pet. A person when left out.")
            MemberKind kind,

            Role role,

            @Schema(
                    description =
                            "With an email address the person is invited; without one they are in the circle without a phone")
            @Size(max = 200)
            String email,

            LocalDate birthday,

            @Size(max = 60, message = "Use 60 characters or fewer.")
            String about,

            UUID avatarMediaId) {}

    record MemberChangeRequest(
            @Size(min = 1, max = 50, message = "Use 1 to 50 characters.")
            String name,

            Role role,
            LocalDate birthday,
            Boolean removeBirthday,

            @Size(max = 60, message = "Use 60 characters or fewer.")
            String about,

            @Size(max = 12, message = "Keep it to 12 facts.")
            List<@Size(max = 40) String> facts,

            UUID avatarMediaId,
            Boolean removeAvatar,
            Boolean seesLibrary,
            Boolean seesPlan,
            Boolean seesPages) {}

    @GetMapping("/circles")
    @Operation(operationId = "getCircles", summary = "The circles you are in, with their people. Twenty at most.")
    List<CircleResponse> mine(@Me UUID me) {
        return circles.mine(me);
    }

    @PostMapping("/circles")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createCircle", summary = "Start a circle. You become its owner.")
    CircleResponse create(@Me UUID me, @Valid @RequestBody NewCircleRequest request) {
        return circles.create(me, request.kind(), request.name(), request.clientId());
    }

    @GetMapping("/circles/{id}")
    @Operation(operationId = "getCircle", summary = "One circle and its people")
    CircleResponse get(@Me UUID me, @PathVariable UUID id) {
        return circles.get(id, me);
    }

    @PatchMapping("/circles/{id}")
    @Operation(operationId = "changeCircle", summary = "Rename a circle, change its kind or its picture")
    CircleResponse change(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody CircleChangeRequest request) {
        return circles.change(
                id,
                me,
                request.name(),
                request.kind(),
                request.coverMediaId(),
                Boolean.TRUE.equals(request.removeCover()));
    }

    @PutMapping("/circles/{id}/join-link")
    @Operation(operationId = "renewJoinLink", summary = "Make a new link for joining. The old one stops working.")
    CircleResponse newJoinLink(@Me UUID me, @PathVariable UUID id) {
        return circles.newJoinLink(id, me);
    }

    @PostMapping("/circles/{id}/members")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "addMember",
            summary = "Add someone: invite a person, or add a child or a pet without a phone")
    MemberResponse add(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody NewMemberRequest request) {
        return circles.add(
                id,
                me,
                new NewMember(
                        request.name(),
                        request.kind(),
                        request.role(),
                        request.email(),
                        request.birthday(),
                        request.about(),
                        request.avatarMediaId()),
                request.clientId());
    }

    @PatchMapping("/members/{id}")
    @Operation(operationId = "changeMember", summary = "Change what a circle keeps about one of its people")
    MemberResponse changeMember(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody MemberChangeRequest request) {
        return circles.change(
                id,
                me,
                new MemberChange(
                        request.name(),
                        request.role(),
                        request.birthday(),
                        request.removeBirthday(),
                        request.about(),
                        request.facts(),
                        request.avatarMediaId(),
                        request.removeAvatar(),
                        request.seesLibrary(),
                        request.seesPlan(),
                        request.seesPages()));
    }

    @DeleteMapping("/members/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "removeMember", summary = "Take someone out of a circle, or leave it yourself")
    void remove(@Me UUID me, @PathVariable UUID id) {
        circles.remove(id, me);
    }

    @GetMapping("/circles/{id}/leaving")
    @Operation(
            operationId = "getLeaving",
            summary = "What leaving a circle will do, in numbers, before you do it",
            description = "How many things only you can see will be deleted, how many shared things stay for the"
                    + " others, and how many passwords stop working for them. Leaving itself is DELETE"
                    + " /v1/members/{id} with your own member id.")
    CircleService.LeavingResponse leaving(@Me UUID me, @PathVariable UUID id) {
        return circles.leaving(id, me);
    }

    @PutMapping("/members/{id}/owner")
    @Operation(operationId = "handOverCircle", summary = "The owner hands the circle to another adult")
    CircleResponse handOver(@Me UUID me, @PathVariable UUID id) {
        return circles.handOver(id, me);
    }

    @GetMapping("/join/{code}")
    @Operation(operationId = "previewJoin", summary = "What a join link is for, before joining")
    JoinPreview preview(@Me UUID me, @PathVariable String code) {
        return circles.preview(code, me);
    }

    @PutMapping("/join/{code}")
    @Operation(operationId = "joinCircle", summary = "Join the circle a link is for. Joining twice is fine.")
    CircleResponse join(@Me CurrentUser user, @PathVariable String code) {
        return circles.join(code, user.id(), user.email());
    }
}
