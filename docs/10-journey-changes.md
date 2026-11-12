# What Journey has to add

> **Status:** written with milestone 10. Nothing here has been done in Journey: every change needs your go-ahead, in Journey's own repo. · **Updated:** 12 Nov 2026
>
> **Checked on 12 Nov 2026 against Journey's code on this computer:** its API description (`apps/api/openapi.json`, 69 routes), the code behind the routes named below, and the screens named below. Nothing was checked against a running Journey: Homeport's half was built against a stand-in.

> **In one line:** most of the link already works with Journey as it is. Ten changes make the rest work, each small enough to do by itself, in this order.

## Where things stand

Homeport asks Journey for everything through one doorway, `JourneyPort` (`apps/api/.../journey/`). There are three things behind it:

| Setting `homeport.journey.mode` | What answers | When |
|---|---|---|
| `local` | A stand-in with sample journeys | Building and testing. It can do everything in this document already, so every screen can be tried. |
| `http` | Journey's real API (`HttpJourney`) | Once both APIs run on the same sign-in. Set `JOURNEY_API_URL`. |
| `off` | Nothing | Homeport without Journey. Every Journey part of the app is absent. |

Homeport always asks **as the signed-in person**, with that person's own token. It has no key of its own to Journey. So Journey's rules decide every answer, and nothing in this document asks Journey to trust Homeport's server.

### What works with Journey exactly as it is today

`HttpJourney` is written against these routes and tested against a small server that answers as Journey's description says (`HttpJourneyTest`).

| Homeport needs | Journey's routes it uses today |
|---|---|
| The switch: do you have a Journey profile, its name, picture and counts | `GET /v1/me`, `GET /v1/profiles/{username}` |
| Your journeys, to pick one to keep | `GET /v1/me/journeys` |
| One journey with its numbers | `GET /v1/journeys/{id}`, `GET /v1/journeys/{id}/recap` |
| A journey's whole story, to keep it | `GET /v1/journeys/{journeyId}/entries`, page after page (100 at a time) |
| The kind words | `GET /v1/entries/{entryId}/comments` |
| Photos, at Journey's largest size | The `url` of each photo in an entry |
| Who is away, for journeys you follow | `GET /v1/me/following`, `GET /v1/journeys/{journeyId}/summary` |
| A journey made from a draft | `POST /v1/journeys`, `POST /v1/media/uploads` and `…/complete`, `POST /v1/journeys/{journeyId}/entries` |
| A challenge's ticked days, for a goal | `GET /v1/journeys/{journeyId}/summary` (its `days`) |

### What does not work until Journey changes

Homeport says so on the screen instead of pretending. `GET /v1/journey/me` lists these under `notYet`, each with its sentence.

| What you would notice | Why | Fixed by |
|---|---|---|
| "Keep" brings every photo at Journey's size, never the original | Journey doesn't say when a photo was taken | Change 3 |
| Clips stay in Journey | Journey can play a clip but not hand it over | Change 4 |
| Someone away shows at home only if you follow their journey | Journey has no way to ask "which journeys of these people may I see" | Change 5 |
| A trip's journey starts with one author | A co-author is invited by username, and must follow you | Change 6 |

## The changes, in the order to do them

Each has: what it is, where it goes in Journey, what Homeport already expects from it, and how you would know it works.

### 1. A sheet on the You tab that opens Homeport

**In Journey's app only.** `src/features/navigation/TabBar.tsx` draws the five tabs; each is a `Pressable` with `onPress`. Add `onLongPress` on the You tab that opens a sheet, "Your apps", as drawn in Homeport's screen 10.1.

- The sheet's second row opens `homeport://` (Homeport's app scheme, in its `app.json`). When the app isn't installed the link does nothing: show the row as "Get Homeport" with the store link instead. Which is the case is asked with `Linking.canOpenURL`, which on iOS needs `homeport` listed under `LSApplicationQueriesSchemes` in Journey's `app.json`.
- Nothing is asked of either API for this sheet. Journey already knows who is signed in.
- **Homeport's side is built:** `GET /v1/journey/me` gives Homeport's own sheet what it shows of Journey.
- **Limit:** opening the other app needs both installed on a phone. It can't be tried in a browser.
- **Size:** small. **Test:** on a real phone with both apps.

