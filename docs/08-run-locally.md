# Homeport: run it on your Mac

> Everything runs on your computer: the database, the Java API and the app. The only account you need is a free Expo login, so that Expo Go on your iPhone will open the app.
>
> **Status:** 12 Nov 2026. I built this in the cloud and checked it in a browser: a walk-through signs up new people, sets up each kind of circle and uses every built screen, in light and dark, as two people where sharing matters. I could not try it on a real iPhone from there, so your first run is that test. If a step fails, tell me what you saw.

## What works today

The app opens with **sample people and their circles**, so there is something in every place from the first minute. Sign in as one of them with the test code **123456** (no email is sent):

| Sign in as | You see |
|---|---|
| `nora@example.com` | The Linds (a family: Nora, Alex, Mia, Leo and Biscuit the dog), "Nora and Alex" (a couple) and Lisbon crew (five friends) |
| `alex@example.com` | The other half of the family and the couple |
| `kai@example.com` | The flat (Kai, Lea, Lena) and Lisbon crew |
| `lea@`, `lena@`, `ana@example.com` | The crew, and the flat for the first two |
| any other address | A new person: the welcome, your profile, setting up your first circle |

- **Signing in and setting up:** the welcome, how it works, sign-in, your profile, a circle of any kind (family, couple, flat, friends, just me), its people (a child or a pet has no sign-in), an invitation link.
- **Home:** Today with its summary, the day's list and what is new; the circle switcher; one search across every place; the + button.
- **People and sharing:** everyone in the circle, a person's page, the chip on every thing that says who sees it and the sheet that changes it, hiding something from one person until a day, a child's view, guest passes with the guest's own web page.
- **Notes:** spaces, folders inside folders, pages made of blocks (text, lists, photos, files, a live bill or password), lists that keep working without a connection and catch up, and the templates gallery.
- **Library:** the wall of photos by day and year, a moment, the viewer, albums, places, files, a document with its dates, selecting and sharing, storage.
- **Plan and Jot:** the day's list, the month, events with answers, "Type it", reminders with turns and nudges, goals; the jot bar and what was filed where.
- **Money:** bills that repeat, reading a bill from its lines, sheets with formulas you can read, a row as a card, the loan planner, splitting costs.
- **Vault:** passwords, cards, IDs, Wi‑Fi and codes, scrambled in the app before they leave it; sharing one so someone can use it; the emergency plan; your Vault key and helpers.
- **Templates that do work:** the meal plan, the chore wheel, the time capsule and seven keepsakes.
- Light and dark, following your phone or your own choice.

Being built as this is written, and listed on the hub when done: the fair-and-fun templates, the homes and templates for couples, housemates and friends, Activity with the Sunday summary, export and leaving, and the link with Journey.

**Testing alone:** sign in as Nora in the app and as Alex in a browser (press `w`), or the other way round. What one shares, hides or ticks shows on the other's side.

**What Expo Go and a browser can't show.** Each of these is drawn in the app and says so when pressed:

