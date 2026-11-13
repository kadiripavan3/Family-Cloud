/** The pages behind the rows on You. */
import { APP, JOURNEY } from './names';

export const settings = {
  // Delete account
  deleteAccount: {
    title: 'Delete your account?',
    lead: `This can't be undone. Your profile and everything you keep in ${APP} are removed for good. Circles other people are still in stay, without your own things.`,
    /** The account is shared with the other app, so deleting asks which. */
    which: `You sign in to ${JOURNEY} with the same account. What should go?`,
    choices: {
      homeport: { label: `Only ${APP}`, note: `Your sign-in stays, and ${JOURNEY} goes on as it was.` },
      both: { label: `${APP}, and ${JOURNEY} too`, note: `The sign-in goes as well. Where ${APP} can't remove it by itself, you are told how to finish in ${JOURNEY}.` },
    },
    confirm: 'Delete my account',
    keep: 'Keep my account',
    /** On the welcome screen afterwards, above what the API said happened. */
    farewell: 'Close',
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
