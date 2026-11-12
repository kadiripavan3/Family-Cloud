# Homeport app

The iOS and Android app: Expo (React Native, TypeScript) with Expo Router. It is the sister app of Journey and is built the same way: the same design system, the same folders, the same rules in the linter.

```sh
npm install
npx expo start        # the API has to run too: ../api, with the `local` profile
npm run check         # types, lint and tests
npm run theme         # after design/tokens.json changes
npm run icons         # after a 3D icon is added to design/hub/icons3d
npm run api:generate  # after ../api/openapi.json changes
```

- **Screens** live in `src/app` (one file per screen). The designs they follow are in `design/hub/src/screens`.
- **Look:** every colour, size and radius comes from `src/theme/tokens.ts`, generated from `design/tokens.json`, and so do the app's name, its web address and the icon of its mark (`brand`). The design system is in `src/ui` (it knows nothing about circles, people or the API); components that do are in `src/features`. The linter keeps sizes, corners, colours and emoji coming from the tokens.
- **Words:** every sentence a person reads or hears is in `src/words/en`, one file per area, and screens read them from `words` (`@/words`). The linter refuses a sentence written in a screen. `src/words/index.ts` says how another language is added.
- **API:** `src/api/generated` is generated from the API's description. Don't edit it by hand.
- **Adding a library:** use `npx expo install <name>` so the version matches the Expo SDK.

The standards are Journey's, written out in "App structure and standards" of Journey's `CLAUDE.md`.

## How the app is put together

The spine: the pieces every place builds on. Their names and signatures are fixed; add to them, don't rename them.

