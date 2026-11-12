import { act, render, screen } from '@testing-library/react-native';
import { Share, Text } from 'react-native';

import { keep } from '@/lib/keep';
import { formatMoney } from '@/lib/money';
import { firstName, initials } from '@/lib/names';
import { copyText, shareText, shortLink } from '@/lib/share';
import { forgetKeptChoices, useKept } from '@/lib/useKept';

jest.mock('@/lib/keep', () => ({ keep: { get: jest.fn(() => Promise.resolve(null)), set: jest.fn(() => Promise.resolve()), remove: jest.fn(() => Promise.resolve()) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));

describe('money', () => {
  it('is written whole when it is whole, and with cents when it is not', () => {
    expect(formatMoney(4500)).toBe('€45');
    expect(formatMoney(4550)).toBe('€45.50');
    expect(formatMoney(8400)).toBe('€84');
    expect(formatMoney(0)).toBe('€0');
    expect(formatMoney(120000)).toBe('€1,200');
  });

  it('is written in its own currency when it has one', () => {
    expect(formatMoney(1999, 'USD')).toBe('$19.99');
    expect(formatMoney(500, 'GBP')).toBe('£5');
  });
});

describe('names', () => {
  it('calls someone by their first name, without what follows it', () => {
    expect(firstName('Nora Lind')).toBe('Nora');
    expect(firstName('Ines, the sitter')).toBe('Ines');
    expect(firstName('  Biscuit ')).toBe('Biscuit');
    expect(firstName(null)).toBe('');
    expect(initials('Ines, the sitter')).toBe('IT');
  });
});

describe('sharing a link', () => {
  beforeEach(() => jest.restoreAllMocks());

  it("goes through the phone's share sheet where there is one", async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    expect(await shareText('Here is your pass: https://homeport.app/g/1')).toBe('shared');
    expect(share).toHaveBeenCalledWith({ message: 'Here is your pass: https://homeport.app/g/1' });
  });

  it('is copied instead where there is none', async () => {
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('not here'));
    expect(await shareText('https://homeport.app/g/1')).toBe('copied');
    expect(await copyText('x')).toBe(true);
    expect(shortLink('https://homeport.app/g/1/')).toBe('homeport.app/g/1');
  });
});

describe('a choice remembered on the phone', () => {
  function Choice({ id }: { id: string }) {
    const [value, set] = useKept(id, { on: false });
    return <Text onPress={() => set({ on: !value.on })}>{value.on ? 'on' : 'off'}</Text>;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    forgetKeptChoices();
    jest.mocked(keep.get).mockResolvedValue(null);
  });

  it('starts as it is given, and takes what the phone remembers', async () => {
    jest.mocked(keep.get).mockResolvedValue(JSON.stringify({ on: true }));
    await render(<Choice id="homeport.test.a" />);
    expect(await screen.findByText('on')).toBeOnTheScreen();
    expect(keep.get).toHaveBeenCalledWith('homeport.test.a');
  });

  it('is written back when it changes, and every screen that shows it changes with it', async () => {
    await render(
      <>
        <Choice id="homeport.test.b" />
        <Choice id="homeport.test.b" />
      </>,
    );
    expect(screen.getAllByText('off')).toHaveLength(2);
    await act(async () => screen.getAllByText('off')[0]!.props.onPress());
    expect(screen.getAllByText('on')).toHaveLength(2);
    expect(keep.set).toHaveBeenCalledWith('homeport.test.b', JSON.stringify({ on: true }));
    // The phone is asked once for a key, however many screens show it.
    expect(keep.get).toHaveBeenCalledTimes(1);
  });

  it('is its starting value when what the phone kept cannot be read', async () => {
    jest.mocked(keep.get).mockResolvedValue('{not json');
    await render(<Choice id="homeport.test.c" />);
    await act(async () => undefined);
    expect(screen.getByText('off')).toBeOnTheScreen();
  });
});
