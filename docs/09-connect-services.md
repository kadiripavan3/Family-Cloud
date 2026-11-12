# Go live: connect the real services

Everything in Homeport runs on one computer with stand-ins. This page is the list of what to do, account by account, to run it for real people. Homeport shares Journey's accounts (one Supabase project, one Cloudflare account, one Fly.io organisation), so most steps are "add Homeport to what Journey already has". Do them in this order; each step says what you create, which values to copy, where each value goes, and how to check it worked.

> **Status:** 12 Nov 2026. The code for every service below is written and tested against small fakes of those services. None of it has talked to the real service yet: the accounts are Journey's and I have no access to them from here. Nothing on this page was run against Supabase, Cloudflare, Fly.io, Apple, Google, Expo or Resend. Expect small fixes the first time each one is connected; tell me what you see.

**You don't need every account on day one.** Steps 1 to 4 give you a working app with real sign-in and real storage. Push notifications and email each have an "off" switch (the table in step 3), so the API runs without them and you add them one at a time.

**Before real families use it,** three things on this page are not settings but decisions, and they are yours: the outside review of the Vault ([its protocol](07-vault-protocol.md), "Open questions"), whether files should be reachable by anyone who holds their address (step 2), and the legal pages (privacy, terms), which are drafts.

## Where values go

There are four places. Each step below names one of them.

