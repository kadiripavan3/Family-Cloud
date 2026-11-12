# The build plan

> **Status:** approved on 12 Nov 2026: "go ahead with the defaults", every milestone, one after another, under the name Homeport. Being built now; the hub's overview says which milestone is done. · **Written:** 12 Nov 2026
>
> **In one line:** the app is built the way Journey was: on one computer first, with stand-ins for the outside services, one milestone at a time, every screen from its design, each milestone ending with its tests green and a walk-through you can watch.

## What you asked for

Every screen and flow in the hub, built as shown: the same layouts, words, 3D icons and built-in pictures (the welcome photo, the cards on “How it works”). Photos a person would add themselves are not built in. They come from sample data that exists only in the local setup, so the app you run looks like the screens; a real new account starts empty, with the empty screens from group 13. And everything is tested end to end as far as it can be.

All **125 screens** are in the list at the bottom of this page, each with the milestone it is built in and how it is tested.

## How it is built

The method is Journey's, unchanged. Journey's `CLAUDE.md` is the rulebook, and this repo's will be written from it in milestone 1.

| | What it means here |
|---|---|
| **Same shape of repo** | `apps/mobile` (Expo, TypeScript), `apps/api` (Spring Boot, Java), `design/`, `docs/`, `scripts/`, tests on every push |
| **Same versions as Journey** | Expo SDK 58, React Native 0.88, Spring Boot 4, Java 21, PostgreSQL: the versions in Journey's code today. Each library's own current version is checked when it is added. |
| **Local first** | Sign-in with any email and the code 123456, files on disk, pushes and emails written to a log. Each outside service has a stand-in behind a setting; the real ones are switched on in the last milestone. |
| **Journey's code where it fits** | The design system (`src/ui`), the theme made from the tokens, the linter's rules, the way the app talks to the API, the drafts-and-uploads queue, the photo pipeline, and the API's common parts are copied from Journey and adapted. Nothing is written twice that Journey already got right. |
| **One rule for who sees what** | Written once in the API, used by every query, and tested before anything else. In this app it is the whole promise. |
| **Screens from the designs** | Each screen is built from its file in `design/hub/src/screens`, with the shared components and only values from the tokens. The linter refuses a colour, a size or a sentence written by hand. |
| **The people in the screens** | Sample data: The Linds, Nora and Alex, the flat on Trubarjeva, Lisbon crew, with the hub's photos. The app you run looks like the hub. |
| **Reviews** | Two full code reviews, as Journey had: one after milestone 1, on the foundations everything stands on, and one before the real services are connected. |

### What “done” means for a milestone

1. The API for it exists, with its tests: the rules first, then every route.
2. Every screen in it is built from its design and has its own test.
3. The walk-through (below) goes through every one of them, in light and dark, and takes a picture of each.
4. I put each picture next to its design and fix what differs.
5. The docs say how to run it and what was decided; the hub's status and this page are updated; the work is pushed.

## How it is tested

| Level | What it is | Screens |
|---|---|---|
| **In the browser** | A script opens the app as a web page against the real API and database and uses it as a person would, start to finish. Where sharing matters it acts as two or more people at once: what Nora hides, Alex must not find. It fails at the first thing that doesn't work and leaves a picture of it. It runs on every push. | 88 |
| **In the browser, phone part stood in** | The same, with one piece replaced: a picked photo instead of the camera, a typed sentence instead of the microphone, a list instead of a map. The logic behind the piece is fully tested. | 30 |
| **On a real phone** | Things a browser can't do: widgets, the pinned notification, the Lock Screen, the share button, opening the other app. I write them and test their logic here. Their first real run is on a phone build in the last milestone, with a checklist for you. | 6 |
| **In Journey** | The one button that lives in Journey's code. | 1 |

Under those sit two more layers, as in Journey: a test for every screen on its own, and tests in the API for every rule and route, run against a real database.

This environment can run all of it: it has Java 21, PostgreSQL 16, Node 22 and a browser, and can reach the libraries both halves need. I checked today.

## The milestones

Each one leaves something you can run and use.

