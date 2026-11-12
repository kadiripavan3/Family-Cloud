/**
 * The two choices under "This phone" on Privacy and security that are remembered on the phone for each
 * account. (The third, hiding details in notifications, is the account's own setting and lives in the API.)
 */
export type PhoneSecurity = { faceId: boolean; lockAfterMinutes: number };

/** As the page starts: Face ID on, the Vault locks after two minutes. */
export const PHONE_SECURITY: PhoneSecurity = { faceId: true, lockAfterMinutes: 2 };

/** How long the Vault can stay open, to choose from. */
export const LOCK_AFTER_MINUTES = [1, 2, 5, 15] as const;

export const phoneSecurityKey = (account: string | undefined) => `homeport.security.${account ?? 'nobody'}`;
