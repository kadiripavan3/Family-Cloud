import { act, render, screen, userEvent } from '@testing-library/react-native';

import { apiFetch } from '@/api/fetcher';
import { onPhone } from '@/test/phone';

import { AskAboutNotifications, type Moment } from '../AskAboutNotifications';
import { askedAboutPush, shouldAskAboutPush, turnOnPush } from '../device';
import { pushSupport } from '../support';

jest.mock('../device', () => ({ shouldAskAboutPush: jest.fn(), askedAboutPush: jest.fn(async () => undefined), turnOnPush: jest.fn() }));
jest.mock('../support', () => ({ pushSupport: jest.fn() }));

const support = jest.mocked(pushSupport);
const worthAsking = jest.mocked(shouldAskAboutPush);
const seen = jest.mocked(askedAboutPush);
const turnOn = jest.mocked(turnOnPush);

/** The app does something, and the API says yes. */
const did = async (method: string, path: string) => {
  globalThis.fetch = jest.fn(() => Promise.resolve(new Response('{}', { status: 200 }))) as unknown as typeof fetch;
  await act(async () => void (await apiFetch(path, { method })));
};
const QUESTION = 'Know when something needs you';
/** Good moments, as a screen that has them would name them: joining a circle, and asking someone to do a job. */
const MOMENTS: Moment[] = [
  ['POST', /^\/v1\/circles\/[^/]+\/join$/],
  ['POST', /^\/v1\/circles\/[^/]+\/jobs$/],
];
const asking = () => onPhone(<AskAboutNotifications after={MOMENTS} />);

describe('asking about notifications inside the app', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
    support.mockReturnValue('ready');
    worthAsking.mockResolvedValue(true);
    turnOn.mockResolvedValue('on');
  });
  afterEach(() => jest.useRealTimers());

  it('never asks when the app opens, or for reading; it waits for a moment with something to hear about', async () => {
    await render(asking());
    await act(async () => void (await jest.advanceTimersByTimeAsync(5000)));
    expect(screen.queryByText(QUESTION)).toBeNull();

    await did('GET', '/v1/circles/c1');
    await did('PUT', '/v1/me/settings');
    await act(async () => void (await jest.advanceTimersByTimeAsync(5000)));
    expect(screen.queryByText(QUESTION)).toBeNull();
    expect(worthAsking).not.toHaveBeenCalled();

    await did('POST', '/v1/circles/c1/join');
    expect(screen.queryByText(QUESTION)).toBeNull(); // first the screen shows what was just done
    await act(async () => void (await jest.advanceTimersByTimeAsync(900)));
    expect(screen.getByText(QUESTION)).toBeOnTheScreen();
    expect(seen).toHaveBeenCalledTimes(1); // remembered on this phone as soon as it is shown
  });

  it("asks, by the app's own list of moments, after someone joined a circle by its link", async () => {
    await render(onPhone(<AskAboutNotifications />));
    await did('GET', '/v1/join/the-linds');
    await did('PUT', '/v1/circles/c1/join-link');
    await act(async () => void (await jest.advanceTimersByTimeAsync(2000)));
    expect(screen.queryByText(QUESTION)).toBeNull();
    await did('PUT', '/v1/join/the-linds');
    await act(async () => void (await jest.advanceTimersByTimeAsync(900)));
    expect(screen.getByText(QUESTION)).toBeOnTheScreen();
  });

  it('gives the reason first, and the phone asks only after a yes', async () => {
    await render(asking());
    await did('POST', '/v1/circles/c1/jobs');
    await act(async () => void (await jest.advanceTimersByTimeAsync(900)));
    expect(turnOn).not.toHaveBeenCalled();

    await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(screen.getByRole('button', { name: 'Turn on notifications' }));

    expect(turnOn).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(QUESTION)).toBeNull();
  });

  it('takes "not now" for an answer', async () => {
    await render(asking());
    await did('POST', '/v1/circles/c1/join');
    await act(async () => void (await jest.advanceTimersByTimeAsync(900)));

    await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(screen.getByRole('button', { name: 'Not now' }));

    expect(turnOn).not.toHaveBeenCalled();
    expect(screen.queryByText(QUESTION)).toBeNull();
  });

  it('does not ask someone who has seen the question, or whose phone has answered already', async () => {
    worthAsking.mockResolvedValue(false);
    await render(asking());
    await did('POST', '/v1/circles/c1/join');
    await act(async () => void (await jest.advanceTimersByTimeAsync(5000)));
    expect(screen.queryByText(QUESTION)).toBeNull();
    expect(seen).not.toHaveBeenCalled();
  });

  it('does nothing at all where notifications cannot work', async () => {
    support.mockReturnValue('browser');
    await render(asking());
    await did('POST', '/v1/circles/c1/join');
    await act(async () => void (await jest.advanceTimersByTimeAsync(5000)));
    expect(worthAsking).not.toHaveBeenCalled();
    expect(screen.queryByText(QUESTION)).toBeNull();
  });

  it('has no good moment of its own yet: as the app stands, nothing it does brings the question up', async () => {
    await render(onPhone(<AskAboutNotifications />));
    await did('PUT', '/v1/me/profile');
    await did('PUT', '/v1/me/settings');
    await act(async () => void (await jest.advanceTimersByTimeAsync(5000)));
    expect(worthAsking).not.toHaveBeenCalled();
    expect(screen.queryByText(QUESTION)).toBeNull();
  });
});
