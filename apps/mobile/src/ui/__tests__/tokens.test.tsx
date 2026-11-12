import { render, screen, userEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { onPhone } from '@/test/phone';
import { fontFor, radius, textStyle, themeFor, withAlpha } from '@/theme';
import { brand, places } from '@/theme/tokens';

import tokens from '../../../../../design/tokens.json';
import { BrandMark, JourneyMark } from '../Brand';
import { DayPicker } from '../DayPicker';
import { Emoji } from '../Emoji';
import { Photo } from '../Photo';
import { Stat } from '../Stat';
import { Txt } from '../Txt';

const variantName = (name: string) => name.toLowerCase().replace(/ ([a-z0-9])/g, (_, c: string) => c.toUpperCase());

describe('Txt', () => {
  it.each(tokens.type.map((t) => [variantName(t.name), t] as const))('draws "%s" with the size, line, weight and tracking in the tokens', async (variant, t) => {
    await render(<Txt variant={variant as Parameters<typeof textStyle>[0]}>Sample</Txt>);
    const style = StyleSheet.flatten(screen.getByText('Sample').props.style);
    expect(style.fontSize).toBe(t.size);
    expect(style.lineHeight).toBe(t.line);
    expect(style.fontFamily).toBe(fontFor[t.weight as keyof typeof fontFor]);
    expect(style.letterSpacing).toBeCloseTo(t.tracking * t.size, 1);
    expect(style.textTransform).toBe('caps' in t && t.caps ? 'uppercase' : undefined);
  });

  it('is body text in the text colour unless told otherwise', async () => {
    await render(<Txt>Plain</Txt>);
    const style = StyleSheet.flatten(screen.getByText('Plain').props.style);
    expect(style.fontSize).toBe(15);
    expect(style.color).toBe(tokens.color.light.text);
  });

  it('takes another weight and a colour by name', async () => {
    await render(
      <Txt variant="caption" weight={800} color="muted">
        Bold
      </Txt>,
    );
    const style = StyleSheet.flatten(screen.getByText('Bold').props.style);
    expect(style.fontFamily).toBe(fontFor[800]);
    expect(style.color).toBe(tokens.color.light.muted);
  });
});

describe('theme helpers', () => {
  it('leaves the line height out for a one-line box', () => {
    expect(textStyle('item', 600, { oneLine: true })).toEqual({ fontFamily: fontFor[600], fontSize: 15, letterSpacing: 0 });
    expect(textStyle('item').lineHeight).toBe(20);
  });

  it('makes a token colour see-through', () => {
    expect(withAlpha('#08080A', 0.45)).toBe('rgba(8, 8, 10, 0.45)');
    expect(withAlpha('#000', 0)).toBe('rgba(0, 0, 0, 0)');
  });
});

describe('the name, the mark and the tints', () => {
  it('takes the app\'s name, its web address and its mark from the one setting in the tokens', () => {
    const chosen = tokens.brand.options[tokens.brand.chosen as keyof typeof tokens.brand.options];
    expect(brand).toEqual({ name: chosen.label, domain: chosen.domain, icon: chosen.icon });
    expect(brand).toEqual({ name: 'Homeport', domain: 'homeport.app', icon: 'anchor' });
    expect(places.notes).toBe(tokens.places.notes.label);
  });

  it('draws both marks on a tile in the accent colour, with corners that keep their shape at any size', async () => {
    const view = await render(<BrandMark size={64} />);
    expect(StyleSheet.flatten(view.root?.props.style)).toMatchObject({ width: 64, height: 64, backgroundColor: tokens.accent.options.sun.accent });
    expect(StyleSheet.flatten(view.root?.props.style).borderRadius).toBeCloseTo(19.2);
    await view.rerender(<JourneyMark />);
    expect(StyleSheet.flatten(view.root?.props.style)).toMatchObject({ width: 28, height: 28, backgroundColor: tokens.accent.options.sun.accent });
  });

  it('has the five tints that tell people and categories apart, in light and in dark', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const { colors } = themeFor(scheme);
      expect([colors.tint1, colors.tint2, colors.tint3, colors.tint4, colors.tint5]).toEqual([1, 2, 3, 4, 5].map((n) => tokens.color[scheme][`tint-${n}` as 'tint-1']));
    }
  });
});

describe('Emoji', () => {
  it('draws the 3D icon where there is one, with or without the "as picture" mark', async () => {
    await render(
      <>
        <Emoji char="✈️" size={24} />
        <Emoji char="✈" size={24} />
      </>,
    );
    expect(screen.queryByText('✈️')).not.toBeOnTheScreen();
    expect(screen.queryByText('✈')).not.toBeOnTheScreen();
  });

  it('falls back to the emoji as text, sized to match', async () => {
    await render(<Emoji char="🦉" size={20} />);
    const style = StyleSheet.flatten(screen.getByText('🦉', { includeHiddenElements: true }).props.style);
    expect(style.fontSize).toBeCloseTo(17.2);
  });
});

describe('Photo', () => {
  it('takes its corners from the radius tokens, or none for an edge-to-edge photo', async () => {
    const view = await render(<Photo uri={null} radius="field" style={{ width: 40, height: 40 }} label="x" />);
    expect(StyleSheet.flatten(view.root?.props.style).borderRadius).toBe(radius.field);
    await view.rerender(<Photo uri={null} radius="none" style={{ width: 40, height: 40 }} label="x" />);
    expect(StyleSheet.flatten(view.root?.props.style).borderRadius).toBe(0);
  });
});

describe('Stat', () => {
  it('reads out the whole number when the one shown is shortened', async () => {
    const onPress = jest.fn();
    await render(<Stat value="1.2k" spoken={1234} label="photos" onPress={onPress} />);
    expect(screen.getByRole('button', { name: '1234 photos' })).toBeOnTheScreen();
    expect(screen.getByText('1.2k')).toBeOnTheScreen();
  });
});

describe('DayPicker', () => {
  const picker = (visible: boolean, value: string) => onPhone(<DayPicker visible={visible} onClose={() => {}} title="When?" value={value} onChange={() => {}} />);

  it('opens on the month of the chosen day every time, not the month it was left on', async () => {
    const view = await render(picker(true, '2026-03-14'));
    expect(screen.getByText('March 2026')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('April 2026')).toBeOnTheScreen();

    await view.rerender(picker(false, '2026-03-14'));
    await view.rerender(picker(true, '2026-03-14'));
    expect(screen.getByText('March 2026')).toBeOnTheScreen();

    // And when the chosen day changed while it was closed, it opens there.
    await view.rerender(picker(false, '2026-07-02'));
    await view.rerender(picker(true, '2026-07-02'));
    expect(screen.getByText('July 2026')).toBeOnTheScreen();
  });
});
