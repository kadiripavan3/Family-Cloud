# Jot outside the app: the native parts

Jot is "adding things without opening the app". Half of it is the app's own screens (`src/app/(app)/jot`), which run and are tested in the browser. The other half lives outside the app, on the Home Screen, the Lock Screen and in the notifications, and can only be written in each phone's own language. **That half is in this folder. It was written without a Mac, without Android Studio and without a phone, and has never been compiled or run.** This page says what each piece is, how to make a build with it, the order to try the pieces in, what to look for, and what will probably need fixing.

## What has run, and what hasn't

| Piece | Where | What has run |
|---|---|---|
| The pinned note: what it says, what is posted when, how an answer becomes a jot | `src/features/jot/pinned/note.ts` | Unit tests. Pure code, nothing of the phone in it. |
| The pinned note: asking `expo-notifications` to post it, the background task, jotting the answer | `src/features/jot/pinned/service.ts`, `early.ts`, `apps/mobile/index.ts` | Unit tests with the notifications library replaced by a stand-in: they show what the app asks of the library, not what a phone does with it. Never on a phone. |
| The file the widgets read, and Android's "do it unseen" task | `src/features/jot/outside.ts` | The shape of the file, in a unit test. Writing it: never. |
| The config plugins | `plugins/withJotIos.js`, `plugins/withJotAndroid.js`, `plugins/jotNames.js` | Their pure parts in a unit test. `expo prebuild` once, on a throwaway copy outside the repository: the Xcode project got the extension's target and reads back, the Android manifest got its entries. Nothing was compiled. |
| The iPhone's widgets, Lock Screen widgets, Live Activity | `ios/` (13 files) | Nothing. Not even the Swift compiler has seen them. |
| Android's widgets, tile, long press | `android/` (5 Kotlin files, 17 resource files) | Nothing, except that every XML file was checked to be well-formed. |

Without the build setting `JOT_NATIVE=1` none of the plugins is listed (`app.config.ts`), so Expo Go, the browser, the tests and every ordinary build are exactly as before. The pinned note is the exception: it is plain JavaScript on `expo-notifications`, so it is in every phone build, behind `pushSupport()`.

## What each piece is

**iPhone** (`ios/`). A WidgetKit extension in SwiftUI, iOS 17 or later.

