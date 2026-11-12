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
} as const;
