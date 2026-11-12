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

## What is built

The foundation: welcome, how it works, signing in (the test sign-in takes any email and the code 123456), creating a profile, the four tabs and the + button, and on You: notifications, appearance, logging out and deleting the account. Home, People, Activity, the + sheet and setting up a circle are stand-ins (`features/states/NotBuiltYet`) until they are built from their designs.

## The API's description

`src/api/generated/homeport.ts` is made from `../api/openapi.json`, the API's own description, with `npm run api:generate`. A list that comes in pages gets a hook that loads page after page: name its operation in `PAGED` in `orval.config.ts`. To try the app against another description, name it: `OPENAPI=some.json npm run api:generate`.

The foundation itself uses only these calls: the test sign-in (`/local-auth/code`, `/local-auth/token`), `/v1/me`, `/v1/me/profile`, `/v1/me/settings`, `/v1/me/devices`, `/v1/me/apple-sign-in` and the two steps of an upload (`/v1/media/uploads`, `/v1/media/uploads/{id}/complete`).

## Links that open the app

A shared link is a web page served by the API that also works without the app. One kind is planned so far: an invitation to a circle, `https://<host>/join/<code>`.

The app already knows what to do with such a link: `src/app/+native-intent.ts` turns it into the screen with the same address (`src/lib/links.ts`), and a link that arrives before the person has signed in is remembered and opened once they are in. The screen itself (`/join/[code]`) is built with circles. The app's own scheme is `homeport://` (`scheme` in `app.json`).

For a tap on the web address itself to open the app, a build claims the address with the build setting `EXPO_PUBLIC_LINK_HOST` (`app.config.ts`), and the API serves the two files Apple and Google look for (`/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`). That is set up with the store builds.