### 2. "Keep in Homeport" on the recap

**In Journey's app only.** This is screen 10.2. The recap is `src/app/(app)/journey/[id]/recap.tsx`. It has two buttons at the bottom: "Share recap" (when the journey has a share link) and "Read all". Add a third, above them, for the journey's authors (`r.journey.viewer.isOwner || r.journey.viewer.isMember`):

- Label: "Keep in Homeport", with Homeport's mark. Words go in `src/words/en/journey.ts` under `recap`.
- It opens `homeport://keep?journey=<journey id>`. Homeport's app then shows "What to keep" (10.3) for that journey.
- Not installed: the same as in change 1.
- **Homeport's side is built:** `GET /v1/journey/journeys/{journeyId}/keep-options?circleId=…` and `POST /v1/journey/keeps`. The app must still be taught the `homeport://keep` link.
- **Size:** small. **Test:** Journey's walk-through opens a recap as its author and finds the button; as a follower it isn't there.

### 3. When each photo was taken, and its fingerprint

**This is the one that makes "the originals" work.** Journey deliberately keeps nothing that travelled inside a photo (`MediaSizes`), and its app makes a photo smaller before sending it (`src/features/media/compress.ts`). So today Journey can't say which of your photos an entry's photo is. Homeport then brings Journey's copy and says so.

**In Journey's app:** `src/features/media/exif.ts` already reads the day a photo was taken (`photoDay`). Read the whole moment the same way, and send it when the upload starts. Also send the fingerprint of the file as it is on the phone, before `compress.ts` touches it.

**In Journey's API:** two optional fields on `POST /v1/media/uploads` (`StartUploadRequest` in `media/MediaController.java`), two nullable columns on `media` (a new migration), and the same two fields on `MediaResponse`.

```
POST /v1/media/uploads
{ "kind": "photo", "contentType": "image/jpeg",
  "takenAt": "2026-04-01T10:15:00+00:00",
  "originalHash": "3b1f…64 hex characters" }
```

- `takenAt` is the clock time the file itself carries, with the offset of that clock. It must be worked out exactly as Homeport's app works out `takenAt` when it backs a photo up (`POST /v1/library`), because the two are compared. Share the helper.
- `originalHash` is the SHA-256 of the file, in hex. It is the same number Homeport's Library keeps as a photo's fingerprint.
- **Who is told:** only the people who write in the journey. For everyone else both fields are null. When a photo was taken is a fact about a person's day, and Journey has so far kept none of those.
- **Homeport already reads both** from each entry's `media` (`HttpJourney.entry`). The day Journey sends them, matching switches itself on. The rule is written out in `Originals.java`: the same fingerprint is the same file; failing that, taken within 2 seconds and the same shape; never a guess.
- **Size:** small in the API, small in the app. **Test:** in Journey, an entry's author gets the two fields and a follower gets nulls. In Homeport, `HttpJourneyTest.aWholeStoryIsReadPageAfterPageAndOnlyByItsAuthors` already holds the reading.

### 4. A clip as a file

A clip in Journey lives at the video service (Mux). `MediaResponse.playbackUrl` is a stream, which can be watched but not saved. Homeport needs an address it can fetch the clip from.

**In Journey's API:** one more nullable field on `MediaResponse`, for a ready clip, for the journey's authors only.

```
"downloadUrl": "https://…/clip.mp4"
```

- **Homeport already reads it** (`HttpJourney.entry`), and counts a clip without it as "left in Journey".
- **Not checked:** how Mux hands out a file today, and what it costs. I did not look that up. Check Mux's current page before building this.
- **Size:** small, plus whatever Mux needs. **Test:** an author gets an address that downloads; a follower gets null.

### 5. Which journeys of these people may I see?

