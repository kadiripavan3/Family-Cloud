/** Loading, offline, and what the app itself says when something didn't work. (The API's own sentences are shown as they are.) */
import { APP } from './names';

export const states = {
  loading: 'Loading',
  loadingMore: 'Loading more',

  offline: {
    title: "You're offline",
    body: "This hasn't been loaded on this phone yet. It shows up by itself when you're back online.",
  },

  // A part of a page, or a whole page, that couldn't be fetched
  problem: {
    title: "That didn't load",
    pageTitle: "We couldn't open this",
    /** The page's title when the thing isn't there: deleted, or no longer shared with this person. */
    gone: "This isn't available",
  },

  // The strip across the top of the app while there is no connection
  strip: {
    /** After "You're offline" (`offline.title` above). */
    offlineRest: "Showing what's saved on this phone",
    /** For a few seconds after a change couldn't be sent. */
    notSent: { headline: "That didn't go through", rest: "Try again when you're back online" },
    spoken: (headline: string, rest: string) => `${headline}. ${rest}.`,
  },

  // Signed in, but the app can't open: nothing is known about the person and the API can't be asked
  cantOpen: {
    unreachable: { title: `We can't reach ${APP}`, body: "Check your connection and try again. You're still signed in." },
    /** Under "You're offline" (`offline.title` above). */
    offline: `${APP} opens as soon as you're back online. You're still signed in.`,
  },

  // An address the app has no screen for
  notFound: {
    title: "There's nothing at this address",
    body: `The link may be old, or made for a newer ${APP}.`,
    bodySignedIn: `The link may be old, or made for a newer ${APP}. Everything you keep is on Home.`,
    goToStart: 'Go to the start',
  },

  // A screen that broke
  broken: {
    title: 'Something went wrong',
    body: `That's on us, not you. Try again. If it keeps happening, close ${APP} and open it again.`,
  },

  // A part of the app that is still to come
  notBuilt: `This part of ${APP} isn't built yet. It's on its way.`,

  // Requests the API never answered, or answered without a sentence
  unreachable: `Can't reach ${APP} right now. Check your connection and try again.`,
  tooSlow: `${APP} is taking too long to answer. Check your connection and try again.`,
  onOurSide: 'Something went wrong on our side. Try again.',
  unknown: 'Something went wrong. Try again.',
} as const;
