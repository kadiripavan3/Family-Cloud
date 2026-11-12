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
- **Today** (`src/features/today`) draws whatever the API's Today holds for the current circle, the same way whoever sent it and whatever the kind of circle. `partsOf` (`about.ts`) lays the `cards` out by what each one carries: the first card that is only words is the headline beside the ring ("Friday is yours to plan"; where nobody sent one, the day's own list is summed up there, as in a family); the cards before the first one with a picture are lines of the day's list, after the `items` (a time, a day, an amount, a tick or the kind's icon in front; a card has its figure or its emoji there, and its button when it has an `action`); from the first card with a picture on they stand in the rail, with what is new from `fresh`, under the kind's own heading (`words.today.section`: "New in the library", "The two of you", "From the crew"). A line about a split has a button of its own (`SplitButton`: Remind among several people, Settle between two and for whoever owes). A flat's Today mounts `features/flat/RunningLow` under the list. A place gets onto Today by sending these from the API (`TodaySource`), never by editing Today. A card or a row opens its thing by its kind.
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
- **Days, times and money**: besides `formatDay` and `timeAgo`, `lib/dates` has `formatComingDay` ("Today", "Tomorrow", "Fri 4 Dec"), `formatTime` ("18:00"), `formatSpan` ("Today, 18:00 to 23:30"), `atTime(day, '18:00')`, `ageOn` and `nextBirthday`; for a calendar it has `formatWeekdayDay` ("Sat 14 Nov", with the year when it isn't this one), `nearName` ("Today", "Tomorrow" or null), `formatTimeOfDay` and `formatClocks` for a time of day as the API sends it ("07:30" is "7:30"; "10:00 to 10:30"), `addMinutes`, `monthOf`, `addMonths`, `formatMonth` and `phoneTimeZone()`; `lib/money` has `formatMoney(cents)` ("€45", "€45.50"), `formatMoneyExact` ("€84.20": a bill, a cell), `formatMoneyRound` ("€1,240": a figure on a card), `formatMoneyAbout` ("€15,000" after "about"), `formatAmount` ("1,480.00": a cell under a column that says the currency), and `parseMoney` / `moneyToType` for a box an amount is typed in; `lib/dates` also has `formatMonthName` and `formatMonthShort`. `useDebounced(value)` (`lib/useDebounced`) is a value once it has stopped changing.
- **In `src/ui`** since the foundation: `Segmented` (a few choices in one grey bar), `MoreRow` (a soft row with an emoji, a bold line and an arrow), `Blob` (a big emoji on a soft round ground), `SelectPill` (a small pill that holds a choice and opens the others), `GrowingInput` (a box typed straight into the page, as tall as what is in it); `EmojiTabs` takes `six`, `NoteBox` takes `soft` and `trailing`, `DayPicker` takes `byYear` (for a birthday), and `ThingRow` takes `picked` for a list to tick things in.

## Adding a template

A template that does work (LIVE in the gallery) is a **board**: a thing of kind `board`, opened at `/board/<id>`. The gallery (`/templates`), the route, the bar with the audience chip and More (rename, delete), the loading and problem states and every way of changing a board are shared and live in `src/features/templates/`. A new template adds four things and changes nothing that is shared:

1. **One screen file in its own folder**, in your place's feature folder: `src/features/perks/whose-turn/WhoseTurn.tsx`. It takes the board with its view and settings typed, and draws inside the frame:

   ```tsx
   export function WhoseTurn({ board }: BoardScreenProps<WhoseTurnView, WhoseTurnSettings>) {
     const changes = useBoardChanges(board);
     return (
       <BoardFrame board={board} title={board.title} problem={changes.problem}>
         …what the drawing shows, from board.view…
       </BoardFrame>
     );
   }
   ```

   `WhoseTurnView` and `WhoseTurnSettings` are the template's records in the generated client; `x-board-templates` in `apps/api/openapi.json` names them and lists, under `guide`, what `settings`, each kind of entry, each verb and `show` take.
2. **One line in the typing map**, in your place's own file `src/features/templates/places/<place>.ts` (`notes`, `keepsakes`, `perks`, `couple`, `flat`, `crew`): `whose_turn: template<WhoseTurnView, WhoseTurnSettings>(WhoseTurn),`. The line pairs the template's code with its two types and its screen, and the compiler refuses a screen that takes other records. From then on the board opens on your screen instead of "arrives with the next update".
3. **Its words** in your place's catalog file, under a key of its own: `words.perks.whoseTurn`.
4. **Its test and its walk-through steps**: a made-up view in `src/test/samples/<place>.ts`, drawn through the route (`src/__tests__/screens/templates/MealPlan.test.tsx` is the example: `useGetBoard` answers `board({ template: 'meal_plan', view: … })`; the router, the cache and the API's calls every board test mocks are in `src/test/boards.tsx`), and steps in your place's walk-through file that start it from the gallery (`/templates`, its card, Start) or open the sample one (its card, then its row under "In The Linds already"). `scripts/e2e/steps/04-templates.js` shows both, a second person who joins through the API, and how a step takes back what an earlier run left so it can run again; `scripts/e2e/sound.js` writes the sound file a browser picks where a phone has a microphone.

What the frame gives you (`src/features/templates/`):

- **`BoardFrame`**: `title` and `subtitle` for the bar's middle; `chip="menu"` when the bar is full (the chip then stands on the More sheet only); `chipLook` to word the chip the template's way ("For Mia"); `actions` for a round button of your own before More; `menu` for your own rows on the More sheet ("Next week"); `footer` for what is pinned at the end (`Foot`, `AddBar`), `floating` for the glass bar (`CtaBar`); `scroll={false}` when your page is a `List`; `tone="stage"` for a camera or a photo (the frame then draws no bar: put `BoardMore` in your own); `problem` for the sentence of a change that didn't work. Pulling the page down asks for the board again.
- **`useBoardChanges(board)`**: `add(kind, fields, clientId?)`, `change(entryId, fields)`, `remove(entryId)`, `act(verb, body)`, `set(settings, title?)`, with `busy` and `problem`. Each sends the phone's day, tells the cache (`boardSaved`), and answers null instead of throwing. A sheet that adds keeps its own `clientId` (`useRef(newClientId())`) and asks for its own `useBoardChanges`, so a tick behind it doesn't share its spinner.
- **`useBoardPart(board, show)`**: another part of the same board (another week, an earlier year), typed like the board. A list that is read a page at a time is `useGetBoardEntriesInfinite(board.id, { kind, member, filter, q })` with `List`.
- **Before it starts**: a template that needs something to begin (who it is for, a date) exports a small component taking `SetupProps` and passes it as the second argument: `template<V, S>(Screen, Setup)`. The gallery's sheet draws it above Start; it calls `onChange({ settings, title })`, or `onChange(null)` while something is missing.
- **Parts** (`src/features/templates/parts/`): `BoardRow`, `Face`, `Tile`, `Sealed`, `Arrow` (rows in a `RowGroup`); `BlobHead`, `PersonHead` (the top of a page); `Foot`, `CtaBar`, `AddBar` (the end of a page); `PersonChips` (pick one of the circle's people); `PlayButton` (a recording, played back); `Notice` (a sentence in a sheet, for a control that can't do its work in this build). `media.ts` has `pickPhoto`, `uploadPhoto` and `uploadSound`; `sound` has `pickSound` (in a browser a sound file stands in for the microphone).

A template without a screen yet still shows in the gallery, starts, and opens on a friendly "arrives with the next update" page with its chip and More, so nothing made from it is lost.

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
| 3.1 Today, 13.1 Loading, 13.3 A brand-new circle | `/` | Draws whatever the API's Today holds, from every place: the day's list, the cards of a circle's own templates, what is new. |
| 3.2 Your circles | (a sheet on Home) | |
| 3.3 Find anything | `/search`, `/search?place=notes` | |
| 3.4 The + button | (a sheet on the tab bar) | "Type it" opens Plan's `/plan/quick-add`. |
| 4.1 People | `/people` | |
| 4.2 A person's page | `/person/<id>` | "Coming up" is Plan's `ComingUp`: the calendar for that one person. Their photos are one row that leads to the Library. |
| 4.3 Who can see this? | (the sheet behind every audience chip) | |
| 4.4 Keep it a surprise | `/page/<id>` | Any page that is hidden from someone says so, and until when. A page made of parts is read part by part, each thing it holds as a row. |
| 4.5 Guest pass | `/guest-pass/new`, `/guest-pass/<id>`, `/guest-passes` | The guest's side is a web page the API serves. |
| 4.6 A child's view | `/person/<id>/access` | |
| A page, a list | `/page/<id>`, `/checklist/<id>`, `/new/note`, `/new/checklist` | Simple and solid; they get richer with Notes. |
| 12.1 You | `/you` | The numbers come from the API. The swap button and the line about Journey say when they will work. |
| 12.3 Privacy and security | `/settings/security` | The three choices under "This phone" are remembered on the phone. |
| Notifications and appearance | `/settings` | Leads to the two pages the foundation built. |

Milestone 2, the Library: photos, videos and documents (`src/features/library`).

| Screen (design) | Address | |
|---|---|---|
| 6.1 The wall | `/?place=library` | Days under their own lines, more as it scrolls, the strip of years, the month bubble, the people in photos. `?until=<day>` is where it starts. |
| 6.2 Pinch out to a year | `/library/years?year=2026` | Reached from the month bubble. Pinching between days, months and years is still to be wired on a phone. |
| 6.3 A moment | `/library/moment/<id>` | The id of any of its photos. |
| 6.4 A photo | `/photo/<id>`, `/video/<id>` | One viewer. The narrowing it was opened from travels in the address (`?moment=`, `?album=`, `?place=`, …), so stepping stays inside it. A video is played by opening its file. |
| 6.5 Albums | `/library/albums`, `/album/<id>` | An album's page is not drawn; it is the wall's rows. A folder of files is an album too. |
| 6.6 Places | `/library/places` | A list on every device until the app has a map. |
| 6.7 Files, 6.8 A document | `/library/files`, `/document/<id>` | "Remind me" makes the reminder with Plan's API and links it. |
| 6.9 Select and share | `/library/select` | Over the same narrowing; `?into=<album>` puts photos into an album. |
| 12.2 Storage and backup | `/settings/storage` | The rows under "This phone" say what needs a phone. |
| Adding | `/new/photos`, `/new/scan` | Not drawn. A file chooser in a browser, the photo picker on a phone; a scan's words are typed until a phone reads them. |

- A photo opens with `viewerHref(item, narrow)` (`features/library/narrow.ts`): the address `thingHref` makes, with the narrowing after it.
- The answer of `GET /v1/library/{id}` is typed by hand (`features/library/types.ts`, read with `useLibraryItem`) until the API's description stops giving it the name of a checklist's line.
- `List` takes `onTop` (the first row on screen changed). In a screen's test the list is stood in for, since the tests can't load the real one: `jest.mock('@/ui/List', () => jest.requireActual('@/test/samples/library').listForTests)` draws every row and lets a test press "the end of the list".
- `lib/dates` also has `formatMonth` ("November 2026"), `formatMonthName`, `formatMonthShort` ("Nov 2028"), `formatWeekdayPast` ("Sat 7 Nov", with the year when it isn't this one) and `formatClock` ("11:42" from the moment a photo was taken, written without a zone).

Milestone 3, Plan: the calendar, events, reminders, goals. Its pieces are in `src/features/plan`.

| Screen (design) | Address | |
|---|---|---|
| 7.1 Plan | `/?place=plan` | The week strip and the list by day (`getPlan`). Three chips lead to the month, the reminders and the goals; they are not in the drawing, which has no way to them. |
| 7.2 Month | `/plan/month`, `/plan/month?day=2026-11-14` | A dot per person, the chosen day's list, one person's days. The arrows by the month's name are not in the drawing. The + makes an event on the chosen day. |
| 7.3 An event | `/event/<id>` | Answers, who is coming, what it gathers (a to-do list, a budget from the party template, an album), change, a picture, delete. |
| 7.4 Type it | `/plan/quick-add` | The line is read a moment after the last key (`readLine`); each piece can be corrected. An uncorrected line is filed by `jot`, a corrected part by `createEvent` or `createReminder`. |
| 7.5 Reminders | `/plan/reminders` | Yours, what you asked of others (with Nudge), the ones that wait for a place, and what was ticked. |
| A reminder | `/reminder/<id>` | Not drawn. |
| 7.6 Goals | `/plan/goals` | |
| 7.7 A goal | `/goal/<id>` | "Add money", "Add one" or the list of steps; a line that was put in can be taken back. |
| A new event, reminder, goal | `/new/event` (`?day=`), `/new/reminder`, `/new/goal` | Not drawn. The first two have a line on top that leads to Type it. |

Plan's pieces that other screens use: `useTick()` and `Tick` (ticking a reminder from any list, for the due day the line is for; `TodayTick` is the tick on Today, where a line has no due day and the reminder itself is asked first), `ComingUp` (a person's page), `PlanEntry` and `DayHeader` (one line of a day), `WhenSheet`, `RepeatSheet`, `RemindSheet` and `PeopleSheet` (picking a day and time, how often, how long ahead, and people of the circle), `readTime` and `readCents` (`features/plan/times`: a time and an amount the way people type them), and `useNotice()` (a sentence that answers a press and goes by itself).

Milestone 3, Jot: adding something without opening the app (`src/features/jot`; what runs outside the app is in `native/jot` and `plugins/`, built in only with `JOT_NATIVE=1`).

| Screen (design) | Address | |
|---|---|---|
| 14.2 The jot bar, 14.6 Filed for you | `/jot`, `/jot/filed` | A line is read by the API's rules and filed; "what was filed" undoes or moves it. A line that looks like a code is held back and can go to the Vault. |
| 14.4 Voice | `/jot/voice` | Typed words stand in for the microphone in a browser. |
| 14.7 Share into Homeport | `/jot/share` | What another app shares. In a browser, a pasted text. |
| 14.1 Widgets, 14.3 The pinned note, 14.5 The Lock Screen | `/jot/widgets`, `/jot/pinned`, `/jot/lock` | Pictures of what the phone build adds, with what each can and can't do. Their code has never run on a phone. |
| Ways in | `/jot/ways` | Reached from You, Settings. |

Milestone 4, Notes: spaces, folders, pages, lists (`src/features/notes`).

| Screen (design) | Address | |
|---|---|---|
| 5.1 Notes | `/?place=notes` | Pinned, spaces, lately, not filed. |
| 5.2 A space | `/folder/<id>` | A space or any folder; folders inside folders open in place. "Templates" opens the gallery. |
| 5.3 A page, 5.4 Blocks | `/page/<id>` | Blocks changed one at a time. A list in a page ticks in place; a live block shows another thing as it stands and opens it; a password's "Copy" opens it in the Vault. A page that is a kept journey is drawn as its book (milestone 10). |
| 5.5 A checklist, 13.2 Offline | `/checklist/<id>` | Changes are written on the phone first and sent in order when there is a connection (`features/notes/changes`). An open list or page asks again every few seconds. |
| New | `/new/note`, `/new/checklist` | Take `?folder=`. |

Milestones 4, 7 and 8, the templates that do work. Every one is a board at `/board/<id>`, started from the gallery at `/templates`; "Adding a template" above is how each was added.

| Where its files are | Templates |
|---|---|
| `src/features/templates` | Weekly meal plan, chore wheel, time capsule |
| `src/features/keepsakes` | Open when…, the birthday interview, what they said, same spot every year, Grandma's stories (with her own web page), the good things jar, the doorframe |
| `src/features/perks` | Whose turn?, the piggy bank, secret missions, the Saturday jar, sleeps until…, where is it?, habit charts |
| `src/features/couple` | Our story, tucked notes, the anniversary, mystery date, both said yes, the fair share |
| `src/features/flat` | The kitty, a fairer split, heads-up, heard in this flat, the guest book (with its page at the door), who lived here; and "Running low" on a flat's Today |
| `src/features/crew` | When can everyone? (with its page by link), Secret Santa, where next?, the dictionary, predictions, the awards, a goal you walk together |

- **Today is one screen for every kind of circle** (`src/features/today`): it draws what the API's Today holds. The first card that is only words is the headline beside the ring; the day's things and the other cards are lines of one list (`TodayLine`), a line about shared costs or a bill with its button; cards with a picture stand in a rail with what is new.
- Six templates are marked LIVE in the galleries and have no drawing of their own yet (Date ideas, Who pays what, Names; Cleaning rota, Bills by nights, Move-in photos): they say "Coming with the next update" and can't be started.

Milestone 5, Money: bills, sheets, the loan planner and splitting costs. Every amount, share, total and formula result comes from the API; the app only writes them (`lib/money`).

| Screen (design) | Address | |
|---|---|---|
| 8.1 Money | `/?place=money` | The month's card, what is due soonest, the sheets as a rail, and the circle's splits under them. |
| The lists of bills | `/money/bills`, `/money/bills?show=subscriptions` | To pay, paid, subscriptions. Not drawn. |
| 8.2 A bill | `/bill/<id>` | "Pay" on Today's line is `PayBillButton` (`features/money/PayBill`). |
| Adding and changing a bill | `/new/bill`, `/money/bill?id=<id>` | Not drawn. |
| 8.3 Scan a bill | `/money/scan`, `?bill=<id>`, `?split=<id>` | A picked picture and typed or pasted lines stand in for the camera and its text reading. |
| 8.4 Sheets | `/money/sheets`, `/new/sheet` | The templates are the API's. |
| 8.5 A sheet | `/sheet/<id>` | It asks again every few seconds: "Alex is here too". |
| 8.6 A row, as a card | `/money/row/<id>` | A box is saved when it is left, with only that cell. |
| 8.7 A formula you can read | `/money/formula?sheet=<id>&tab=<id>` | `&tile=`, `&column=` for one that is there; `&as=tile` or `&as=column` for a new one. |
| 8.8 Template: loan planner | `/money/loan` | The savings plan has no such screen yet: its template starts as its sheet. |
| 8.9 Splitting with friends | `/split/<id>`, `/money/splits` | |

A place's own pieces live in its folder: Money's are `features/money/` (`parts.tsx` for what several of its screens draw, `lines.ts` for the lines under a bill or an expense, `sheet/` for the grid, the cells by kind, the formula chips and `formula.ts`, which writes a formula from chips and never works one out). Its lists read their rows through `useWhileInFront`: a list that another screen covers keeps the rows it had until it is looked at again, because in a browser the list trips ("not enough layouts") when a row goes while it is covered, as when a sheet opened from it is deleted.

Milestone 6, the Vault. Its contract is `docs/07-vault-protocol.md`; its cryptography is in `src/features/vault/crypto/` (no React, no API calls, a test file for each) and what the phone does with keys, step by step, in `src/features/vault/actions.ts`.

| Screen (design) | Address | |
|---|---|---|
| 9.1 The Vault, locked | `/?place=vault` | Also what any Vault screen shows while locked (`features/vault/Gate`). Face ID on a phone; a passcode where there is none, and in the browser. |
| 9.2 The Vault | `/?place=vault`, `/vault/drawer/<login, card, …, look, shared>` | |
| 9.3 A password | `/vault-item/<id>`, `/new/password`, `/vault/edit/<id>` | |
| 9.4 Share a secret | (a sheet on 9.3) | |
| 9.5 If something happens | `/vault/emergency`; for the trusted person `/vault/entrusted/<id>` | |
| 9.6 Your Vault key | `/vault/key`, after `/vault/setup`; for a helper `/vault/helping` | |
| Getting in | `/vault/unlock` (with the Vault key), `/vault/recover` (with two helpers) | Not drawn. |

- **Nothing a phone has opened goes into the data layer.** A screen that handles keys or what they open runs its work with `useSecretAction()` (`features/vault`), never with `useMutation`, and keeps what it shows in its own state. `NothingSecretIsKept.test.tsx` searches the data layer for it.
- **A screen of the Vault** is wrapped in `VaultScreen` (`features/vault/Gate`): locked, it shows the locked page; unlocked, any touch on it starts the two minutes again.
- **Another screen that needs a sealed card for a guest** calls `sealForGuest(text, key?)` (`features/vault/crypto/guest`); the guest pass screens use `features/vault/PassCards`.

Stand-ins (`features/states/NotBuiltYet`) until they are built from their designs: Activity, and "Export and leaving" (`/settings/leaving`), which so far holds Log out and Delete account.

## The API's description

`src/api/generated/homeport.ts` is made from `../api/openapi.json`, the API's own description, with `npm run api:generate`. A list that comes in pages gets a hook that loads page after page: name its operation in `PAGED` in `orval.config.ts`. To try the app against another description, name it: `OPENAPI=some.json npm run api:generate`.

The foundation itself uses only these calls: the test sign-in (`/local-auth/code`, `/local-auth/token`), `/v1/me`, `/v1/me/profile`, `/v1/me/settings`, `/v1/me/devices`, `/v1/me/apple-sign-in` and the two steps of an upload (`/v1/media/uploads`, `/v1/media/uploads/{id}/complete`).

## Links that open the app

A shared link is a web page served by the API that also works without the app. One kind is planned so far: an invitation to a circle, `https://<host>/join/<code>`.

The app already knows what to do with such a link: `src/app/+native-intent.ts` turns it into the screen with the same address (`src/lib/links.ts`), and a link that arrives before the person has signed in is remembered and opened once they are in: by the app's layout for someone who is in a circle, and by the setup steps' layout (`src/app/(setup)/_layout.tsx`) for someone who is in none, so an invitation is not lost behind "set up a circle". The screen itself (`/join/[code]`) is built with circles. The app's own scheme is `homeport://` (`scheme` in `app.json`).

For a tap on the web address itself to open the app, a build claims the address with the build setting `EXPO_PUBLIC_LINK_HOST` (`app.config.ts`), and the API serves the two files Apple and Google look for (`/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`). That is set up with the store builds.