For "Alex is on a journey" on Today. Homeport knows who is in a circle; only Journey knows which of their journeys you may see.

**In Journey's API:** one new route. It answers with the active journeys of the people asked about, as far as `Rules.visibleJourney` lets the asker see them and neither has blocked the other.

```
GET /v1/people/journeys?ids=<user id>,<user id>&status=active

{ "items": [ { "journey": { …JourneyResponse… },
               "newCount": 2,
               "latest": { …EntryResponse… } } ] }
```

- At most 20 ids, at most 20 items. The asker's own journeys are left out.
- The ids are the ones people sign in with. They are the same in both apps, so nothing has to be looked up.
- `newCount` and `latest` are what `GET /v1/journeys/{journeyId}/summary` gives today (`newCount`, `latest[0]`).
- **Homeport expects** exactly those three names per item (`JourneyPort.AwayJourney`). Until the route exists it asks `GET /v1/me/following` and looks into the active ones, so only journeys you follow show at home. When the route exists, `HttpJourney.away` becomes one call.
- **Size:** small. **Test:** in Journey's `RulesTest`: a private journey, a blocked person and a completed journey are not in the answer.

### 6. An author by their id

For "Tell it as a journey" nothing is needed: Homeport makes the journey with the routes that exist, as private unless you choose otherwise, and you carry on in Journey. For a trip (10.7) Homeport also wants the other adults of the circle as authors.

Today `POST /v1/journeys/{id}/members` takes a `username`, and `MemberService.invite` refuses anyone who doesn't follow the owner ("You can invite people who follow you").

**In Journey's API:** let `InviteRequest` carry `userId` instead of `username`. Everything else stays: the same invitation, which the person accepts or not, the same limit of four authors.

```
POST /v1/journeys/{id}/members
{ "userId": "…" }
```

- **A decision for you:** whether someone in your circle can be invited without following you. I would say yes, and have Homeport's app say "They're in your circle" on the invitation. That is a change to a Journey rule, so it is yours to make.
- **Homeport today** makes the journey and says "Journey can't add the other authors from here yet. Invite them in Journey." The call goes into `HttpJourney.post` when the route takes an id.
- **Size:** small. **Test:** in Journey, inviting by id behaves exactly as inviting by username.

### 7. Goodnight from far away

**In Journey's app only.** Journey's API is never told about a goodnight: the clip goes straight from the phone to Homeport, as the same person.

1. When someone has an active journey, Journey's app asks Homeport `GET /v1/journey/circles`. Each circle that has children comes with `goodnightAt` ("20:00") and, when the circle has said it, `timeZone` ("Europe/Ljubljana").
2. A while before that time on that clock, it offers: "Record a goodnight for The Linds?"
3. The clip is sent to Homeport like any upload: `POST /v1/media/uploads` with `"kind": "video"`, send the file, `…/complete`.
4. Then `POST /v1/goodnights` with `circleId`, `mediaId`, and what is known: `title`, `recordedAt` (with its offset), `place`, `dayLabel` ("Day 6"), `journeyId`.

- **Homeport's side is built:** the goodnight waits on Today from bedtime, can be loved and answered, and is shared like any other thing.
- **Journey's app needs** Homeport's API address as a build setting.
- **Limit:** a circle that hasn't said which clock it keeps has no `timeZone`. Then the offer can only go by the traveller's own clock.
- **Size:** small to medium. **Test:** on a phone. Recording needs a camera.

### 8. A circle as who can see a journey

"Only The Linds." This is the one change that touches Journey's privacy rule, so it comes late and needs the most care.

**In Journey's API:**

- A fourth `Visibility`, `circle`, and on `journeys` the circle's id and name.
- A table of who may see such a journey: `journey_circle_members (journey_id, user_id)`.
- `Rules.visibleJourney` gains one line: a `circle` journey is visible to its authors and to the people in that table.
- When the owner chooses the circle, and again whenever the owner opens the journey's settings, Journey's API asks Homeport **as the owner** for `GET /v1/journey/circles` and writes that circle's `people` into the table.

