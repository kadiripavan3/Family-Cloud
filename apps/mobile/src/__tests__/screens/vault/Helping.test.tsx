import { cleanup, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { answerHelperAsk, getShareToPassOn, passShareOn, useGetEntrusted, useGetHelping, useGetShareToPassOn, useGetVault } from '@/api/generated/homeport';
import Helping from '@/app/(app)/vault/helping';
import { checkWordsOf } from '@/features/vault/CheckWords';
import { utf8 } from '@/features/vault/crypto/bytes';
import { openMine, publicKeyOf, sealFor } from '@/features/vault/crypto/seal';
import { split } from '@/features/vault/crypto/shamir';
import { lockVault, unlockVault } from '@/features/vault/session';
import { inApp } from '@/test/phone';
import { failed, loaded, me, pending } from '@/test/samples';
import { ALEX_KEY, ALEX_PUBLIC, entrusted, helping, NORA_KEY, vaultPerson, vaultRecord } from '@/test/samples/vault';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) };
const mockCache = { vaultHelpGiven: jest.fn(() => Promise.resolve()) };
const mockKeeper = { keptHow: jest.fn(async () => 'passcode'), canAskThePhone: jest.fn(() => false) };
jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/vault/keeper', () => new Proxy({}, { get: (_, name: string) => (...given: unknown[]) => (mockKeeper as unknown as Record<string, (...given: unknown[]) => unknown>)[name]?.(...given) }));
jest.mock('@/api/generated/homeport', () => ({
  useGetVault: jest.fn(),
  useGetHelping: jest.fn(),
  useGetEntrusted: jest.fn(),
  useGetShareToPassOn: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  answerHelperAsk: jest.fn(),
  getShareToPassOn: jest.fn(),
  passShareOn: jest.fn(),
}));

const mockMe = loaded(me());
const list = jest.mocked(useGetHelping) as unknown as jest.Mock;
const trusts = jest.mocked(useGetEntrusted) as unknown as jest.Mock;
// In these tests the signed-in person (with Nora's key) helps Alex.
const alexAsks = (over = {}) => helping({ person: vaultPerson(), ...over });

