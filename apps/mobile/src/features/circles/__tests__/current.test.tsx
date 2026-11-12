import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useGetCircles } from '@/api/generated/homeport';
import { keep } from '@/lib/keep';
import { coupleCircle, crewCircle, linds, loaded, pending } from '@/test/samples';

import { chosenCircleFor, currentOf, resetChosenCircle, switchCircle, useChosenCircleKnown, useCircle, useCircleIfAny, useCircles } from '../current';

jest.mock('@/api/generated/homeport', () => ({ useGetCircles: jest.fn() }));
jest.mock('@/lib/keep', () => ({ keep: { get: jest.fn(() => Promise.resolve(null)), set: jest.fn(() => Promise.resolve()), remove: jest.fn(() => Promise.resolve()) } }));

const circles = jest.mocked(useGetCircles) as unknown as jest.Mock;
const kept = jest.mocked(keep);

function Current() {
  return <Text>{useCircle().name}</Text>;
}
function CurrentIfAny() {
  const all = useCircles();
  return <Text>{`${useCircleIfAny()?.name ?? 'none'} of ${all.length}`}</Text>;
}
function Known({ account }: { account: string | null }) {
  return <Text>{useChosenCircleKnown(account) ? 'known' : 'asking'}</Text>;
}

describe('the current circle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    kept.get.mockResolvedValue(null);
    resetChosenCircle();
    circles.mockReturnValue(loaded([linds, coupleCircle, crewCircle]));
  });

  it('is the first circle until another is picked', async () => {
    await render(<Current />);
    expect(screen.getByText('The Linds')).toBeOnTheScreen();
    expect(currentOf([linds, crewCircle], null)).toBe(linds);
    expect(currentOf([linds, crewCircle], 'c-crew')).toBe(crewCircle);
    expect(currentOf([], 'c-crew')).toBeUndefined();
  });

  it('changes for every screen at once, and is remembered on the phone for this account', async () => {
    await chosenCircleFor('a-nora');
    await render(<Current />);
    await act(async () => switchCircle('c-crew'));
    expect(screen.getByText('Lisbon crew')).toBeOnTheScreen();
    expect(kept.set).toHaveBeenCalledWith('homeport.circle.a-nora', 'c-crew');
  });

  it("starts on the circle the person was in last time, and never on someone else's", async () => {
    kept.get.mockImplementation((key: string) => Promise.resolve(key === 'homeport.circle.a-nora' ? 'c-couple' : null));
    await chosenCircleFor('a-nora');
    const view = await render(<Current />);
    expect(screen.getByText('Nora and Alex')).toBeOnTheScreen();
    await view.unmount();

    await chosenCircleFor('a-alex');
    await render(<Current />);
    expect(screen.getByText('The Linds')).toBeOnTheScreen();
  });

  it('falls back to the first circle when the remembered one is gone', async () => {
    kept.get.mockResolvedValue('c-left-long-ago');
    await chosenCircleFor('a-nora');
    await render(<Current />);
    expect(screen.getByText('The Linds')).toBeOnTheScreen();
  });

  it('says when the phone has answered which circle was picked last, so the app can wait for it', async () => {
    let answer: (id: string | null) => void = () => undefined;
    kept.get.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await render(<Known account="a-nora" />);
    expect(screen.getByText('asking')).toBeOnTheScreen();
    await act(async () => answer('c-crew'));
    expect(screen.getByText('known')).toBeOnTheScreen();
  });

  it('has nothing to wait for while nobody is signed in', async () => {
    await render(<Known account={null} />);
    expect(screen.getByText('known')).toBeOnTheScreen();
    expect(kept.get).not.toHaveBeenCalled();
  });

  it('is nothing for someone in no circle, and a screen that needs one says what went wrong', async () => {
    circles.mockReturnValue(loaded([]));
    await render(<CurrentIfAny />);
    expect(screen.getByText('none of 0')).toBeOnTheScreen();
    circles.mockReturnValue(pending());
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(render(<Current />)).rejects.toThrow(/in no circle/);
    quiet.mockRestore();
  });
});