| Place | What it is for | How to set it |
|---|---|---|
| **Fly secrets** | What the API needs when it runs | `fly secrets set NAME=value` in `apps/api` |
| **App build settings** | What the app needs when it is built. Only values that are safe to be public: they end up inside the app. | `eas env:create` (or the project's page on expo.dev), for the `preview` and `production` profiles |
| **GitHub secrets** | What the deploy workflow needs | The repository's Settings, Secrets and variables, Actions |
| **Claude's cloud environment** | So I can test against the real service from a session | The environment's settings: the service's address on the network allowlist, and its key as a secret |

Never put a key in a file in the repository, in a chat, or in an app build setting unless this page says it is safe to be public.

## 1. Supabase: Journey's project, a schema of Homeport's own

The two apps share one Supabase project, so a person is the same person in both. Sign-in is already set up there for Journey (the 6-digit email code, the sender, Apple and Google); Homeport adds its tables and, in step 5, its own app identifiers.

1. **A schema and a database user for Homeport.** Each API signs in to the database as its own user and has no rights on the other's tables. In Supabase's SQL editor:

   ```sql
   create role homeport_api login password '<a long password from a password manager>';
   create schema homeport authorization homeport_api;
   -- So the API can find the email address an invitation or the Sunday summary goes to:
   grant usage on schema auth to homeport_api;
   grant select on auth.users to homeport_api;
   -- Where Supabase keeps extensions:
   grant usage on schema extensions to homeport_api;
   ```

   The API creates its own tables in that schema the first time it starts. Supabase's data API serves the `public` schema; `homeport` is not served, and Journey's settings already switch the data API off.
2. The database address is the project's direct connection (not the pooler), as for Journey:

   `jdbc:postgresql://db.<project-ref>.supabase.co:5432/postgres?sslmode=require`

3. Copy three values from the project's API settings, the same three Journey uses: the **project URL**, the **publishable (anon) key** and the **secret (service role) key**.

| Value | Where it goes | Name |
|---|---|---|
| Database address (above) | Fly secrets | `HOMEPORT_DB_URL` |
| `homeport_api` and its password | Fly secrets | `HOMEPORT_DB_USER`, `HOMEPORT_DB_PASSWORD` |
| The word `homeport` | Fly secrets | `HOMEPORT_DB_SCHEMA` |
| Project URL | Fly secrets | `SUPABASE_URL` |
| Secret key | Fly secrets | `SUPABASE_SERVICE_KEY` (used for one thing: removing the sign-in when someone deletes their account in both apps; see below) |
| Project URL | App build settings (safe to be public) | `EXPO_PUBLIC_SUPABASE_URL` |
| Publishable key | App build settings (safe to be public) | `EXPO_PUBLIC_SUPABASE_ANON_KEY` |

**Deleting an account, with one sign-in for two apps.** "Delete my account" in Homeport removes everything a person keeps in Homeport and leaves the sign-in alone, because Journey uses it too. Only when the person chooses "Journey too" does Homeport ask Supabase to remove the sign-in, and only if `HOMEPORT_REMOVE_SIGN_IN` is `true` (the default). Journey's own data is Journey's to delete: until the two APIs can tell each other (listed in [what Journey needs](10-journey-changes.md)), set `HOMEPORT_REMOVE_SIGN_IN=false` in `fly.toml`, and the app tells the person to finish in Journey.

The API opens every database connection with limits of its own (a statement is stopped after 5 seconds, a wait for a lock after 3), as Journey does. If the connection is ever refused because of them, set `HOMEPORT_DB_OPTIONS` to an empty value in `fly.toml` and tell me.

**Check:** after step 4, sign in to a `preview` build of Homeport with the address you use in Journey. The same code email arrives, and the app opens on your profile from Journey ("Continue as …"), then on setting up a circle.

## 2. Cloudflare R2: a bucket of Homeport's own

1. In Journey's Cloudflare account, create a second R2 bucket (for example `homeport-media`).
2. Give the bucket a public address on a domain you own (for example `files.yourdomain.com`), which also puts Cloudflare's CDN in front of it.
3. Create an R2 API token with read and write access to **that bucket only**. Copy the **access key id**, the **secret access key** and the account's **S3 endpoint**.
4. Add a CORS rule to the bucket so the web preview can upload: allow `PUT` from your own addresses. Phones don't need it.

| Value | Where it goes | Name |
|---|---|---|
| S3 endpoint | Fly secrets | `R2_ENDPOINT` |
| Bucket name | Fly secrets | `R2_BUCKET` |
| Access key id, secret access key | Fly secrets | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` |
| The bucket's public address, no slash at the end | Fly secrets | `R2_PUBLIC_URL` |

The phone sends each file straight to R2 with a link that is good for fifteen minutes and for that one file. A photo arrives in a folder called `incoming`; the API opens it, saves the photo it keeps (in three sizes) under `photos`, and deletes the upload. Videos, files and recordings stay as they arrive, under `videos`, `files` and `audio`.

Two rules to add to the bucket, as for Journey:

- **A lifecycle rule:** delete objects under the prefix `incoming/` one day after they were created.
- **A rule on the public address** (Security, WAF, Custom rules): block requests whose path starts with `/incoming/`.

**What this means for privacy, plainly.** A photo, a video or a scan is read from the bucket's public address. Nobody can list the bucket and every address has a long random part, and the app only gives an address to people who may see the thing. But **whoever holds an address can open that file without signing in**, for as long as the file exists: someone it was shared with and later un-shared from still can, if they kept the address. That is how Journey works too, and it is the normal trade for speed. Homeport keeps passports and bills, so this is a decision for you, not a default to inherit: the alternative is addresses that expire (the API signs a fresh one each time), which costs some speed and makes photos harder to cache. Tell me which you want before real documents go in. Passwords are not affected: the Vault is scrambled on the phone and never stored in R2 in a form the service can read.

**Check:** add a photo in the Library. It shows on the wall, and its address starts with your public address.

## 3. Fly.io: a second small server

1. In `apps/api` run `fly apps create <a name of your own>`. Put that name, and Journey's region, in `apps/api/fly.toml` (`app` and `primary_region`).
2. Set every secret from steps 1 and 2, and from the later steps as you do them, with `fly secrets set`. Also set `HOMEPORT_PUBLIC_URL` to the address people will reach the API at (first `https://<app>.fly.dev`, later your own domain): the links of a guest pass, an invitation and Grandma's story page are built from it.
3. Run `fly deploy --ha=false` from `apps/api`. (One machine: reminders, the Sunday summary and exports run inside the API.) The first start creates every table in the `homeport` schema. Check with `fly scale show` that there is one machine.
4. To deploy from GitHub from then on: create a deploy token (`fly tokens create deploy`) and add it to the repository's GitHub secrets as `FLY_API_TOKEN`. The **Deploy** workflow then runs whenever `main` changes. Until the secret exists it does nothing.

**Switch off what you haven't connected yet.** Each of these is a line in `fly.toml` under `[env]` (they are not secrets). Remove the line when you do that step.

| Line in `fly.toml` | What it does | Remove it in |
|---|---|---|
| `HOMEPORT_PUSH_MODE = "off"` | Nothing is pushed to phones; Activity in the app still shows everything | Step 6 |
| `HOMEPORT_EMAIL_MODE = "off"` | Invitations are shown as a link to send yourself, and the Sunday summary is shown in the app but not emailed | Step 7 |

A switch set to a word the API doesn't know stops it from starting, and the message says which words it takes.

**Check:** `https://<app>.fly.dev/actuator/health` answers `{"status":"UP"}`. `https://<app>.fly.dev/local-auth/token` answers "not found": the test sign-in does not exist there.

When it starts, the API checks that everything that is switched on has what it needs. If something is missing, the deploy fails and `fly logs` shows one list: "The API can't start yet. Set these: …", each with the step of this page it belongs to. A deploy that fails this way changes nothing: the version that was running keeps running. The API also refuses to start if a stand-in is switched on without the `local` profile.

## 4. The app on your iPhone, for real

1. In `apps/mobile`, run `eas init` once (your Expo account from Journey). It writes the project's id into `app.json`.
2. Set the app's build settings (the table in step 1, and `EXPO_PUBLIC_API_URL` = the API's address from step 3) for the `preview` and `production` profiles.
3. Change `app.homeport.dev` in `app.json` (`ios.bundleIdentifier`, `android.package`) to an identifier of your own before the first store build. It can't be changed afterwards. Jot's widgets share data with the app through an app group named after it (`group.<your identifier>.jot`), which `eas build` registers for you when it asks.
4. Build: `eas build --profile preview --platform ios` for a build you install from a link. `eas.json` has three profiles: `development` (your own phone: a build that loads the app from your Mac like Expo Go does, with the test sign-in, and can run what Expo Go can't), `preview` (testers, real sign-in) and `production` (the stores). Add `JOT_NATIVE=1` to a profile's settings to include Jot's widgets, Lock Screen and share sheet in that build; leave it out and the build is the app alone.

**The first build on a phone is a test in itself.** These have never run on a phone: Face ID for the Vault and how long its key takes to unlock, Jot's widgets and pinned note, the photo picker and camera, backing up in the background. `docs/06-build-plan.md` has the checklist.

## 5. Apple and Google sign-in

Both are already switched on in the Supabase project for Journey. Homeport is a second app using them, so each needs Homeport's identifier added:

- **Apple:** in the Apple Developer account, switch on "Sign in with Apple" for Homeport's app identifier, and group it with Journey's (the same primary App ID), so a person who signs in to both is one Apple account to both. In Supabase, Authentication, Providers, Apple, add Homeport's identifier to the client ids (they are separated by commas).
- **Google:** create an OAuth client id of type **iOS** for Homeport's identifier (and one of type Android later) in the same Google Cloud project, and add it to Supabase's list of allowed client ids. The Web client id is Journey's and stays.

| Value | Where it goes | Name |
|---|---|---|
| Web client id (Journey's) | App build settings (safe to be public) | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` |
| Homeport's iOS client id | App build settings (safe to be public) | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` |

Apple requires that deleting an account also ends the link between that person's Apple ID and the app. The API does that with a key of its own, as Journey's does: create a key with "Sign in with Apple" ticked for Homeport's identifier, then set `HOMEPORT_APPLE_MODE = "apple"` in `fly.toml` and the Fly secrets `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID` (Homeport's identifier) and `APPLE_PRIVATE_KEY` (the whole `.p8` file: `fly secrets set APPLE_PRIVATE_KEY="$(cat AuthKey_XXXXXXXXXX.p8)"`).

**Check:** each button signs you in. Someone who already uses Journey lands on "Continue as …" with their Journey name and picture.

## 6. Push notifications

Push needs a real build of the app (step 4).

1. **iPhone:** run `eas credentials`, choose iOS, and let it create a push key for Homeport's identifier (or say yes when the first `eas build` offers to).
2. **Android:** in the Firebase console, add an Android app with Homeport's package name to the project, download `google-services.json` and give it to the build as a **File** variable named `GOOGLE_SERVICES_JSON`; upload a service account key with `eas credentials` (Android, "Push Notifications: FCM V1").

Then remove `HOMEPORT_PUSH_MODE = "off"` from `fly.toml` and deploy. (`EXPO_ACCESS_TOKEN` as a Fly secret only if "enhanced security for push notifications" is on for the Expo project.)

What is pushed, and what never is, is written in one place: the comment on `notify/Outbox.java`. In short: what is due, what someone asks of you, and what was shared with you; never anything about a thing you can't see, never the words of a Vault item, and with "Hide details in notifications" on, only "A bill is due tomorrow".

**Check:** on a phone with a `preview` build, turn on notifications. From a second account in the same circle, ask to see a password, or give the first a reminder. The push arrives within a minute and opens the right screen.

## 7. Resend: email

Two kinds of email leave Homeport: an **invitation** to a circle, and the **Sunday summary** for people who asked for it by email. (Sign-in codes are Supabase's and already go through Journey's sender.)

| Value | Where it goes | Name |
|---|---|---|
| API key (Journey's Resend account; a key of Homeport's own is better) | Fly secrets | `RESEND_API_KEY` |
| The sender, such as `Homeport <hello@yourdomain.com>` | Fly secrets | `HOMEPORT_EMAIL_FROM` |

Then remove `HOMEPORT_EMAIL_MODE = "off"` from `fly.toml` and deploy.

**Check:** invite an address of yours to a circle: the email arrives with a link that opens the invitation.

## 8. Links that open the app

A guest pass (`/g/…`), an invitation (`/join/…`), Grandma's story page (`/s/…`), a flat's guest book (`/book/…`) and "When can everyone?" (`/when/…`) are web pages served by the API; the first two can open the app instead on phones that have it. That needs a domain of your own:

1. Point a subdomain (such as `home.yourdomain.com`) at the API: `fly certs add home.yourdomain.com` in `apps/api`, add the DNS record it shows, and set the Fly secret `HOMEPORT_PUBLIC_URL` to `https://home.yourdomain.com`.
2. Tell the API which app the links belong to:

| Value | Where it goes | Name |
|---|---|---|
| Apple team id, a dot, the app's identifier | Fly secrets | `HOMEPORT_IOS_APP_ID` |
| The Android package name | Fly secrets | `HOMEPORT_ANDROID_PACKAGE` |
| The SHA-256 fingerprints of the Android signing keys, separated by commas | Fly secrets | `HOMEPORT_ANDROID_FINGERPRINTS` |

3. Set `EXPO_PUBLIC_LINK_HOST` to `home.yourdomain.com` in the app build settings and make a new build.

Also set `HOMEPORT_CONTACT_EMAIL` (shown on the contact page). The privacy and terms pages the API serves (`/privacy`, `/terms`) are **drafts**: have them read by someone qualified before the stores.

**A guest pass that carries a door code** keeps the code scrambled; the key is the part of the link after `#`, which never reaches the server. Whoever has the whole link can read the code until the pass ends.

## 9. The link with Journey

Homeport's side of Keep, Tell and "On a journey" is built against a stand-in. What Journey's own API and app need before the real link can be switched on is in [docs/10-journey-changes.md](10-journey-changes.md). Those changes are made in the Journey repository, with your go-ahead.

**None of this was run against the real Journey.** The code that asks Journey's API (`HttpJourney`) is tested against a small fake that answers as Journey's description says. The first time the two real APIs talk, expect small fixes; tell me what you see.

The API runs without Journey until you say otherwise: with nothing set, the switch is `off`, every Journey part of the app is absent, and nothing is asked of Journey. To connect the two, once both APIs use the same Supabase project (step 1):

| Value | Where it goes | Name |
|---|---|---|
| The word `http` | `[env]` in `fly.toml` | `HOMEPORT_JOURNEY_MODE` |
| The address of Journey's API, no slash at the end (such as `https://api.yourjourney.com`) | `[env]` in `fly.toml` | `JOURNEY_API_URL` |
| How "Open in Journey" links start. Leave it unset: it is `journey://`, the scheme Journey's app answers to today. | `[env]` in `fly.toml` | `JOURNEY_OPEN` |

None of the three is a secret. Homeport has no key to Journey: it asks as the signed-in person, with that person's own sign-in, so Journey's rules decide every answer.

With `HOMEPORT_JOURNEY_MODE = "http"` and no `JOURNEY_API_URL`, the API doesn't start and the list in `fly logs` says so (step 3). To go back, remove the line (or set it to `off`) and deploy: what was kept from Journey stays in Homeport as ordinary pages and photos, and the Journey cards, "Keep" and "Tell" disappear from the app.

**Check:** in the app, "One account with Journey" on the You tab shows your Journey name, picture and counts. Keep one short journey: its book appears in Notes and its photos in the Library. If Journey can't be reached, Today still opens, without the Journey cards.

## 10. Sentry: what breaks

Off until its key is in the build. It is never sent a name, an email address, a title or anything a person wrote. (Homeport has no usage analytics: PostHog, which Journey uses, was left out on purpose for an app that holds a family's papers. Say so if you want it.)

| Value | Where it goes | Name |
|---|---|---|
| Sentry DSN (a project of Homeport's own) | App build settings (safe to be public) | `EXPO_PUBLIC_SENTRY_DSN` |
| Sentry organisation and project | App build settings | `SENTRY_ORG`, `SENTRY_PROJECT` |
| A Sentry auth token | App build settings, as a **secret** | `SENTRY_AUTH_TOKEN` |

In Sentry, Security & Privacy, switch on **Prevent storing of IP addresses**.

## Letting Claude test against the real services

When an account exists and you want me to check it from a session like this one, add the service's address to the cloud environment's network allowlist and its key as a secret there. The addresses are: the Supabase project's address, the R2 endpoint, `exp.host`, `api.resend.com` and the Fly app's address.

## Every setting, in one place

**The API (Fly secrets, or `[env]` in `fly.toml` for the ones that aren't secret)**

| Name | Step | Secret |
|---|---|---|
| `HOMEPORT_DB_URL`, `HOMEPORT_DB_USER`, `HOMEPORT_DB_PASSWORD` | 1 | yes |
| `HOMEPORT_DB_SCHEMA` (`homeport`) | 1 | no |
| `HOMEPORT_DB_OPTIONS`, `HOMEPORT_DB_CONNECTION_WAIT_MS`, `HOMEPORT_DB_POOL` (leave unset) | 1 | no |
| `SUPABASE_URL` | 1 | no |
| `SUPABASE_SERVICE_KEY` | 1 | yes |
| `SUPABASE_JWT_SECRET` (older projects only) | 1 | yes |
| `HOMEPORT_REMOVE_SIGN_IN` (`false` while Journey removes the shared sign-in itself) | 1 | no |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_PUBLIC_URL` | 2 | no |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | 2 | yes |
| `HOMEPORT_PUBLIC_URL` | 3, 8 | no |
| `HOMEPORT_AUTH_MODE`, `HOMEPORT_MEDIA_MODE`, `HOMEPORT_FORWARD_HEADERS`, `HOMEPORT_CLIENT_ADDRESS_HEADER` | already in `fly.toml` | no |
| `HOMEPORT_PUSH_MODE`, `HOMEPORT_EMAIL_MODE` (`off` until connected) | 3 | no |
| `HOMEPORT_APPLE_MODE` (`apple` once the key is there) | 5 | no |
| `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID`, `APPLE_PRIVATE_KEY` | 5 | yes |
| `EXPO_ACCESS_TOKEN` (only with enhanced push security) | 6 | yes |
| `RESEND_API_KEY` | 7 | yes |
| `HOMEPORT_EMAIL_FROM` | 7 | no |
| `HOMEPORT_CONTACT_EMAIL` | 8 | no |
| `HOMEPORT_IOS_APP_ID`, `HOMEPORT_ANDROID_PACKAGE`, `HOMEPORT_ANDROID_FINGERPRINTS` | 8 | no |
| `HOMEPORT_JOURNEY_MODE` (`http` once Journey is ready; unset or `off` until then) | 9 | no |
| `JOURNEY_API_URL` (needed with `http`) | 9 | no |
| `JOURNEY_OPEN` (leave unset: `journey://`) | 9 | no |
| `HOMEPORT_EXPORT_MAX_BYTES` (how much one export may hold; 2 GB unless set) | | no |

**The app (build settings: environment variables of the Expo project. All but one end up inside the app, so they may not be secrets)**

| Name | Step |
|---|---|
| `EXPO_PUBLIC_API_URL` | 4 |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | 1 |
| `JOT_NATIVE` (`1` to build Jot's widgets and share sheet in) | 4 |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | 5 |
| `GOOGLE_SERVICES_JSON` (a file; Android notifications) | 6 |
| `EXPO_PUBLIC_LINK_HOST` | 8 |
| `EXPO_PUBLIC_SENTRY_DSN` | 10 |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (the token is the one secret here) | 10 |

**GitHub secrets:** `FLY_API_TOKEN` (step 3).