- **The current circle** (`src/features/circles/current.ts`). A person is in up to twenty circles and looks at one at a time. `useCircle()` gives the current `CircleResponse` (its kind, its people, `myRole`, `iRunIt`, `startsAs`); `useCircles()` gives all of them; `const switchTo = useSwitchCircle(); switchTo(id)` changes it for every screen at once. The choice is remembered on the phone for each account and is the first circle until one is picked. Everything under `src/app/(app)` can call `useCircle()`: someone with a profile and no circle is sent to `/setup` by `app/(app)/_layout.tsx` before any of it is drawn. (`useCircleIfAny()` is for the few screens outside it.) Small helpers on a circle are in `features/circles/members.ts`: `membersOf`, `headcount`, `circleLine` ("Family · 4 people and Biscuit"), `isYoung`.
- **Words that depend on the kind of circle** come from `words.kinds[circle.kind]` (`src/words/en/kinds.ts`) and never from a ternary in a screen: `emoji` (👪 ❤️ 🏠 🤝, and 🔒 for a circle of one), `name` ("Housemates"), `short` ("Flat"), `called` ("the flat"), `calledFirst`, `everyone(circle.name)` ("Everyone in The Linds", "The two of you"), `chip(circle.name)`, `startsAs`. A sentence of your own that differs by kind is keyed by kind in your own catalog file, the same way.
- **Home's shell** (`src/app/(app)/(tabs)/index.tsx`) draws the search pill with the round circle button and the row of six places, and under them the chosen place. The place is part of the address: `/?place=money`; `placeHref('money')` (`features/home/places.ts`) is the link to it from anywhere. Each place is one component with no props in its own folder, and its builder replaces that one file: `features/today/TodayHome.tsx`, `features/plan/PlanHome.tsx`, `features/notes/NotesHome.tsx`, `features/library/LibraryHome.tsx`, `features/money/MoneyHome.tsx`, `features/vault/VaultHome.tsx`. The pill and the row stay put; the place gets the rest of the screen (`flex: 1`), reads `useCircle()`, scrolls by itself (a `ScrollView`, or a `List` for something long) and leaves `TAB_BAR_ROOM` under its last row. It is drawn afresh when the circle changes. The pill opens `/search?place=<place>`. For a teen or a child the shell draws Money and the Vault as shut (`isShut`), so those two never have to check.
- **Opening a thing of any kind** (`src/features/things/open.ts`): `const open = useOpenThing(); open(thing)`, or `thingHref(thing)` for a link. The address is the kind with dashes and the id, by convention and with no table to add to: a `page` is at `/page/<id>`, a `vault_item` at `/vault-item/<id>`. Build the screen at `src/app/(app)/<kind>/[id].tsx` and every list of mixed things (search, Today, a person's page, links, a guest pass) opens it. Until then the address lands on `src/app/(app)/[kind]/[id].tsx`, which shows the thing's title and chip and says it arrives with its place.
- **A thing as a row** (`src/features/things/ThingRow.tsx`): `<ThingRow thing={brief} />` draws a `ThingBrief` with an icon by its kind, its title, its `glance` line and its audience chip, and opens it when pressed. `line` replaces the second line (what a search found), `look="grouped"` is the row inside a `RowGroup` card (an arrow at the end, `first` for the top one), `trailing` and `onPress` replace the end and the press. The icon of a kind is one line in `features/things/kinds.ts` and its word one line in `words.things` (`src/words/en/things.ts`); a kind that is in neither gets a plain file icon and is called "a thing".
- **Who can see a thing** (`src/features/sharing`): `<AudienceChip thing={thing} />` on any answer that has `id`, `circleId`, `mine` and `chip` (a page, a list, a `ThingBrief`). It draws the lock and "Only you", the pictures and "Alex and you", the circle's emoji and name, or the crossed eye and "Not Mia", and pressing it opens the one `AudienceSheet` for that thing (the three choices, what each person may do, hiding it from someone until a day; read-only for someone who isn't its owner). After saving, the sheet calls `cache.audienceChanged(...)`, which writes the new chip onto every loaded copy of the thing and asks its lists again; a place does nothing. Pass `quiet` for a chip inside a row that is pressed itself.
- **After a change** call the function of `useCache()` that names what happened. For a thing of any kind there are four: `cache.thingMade(circleId)`, `cache.thingChanged({ id, circleId })`, `cache.thingDeleted({ id, circleId })` and `cache.audienceChanged(audience)`; they see to Today, search, people's pages and links, which no place knows about. A place's own changes are functions in its own file `src/api/cache/<place>.ts` (`plan`, `jot`, `notes`, `templates`, `library`, `money`, `vault`, `keepsakes`, `perks`, `couple`, `flat`, `crew`, `together`, `activity`): each exports `(tools) => ({ eventSaved: (event) => …, … })`, and everything it returns is part of what `useCache()` gives every screen. `tools` (`src/api/cache/tools.ts`) are what the functions are made of: `stale`, `staleOnly`, `staleAbout`, `put`, `patch`, `drop`, and `thingMade` / `thingChanged` / `thingGone` to end with. Two places can't use the same name (a test says so), so name a function for your own thing: `billPaid`, not `saved`.
- **The + sheet** opens ten routes, one file each under `src/app/(app)/new/`: `note`, `checklist`, `photos`, `scan`, `event`, `reminder`, `bill`, `sheet`, `password`, `goal`. Each makes its thing in the current circle. When the person changed who it starts as seen by, the sheet hands that over as `?audience=me` or `?audience=circle`: send it as the request's `audience`; without it, leave `audience` out and the circle's kind decides.
- **Words** go in your own file under `src/words/en/`, all of them registered already: `today`, `circles`, `people`, `sharing`, `things`, `search`, `setup`, `you`, `states` (the spine's), and `plan`, `jot`, `notes`, `templates`, `library`, `money`, `vault`, `keepsakes`, `perks`, `couple`, `flat`, `crew`, `together`, `activity`.
- **Made-up answers for tests** go in your own file `src/test/samples/<place>.ts`. What every test shares is in `@/test/samples`: Nora, the three sample circles and their people (`linds`, `coupleCircle`, `crewCircle`, `soloCircle`, `alex`, `mia`, …), `thing()`, `page()`, `checklist()`, `audience()`, the chips (`onlyMe`, `everyone`, `withAlex`, `notMia`), and `loaded()` / `pending()` / `failed()` for a mocked query. `inApp(<Screen />)` (`@/test/phone`) is a screen on a phone with the data layer around it.
- **The walk-through** has one file per part in `scripts/e2e/steps/` (`02-library.js` … `10-journey.js`), run in order after `01-spine.js`. Every file starts signed out on the welcome screen and ends there: `await ctx.signIn('nora@example.com')` first, `await ctx.signOut()` last. `const alex = await ctx.second('Alex Demo')` is a second, new person signed in on a second phone (`alex.page`, `alex.T`, `alex.R`, `alex.L`, `alex.shot`, `alex.token`, `alex.close()`), for the steps where what one person shares another must or must not find.
- **Options for a screen in the stack** (a sheet on an iPhone, no swipe to close) are set by the screen itself with `<Stack.Screen options={…} />` from `expo-router`, not in `app/(app)/_layout.tsx`.
- **A form that makes a thing** (`/new/...`) reads who it starts as seen by with `const [audience, setAudience] = useStartsAs(circle)` (`src/features/sharing/useStartsAs.ts`: what the + sheet handed over, else what the circle's kind says), shows it with `<StartsAsPill circle={circle} value={audience} onChange={setAudience} />`, and sends `audience` with its request. `/new/note` and `/new/checklist` are the two examples. `newThingHref('event')` (`src/features/today/newThings.ts`) is the link to one of the ten from anywhere.
- **A screen that can lose what was typed** guards itself with `const unsaved = useUnsaved(changed)` (`src/features/navigation/useUnsaved.ts`) and a `ConfirmSheet` while `unsaved.asking`; call `unsaved.release()` after saving, before going on to another screen.
- **A choice that is remembered on the phone** (a switch that has no place in the API) is `const [value, set] = useKept(key, initial)` (`src/lib/useKept.ts`). Every screen that uses the same key sees the same value at once.
- **A person in a list** is `PersonRow` (`src/features/people`), and the line under their name is `memberLine(member, circle)`. `AddSomeoneSheet` adds someone to a circle; `RoleSheet` changes a role.
- **Days, times and money**: besides `formatDay` and `timeAgo`, `lib/dates` has `formatComingDay` ("Today", "Tomorrow", "Fri 4 Dec"), `formatTime` ("18:00"), `formatSpan` ("Today, 18:00 to 23:30"), `atTime(day, '18:00')`, `ageOn` and `nextBirthday`; `lib/money` has `formatMoney(cents)` ("€45", "€45.50").
- **In `src/ui`** since the foundation: `Segmented` (a few choices in one grey bar), `MoreRow` (a soft row with an emoji, a bold line and an arrow), `Blob` (a big emoji on a soft round ground), `SelectPill` (a small pill that holds a choice and opens the others), `GrowingInput` (a box typed straight into the page, as tall as what is in it); `EmojiTabs` takes `six`, `NoteBox` takes `soft` and `trailing`, `DayPicker` takes `byYear` (for a birthday), and `ThingRow` takes `picked` for a list to tick things in.

## What is built

The foundation: welcome, how it works, signing in (the test sign-in takes any email and the code 123456), creating a profile, the four tabs and the + button, notifications, appearance, logging out and deleting the account.

Milestone 1, the spine: circles, people and sharing.

| Screen (design) | Address | |
|---|---|---|
| 2.1 Who is it for? | `/setup` | Makes the circle. "Just me for now" makes a circle of one. Also from "New circle". |
| 2.5 Made for your kind of circle | `/setup/made` | After choosing Couple, Housemates or Friends. |
| 2.2 Name it and invite people | `/setup/people` | An adult by email, a child or a pet without a phone; roles only in a family; the link to join. |
| 2.3 Bring your things in | `/setup/bring-in` | The switches are remembered on the phone. Each import arrives with its place. |
| 2.4 All set | `/setup/ready` | Three shortcuts, each opening on top of Home. |
| 2.6 What each kind gets | `/circle/<id>/kind` | From a circle's settings (`/circle/<id>`, from "Your circles" on You, `/circles`). |
| An invitation | `/join/<code>` | Not drawn. Joining is the moment the question about notifications waits for. |
| 3.1 Today, 13.1 Loading, 13.3 A brand-new circle | `/` | Draws whatever the API's Today holds, from every place. |
| 3.2 Your circles | (a sheet on Home) | |
| 3.3 Find anything | `/search`, `/search?place=notes` | |
| 3.4 The + button | (a sheet on the tab bar) | "Type it" is drawn and says it arrives with Plan. |
| 4.1 People | `/people` | |
| 4.2 A person's page | `/person/<id>` | "Coming up" waits for Plan. |
| 4.3 Who can see this? | (the sheet behind every audience chip) | |
| 4.4 Keep it a surprise | `/page/<id>` | Any page that is hidden from someone says so, and until when. |
| 4.5 Guest pass | `/guest-pass/new`, `/guest-pass/<id>`, `/guest-passes` | The guest's side is a web page the API serves. |
| 4.6 A child's view | `/person/<id>/access` | |
| A page, a list | `/page/<id>`, `/checklist/<id>`, `/new/note`, `/new/checklist` | Simple and solid; they get richer with Notes. |
| 12.1 You | `/you` | The numbers come from the API. The swap button and the line about Journey say when they will work. |
| 12.3 Privacy and security | `/settings/security` | The three choices under "This phone" are remembered on the phone. |
| Notifications and appearance | `/settings` | Leads to the two pages the foundation built. |

Stand-ins (`features/states/NotBuiltYet`) until they are built from their designs: five of Home's six places (all but Today), Activity, eight of the ten things the + sheet opens, "Storage and backup" (`/settings/storage`), and "Export and leaving" (`/settings/leaving`), which so far holds Log out and Delete account.

## The API's description

`src/api/generated/homeport.ts` is made from `../api/openapi.json`, the API's own description, with `npm run api:generate`. A list that comes in pages gets a hook that loads page after page: name its operation in `PAGED` in `orval.config.ts`. To try the app against another description, name it: `OPENAPI=some.json npm run api:generate`.

The foundation itself uses only these calls: the test sign-in (`/local-auth/code`, `/local-auth/token`), `/v1/me`, `/v1/me/profile`, `/v1/me/settings`, `/v1/me/devices`, `/v1/me/apple-sign-in` and the two steps of an upload (`/v1/media/uploads`, `/v1/media/uploads/{id}/complete`).

## Links that open the app

A shared link is a web page served by the API that also works without the app. One kind is planned so far: an invitation to a circle, `https://<host>/join/<code>`.

The app already knows what to do with such a link: `src/app/+native-intent.ts` turns it into the screen with the same address (`src/lib/links.ts`), and a link that arrives before the person has signed in is remembered and opened once they are in: by the app's layout for someone who is in a circle, and by the setup steps' layout (`src/app/(setup)/_layout.tsx`) for someone who is in none, so an invitation is not lost behind "set up a circle". The screen itself (`/join/[code]`) is built with circles. The app's own scheme is `homeport://` (`scheme` in `app.json`).

For a tap on the web address itself to open the app, a build claims the address with the build setting `EXPO_PUBLIC_LINK_HOST` (`app.config.ts`), and the API serves the two files Apple and Google look for (`/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`). That is set up with the store builds.