| # | Milestone | What you can do at the end | Screens | Size |
|---|---|---|---|---|
| 1 | **The spine:** sign-in, circles, people and sharing | Sign up, make a circle of any kind, invite people, share a thing with some and hide it from one, give a sitter a guest pass | 22 | Large |
| 2 | **Library** | Add photos, videos and files; the wall, years, moments from several people, albums, places, documents | 10 | Large |
| 3 | **Plan and Jot** | Calendar, events, reminders, goals; type a sentence and it is filed; the jot bar; the phone parts written | 15 | Large |
| 4 | **Notes** | Spaces, folders, pages with live blocks, a list two people tick at once, templates, working offline | 10 | Large |
| 5 | **Money** | Bills, scanning one, a real sheet with formulas, rows as cards, the loan planner, splitting costs | 9 | Very large |
| 6 | **Vault** | Passwords and codes scrambled on the device, sharing one, the Vault key and helpers, emergency access | 6 | Large, and reviewed |
| 7 | **Keepsakes, and fair and fun** | The fourteen family ones, from Open when… to habit charts | 14 | Large |
| 8 | **Couples, housemates, friends** | Each kind's Home, templates, keepsakes and rituals | 25 | Large |
| 9 | **What ties it together** | Activity, notifications, the Sunday summary, search across everything, export, leaving a circle | 5 | Medium |
| 10 | **With Journey** | Keep a journey, tell one, the trip space, Journey at home, against a stand-in for Journey | 9 | Medium |
| 11 | **Real services and real phones** | The accounts connected one at a time, a build on your phone, and the checklist of everything that could only be written, not tried | — | Your part and mine |

Journey has 66 screens. This app has about twice that, and three parts harder than anything in Journey: sheets, the Vault, and lists two people edit at once. Count it as two to three Journeys of work. I'll report at the end of every milestone instead of promising dates.

Later milestones go back into earlier screens to switch on what was waiting: a page's Wi‑Fi block needs the Vault, a bill's “Log in” row too. Until then such a row is there and says what it is waiting for.

## Calls I need from you

You said on 12 Nov: build on the defaults. They are decisions now (decision 6 under *What it does*), and each can still be changed later.

| # | Question | Default I'll build |
|---|---|---|
| 1 | **Children.** Profiles a parent looks after, or children signing in themselves? | **Profiles only.** A child has a page, photos, jobs and stars; anything they tick is ticked on a parent's device. No sign-in for under-13s. Screen 4.6 becomes what a parent chooses to show on a child's page. |
| 2 | **Understanding text.** Several screens read a sentence, a letter or a voice note. By rules on the device, or by an AI service? | **Rules, no AI service.** Private and free. It will read dates, times, amounts, names and shopping well, and a free-form letter only roughly; it always shows its reading for you to correct. An AI service would do better, costs per use, and means the text leaves the phone. It can be added later behind the same door. |
| 3 | **Faces.** “Every photo Mia is in” | **No face recognition.** People are tagged by hand, and albums fill from tags. |
| 4 | **The name.** | **Homeport**, your choice on 12 Nov, kept in one place. It has had a web search, not a legal check ([The name](03-name.md)); the check and the app's id in the stores are settled before milestone 11. |
| 5 | **Three new services:** mail in, typing out a voice, the weather | **Stand-ins now.** You decide at milestone 11 which are worth an account. |
| 6 | **Journey's code.** Keep, Tell and the switch need small changes in Journey. | **A stand-in for Journey until milestone 10.** Then I need your go-ahead to change Journey, in its own repo. |

## Where the build can't match the screen

Said now, so none of it is a surprise later.

| Screen | What it shows | What can really be done |
|---|---|---|
| 4.5 Guest pass | The sitter's phone joins the Wi‑Fi without her seeing the password | Only an app can join a network for someone. On a web page with no app, she is shown the password for the evening, or she installs the app. |
| 6.5 Albums, 4.2 A person's page | “Every photo she is in” | From tags made by hand, unless you choose face recognition (call 3). |
| 9.3 A password | “It fills in for her. She never sees it.” | Copying and opening a site signed in come first. Filling in inside other apps is separate phone work, after the first version. And a determined person can dig a password out of their own phone: the app will say “can't see”, not “can't get”. |
| 14.1, 14.3, 14.5 Jot | Widgets, the pinned note, the Lock Screen | The screens already show the limits: a widget takes taps, not typing, and on an iPhone the pinned note comes back instead of staying. What is left is that none of it can be run here; its first real run is on a phone. |
| 14.6, 14.7, 8.3, 8.7 | A sentence split into four things; a school letter read; a bill read; a question turned into a formula | By rules (call 2): right for the common cases, and always shown for you to correct. |
| 6.6, 19.9 Maps | A map | A real map on phones. In the browser a list of places, as Journey does. |
| 17.4 Tucked notes | “When he lands”, “next time it rains” | “Some time this week” and a set time are built. The other two need the phone's location or a weather source. |
| 16.4 The Saturday jar | “Dry until 4” | Needs a weather source (call 5). Until then it asks. |
| 15.5 Grandma's stories | Her answer “typed out” | Needs a service that turns speech into text (call 5). Her voice is kept either way. |
| 18.7 The guest book | Anyone with the code can write in it | What a guest writes waits for a flatmate's yes before it shows. |
| 2.3 Bring your things in | Apple Notes, Notion, Evernote, iCloud Keychain, 1Password | Files those apps export. No direct connection to them. |
| 1.3 Log in | “Continue as Nora” | Needs both apps on one phone from the same developer account. |

