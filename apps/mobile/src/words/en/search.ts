/** 3.3 Find anything: the pill at the top of Home, and one search across the circle. */
import { places } from '@/theme/tokens';

export const search = {
  /** The pill at the top of Home, by the place that is showing. */
  pill: {
    today: { title: 'Find anything', sub: 'Notes · photos · bills · passwords' },
    plan: { title: 'Find a date or a job', sub: 'Events · reminders · lists · goals' },
    notes: { title: places.notes === 'Notes' ? 'Search notes' : `Search ${places.notes}`, sub: 'Pages · checklists · templates' },
    library: { title: 'Search the library', sub: 'People · places · words in a scan' },
    money: { title: 'Search money', sub: 'Bills · sheets · who owes who' },
    vault: { title: 'Search the Vault', sub: 'Logins · cards · IDs · codes' },
  },

  /** The box you type in. */
  field: (circle: string) => `Search ${circle}`,
  clear: 'Clear',
  cancel: 'Cancel',
  /** The first of the chips that narrow a search to one place. */
  everything: 'Everything',
  /** What was found inside a thing, shown under its title. */
  found: (snippet: string) => `“${snippet.trim()}”`,

  start: { title: 'One search across every place', body: 'A title, or words inside a page or a list. Only what you can see is searched.' },
  none: { title: (words: string) => `Nothing found for “${words}”`, body: "Try fewer words. Things that aren't shared with you don't show up." },
} as const;
