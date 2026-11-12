import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { jot } from '@/api/generated/homeport';
import Voice from '@/app/(app)/jot/voice';
import { handIn } from '@/features/jot/handedIn';
import { inApp } from '@/test/phone';
import { codeRead, eggsRead, jotMade, mumRead, readItem, reading } from '@/test/samples/jot';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: () => true };
const mockCache = { jotFiled: jest.fn() };
let mockRead = reading();
let mockIds = 0;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/ui/LightStatusBar', () => ({ LightStatusBar: () => null }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds(), useCircles: () => [mockLinds()], useCircleIfAny: () => mockLinds() }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => `client-${(mockIds += 1)}` }));
jest.mock('@/features/jot/useReading', () => ({ useReading: (_circleId: string, text: string) => ({ reading: text.trim() ? mockRead : undefined, isReading: false, error: null }) }));
jest.mock('@/api/generated/homeport', () => ({ jot: jest.fn(), undoJot: jest.fn(), moveJot: jest.fn(), useGetMe: () => ({ data: undefined }) }));
const mockLinds = () => jest.requireActual<typeof import('@/test/samples')>('@/test/samples').linds;

const SENTENCE = 'Eggs and flour, remind me to call Mum at six, and the gate code is 4471.';
const flourRead = readItem({ words: 'flour', title: 'Flour' });
const say = (sentence: string) => fireEvent.changeText(screen.getByLabelText('What you would say'), sentence);

describe('14.6 Say it all at once', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIds = 0;
    mockRead = reading([eggsRead, flourRead, mumRead, codeRead]);
    jest.mocked(jot).mockResolvedValue([jotMade()]);
  });

  it('says that a typed sentence stands in for the microphone, and has nothing to add until there is one', async () => {
    await render(inApp(<Voice />));
    expect(screen.getByText('On a phone you hold a mic and say it in one breath. Here, type or paste the sentence.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Nothing to add' })).toBeDisabled();
    // The mic itself comes with the phone build, and says so when pressed.
    await userEvent.setup().press(screen.getByRole('button', { name: 'Hold to speak' }));
    expect(screen.getByText('The microphone comes with the phone build of Homeport. Until then, type or paste the sentence: it comes apart the same way.')).toBeOnTheScreen();
  });

  it('takes one sentence apart into separate things, each with how it was read', async () => {
    await render(inApp(<Voice />));
    await say(SENTENCE);
    expect(screen.getByText('Four things')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Eggs. Groceries', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Flour. Groceries', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Call Mum. Reminder · today 18:00 · for you', checked: true })).toBeOnTheScreen();
    // The code was noticed: it is for the Vault, which is the person's alone.
    expect(screen.getByRole('checkbox', { name: 'Gate code 4471. Looks like a code · the Vault', checked: true })).toBeOnTheScreen();
    expect(screen.getByLabelText('Seen by: Only you')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add all four' })).toBeEnabled();
  });

  it('adds the whole sentence as said, from voice, and goes on to what was filed', async () => {
    await render(inApp(<Voice />));
    await say(SENTENCE);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add all four' }));
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/jot/filed'));
    expect(jot).toHaveBeenCalledWith('c-linds', expect.objectContaining({ text: SENTENCE, source: 'voice', clientId: 'client-1', day: expect.any(String) }));
    expect(mockCache.jotFiled).toHaveBeenCalledWith('c-linds', [expect.objectContaining({ id: 'j-milk' })]);
  });

  it('leaves out what was taken out before adding, and takes it back in', async () => {
    await render(inApp(<Voice />));
    await say(SENTENCE);
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: 'Flour. Groceries' }));
    expect(screen.getByRole('checkbox', { name: 'Flour. Left out', checked: false })).toBeOnTheScreen();
    expect(screen.getByText('Three things')).toBeOnTheScreen();
    await user.press(screen.getByRole('checkbox', { name: 'Gate code 4471. Looks like a code · the Vault' }));
    await user.press(screen.getByRole('button', { name: 'Add two' }));
    // What stays is sent as its own words.
    await waitFor(() => expect(jot).toHaveBeenCalledWith('c-linds', expect.objectContaining({ text: 'Eggs, remind me to call Mum at six', source: 'voice' })));

    await user.press(screen.getByRole('checkbox', { name: 'Flour. Left out' }));
    expect(screen.getByRole('checkbox', { name: 'Flour. Groceries', checked: true })).toBeOnTheScreen();
  });

  it('starts another sentence with nothing left out, and says when a sentence holds nothing', async () => {
    await render(inApp(<Voice />));
    await say(SENTENCE);
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Eggs. Groceries' }));
    mockRead = reading([eggsRead]);
    await say('eggs');
    expect(screen.getByRole('button', { name: 'Add it' })).toBeEnabled();
    mockRead = reading([]);
    await say('hm');
    expect(screen.getByText('Nothing to add in that yet')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Nothing to add' })).toBeDisabled();
  });

  it('starts with what the microphone heard, when it was handed over, and shows it as said', async () => {
    handIn({ text: 'Eggs and flour', from: 'voice' });
    mockRead = reading([eggsRead, flourRead]);
    await render(inApp(<Voice />));
    expect(screen.getByText('“Eggs and flour”')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add all two' })).toBeEnabled();
    // Pressing the sentence makes it a box again.
    await userEvent.setup().press(screen.getByRole('button', { name: '“Eggs and flour”. Change the sentence' }));
    expect(screen.getByLabelText('What you would say').props.value).toBe('Eggs and flour');
  });

  it("says what the API says when it can't be added", async () => {
    const { ApiError } = jest.requireActual<typeof import('@/api/fetcher')>('@/api/fetcher');
    jest.mocked(jot).mockRejectedValue(new ApiError(500, 'error', 'Something went wrong on our side. Try again.'));
    await render(inApp(<Voice />));
    await say(SENTENCE);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add all four' }));
    expect(await screen.findByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });
});
