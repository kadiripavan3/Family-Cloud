/** 3 Home: the row of six places and what stands under it, and 3.1 Today. */

export const today = {
  // 3.4 The + button: the ways to add something, wherever you are in the app
  plus: {
    /** The ten things it makes, by the last part of the address each one opens ("/new/note"). */
    things: { note: 'Note', checklist: 'Checklist', photos: 'Photos', scan: 'Scan', event: 'Event', reminder: 'Reminder', bill: 'Bill', sheet: 'Sheet', password: 'Password', goal: 'Goal' },
  },


  /** A place that is shut for the youngest in a family: Money and the Vault for a teen or a child. */
  shut: {
    title: (place: string) => `${place} is shut for you`,
    body: (place: string, circle: string) => `In ${circle}, ${place} is for the adults. Ask one of them if you need something from it.`,
  },
} as const;