**What Homeport gives, and nothing more:** each circle's `id`, `name`, `kind`, and `people` as `{ userId, name }` for the people who sign in themselves, plus the two facts change 7 needs (`goodnightAt`, `timeZone`). No children, nothing a circle keeps, no counts. A test holds that (`JourneyAtHomeTest.journeyLearnsThatACircleExistsAndWhoIsInItAndNothingElse`).

- **A gap to decide on:** someone who leaves the circle keeps seeing the journey until its owner next opens it. Closing that gap needs Homeport to tell Journey when a circle changes, which needs the two servers to trust each other. See change 10.
- **Size:** medium. **Test:** every case in Journey's `RulesTest` again for the new visibility: a stranger, a follower, someone in the circle, someone who left, someone blocked.

### 9. A check-in tells home

Not needed. A goal that follows a challenge reads the ticked days from Journey whenever someone looks at the goal (`GET /v1/journeys/{journeyId}/summary`), as that person. Someone who may not see the challenge in Journey is shown the number that was put in by hand.

It would only matter for a push at home ("Day 12 done"). That needs server to server trust too. See change 10.

### 10. One Sunday summary, and anything else the two servers would say to each other

**Needs a decision before any work.** Both apps send their summary from a job that runs at night, with nobody signed in. Homeport's job cannot ask Journey as you, and Journey's cannot ask Homeport as you. That is on purpose: neither server has a back door into the other.

So today there are two summaries. Homeport's has a part "From Journey" made from what it already holds: the journeys you kept that week, the ones you told, the goodnights that arrived.

One message for both needs one of these, and each is a real choice:

| Way | What it costs |
|---|---|
| A key the two servers share, for a few narrow questions ("this person's week, in lines") | The first back door. Small, but it is one. |
| The phone puts the two halves together | No back door. Only works as a notification, not as an email. |
| Leave it as two | Nothing. |

The same choice decides changes 8 (a member leaves) and 9 (a push for a check-in).

## What Journey is never handed

These are held by tests in Homeport (`NeverSharedWithJourneyTest`, `LeavingHomeTest`), not by care.

| Rule | How it is held |
|---|---|
| Nothing private goes to Journey without "Before it leaves home" | One method in Homeport's API hands anything to Journey, and it only takes a draft that the check made. No other code can build one. |
| Journey never learns what is in a circle | The one answer about circles has six fields: its id, name and kind, who signs in, and when and on which clock a goodnight is welcome. A trip that becomes a journey sends its title, its first day and its authors. |
| The Vault is invisible to Journey | A draft can only hold photos and videos of the Library. Nothing else can be put in one, whatever is asked. |
| Blocking in Journey doesn't change a circle, and leaving a circle doesn't unfollow | Homeport writes nothing to Journey except a journey you tell. |

Two things to know about what does go:

- **A photo goes as Homeport's own copy**, made afresh, with nothing inside it about where it was taken. With "show the town, not the spot" on, a day carries the place's name and a point rounded to about a kilometre.
- **A video goes as it is.** Homeport can't take what travels inside a video file out of it. Journey's video service makes its own copy and Journey shows that one. Clips longer than 60 seconds stay home: that is Journey's limit.

## Settings both sides need

| Setting | Where | For |
|---|---|---|
| The same Supabase project | Both APIs | One sign-in. The id a person signs in with is the same in both, and everything above relies on that. |
| `HOMEPORT_JOURNEY_MODE=http`, `JOURNEY_API_URL` | Homeport's API | Asking Journey |
| `JOURNEY_OPEN` (starts as `journey://`) | Homeport's API | "Open in Journey" links: `journey://journey/<id>` and `journey://profile/<username>`. Journey's app has those two screens and the `journey` scheme (`app.json`); that the links open them was not tried on a phone. |
| Homeport's API address | Journey's app | Changes 7 and 8 |
| `homeport` under `LSApplicationQueriesSchemes` | Journey's `app.json` | Changes 1 and 2 |
