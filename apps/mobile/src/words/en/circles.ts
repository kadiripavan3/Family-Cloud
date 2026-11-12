/** Circles: which one you are in, the sheet that changes it, and (2.6) what each kind gets. */
import { plural } from './plural';

/** "Biscuit", "Biscuit and Momo", "3 pets". */
const petsLine = (pets: readonly string[]) => (pets.length > 2 ? `${pets.length} pets` : pets.join(' and '));

export const circles = {
  /** The round button in Home's search pill. */
  switchLabel: (circle: string) => `${circle}. Change circle`,

  /** How many are in it: "4 people and Biscuit", "2 people", "Just you". Pets are named, not counted. */
  people: (people: number, pets: readonly string[] = []) => {
    const counted = people <= 1 && pets.length === 0 ? 'Just you' : plural(people, 'person', 'people');
    return pets.length ? `${counted} and ${petsLine(pets)}` : counted;
  },

  // 3.2 Your circles
  yours: {
    title: 'Your circles',
    justMe: 'Just me',
    onlyYou: (count: number) => (count === 1 ? '1 thing only you can see' : `${count} things only you can see`),
    newCircle: { label: 'New circle', note: 'Family, friends, housemates, a club' },
    /** A row, for a screen reader. */
    row: (name: string, line: string, current: boolean) => (current ? `${name}. ${line}. You are here` : `${name}. ${line}`),
  },
} as const;
