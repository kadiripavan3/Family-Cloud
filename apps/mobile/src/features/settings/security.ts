/** The three choices under "This phone" on Privacy and security, remembered on the phone for each account. */
export type PhoneSecurity = { faceId: boolean; lockAfterMinutes: number; hideDetails: boolean };

/** As the page starts: Face ID on, the Vault locks after two minutes, notifications say little. */
export const PHONE_SECURITY: PhoneSecurity = { faceId: true, lockAfterMinutes: 2, hideDetails: true };

/** How long the Vault can stay open, to choose from. */
export const LOCK_AFTER_MINUTES = [1, 2, 5, 15] as const;

export const phoneSecurityKey = (account: string | undefined) => `homeport.security.${account ?? 'nobody'}`;
