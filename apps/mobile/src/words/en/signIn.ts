/** Before someone is signed in: welcome, how it works, and signing in with Apple, Google or an emailed code. */
import { mark } from '../rich';
import { common } from './common';
import { JOURNEY } from './names';

const { places } = common;

export const signIn = {
  // 1.1 Welcome
  welcome: {
    /** The chip above the title. "bold" marks the other app's name. */
    oneAccount: ['One account with ', mark('bold', JOURNEY)],
    title: 'Everything your people keep, together.',
    body: 'Notes, photos, plans, money and passwords. Yours alone until you share them.',
    start: 'Get started',
    haveAccount: 'I already have an account',
    /** "terms" and "privacy" mark the two links. */
    agree: ['By continuing you agree to the ', mark('terms', 'Terms'), ' and ', mark('privacy', 'Privacy Policy'), '.'],
  },

  // 1.2 How it works: three cards, each a picture, a title and a sentence or two
  howItWorks: {
    oneHome: {
      /** The labels on the three example photos. */
      cards: { doorCode: 'Front door code', recipe: "Grandma's cookies", album: 'Saturday at the lake' },
      /** The made-up circle under the photos. "bold" marks its name. */
      circle: [mark('bold', 'The Linds'), ' · 4 people'],
      /** What a screen reader says for the picture as a whole. */
      picture: "Three things in one pile: an album called Saturday at the lake, a recipe called Grandma's cookies and the front door code, shared by The Linds, 4 people.",
      title: 'One home for what you share',
      body: 'Photos, notes, bills and passwords for your family or your friends. Each one is yours alone until you choose who sees it.',
    },
    youChoose: {
      /** Who can see each of the three example things. */
      cards: { onlyYou: 'Only you', two: 'Alex and you', everyone: 'The Linds' },
      picture: 'Three things, each with a label saying who can see it: only you, Alex and you, and The Linds.',
      title: 'Shared with exactly who you choose',
      body: 'A small label on every page, photo, bill and password says who can see it. One tap changes that, and a surprise can stay hidden from one person.',
    },
    sixPlaces: {
      /** What a screen reader says for the picture: the six places, in the order of Home's top row. */
      picture: `The six places: ${Object.values(places).join(', ')}.`,
      title: 'Six places, one tap apart',
      body: `${places.today}, ${places.plan}, ${places.notes}, ${places.library}, ${places.money} and the ${places.vault}. Everything has a place, so anyone in your circle can find it.`,
    },
  },

  // 1.3 Log in or sign up
  choose: {
    title: 'Log in or sign up',
    body: `Your ${JOURNEY} account works here too.`,
    /** The row offered when the other app is signed in on this phone. */
    journeyAccount: `Your ${JOURNEY} account`,
    continueAs: (name: string) => `Continue as ${name}`,
    orAnother: 'or use another account',
    apple: 'Continue with Apple',
    google: 'Continue with Google',
    email: 'Continue with email',
    /** `name` is "Apple" or "Google" (`providers` below). */
    later: (name: string) => `${name} sign-in is switched on later. Use your email for now.`,
    notOnThisPhone: (name: string) => `${name} sign-in isn't available on this phone. Use your email.`,
    /** "terms" and "privacy" mark the two links. */
    agree: ['By continuing you agree to the ', mark('terms', 'Terms'), ' and ', mark('privacy', 'Privacy Policy'), ", and confirm you're 13 or older."],
  },

  // 1.4 Email
  email: {
    title: "What's your email?",
    body: "We'll send a 6-digit code to sign you in. No password needed.",
    field: 'Email',
    send: 'Send code',
  },

  // 1.5 Email code
  code: {
    title: 'Check your email',
    /** "email" marks the address, drawn in bold. */
    sentTo: (email: string) => ['Enter the code we sent to ', mark('email', email), '.'],
    sending: 'Sending…',
    sentAgain: 'Code sent again',
    sendAgain: 'Send the code again',
    testMode: (code: string) => `Test mode: no email is sent. The code is ${code}.`,
  },

  /** What each way of signing in is called. */
  providers: { apple: 'Apple', google: 'Google' },

  // What the app says when signing in itself didn't work
  problems: {
    notSetUp: "Sign-in isn't set up in this build yet.",
    failed: "That didn't sign you in. Try again.",
    appleFailed: "Apple didn't sign you in. Try again, or use your email.",
    googleNeedsApp: 'Google sign-in needs the installed app. Use your email for now.',
    googleFailed: "Google didn't sign you in. Try again, or use your email.",
    wrongCode: "That code isn't right, or it has run out. Check it or ask for a new one.",
    tooManyCodes: "That's a lot of codes. Wait a minute and try again.",
    badEmail: "That email doesn't look right.",
    didntWork: "That didn't work. Try again in a moment.",
  },
} as const;