- a push notification arriving on the phone (what each would say is written to the API's log);
- signing in with Apple or Google;
- Face ID for the Vault (a browser, and Expo Go, use a passcode);
- Jot's widgets, the pinned note, the Lock Screen and the share sheet (their code is in `apps/mobile/native/jot` and is first run by a real build);
- the camera reading a bill or a document, and the microphone (in a browser you type or paste the words, or pick a sound file);
- backing up the camera roll in the background.

Those need a build of Homeport itself: see [the end of this page](#a-real-build-on-your-iphone-later).

## One-time setup

About 20 minutes.

| # | What | How |
|---|---|---|
| 1 | **Node 22** | `brew install node@22`, then check with `node -v` |
| 2 | **Java 21 or newer** | Any JDK you already use is fine. Check with `java -version`. |
| 3 | **Docker Desktop** | For the database. Open it once so it is running. |
| 4 | **The code** | `git clone https://github.com/kadiripavan3/Family-Cloud.git`, then `cd Family-Cloud` and `git checkout claude/family-cloud-app-design-r48nx2` |
| 5 | **Expo Go on your iPhone** | Install it from the App Store. Create a free account at expo.dev and sign in inside Expo Go. |
| 6 | **The same Expo login on your Mac** | `cd apps/mobile`, then `npm ci` and `npx expo login` |
| 7 | **Xcode** (optional) | From the App Store. It adds the iOS Simulator now, and real builds on your iPhone later. |

If Journey's database is already running on your Mac (port 5432), Homeport uses the same PostgreSQL with databases of its own: run `./scripts/local-db.sh` once.

## Start it

From the `Family-Cloud` folder:

```sh
./scripts/dev.sh
```

It starts the database, then the API, then the app, and prints a QR code.

| Where | How |
|---|---|
| **Your iPhone** | Be on the same Wi-Fi as the Mac. Scan the QR code with the Camera app; it opens in Expo Go. |
| **iOS Simulator** | Press `i` in the terminal (needs Xcode). |
| **A browser** | Press `w`. |

Sign in with one of the sample addresses, or any email of your own. The code is **123456**.

The first time, macOS may ask whether Java and Node may accept incoming connections, and your iPhone asks whether Expo Go may find devices on your local network. Choose **Allow** both times: the iPhone reaches your Mac through that. (On the iPhone it can be changed later in Settings, Privacy & Security, Local Network.)

Journey and Homeport both want port 8080 for their API and 8081 for the app. Run one at a time, or start Homeport's API on another port (`--server.port=8090` in your IDE's run configuration) and the app with `EXPO_PUBLIC_API_URL=http://<your Mac's address>:8090 ./scripts/dev.sh`.

## Debug the API in your IDE

1. Open `apps/api` in IntelliJ (or any Java IDE). It is a normal Maven project.
2. Run `HomeportApiApplication` with the active profile `local`, in debug mode if you like.
3. Start `./scripts/dev.sh` afterwards. It sees the API is already running and uses yours.

Every endpoint can be tried in a browser at http://localhost:8080/swagger-ui.html. To call the ones under `/v1`, get a token from `POST /local-auth/token` (`{"email": "nora@example.com", "code": "123456"}`) and paste it into **Authorize**.

Where to put a breakpoint: every request comes in through a controller (`…Controller`), the rules are in the service next to it, and all SQL is in the `…Store` next to that. Who may see what is written once, in `common/Rules.java`. `CLAUDE.md` has the map.

## Everyday commands

| What | Command |
|---|---|
| The API's tests (need the database running) | `cd apps/api && ./mvnw test` |
| The app's checks: types, lint, tests | `cd apps/mobile && npm run check` |
| Everything CI checks for the API: tests, code style, compiler warnings | `cd apps/api && ./mvnw verify` |
| Format the API's code before committing | `cd apps/api && ./mvnw spotless:apply` |
| After pulling new code | `cd apps/mobile && npm ci`. The API brings the database up to date by itself when it starts. |
| After changing the API: refresh its description, then the app's client | `cd apps/api && UPDATE_OPENAPI=1 ./mvnw test -Dtest=OpenApiDocumentTest`, then `cd apps/mobile && npm run api:generate` |
| After changing `design/tokens.json`: refresh the app's theme | `cd apps/mobile && npm run theme` |
| The walk-through in a browser, as I run it | The three commands under "Check the app in a browser" in `CLAUDE.md` |
| Start over with fresh sample people | Stop the API, `docker compose down -v`, start again. The sample week is anchored to the day the data was added, so do this when "today" in the app has drifted from the drawings. |

## If something goes wrong

| What you see | What to do |
|---|---|
| Expo Go asks you to log in, or won't open the project | Sign in to Expo Go with the same account you used for `npx expo login` on the Mac. |
| Expo Go says the project uses a different SDK version | Update Expo Go from the App Store. |
| The app opens but says "Can't reach Homeport right now" | The phone can't reach the API. Check both are on the same Wi-Fi, that you allowed incoming connections for Java on the Mac, and Local Network for Expo Go on the iPhone. |
| The Wi-Fi doesn't let devices see each other (some offices and hotels) | `./scripts/dev.sh --tunnel` gives the app a public address, but the API needs one too. Open a tunnel to port 8080 with any tunnelling tool (for example `cloudflared tunnel --url http://localhost:8080`) and start with its address: `EXPO_PUBLIC_API_URL=https://<the tunnel's address> ./scripts/dev.sh --tunnel`. |
| "No database found" | Docker Desktop isn't running. Start it and run the script again. |
| Port 5432 is already in use | You already run a PostgreSQL (Journey's, perhaps). Run `./scripts/local-db.sh` once to create Homeport's databases in it; the script then uses it. |
| Port 8080 is already in use | Journey's API is running. Stop it, or use another port as described under "Start it". |
| The API stops while starting | The end of `.dev/api.log` says why. Send it to me if it isn't clear. |
| The Vault asks for a passcode and you forgot it | In a browser or Expo Go the Vault is opened with a passcode you chose there. Choose "Use your Vault key", or start over with fresh sample people. |

## What is real and what is a stand-in

We build local first, as with Journey. Each outside service has a stand-in until its account exists:

| Real service, connected later | Stand-in today |
|---|---|
| Sign-in with Apple, Google or an email code (the same account as Journey) | Any email with the test code |
| Photo, video and file storage | Kept in a folder next to the API (`apps/api/.dev/media`) and served by it |
| Push notifications | Written to the API's log; Activity shows the same events |
| Email: an invitation, the Sunday summary | Written to the API's log |
| Reading a bill, a document or a school letter with the camera | You type or paste the lines; the API reads them by rules and shows its reading for you to correct |
| Speech to text | Typed text; a recording is kept as a recording |
| Journey | A stand-in with two sample journeys, until Journey's own code has what the link needs ([what that is](10-journey-changes.md)) |
| A leak check for passwords, the weather, a map, mail forwarded in | Not connected. The screens that would use them say so. |
| Other people | The sample circles, added to an empty database |

**The Vault is not a stand-in:** its scrambling is real and happens in the app. In a browser and in Expo Go it is opened with a passcode instead of Face ID, and its key is kept in that browser's storage, which is fine for trying it and not for real secrets. [The Vault's protocol](07-vault-protocol.md) says what is and isn't protected, and what an outside review still has to look at.

Switching a stand-in for the real service is a setting in the API. The app and the rest of the API don't change. [Connect the real services](09-connect-services.md) has every step.

## A real build on your iPhone, later

Expo Go can't run everything: push notifications, Apple and Google sign-in, Face ID for the Vault, and Jot's widgets and share sheet need a build of Homeport itself. That build needs the **Apple Developer Program** (US$99 a year when I last looked for Journey; check the price on Apple's page): Homeport uses Sign in with Apple, push notifications and widgets, and Apple doesn't let a free Apple ID sign an app that does. Journey's membership covers both apps. The steps are in [Connect the real services](09-connect-services.md), step 4.

The first build on a phone is also the first time these have ever run, so expect fixes: the Vault's Face ID path and its speed on a phone, Jot's widgets, pinned note and Lock Screen (iOS and Android), the photo picker and camera, backing up in the background. `docs/06-build-plan.md` has the checklist to go through with the phone in your hand.
