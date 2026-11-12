import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { onPhone } from '@/test/phone';
import { darkTheme } from '@/theme';

import { Avatar } from '../Avatar';
import { Button } from '../Button';
import { ConfirmSheet } from '../ConfirmSheet';
import { ErrorScreen } from '../ErrorScreen';
import { Loading } from '../Loading';
import { Photo } from '../Photo';
import { Problem } from '../Problem';
import { MAX_TEXT_SCALE, Txt } from '../Txt';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));

const colorOf = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style).color;

describe('Problem', () => {
  it('as a small note: the sentence and a way to try again', async () => {
    const retry = jest.fn();
    await render(<Problem message="Can't reach Homeport right now." onRetry={retry} />);
    expect(screen.getByRole('header', { name: "That didn't load" })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Go to Home' })).not.toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('as a whole page: "Try again" and "Go to Home"', async () => {
    const home = jest.fn();
    await render(<Problem message="This page didn't load." onRetry={() => {}} onHome={home} />);
    expect(screen.getByRole('header', { name: "We couldn't open this" })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Go to Home' }));
    expect(home).toHaveBeenCalledTimes(1);
  });

  it('offers only the way Home when asking again cannot help', async () => {
    await render(<Problem title="This isn't available" message="This page isn't available." onHome={() => {}} />);
    expect(screen.getByRole('button', { name: 'Go to Home' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
  });

  it('is readable on a photo or the dark stage, whatever the theme', async () => {
    // The app's theme is light in tests: on the dark stage the words must still be the light ones.
    await render(<Problem tone="onPhoto" message="This photo didn't load." onRetry={() => {}} />);
    expect(colorOf("That didn't load")).toBe(darkTheme.colors.text);
    expect(colorOf("This photo didn't load.")).toBe(darkTheme.colors.muted);
  });
});

describe('Loading', () => {
  it('spins while something is on its way', async () => {
    await render(<Loading />);
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
  });

  it('says so, instead of spinning, when it waits for a connection', async () => {
    await render(<Loading offline />);
    expect(screen.getByRole('header', { name: "You're offline" })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Loading')).not.toBeOnTheScreen();
  });

  it('is readable on the dark stage', async () => {
    await render(<Loading offline tone="onPhoto" />);
    expect(colorOf("You're offline")).toBe(darkTheme.colors.text);
  });
});

describe('ErrorScreen', () => {
  it('offers the way Home as well as trying again, so a screen that breaks every time is not a dead end', async () => {
    const retry = jest.fn();
    await render(<ErrorScreen onRetry={retry} />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Go to Home' }));
    expect(router.replace).toHaveBeenCalledWith('/');
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmSheet', () => {
  it('asks, and does it only on the button that says so', async () => {
    const yes = jest.fn();
    const no = jest.fn();
    const user = userEvent.setup();
    await render(onPhone(<ConfirmSheet visible onClose={no} title="Leave The Linds?" body="What you shared stays for the others, as a copy." confirm="Leave circle" cancel="Stay" onConfirm={yes} />));
    expect(screen.getByRole('header', { name: 'Leave The Linds?' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Stay' }));
    expect(no).toHaveBeenCalledTimes(1);
    expect(yes).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Leave circle' }));
    expect(yes).toHaveBeenCalledTimes(1);
  });
});

describe('in a list that reuses its rows', () => {
  it('a photo and an avatar are keyed by their picture, so a reused row never shows the last one', async () => {
    await render(
      <>
        <Photo uri="https://example.com/a.jpg" label="Cover" />
        <Avatar uri="https://example.com/nora.jpg" name="Nora Lind" />
      </>,
    );
    expect(screen.getByLabelText('Cover').props.recyclingKey).toBe('https://example.com/a.jpg');
    expect(screen.getByLabelText('Nora Lind').props.recyclingKey).toBe('https://example.com/nora.jpg');
  });
});

describe('sizes people can touch and read', () => {
  it('a small button is drawn 36 pt high and can be touched over 44', async () => {
    await render(<Button label="Post" size="sm" />);
    const button = screen.getByRole('button', { name: 'Post' });
    expect(StyleSheet.flatten(button.props.style).minHeight).toBe(36);
    expect(button.props.hitSlop).toBe(4);
  });

  it('text grows with the phone\'s setting, up to a limit', async () => {
    await render(<Txt>Hello</Txt>);
    expect(screen.getByText('Hello').props.maxFontSizeMultiplier).toBe(MAX_TEXT_SCALE);
  });
});