One more thing about the built-in pictures. The welcome photo and the other photos are stock pictures from Unsplash. They are fine for building and testing. Before the stores, the ones that show people should be replaced or cleared, because nobody in them agreed to advertise an app. Journey's design brief says the same of its own photos.

## The first build on a phone: what to check

Everything was built in the cloud and walked through in a browser. These parts have never run on a phone, so the first build of Homeport itself (not Expo Go) is their first test. Go through them with the phone in your hand and tell me what you see; expect fixes.

| Part | What to try | What I expect to need fixing |
|---|---|---|
| **Signing in** | Apple, Google, the email code. With Journey on the same phone: "Continue as …" | Needs the accounts first ([docs/09](09-connect-services.md), steps 1 and 5). Never run. |
| **The Vault** | Set it up; unlock with Face ID; lock it, and let it lock itself; put the app in the background and look at the app switcher; copy a password and paste it a minute later; print or save the Vault key; a second phone let in with the typed key; getting back in with two helpers | How long unlocking takes on a phone is unknown (the key is stretched in JavaScript). Whether the app switcher shows a Vault screen. The print path. |
| **Jot outside the app** | The three widgets, the Lock Screen widgets, the list's Live Activity, the pinned note, sharing into Homeport from another app, the Action Button; on Android the widgets, the quick-settings tile, the long press on the icon, the note that stays in the notifications | All of it: written from Apple's and Google's documentation, never run. Needs a build with `JOT_NATIVE=1`. |
| **Photos** | Pick many photos at once; the camera; a video; a HEIC photo; backing up while the app is in the background; "Free up space"; pinching the wall between days, months and years | Backing up in the background and freeing space are not built beyond their switches. Pinching is not wired. |
| **Scans** | Photograph a bill, a school letter, a passport | Reading the words off the picture is not built: it needs a text-recognition library chosen and checked for the build. Until then the lines are typed or pasted. |
| **Voice** | A voice jot; recording an answer for Grandma's stories; playing a recording | Recording and playing inside the app need an audio library chosen for the build. In a browser a sound file stands in. |
| **Without a connection** | Flight mode: tick a list, write on a page, add a jot; close the app; connect again | Built and tested in a browser; a phone that closes the app in between is the real test. |
| **Notifications** | Turn them on; from a second account ask to see a password, give a reminder, add photos; tap each; "Hide details in notifications" | Needs push connected ([docs/09](09-connect-services.md), step 6). What each opens was tested only as an address. |
| **Links** | An invitation link, a guest pass, Grandma's story page, opened on the phone with and without the app | Opening the app from a link needs your own domain (step 8). |
| **The two apps** | Hold the You tab to hop to Journey and back; keep a journey; tell a moment as a journey | Needs both apps installed, and the changes inside Journey ([docs/10](10-journey-changes.md)). Until then Journey is a stand-in. |
| **Everything else** | Large text, dark mode, a small phone and a big one, the keyboard over every form, one-handed reach of the bottom bars | Layout was checked at one phone size in a browser. |

## Your part

- **Now:** say go, and answer any of the six calls you want different.
- **At each milestone:** run it on your Mac, open it on your iPhone in Expo Go as with Journey, and tell me what is wrong. The steps are in [Run it on your Mac](08-run-locally.md).
- **Before milestone 6 is used for real:** a security review of the Vault by someone outside. I can prepare everything for it.
- **Milestone 11:** the accounts. They are the ones Journey needs too (Apple, Google, Supabase, Cloudflare, Expo, Fly.io, Resend): made once, used by both apps. A build on your phone needs the Apple Developer Program; Journey's tech page has what it costs and how long enrolling takes.

