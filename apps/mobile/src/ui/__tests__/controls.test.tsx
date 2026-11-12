import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

import { onPhone } from '@/test/phone';

import { Button } from '../Button';
import { DayPicker } from '../DayPicker';
import { Dots } from '../Dots';
import { EmojiTabs } from '../EmojiTabs';
import { Field } from '../Field';
import { GrowingInput } from '../GrowingInput';
import { MoreRow } from '../MoreRow';
import { Tap } from '../Motion';
import { Segmented } from '../Segmented';
import { SelectPill } from '../SelectPill';
import { Sheet } from '../Sheet';
import { Toggle } from '../Toggle';
import { WordTabs } from '../WordTabs';

describe('Button', () => {
  it('does what it says when pressed', async () => {
    const onPress = jest.fn();
    await render(<Button label="Continue" onPress={onPress} />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Continue' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('cannot be pressed while disabled, and says so to screen readers', async () => {
    const onPress = jest.fn();
    await render(<Button label="Post" disabled onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Post' });
    await userEvent.setup().press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });

  it('cannot be pressed twice while it is working', async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" loading onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Save' });
    await userEvent.setup().press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeBusy();
  });

  it('says more to a screen reader than it shows, where the label needs what is around it', async () => {
    await render(<Button label="Continue" spoken="Continue as Nora Lind" />);
    expect(screen.getByRole('button', { name: 'Continue as Nora Lind' })).toBeOnTheScreen();
    expect(screen.getByText('Continue')).toBeOnTheScreen();
  });
});

describe('Dots', () => {
  it('says which card of how many is in front', async () => {
    const view = await render(<Dots count={3} at={0} />);
    expect(screen.getByLabelText('Step 1 of 3')).toBeOnTheScreen();
    await view.rerender(<Dots count={3} at={2} />);
    expect(screen.getByLabelText('Step 3 of 3')).toBeOnTheScreen();
  });
});

describe('Tap', () => {
  it('passes presses on, unless disabled', async () => {
    const onPress = jest.fn();
    const view = await render(
      <Tap accessibilityRole="button" accessibilityLabel="Open" onPress={onPress}>
        <Text>Open</Text>
      </Tap>,
    );
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Open' }));
    expect(onPress).toHaveBeenCalledTimes(1);

    await view.rerender(
      <Tap accessibilityRole="button" accessibilityLabel="Open" disabled onPress={onPress}>
        <Text>Open</Text>
      </Tap>,
    );
    await user.press(screen.getByRole('button', { name: 'Open' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Toggle', () => {
  it('is a switch that asks for the opposite of what it shows', async () => {
    const onChange = jest.fn();
    const view = await render(<Toggle label="Weekly digest" value={false} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Weekly digest' });
    expect(toggle).not.toBeChecked();
    await userEvent.setup().press(toggle);
    expect(onChange).toHaveBeenCalledWith(true);

    await view.rerender(<Toggle label="Weekly digest" value onChange={onChange} />);
    expect(screen.getByRole('switch', { name: 'Weekly digest' })).toBeChecked();
  });
});

describe('Field', () => {
  it('shows its label and takes what is typed', async () => {
    const onChangeText = jest.fn();
    await render(<Field label="Name" value="" onChangeText={onChangeText} />);
    expect(screen.getByText('Name')).toBeOnTheScreen();
    await userEvent.setup().type(screen.getByLabelText('Name'), 'Nora');
    expect(onChangeText).toHaveBeenLastCalledWith('a');
  });

  it('shows the error in place of the note', async () => {
    await render(<Field label="Username" value="no" note="Letters, numbers and dots." error="That one is taken." />);
    expect(screen.getByText('That one is taken.')).toBeOnTheScreen();
    expect(screen.queryByText('Letters, numbers and dots.')).not.toBeOnTheScreen();
  });
});

describe('Sheet', () => {
  it('shows its title and content only while open', async () => {
    const view = await render(
      onPhone(
        <Sheet visible={false} onClose={() => {}} title="Category">
          <Text>Travel</Text>
        </Sheet>,
      ),
    );
    expect(screen.queryByText('Travel')).not.toBeOnTheScreen();
    await view.rerender(
      onPhone(
        <Sheet visible onClose={() => {}} title="Category">
          <Text>Travel</Text>
        </Sheet>,
      ),
    );
    expect(screen.getByRole('header', { name: 'Category' })).toBeOnTheScreen();
    expect(screen.getByText('Travel')).toBeOnTheScreen();
  });

  it('closes when the dimmed page behind it is pressed', async () => {
    const onClose = jest.fn();
    await render(
      onPhone(
        <Sheet visible onClose={onClose} title="Category">
          <Text>Travel</Text>
        </Sheet>,
      ),
    );
    // The sheet is modal, so screen readers skip what is behind it; a finger still reaches the dimmed page.
    await userEvent.setup().press(screen.getByRole('button', { name: 'Close', includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('WordTabs', () => {
  const tabs = [
    { id: 'photos', label: 'Photos', count: 3 },
    { id: 'people', label: 'People' },
  ] as const;

  it('marks the chosen tab and reports the one pressed', async () => {
    const onChange = jest.fn();
    await render(<WordTabs tabs={tabs} value="photos" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: 'Photos, 3' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'People' })).not.toBeSelected();
    await userEvent.setup().press(screen.getByRole('tab', { name: 'People' }));
    expect(onChange).toHaveBeenCalledWith('people');
  });
});

describe('Segmented', () => {
  const roles = [
    { id: 'child', label: 'Child' },
    { id: 'teen', label: 'Teen' },
    { id: 'adult', label: 'Adult' },
  ] as const;

  it('shows which one is chosen and says which one was pressed', async () => {
    const onChange = jest.fn();
    await render(<Segmented label="Role" options={roles} value="child" onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'Child', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Teen', checked: false })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('radio', { name: 'Adult' }));
    expect(onChange).toHaveBeenCalledWith('adult');
  });

  it('can be shown without being changeable', async () => {
    const onChange = jest.fn();
    await render(<Segmented label="Role" options={roles} value="teen" onChange={onChange} locked />);
    await userEvent.setup().press(screen.getByRole('radio', { name: 'Adult' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'Teen', checked: true })).toBeOnTheScreen();
  });
});

describe('EmojiTabs', () => {
  const tabs = [
    { id: 'today', label: 'Today', emoji: '🏡' },
    { id: 'plan', label: 'Plan', emoji: '📅' },
  ] as const;

  it('has one tab chosen, and says which one was pressed', async () => {
    const onChange = jest.fn();
    await render(<EmojiTabs six tabs={tabs} value="today" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: 'Today', selected: true })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('tab', { name: 'Plan' }));
    expect(onChange).toHaveBeenCalledWith('plan');
  });
});

describe('MoreRow', () => {
  it('says what it does and a few lighter words after it, and can be pressed', async () => {
    const onPress = jest.fn();
    await render(<MoreRow emoji="📅" title="Add this week" rest="school, bins, dentist" onPress={onPress} />);
    expect(screen.getByText('Add this week')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add this week. school, bins, dentist' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('SelectPill', () => {
  it('holds the current choice and opens the others', async () => {
    const onPress = jest.fn();
    await render(<SelectPill label="Adult" spoken="Alex: Adult. Change role" onPress={onPress} />);
    expect(screen.getByText('Adult')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Alex: Adult. Change role' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('GrowingInput', () => {
  it('is typed into like any box, and is as tall as what is in it', async () => {
    const onChangeText = jest.fn();
    await render(<GrowingInput label="Words" variant="body" value="One line" onChangeText={onChangeText} minHeight={40} />);
    const box = screen.getByLabelText('Words');
    await userEvent.setup().type(box, '!');
    expect(onChangeText).toHaveBeenLastCalledWith('One line!');
    await fireEvent(box, 'contentSizeChange', { nativeEvent: { contentSize: { width: 300, height: 131.2 } } });
    expect(screen.getByLabelText('Words')).toHaveStyle({ height: 132, minHeight: 40 });
  });
});

describe('DayPicker', () => {
  it('steps a year at a time when the day can be long ago', async () => {
    const onChange = jest.fn();
    await render(onPhone(<DayPicker visible onClose={jest.fn()} title="Birthday" value="2026-11-11" max="2026-11-11" byYear onChange={onChange} />));
    const user = userEvent.setup();
    expect(screen.getByText('November 2026')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'A year on' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'A year back' }));
    await user.press(screen.getByRole('button', { name: 'A year back' }));
    expect(screen.getByText('November 2024')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: '15 November 2024' }));
    expect(onChange).toHaveBeenCalledWith('2024-11-15');
  });

  it('has no year buttons unless asked', async () => {
    await render(onPhone(<DayPicker visible onClose={jest.fn()} title="Day" value="2026-11-11" onChange={jest.fn()} />));
    expect(screen.queryByRole('button', { name: 'A year back' })).toBeNull();
  });
});
