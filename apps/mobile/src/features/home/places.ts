import type { Href } from 'expo-router';

import type { CircleResponse } from '@/api/generated/homeport';
import { isYoung } from '@/features/circles/members';

/** The six places things live, in the order of Home's top row. Home opens on Today. */
export const HOME_PLACES = ['today', 'plan', 'notes', 'library', 'money', 'vault'] as const;
export type HomePlace = (typeof HOME_PLACES)[number];

/** Each place's emoji in the top row (drawn as its 3D icon). */
export const PLACE_EMOJI: Record<HomePlace, string> = { today: '🏡', plan: '📅', notes: '📓', library: '📷', money: '💰', vault: '🔐' };

export function isHomePlace(value: unknown): value is HomePlace {
  return typeof value === 'string' && (HOME_PLACES as readonly string[]).includes(value);
}

/** The place an address asks for ("/?place=money"), or Today when it names none or one that doesn't exist. */
export function placeFrom(param: string | string[] | undefined): HomePlace {
  const value = Array.isArray(param) ? param[0] : param;
  return isHomePlace(value) ? value : 'today';
}

/** The address of Home on one of its places, for a link or a button anywhere in the app: `router.navigate(placeHref('money'))`. */
export function placeHref(place: HomePlace): Href {
  return place === 'today' ? '/' : { pathname: '/', params: { place } };
}

/**
 * True when a place is shut for the signed-in person in this circle: Money and the Vault for a teen or a
 * child. The tab is still drawn, and says so; the API refuses as well.
 */
export function isShut(circle: CircleResponse, place: HomePlace): boolean {
  return isYoung(circle) && (place === 'money' || place === 'vault');
}

/** Room to leave under the last thing a tab shows, so the floating tab bar doesn't cover it. */
export const TAB_BAR_ROOM = 130;
