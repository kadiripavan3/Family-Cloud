import type { Href } from 'expo-router';

import { linkHost } from './build';

/**
 * Shared links are web addresses (homeport.app/join/…) that also work for people without the app. When one
 * opens the app instead, this says which screen it is about. One so far: an invitation to a circle, whose
 * screen has the same address in the app. A new kind of shared page gets a line here and in `app.config.ts`.
 */
const SCREENS: Record<string, string> = { join: 'join' };
const SHARED = new RegExp(`^/(${Object.keys(SCREENS).join('|')})/([^/?#]+)`);
const IN_APP = new RegExp(`^/(${Object.values(SCREENS).join('|')})/[^/?#]+`);

/**
 * Screens the phone's own parts open with the app's own scheme (`homeport://jot`): the jot bar, from a
 * widget's line, a quick-settings tile or a long press on the icon; voice, from "Hey Siri, jot…"; and the
 * share screen, from another app's share button. They are not web pages, so `screenFor` leaves them as they
 * come and the router opens them; they are listed here so one that arrives before the person has signed in
 * is remembered like an invitation, and opened once they are in.
 */
const OWN = /^\/jot(\/(voice|share))?\/?([?#].*)?$/;

/**
 * The screen for a link that opened the app: "https://homeport.app/join/the-linds" becomes "/join/the-linds".
 * Anything that isn't one of the shared pages is handed back as it came.
 *
 * `host` is the address this build answers to (the build setting `EXPO_PUBLIC_LINK_HOST`). With one, a web
 * address is only taken when it comes from there; a build that claims no address takes them from anywhere.
 */
export function screenFor(link: string, host: string | null = linkHost): string {
  const web = /^https?:\/\/([^/?#]+)(.*)$/i.exec(link);
  if (web && host && web[1]!.toLowerCase() !== host) return link;
  const path = web ? web[2]! : link;
  const match = SHARED.exec(path);
  if (!match) return link;
  return `/${SCREENS[match[1]!]}/${match[2]}`;
}

/** True for a link to something inside the app that needs a signed-in person. */
function isAppScreen(path: string): boolean {
  return IN_APP.test(path) || OWN.test(path);
}

const KEEP_FOR = 30 * 60 * 1000;
let waiting: { path: string; at: number } | null = null;
/** True while someone is known to be signed in: the router opens their links itself, there is nothing to remember. */
let signedIn = false;

/** The session says whether someone is signed in. */
export function linksKnowSession(isSignedIn: boolean): void {
  signedIn = isSignedIn;
}

/**
 * Remembers the screen a link asked for, for someone who still has to sign in or sign up: an invitation
 * opened before they have an account would otherwise be lost on the way through sign-up. It is opened once
 * they are in. For someone who is signed in already nothing is remembered: the link has just been opened.
 */
export function rememberLink(path: string, now = Date.now()): void {
  if (!signedIn && isAppScreen(path)) waiting = { path: path.replace(/[?#].*$/, '').replace(/(.)\/$/, '$1'), at: now };
}

/** The remembered screen, handed over once. Null when there is none or it has been waiting too long to still be meant. */
export function takeLink(now = Date.now()): Href | null {
  const link = waiting;
  waiting = null;
  return link && now - link.at < KEEP_FOR ? (link.path as Href) : null;
}
