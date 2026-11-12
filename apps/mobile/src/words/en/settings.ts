/** The pages behind the rows on You. */
import { APP } from './names';

export const settings = {
  // Delete account
  deleteAccount: {
    title: 'Delete your account?',
    lead: `This can't be undone. Your profile and everything you keep in ${APP} are removed for good.`,
    confirm: 'Delete my account',
    keep: 'Keep my account',
  },

  // Notifications
  notificationsPage: {
    title: 'Notifications',
    tellMeAbout: 'Tell me about',
    activity: { label: 'What happens in your circles', note: 'What was added, what is due and who is asking' },
    onceAWeek: 'Once a week',
    summary: { label: 'The Sunday summary', note: 'Your week on one page' },
    summaryEmail: 'Also send it by email',
  },

  // Appearance
  appearancePage: {
    title: 'Appearance',
    theme: 'Theme',
    choices: {
      system: { label: 'Automatic', note: 'Follows your phone' },
      light: { label: 'Light', note: 'Always light' },
      dark: { label: 'Dark', note: 'Always dark' },
    },
  },
} as const;
