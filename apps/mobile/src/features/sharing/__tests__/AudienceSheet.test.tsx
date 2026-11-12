import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { saveAudience, useGetAudience } from '@/api/generated/homeport';
import { inApp } from '@/test/phone';
import { audience, failed, hiddenFromMia, loaded, pending, sharedWithSome } from '@/test/samples';

import { AudienceSheet } from '../AudienceSheet';

const mockChanged = jest.fn(() => Promise.resolve());
jest.mock('@/api/cache', () => ({ useCache: () => ({ audienceChanged: mockChanged }) }));
jest.mock('@/api/generated/homeport', () => ({ useGetAudience: jest.fn(), saveAudience: jest.fn() }));

const asked = jest.mocked(useGetAudience) as unknown as jest.Mock;
const save = jest.mocked(saveAudience);
const ID = '11111111-1111-4111-8111-111111111111';
const onClose = jest.fn();
const sheet = () => inApp(<AudienceSheet thingId={ID} visible onClose={onClose} />);

describe('4.3 Who can see this?', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(audience()));
  });

  it('says what the thing is, and offers the three choices in plain words', async () => {
    await render(sheet());
    expect(asked).toHaveBeenCalledWith(ID, { query: { enabled: true } });
    expect(screen.getByRole('header', { name: 'Who can see this?' })).toBeOnTheScreen();
    expect(screen.getByText('“Wi‑Fi and smart home”, a page in The Linds')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Only you. Nobody else, not even in search', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Some people. Pick who, and what each can do', checked: false })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Everyone in The Linds. All four, and anyone who joins later', checked: false })).toBeOnTheScreen();
    // Nobody to list while only you see it.
    expect(screen.queryByText('Alex')).toBeNull();
  });

  it('closes without saving when nothing was changed', async () => {
    await render(sheet());
    await userEvent.setup().press(screen.getByRole('button', { name: 'Done' }));
    expect(save).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shares with some people, each to view or to edit, and tells every list', async () => {
    const saved = { ...sharedWithSome };
    save.mockResolvedValue(saved);
    await render(sheet());
    const user = userEvent.setup();
    await user.press(screen.getByRole('radio', { name: /^Some people/ }));
    expect(screen.getByRole('button', { name: "Alex: Can't see it. Change" })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: /^Alex:/ }));
    await user.press(screen.getByRole('radio', { name: 'Can edit' }));
    expect(screen.getByRole('button', { name: 'Alex: Can edit. Change' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: /^Mia:/ }));
    await user.press(screen.getByRole('radio', { name: 'Can view' }));
    await user.press(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(ID, {
      audience: 'some',
      everyoneEdits: true,
      people: [
        { memberId: 'm-alex', access: 'edit' },
        { memberId: 'm-mia', access: 'view' },
      ],
      hiddenFrom: [],
    });
    expect(mockChanged).toHaveBeenCalledWith(saved);
  });

  it('shows what each person may do now', async () => {
    asked.mockReturnValue(loaded(sharedWithSome));
    await render(sheet());
    expect(screen.getByRole('radio', { name: /^Some people/, checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Alex: Can edit. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mia: Can view. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Leo: Can't see it. Change" })).toBeOnTheScreen();
  });

  it('shares with everyone, to change it or only to look', async () => {
    save.mockResolvedValue(audience({ audience: 'circle', everyoneEdits: false }));
    await render(sheet());
    const user = userEvent.setup();
    await user.press(screen.getByRole('radio', { name: /^Everyone in The Linds/ }));
    expect(screen.getByRole('button', { name: 'Leo: Can edit. Change' })).toBeOnTheScreen();
    await user.press(screen.getByRole('switch', { name: 'Everyone can change it' }));
    expect(screen.getByRole('button', { name: 'Leo: Can view. Change' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(ID, { audience: 'circle', everyoneEdits: false, people: [], hiddenFrom: [] }));
  });

  it('hides it from one person, until you change it or until a day', async () => {
    asked.mockReturnValue(loaded(audience({ audience: 'circle' })));
    save.mockResolvedValue(hiddenFromMia);
    await render(sheet());
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Mia:/ }));
    await user.press(screen.getByRole('button', { name: 'Hide it from Mia' }));
    expect(screen.getByRole('button', { name: 'Mia: Hidden. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Hidden until: Until you change it. Change' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(ID, { audience: 'circle', everyoneEdits: true, people: [], hiddenFrom: [{ memberId: 'm-mia' }] }));
  });

  it('shows who it is hidden from and until when, and shows it to them again', async () => {
    const year = new Date().getFullYear();
    const hidden = { ...hiddenFromMia, people: hiddenFromMia.people.map((person) => (person.hidden ? { ...person, hiddenThrough: `${year}-12-04` } : person)) };
    asked.mockReturnValue(loaded(hidden));
    save.mockResolvedValue(audience({ audience: 'circle' }));
    await render(sheet());
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Mia: Hidden until 4 December. Change' }));
    await user.press(screen.getByRole('button', { name: 'Show it to Mia again' }));
    expect(screen.getByRole('button', { name: 'Mia: Can edit. Change' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(ID, { audience: 'circle', everyoneEdits: true, people: [], hiddenFrom: [] }));
  });

  it("says what the API says when a choice can't be saved, and stays open", async () => {
    save.mockRejectedValue(new ApiError(400, 'nobody_chosen', 'Pick at least one person, or choose Only you.'));
    await render(sheet());
    const user = userEvent.setup();
    await user.press(screen.getByRole('radio', { name: /^Some people/ }));
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Pick at least one person, or choose Only you.')).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockChanged).not.toHaveBeenCalled();
  });

  it('can be read but not changed by someone who is not its owner', async () => {
    asked.mockReturnValue(loaded({ ...sharedWithSome, mine: false }));
    await render(sheet());
    expect(screen.getByText('Only the person who made this can change who sees it.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Alex: Can edit')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Alex:/ })).toBeNull();
    const user = userEvent.setup();
    await user.press(screen.getByRole('radio', { name: /^Only you/ }));
    expect(screen.getByRole('radio', { name: /^Some people/, checked: true })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(save).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('waits for the answer, and says so when it does not come', async () => {
    asked.mockReturnValue(pending());
    const view = await render(sheet());
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    const refetch = jest.fn();
    asked.mockReturnValue({ ...failed(new ApiError(500, 'server', 'Something went wrong on our side. Try again.')), refetch });
    await view.rerender(sheet());
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('asks nothing while it is closed', async () => {
    await render(inApp(<AudienceSheet thingId={ID} visible={false} onClose={onClose} />));
    expect(asked).toHaveBeenCalledWith(ID, { query: { enabled: false } });
    expect(screen.queryByRole('header', { name: 'Who can see this?' })).toBeNull();
  });
});