## Every screen

**1 · Welcome**

| # | Screen | Milestone | Tested | To know |
|---|---|---|---|---|
| 1.1 | Welcome | 1 | In the browser |  |
| 1.2 | How it works | 1 | In the browser |  |
| 1.3 | Log in or sign up | 1 | In the browser, phone part stood in | Email and the test code here. Apple, Google and “Continue as Nora” need real accounts and both apps on a phone. |

**2 · Set up a circle**

| # | Screen | Milestone | Tested | To know |
|---|---|---|---|---|
| 2.1 | Who is it for? | 1 | In the browser |  |
| 2.2 | Name it and invite people | 1 | In the browser |  |
| 2.3 | Bring your things in | 1 | In the browser, phone part stood in | The switches are saved now. Each import arrives with its own milestone; photo backup and phone calendars need a phone. |
| 2.4 | All set | 1 | In the browser |  |
| 2.5 | Made for your kind of circle | 1 | In the browser |  |
| 2.6 | What each kind gets | 1 | In the browser | Complete once milestone 8 has every kind’s content. |

**3 · Home**

| # | Screen | Milestone | Tested | To know |
|---|---|---|---|---|
| 3.1 | Today | 1 | In the browser | Fills up milestone by milestone. |
| 3.2 | Your circles | 1 | In the browser |  |
| 3.3 | Find anything | 9 | In the browser | Works from milestone 1 and gains a place at a time. |
| 3.4 | The + button | 1 | In the browser | “Type it” joins in milestone 3. |

**4 · People and sharing**

| # | Screen | Milestone | Tested | To know |
|---|---|---|---|---|
| 4.1 | People | 1 | In the browser |  |
| 4.2 | A person's page | 1 | In the browser |  |
| 4.3 | Who can see this? | 1 | In the browser | Tested as two people: what one shares, the other can or can’t see. |
| 4.4 | Keep it a surprise | 1 | In the browser | Tested as the person it is hidden from. |
| 4.5 | Guest pass | 1 | In the browser, phone part stood in | The guest’s web page is tested. See “Where the build can’t match the screen”. |
| 4.6 | A child's view | 1 | In the browser | Waits on your answer about children. |

**5 · Notes**

| # | Screen | Milestone | Tested | To know |
|---|---|---|---|---|
| 5.1 | Notes | 4 | In the browser |  |
| 5.2 | A space | 4 | In the browser |  |
| 5.3 | A page | 4 | In the browser |  |
| 5.4 | Add to a page | 4 | In the browser | Live blocks light up as their places exist. |
| 5.5 | A shared list | 4 | In the browser | Tested as two people at once, and offline. |
| 5.6 | Templates | 4 | In the browser |  |
| 5.7 | Template: weekly meal plan | 4 | In the browser |  |
| 5.8 | Template: chore wheel | 4 | In the browser |  |
| 5.9 | Template: time capsule | 4 | In the browser, phone part stood in | Recording a voice message needs a phone; here a sound file is picked. |

**6 · Library**

| # | Screen | Milestone | Tested | To know |
|---|---|---|---|---|
| 6.1 | The wall | 2 | In the browser, phone part stood in | Photos are picked from files here. Backing up the camera roll needs a phone. |
| 6.2 | Pinch out to a year | 2 | In the browser |  |
| 6.3 | A moment | 2 | In the browser | Tested with three people’s uploads. |
| 6.4 | A photo | 2 | In the browser |  |
| 6.5 | Albums | 2 | In the browser, phone part stood in | “Fills itself” works from who is tagged, not from faces. |
| 6.6 | Places | 2 | In the browser, phone part stood in | A real map on phones; a list of places in the browser, as in Journey. |
| 6.7 | Files | 2 | In the browser, phone part stood in | Reading the words inside a scan happens on the phone. |
| 6.8 | A document | 2 | In the browser, phone part stood in | The passport line is read by rule. Scanning with the camera needs a phone. |
| 6.9 | Select and share | 2 | In the browser |  |

**7 · Plan**