| File | What it is |
|---|---|
| `Shared/JotShared.swift` | The file with what to show (`jot-widgets.json` in the App Group's folder) and the sign-in for the widgets' buttons (a keychain item shared through the same group). The app writes both; the widgets read. |
| `Shared/JotApi.swift` | The four calls the widgets make themselves: add a line, tick a line, say a list is in use, say it no longer is. |
| `Shared/JotIntents.swift` | What the buttons do (`AppIntent`): `AddChipIntent`, `TickLineIntent`, `StartListIntent`, `StopListIntent`. |
| `Shared/ListAttributes.swift` | The list in use as a Live Activity: starting, updating, ending it. Eight hours at most. |
| `JotWidgets/JotTimeline.swift` | Where every widget gets what it shows, and the row with a circle that ticks. |
| `JotWidgets/JotWidget.swift` | The wide widget: the line (opens the jot bar), the mic (opens voice), four chips that add in one tap. |
| `JotWidgets/ListWidget.swift` | The shopping list with three lines to tick, and "At the shop". |
| `JotWidgets/TodayWidget.swift` | What is next today. |
| `JotWidgets/LockWidgets.swift` | The three round widgets under the Lock Screen's clock: add, mic, how many to buy. |
| `JotWidgets/ListLiveActivity.swift` | How the list in use looks on the Lock Screen and in the Dynamic Island. |
| `JotWidgets/JotBundle.swift` | The list of all seven, for the phone. |
| `JotWidgets/Info.plist`, `JotWidgets.entitlements` | The extension's own papers. The plugin writes the App Group's name into them. |

The four files in `Shared` are compiled into the app as well: the two intents that start and stop the Live Activity run inside the app.

**Android** (`android/`). Plain Android widgets (`RemoteViews`), so nothing is added to the Gradle build.

| File | What it is |
|---|---|
| `java/JotSnapshot.kt` | Reads the file the app wrote (`jot-widgets.json` in the app's own files). |
| `java/JotWidgets.kt` | The three widgets. Each draws itself from the file. |
| `java/JotActionReceiver.kt`, `java/JotActionService.kt` | A chip or a circle was pressed: the app's own JavaScript is started unseen and does the work (`widgetAction` in `outside.ts`), then the widgets are drawn again. No copy of the sign-in is kept for the widgets. |
| `java/JotTileService.kt` | The "Jot" tile in quick settings: opens the jot bar. |
| `res/xml/jot_shortcuts.xml` | A long press on the icon offers "Jot": opens the jot bar. |
| `res/layout`, `res/drawable`, `res/values`, `res/values-night` | How the widgets look, in light and dark, with the app's colours. |

**In the app** (`src/features/jot`). `outside.ts` writes the file each time the app comes to the front and, on an iPhone, leaves a copy of the sign-in in the shared keychain. `pinned/` is the pinned note. `apps/mobile/index.ts` is the app's entry: it names the note's background task before any screen exists.

**Not written yet**, on purpose:

- **The floating bar on Android** (design 14.2: the bar over the Home Screen, with the app never showing). It needs the "display over other apps" permission and an overlay window of its own. Until then the widget's line opens the app straight onto the jot bar, as on an iPhone. It is the next step after the widgets work.
- **The share extension** (design 14.7) and **the microphone** (14.6). Their screens are built and take the words from `handIn(...)` in `src/features/jot/handedIn.ts`; the native side that calls it (an iOS Share Extension and an Android `ACTION_SEND` filter; speech recognition) is not written. In the browser a pasted letter and a typed sentence stand in.
- **Starting the Live Activity from the app's own button.** "Use this list on the Lock Screen" in the app tells the API. The Live Activity itself is started from the list widget's "At the shop" button. Starting it from inside the app needs a small native module that calls `ListActivity.start`.
- **"Widgets: 3 added"** on the Ways in screen needs the phone to say how many widgets are placed. The row says "See them" until then.

## Making the build

Nothing here can be tried in Expo Go or in the browser. It needs a development build.

1. An Apple developer team that may sign an App Group, and EAS set up for the app (docs: "phone build").
2. Set the build setting `JOT_NATIVE=1` for the build (EAS: the project's environment variables, or `env` of the build profile in `eas.json`).
3. `eas build --profile development --platform ios` (and `android`). EAS runs `expo prebuild`, and the two plugins add the extension, the App Group and the manifest entries. To look at what they make first: copy `apps/mobile` somewhere outside the repository and run `JOT_NATIVE=1 npx expo prebuild --no-install` there. Don't run prebuild in the repository: it leaves `ios/` and `android/` behind.
4. Expect the first iPhone build to stop in the Swift compiler (see "What will probably need fixing"). Fix the file under `native/jot/ios`, not the copy in `ios/`.

The names all follow from the app's ids (`plugins/jotNames.js`): the extension is `app.homeport.dev.JotWidgets`, the App Group `group.app.homeport.dev.jot`. Change the bundle id and they follow.

## The order to try them in, and what to look for

Sign in as someone with a shopping list (locally: `nora@example.com`). Each step builds on the one before.

**0. The pinned note** (any phone build; it doesn't need `JOT_NATIVE`). In the app open `/jot/pinned` (Ways in, Pinned note) and switch it on.
- The phone asks about notifications once. After a yes, a notification "Jot it down" appears.
- Android: it sits in the shade and can't be swiped away on Android 13 and earlier. It shows "pinned · The Linds" beside the app's name and today's lines. Its first button "Type" opens a line to type in, inside the notification.
- iPhone: press and hold it: "Type" and up to three chips appear.
- Type "milk" and send. Within a few seconds the note is replaced by one that says "Added: Milk" (Android: as its title; iPhone: at the start of its text), and Milk is on the list. Look in the app: What was filed shows it.
- Now swipe the app away (closed, not just in the background) and do it again. **This is the part most likely to fail** (see below).
- Tap the note itself: the app opens on the jot bar.
- Android 14: swipe the note away, then open the app: the note is back.
- Next morning at 7: it is there again.

**1. The shared file.** Open the app once, put it away. iPhone: nothing to see yet; if step 2 shows the sample ("Milk, Eggs, Bread, Coffee" and a list of three) instead of your own, the file isn't being written or read. Android: `adb shell run-as app.homeport.dev cat files/jot-widgets.json` shows it.

**2. The widgets show up.** Add them from the Home Screen's widget gallery: "Jot" (wide), "A list with ticks", "Today". They show your circle's name, your chips, your list's first three lines and how many are left, and what is next today.

**3. A chip that adds.** Tap a chip. Nothing opens. The list's widget counts one more within a second or two, and the app's What was filed shows the line with "widget" as where it came from (`source` in the API).

**4. A line that ticks.** Tap a circle on the list's widget. It fills, the line is struck through, the count drops. Open the list in the app: the line is ticked there.

**5. The list on the Lock Screen** (iPhone). On the list's widget tap "At the shop". Lock the phone: the list is on the Lock Screen with its lines; a circle ticks from there. On another phone in the same circle, the app's `/jot/lock` says "… is at the shop". The x ends it; so do eight hours.

**6. Under the clock** (iPhone). Customise the Lock Screen and add the three round widgets: plus opens the jot bar, the mic opens voice, the number is what is left to buy.

**7. The tile and the long press** (Android). Edit the quick settings and add "Jot": tapping it from any screen opens the jot bar. Long-press the app's icon: "Jot" is offered and does the same.

**8. Signed out.** Sign out of the app. The pinned note goes. The widgets' file and (iPhone) their copy of the sign-in are removed, so the wide widget says "Open the app once to fill this in" and the list's widget has no list; on an iPhone that shows within fifteen minutes, on Android when the widgets are next drawn. Sign in again and open Ways in: the note is back without being asked for, if the account still has it switched on.

## What will probably need fixing on the first build

Listed with the most likely first.

1. **Swift that doesn't compile.** Thirteen files nobody has compiled. Likely places: the `@Parameter`s of the intents (their initialisers), `ActivityContent` and `Activity.request` (their exact spelling changed between iOS 16 and 17), `Button(intent:)` inside `ForEach`, and `containerBackground`. These are spelling, not design.
2. **An answer to the note while the app is closed, on Android.** `expo-notifications` says its background task runs for a notification's button when the app is closed, through `expo-task-manager`. Whether typed text arrives there, and whether the app's entry (`index.ts`) has named the task in time, has to be seen. If the task doesn't run: the note still works while the app is in the background. If it runs twice (the listener and the task both hear it while the app is alive), `answerPinnedNote` jots it once; check that it does.
3. **The note's buttons on Android.** The library's own notes call `categoryIdentifier` iPhone-only in one place and both phones in another. If the note has no "Type" button on Android, this is why, and the note needs a native notification of its own (a `RemoteInput`), which is small.
4. **The sign-in the iPhone's widgets use runs out.** The app leaves its current token in the shared keychain when it comes to the front. With the real sign-in service a token lasts about an hour, so a chip tapped later is refused (401) and does nothing. Two ways out: the API hands out a narrow, long-lived token just for "add a line" and "tick a line" (an API change), or the widgets get the renewal token and renew themselves. Until one is built, the widgets work for an hour after the app was last open. Android doesn't have this problem (the app's own code does the work), and neither does the pinned note.
5. **Reading the keychain item.** `JotShared.token()` reads what `expo-secure-store` wrote, by its account and its group, without naming its "service". If it reads nothing, compare with how that library builds its query.
6. **Android: starting the service from a widget.** A press on a widget lets an app start a service for a few seconds even when it is closed; Android has tightened this more than once. If `JotActionReceiver` throws "not allowed to start service", hand the work to WorkManager as expedited work instead.
7. **Android: the app's code unseen.** `JotActionService` relies on React Native's headless tasks under the new architecture, and on `index.ts` having named `JotWidgetAction`. If nothing happens on a chip, look in `adb logcat` for the task's name.
8. **The widgets are up to fifteen minutes behind** what someone else ticked, on an iPhone (they are drawn again every quarter of an hour, and when one of their own buttons is pressed); on Android, half an hour. The app can't yet tell them "draw again now": that needs the same small native module as starting the Live Activity.
9. **Two notes in the morning on an iPhone.** The morning's note has a name of its own there, so yesterday's "Added: …" note may still be showing next to it until the next add. If that happens, the morning's note should clear the other when it arrives.
10. **Signing the App Group on EAS.** The plugin declares the extension for EAS (`extra.eas.build.experimental.ios.appExtensions`). If the build stops at signing, create the App Group and the extension's id in the Apple developer account by hand once.
11. **Which circle.** The widgets show the circle the pinned note was switched on for, else the circle last looked at in the app. Someone in three circles can't yet pick one per widget.

## Libraries, checked on 12 November 2026

- **Added: `expo-task-manager` ~58.0.13** (58.0.14 installed). MIT. It is the version Expo SDK 58's own list names (`node_modules/expo/bundledNativeModules.json`), and both versions are on npm. Needed for the note's background task; nothing else uses it.
- **Not added, and looked at: `expo-widgets`** (58.0.27 in SDK 58's list, MIT, on npm). It could replace the hand-written iPhone extension and its plugin. It wasn't tried, and the task asked for SwiftUI files that can be read and changed by hand; worth a look before putting more work into `withJotIos.js`.
- Nothing else was added. The plugins use `expo/config-plugins`, which Expo already brings.
