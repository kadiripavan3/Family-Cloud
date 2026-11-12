/**
 * What this build of the app was given, for the parts that need something from outside (`app.config.ts`).
 */

/**
 * The address shared links are served from when they can open the app ("go.example.com"), from the build
 * setting `EXPO_PUBLIC_LINK_HOST`; null in a build that claims no address.
 */
export const linkHost: string | null =
  (process.env.EXPO_PUBLIC_LINK_HOST ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase() || null;