| # | Screen | Milestone | Tested | To know |
|---|---|---|---|---|
| 7.1 | Plan | 3 | In the browser |  |
| 7.2 | Month | 3 | In the browser |  |
| 7.3 | An event | 3 | In the browser |  |
| 7.4 | Type it | 3 | In the browser | The reading of a sentence gets its own long list of test sentences. |
| 7.5 | Reminders | 3 | In the browser, phone part stood in | Reminders by place need a phone. |
| 7.6 | Goals | 3 | In the browser |  |
| 7.7 | A goal | 3 | In the browser |  |

**8 · Money**

| # | Screen | Milestone | Tested | To know |
|---|---|---|---|---|
| 8.1 | Money | 5 | In the browser |  |
| 8.2 | A bill | 5 | In the browser |  |
| 8.3 | Scan a bill | 5 | In the browser, phone part stood in | Camera and text reading on the phone; a picked picture here. |
| 8.4 | Sheets | 5 | In the browser |  |
| 8.5 | A sheet | 5 | In the browser |  |
| 8.6 | A row, as a card | 5 | In the browser |  |
| 8.7 | A formula you can read | 5 | In the browser, phone part stood in | “Ask in words” answers a set of known questions by rule. |
| 8.8 | Template: loan planner | 5 | In the browser | The loan sums are checked against worked examples. |
| 8.9 | Splitting with friends | 5 | In the browser |  |

**9 · Vault**

| # | Screen | Milestone | Tested | To know |
|---|---|---|---|---|
| 9.1 | The Vault, locked | 6 | In the browser, phone part stood in | Face ID on the phone; a passcode here. |
| 9.2 | The Vault | 6 | In the browser |  |
| 9.3 | A password | 6 | In the browser, phone part stood in | Copy and one-time codes are tested. Filling in for someone who can’t see it needs phone work that comes later. |
| 9.4 | Share a secret | 6 | In the browser | Tested as the person it is shared with. |
| 9.5 | If something happens | 6 | In the browser | The 48 hours are tested by moving the clock. |
| 9.6 | Your Vault key | 6 | In the browser |  |

**10 · With Journey**

| # | Screen | Milestone | Tested | To know |
|---|---|---|---|---|
| 10.1 | One account, two apps | 10 | On a real phone | Opening the other app needs both installed. |
| 10.2 | In Journey: keep it | 10 | In Journey | This button lives in Journey’s code. |
| 10.3 | What to keep | 10 | In the browser, phone part stood in | Against a stand-in for Journey until the real link is made. |
| 10.4 | A journey, kept as a book | 10 | In the browser, phone part stood in |  |
| 10.5 | Tell it as a journey | 10 | In the browser, phone part stood in |  |
| 10.6 | Before it leaves home | 10 | In the browser |  |
| 10.7 | A trip, start to finish | 10 | In the browser |  |
| 10.8 | Journey, at home | 10 | In the browser, phone part stood in |  |
| 10.9 | Goodnight from far away | 10 | In the browser, phone part stood in | Recording needs a phone; a clip is picked here. |

**11 · Activity**

| # | Screen | Milestone | Tested | To know |
|---|---|---|---|---|
| 11.1 | Activity | 9 | In the browser |  |
| 11.2 | Notifications | 9 | On a real phone | The wording and who gets what are tested in the API; the lock screen itself needs a phone. |
| 11.3 | The Sunday summary | 9 | In the browser | The email is written to a log until email is connected. |

**12 · You**

| # | Screen | Milestone | Tested | To know |
|---|---|---|---|---|
| 12.1 | You | 1 | In the browser |  |
| 12.2 | Storage and backup | 2 | In the browser, phone part stood in | “Free up space” needs a phone. |
| 12.3 | Privacy and security | 1 | In the browser, phone part stood in | Locking the app with Face ID needs a phone. |
| 12.4 | Export and leaving | 9 | In the browser | The export is opened and checked. |

**13 · States**

| # | Screen | Milestone | Tested | To know |
|---|---|---|---|---|
| 13.1 | Loading | 1 | In the browser |  |
| 13.2 | Offline | 4 | In the browser |  |
| 13.3 | A brand-new circle | 1 | In the browser |  |

**14 · Jot**

