/** What a person asked to bring in while setting up, remembered on the phone for their account until each part is built and can do it. */
export type BringIn = { photos: boolean; journey: boolean; calendars: boolean };

export const NOTHING_YET: BringIn = { photos: false, journey: false, calendars: false };

export const bringInKey = (account: string | undefined) => `homeport.bringIn.${account ?? 'nobody'}`;
