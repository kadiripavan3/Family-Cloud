/** Photos and files: choosing them and sending them up. */
import { APP } from './names';

export const media = {
  /** The phone's photo picker couldn't be opened. */
  photosClosed: `We couldn't open your photos. Check that ${APP} may see them in the phone's Settings.`,

  // Sending a file up didn't work
  uploads: {
    photoUnreadable: "That photo can't be read any more. Choose it again.",
    photoUnreachable: "The photo couldn't be uploaded. Check your connection and try again.",
    photoFailed: "The photo couldn't be uploaded. Try again.",
    fileFailed: "A file couldn't be uploaded. Try again.",
    fileGone: 'That file is no longer on your phone. Choose it again.',
  },
} as const;