| # | Screen | Milestone | Tested | To know |
|---|---|---|---|---|
| 14.1 | Widgets on the Home Screen | 3 | On a real phone | Written here in each phone’s own language; first run on a phone build. |
| 14.2 | The jot bar | 3 | In the browser | Tested as a screen of the app. Floating over the Home Screen is Android-only and needs a phone. |
| 14.3 | A note pinned in notifications | 3 | On a real phone |  |
| 14.4 | It files itself | 3 | In the browser, phone part stood in | Filing, undo and holding back a code are tested through the API and the jot bar. |
| 14.5 | On the iPhone Lock Screen | 3 | On a real phone |  |
| 14.6 | Say it all at once | 3 | In the browser, phone part stood in | The splitting is tested with typed sentences; the microphone needs a phone. |
| 14.7 | Share into it | 3 | On a real phone | The reading of a letter is tested by picking the same file inside the app. |
| 14.8 | Every way in | 3 | In the browser |  |

**15 · Keepsakes**

| # | Screen | Milestone | Tested | To know |
|---|---|---|---|---|
| 15.1 | Open when… | 7 | In the browser |  |
| 15.2 | The birthday interview | 7 | In the browser, phone part stood in | Answers in her own voice need a phone. |
| 15.3 | Things they said | 7 | In the browser, phone part stood in | Voice clips need a phone. |
| 15.4 | Same spot, every year | 7 | In the browser, phone part stood in | The camera with last year’s photo over it needs a phone; here a photo is picked. |
| 15.5 | Grandma's stories | 7 | In the browser, phone part stood in | Her answer page is tested in a browser. Typing out her words needs a service; a stand-in here. |
| 15.6 | The good things jar | 7 | In the browser | Tested by moving the clock to New Year’s Eve. |
| 15.7 | The doorframe | 7 | In the browser |  |

**16 · Fair and fun**

| # | Screen | Milestone | Tested | To know |
|---|---|---|---|---|
| 16.1 | Whose turn? | 7 | In the browser |  |
| 16.2 | The piggy bank | 7 | In the browser |  |
| 16.3 | Secret missions | 7 | In the browser | Tested as the person a mission is for. |
| 16.4 | The Saturday jar | 7 | In the browser, phone part stood in | The weather comes from a stand-in until you choose a source. |
| 16.5 | Sleeps until… | 7 | In the browser | The widget needs a phone. |
| 16.6 | Where is it? | 7 | In the browser |  |
| 16.7 | Habit charts | 7 | In the browser |  |

**17 · For couples**

| # | Screen | Milestone | Tested | To know |
|---|---|---|---|---|
| 17.1 | Today, for two | 8 | In the browser |  |
| 17.2 | Templates for two | 8 | In the browser |  |
| 17.3 | Our story | 8 | In the browser |  |
| 17.4 | Tucked notes | 8 | In the browser, phone part stood in | “Some time this week” and a set time are built. “When he lands” and “when it rains” need a phone or a service. |
| 17.5 | The anniversary questions | 8 | In the browser | Tested as both people. |
| 17.6 | Mystery date | 8 | In the browser |  |
| 17.7 | Both said yes | 8 | In the browser | Tested as both people: neither sees the other’s answers. |
| 17.8 | The fair share | 8 | In the browser |  |

**18 · For housemates**

| # | Screen | Milestone | Tested | To know |
|---|---|---|---|---|
| 18.1 | Today, in a shared flat | 8 | In the browser |  |
| 18.2 | Templates for a flat | 8 | In the browser |  |
| 18.3 | The kitty | 8 | In the browser |  |
| 18.4 | A fairer split | 8 | In the browser | Tested as three people who must all agree. |
| 18.5 | Heads-up | 8 | In the browser |  |
| 18.6 | Heard in the kitchen | 8 | In the browser |  |
| 18.7 | The guest book | 8 | In the browser | The guest’s web page is tested. What a guest writes waits for a flatmate’s yes. |
| 18.8 | Everyone who's lived here | 8 | In the browser |  |

**19 · For friends**

| # | Screen | Milestone | Tested | To know |
|---|---|---|---|---|
| 19.1 | Today, with friends | 8 | In the browser |  |
| 19.2 | Templates for friends | 8 | In the browser |  |
| 19.3 | When can everyone? | 8 | In the browser | Also answered by link, as someone without the app. |
| 19.4 | Secret Santa | 8 | In the browser | Tested as five people: each sees one name. |
| 19.5 | Where next? | 8 | In the browser |  |
| 19.6 | The dictionary | 8 | In the browser |  |
| 19.7 | Predictions | 8 | In the browser |  |
| 19.8 | The awards | 8 | In the browser |  |
| 19.9 | A goal you walk together | 8 | In the browser, phone part stood in | A map on phones, a list in the browser. |