describe('9.6 Helpers, for the person who helps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (jest.mocked(useGetVault) as unknown as jest.Mock).mockReturnValue(loaded(vaultRecord()));
    list.mockReturnValue(loaded([alexAsks()]));
    trusts.mockReturnValue(loaded([]));
    (jest.mocked(useGetShareToPassOn) as unknown as jest.Mock).mockReturnValue(pending());
    jest.mocked(answerHelperAsk).mockResolvedValue(alexAsks({ state: 'accepted' }));
    unlockVault(NORA_KEY.slice());
  });
  afterEach(async () => {
    await cleanup();
    lockVault();
  });

  it('shows who asked, and takes a yes or a no', async () => {
    await render(inApp(<Helping />));
    expect(screen.getByRole('header', { name: 'People you help' })).toBeOnTheScreen();
    expect(screen.getByText('Alex Strand')).toBeOnTheScreen();
    expect(screen.getByText('Asks you to be a helper')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Yes, help Alex' }));
    await waitFor(() => expect(mockCache.vaultHelpGiven).toHaveBeenCalled());
    expect(answerHelperAsk).toHaveBeenCalledWith('hp-1', { accept: true });
    await user.press(screen.getByRole('button', { name: "No, don't help Alex" }));
    await waitFor(() => expect(answerHelperAsk).toHaveBeenLastCalledWith('hp-1', { accept: false }));
  });

  it('a helper can step down later, after being asked whether they mean it', async () => {
    list.mockReturnValue(loaded([alexAsks({ state: 'accepted' })]));
    await render(inApp(<Helping />));
    expect(screen.getByText('You are a helper')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Stop helping Alex' }));
    expect(screen.getByText('Your part of their key is thrown away.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Step down' }));
    await waitFor(() => expect(answerHelperAsk).toHaveBeenCalledWith('hp-1', { accept: false }));
  });

  it('when the person is getting back in: shows the check words of their new phone, and passes the part on sealed for that phone only', async () => {
    // Alex's Vault key was split; this helper holds part 1, sealed for them. Alex's new phone made a temporary key pair.
    const share = split(utf8('KT4M9QXZPL2A77HDVB3NE8RW'), 2)[0]!;
    const toPassOn = { recoveryId: 'r-1', sealedShare: sealFor(publicKeyOf(NORA_KEY), share, 'helper-share'), tempPublicKey: ALEX_PUBLIC };
    list.mockReturnValue(loaded([alexAsks({ state: 'accepted', recovery: { recoveryId: 'r-1', startedAt: '2026-11-12T09:00:00Z', lapsesAt: '2026-11-19T09:00:00Z', given: false } })]));
    (jest.mocked(useGetShareToPassOn) as unknown as jest.Mock).mockReturnValue(loaded(toPassOn));
    jest.mocked(getShareToPassOn).mockResolvedValue(toPassOn);
    jest.mocked(passShareOn).mockResolvedValue(alexAsks({ state: 'accepted' }));
    await render(inApp(<Helping />));
    expect(screen.getByText('Getting back in now · needs your part')).toBeOnTheScreen();
    expect(screen.getByText('Alex is getting back into their Vault')).toBeOnTheScreen();
    expect(screen.getByText('Check that it is really Alex before you help: call, or ask in person. Read these words to each other. They must be the same on both phones.')).toBeOnTheScreen();
    // Three words, worked out from the temporary key: the same on both phones, or it is not the same recovery.
    const words = checkWordsOf(ALEX_PUBLIC);
    expect(words).toHaveLength(3);
    expect(screen.getByText(words.join(' · '))).toBeOnTheScreen();
    expect(checkWordsOf(vaultRecord().publicKey!)).not.toEqual(words);

    await userEvent.setup().press(screen.getByRole('button', { name: 'They match: pass my part on' }));
    await waitFor(() => expect(mockCache.vaultHelpGiven).toHaveBeenCalled());
    const [id, sent] = jest.mocked(passShareOn).mock.calls[0]!;
    expect(id).toBe('hp-1');
    expect(sent.recoveryId).toBe('r-1');
    // Only the new phone's temporary key opens what was passed on, as a recovery share and nothing else.
    expect(openMine(ALEX_KEY, sent.resealedShare, 'recovery-share')).toEqual(share);
    expect(() => openMine(NORA_KEY, sent.resealedShare, 'recovery-share')).toThrow();
    expect(() => openMine(ALEX_KEY, sent.resealedShare, 'helper-share')).toThrow();
  });

  it('says so once the part was passed on', async () => {
    list.mockReturnValue(loaded([alexAsks({ state: 'accepted', recovery: { recoveryId: 'r-1', startedAt: '2026-11-12T09:00:00Z', lapsesAt: '2026-11-19T09:00:00Z', given: true } })]));
    await render(inApp(<Helping />));
    expect(screen.getByText('You passed your part on')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'They match: pass my part on' })).toBeNull();
  });

  it('lists the people who named this person as the one who can ask, and opens each', async () => {
    list.mockReturnValue(loaded([]));
    trusts.mockReturnValue(loaded([entrusted({ owner: vaultPerson(), state: 'asked' })]));
    await render(inApp(<Helping />));
    expect(screen.getByText('People who trust you')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Alex Strand. You asked · waiting' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/vault/entrusted/[id]', params: { id: 'e-1' } });
  });

  it('says so when nobody has asked, shows that it is loading, and a problem with a way to try again', async () => {
    list.mockReturnValue(loaded([]));
    const view = await render(inApp(<Helping />));
    expect(screen.getByText('Nobody has asked you')).toBeOnTheScreen();
    list.mockReturnValue(pending());
    await view.rerender(inApp(<Helping />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    const problem = failed(new ApiError(500, 'unknown', 'Something went wrong on our side.'));
    list.mockReturnValue(problem);
    await view.rerender(inApp(<Helping />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(problem.refetch).toHaveBeenCalled();
  });
});
