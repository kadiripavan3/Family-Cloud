import { render, screen, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

import { onPhone } from '@/test/phone';
import { coupleCircle, crewCircle, everyone, linds, loaded, me, notMia, onlyMe, page, soloCircle, thing, withAlex } from '@/test/samples';

import { AudienceChip } from '../AudienceChip';

jest.mock('@/features/circles/current', () => ({ useCircles: () => mockCircles, useCircleIfAny: () => mockCircles[0] }));
jest.mock('@/api/generated/homeport', () => ({ useGetMe: jest.fn(() => mockMe) }));
jest.mock('../AudienceSheet', () => ({ AudienceSheet: (props: { thingId: string; visible: boolean }) => mockSheet(props) }));

const mockCircles = [linds, coupleCircle, crewCircle, soloCircle];
const mockMe = loaded(me());
function mockSheet({ thingId, visible }: { thingId: string; visible: boolean }) {
  return visible ? <Text>{`the sheet for ${thingId}`}</Text> : null;
}

describe('the audience chip', () => {
  it('says "Only you" for a thing nobody else sees', async () => {
    await render(onPhone(<AudienceChip thing={page({ chip: onlyMe })} />));
    expect(screen.getByText('Only you')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seen by: Only you. Change who can see this' })).toBeOnTheScreen();
  });

  it('names the people a thing is shared with, and shows their pictures and yours', async () => {
    await render(onPhone(<AudienceChip thing={page({ chip: withAlex })} />));
    expect(screen.getByText('Alex and you')).toBeOnTheScreen();
    expect(screen.getByLabelText('Alex Strand')).toBeOnTheScreen();
    expect(screen.getByLabelText('Nora Lind')).toBeOnTheScreen();
  });

  it('counts the rest when there are many', async () => {
    const people = ['Alex Strand', 'Mia', 'Leo', 'Astrid'].map((name, index) => ({ memberId: `m-${index}`, name, avatarUrl: null }));
    await render(onPhone(<AudienceChip thing={page({ chip: { audience: 'some', people, hiddenFrom: [] } })} />));
    expect(screen.getByText('Alex and 3 more')).toBeOnTheScreen();
  });

  it("leaves the reader out of the names on someone else's thing", async () => {
    const chip = { audience: 'some' as const, people: [{ memberId: 'm-nora', name: 'Nora Lind', avatarUrl: null }, { memberId: 'm-mia', name: 'Mia', avatarUrl: null }], hiddenFrom: [] };
    const view = await render(onPhone(<AudienceChip thing={page({ mine: false, chip })} />));
    expect(screen.getByText('Mia and you')).toBeOnTheScreen();
    await view.rerender(onPhone(<AudienceChip thing={page({ mine: false, chip: { ...chip, people: chip.people.slice(0, 1) } })} />));
    expect(screen.getByText('Shared with you')).toBeOnTheScreen();
  });

  it.each([
    ['c-linds', 'The Linds'],
    ['c-couple', 'The two of you'],
    ['c-crew', 'Lisbon crew'],
  ])("says the circle in its kind's own words: %s", async (circleId, label) => {
    await render(onPhone(<AudienceChip thing={thing({ circleId, chip: everyone })} />));
    expect(screen.getByText(label)).toBeOnTheScreen();
  });

  it('says who it is hidden from today, before anything else', async () => {
    await render(onPhone(<AudienceChip thing={page({ chip: notMia })} />));
    expect(screen.getByText('Not Mia')).toBeOnTheScreen();
    expect(screen.queryByText('The Linds')).toBeNull();
    await render(onPhone(<AudienceChip thing={page({ chip: { ...notMia, hiddenFrom: ['Mia', 'Leo'] } })} />));
    expect(screen.getByText('Not Mia or Leo')).toBeOnTheScreen();
  });

  it('opens the one sheet for that thing when pressed', async () => {
    await render(onPhone(<AudienceChip thing={page({ id: 'p-1' })} />));
    expect(screen.queryByText('the sheet for p-1')).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: /^Seen by/ }));
    expect(screen.getByText('the sheet for p-1')).toBeOnTheScreen();
  });

  it('only says who sees it when it sits in a row that is pressed itself', async () => {
    await render(onPhone(<AudienceChip quiet thing={page({ chip: everyone })} />));
    expect(screen.getByLabelText('Seen by: The Linds')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
