/**
 * The two names this catalog's sentences use. The app's own is one setting in design/tokens.json, so no
 * sentence spells it out: a new name is a change there, not here.
 */
import { brand } from '@/theme/tokens';

/** What this app is called. */
export const APP: string = brand.name;

/** The sister app. The account, the look and the bottom bar are shared with it. */
export const JOURNEY = 'Journey';
