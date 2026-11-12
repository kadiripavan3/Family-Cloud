import { render, screen, userEvent } from '@testing-library/react-native';

import { FindDateSetup } from '@/features/crew/find-date/FindDateSetup';
import { PredictionsSetup } from '@/features/crew/predictions/PredictionsSetup';
import { WalkTogetherSetup } from '@/features/crew/walk-together/WalkTogetherSetup';
import { WhereNextSetup } from '@/features/crew/where-next/WhereNextSetup';
import { inApp } from '@/test/phone';
import { crewCircle } from '@/test/samples';

jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-11' }));

/** What the gallery's sheet is told last: what Start would send, or null while something is missing. */
const last = (onChange: jest.Mock) => onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];

describe('what the crew\'s templates ask before they start', () => {
  it('When can everyone? starts as it is with the three weeks from today, and takes a name and other days', async () => {
    const onChange = jest.fn();
    await render(inApp(<FindDateSetup circle={crewCircle} onChange={onChange} />));
    expect(last(onChange)).toEqual({ title: undefined, settings: { from: '2026-11-11', to: '2026-12-01' } });
    expect(screen.getByRole('button', { name: 'First day: Wed 11 Nov. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Last day: Tue 1 Dec. Change' })).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('What is it for?'), 'Reunion dinner');
    await user.press(screen.getByRole('button', { name: 'Last day: Tue 1 Dec. Change' }));
    await user.press(screen.getByRole('button', { name: '6 December 2026' }));
    expect(last(onChange)).toEqual({ title: 'Reunion dinner', settings: { from: '2026-11-11', to: '2026-12-06' } });
    // A first day after the last one moves the last day on with it.
    await user.press(screen.getByRole('button', { name: 'First day: Wed 11 Nov. Change' }));
    await user.press(screen.getByRole('button', { name: 'Next month' }));
    await user.press(screen.getByRole('button', { name: '10 December 2026' }));
    expect(last(onChange)).toEqual({ title: 'Reunion dinner', settings: { from: '2026-12-10', to: '2026-12-30' } });
  });

  it('Where next? can start with nothing, and takes a name and when the trip would be', async () => {
    const onChange = jest.fn();
    await render(inApp(<WhereNextSetup circle={crewCircle} onChange={onChange} />));
    expect(last(onChange)).toEqual({ title: undefined, settings: {} });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('What is the vote called?'), 'Summer trip');
    await user.type(screen.getByLabelText('When would it be? (if you know)'), 'July 2027');
    expect(last(onChange)).toEqual({ title: 'Summer trip', settings: { when: 'July 2027' } });
  });

  it('Predictions open five years on unless another day is chosen, and are named for that year', async () => {
    const onChange = jest.fn();
    await render(inApp(<PredictionsSetup circle={crewCircle} onChange={onChange} />));
    expect(last(onChange)).toEqual({ title: 'Predictions for 2031', settings: { opensOn: '2031-11-11', occasion: undefined } });
    expect(screen.getByRole('button', { name: 'The day they open: 11 November 2031. Change' })).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('What day is that? (if you like)'), 'the reunion');
    await user.press(screen.getByRole('button', { name: 'The day they open: 11 November 2031. Change' }));
    await user.press(screen.getByRole('button', { name: 'A year on' }));
    await user.press(screen.getByRole('button', { name: '4 November 2032' }));
    expect(last(onChange)).toEqual({ title: 'Predictions for 2032', settings: { opensOn: '2032-11-04', occasion: 'the reunion' } });
    await user.type(screen.getByLabelText('What it is called'), 'In ten years');
    expect(last(onChange)).toEqual({ title: 'In ten years', settings: { opensOn: '2032-11-04', occasion: 'the reunion' } });
  });

  it('A walk waits for how far it is, and is named for where it goes', async () => {
    const onChange = jest.fn();
    await render(inApp(<WalkTogetherSetup circle={crewCircle} onChange={onChange} />));
    // Without a distance there is nothing to walk towards: Start stays off.
    expect(last(onChange)).toBeNull();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('From'), 'Ljubljana');
    await user.type(screen.getByLabelText('To'), 'Lisbon');
    expect(last(onChange)).toBeNull();
    await user.type(screen.getByLabelText('How far is it, in kilometres?'), '2,100');
    expect(last(onChange)).toEqual({ title: 'Walk to Lisbon', settings: { from: 'Ljubljana', to: 'Lisbon', unit: 'km', goal: 2_100_000 } });
    // Counted in steps, the same figures are steps.
    await user.press(screen.getByRole('radio', { name: 'Steps' }));
    expect(screen.getByLabelText('How far is it, in steps?')).toBeOnTheScreen();
    expect(last(onChange)).toEqual({ title: 'Walk to Lisbon', settings: { from: 'Ljubljana', to: 'Lisbon', unit: 'steps', goal: 2100 } });
    await user.clear(screen.getByLabelText('How far is it, in steps?'));
    await user.type(screen.getByLabelText('How far is it, in steps?'), 'a long way');
    expect(last(onChange)).toBeNull();
  });
});
