import { render, screen, userEvent } from '@testing-library/react-native';
import { File, FileText, SquareCheck } from 'lucide-react-native';
import { Text } from 'react-native';

import { ThingKind } from '@/api/generated/homeport';
import { onPhone } from '@/test/phone';
import { everyone, linds, loaded, me, thing, withAlex } from '@/test/samples';

import { kindOf } from '../kinds';
import { looksLikeId, thingHref, useOpenThing } from '../open';
import { ThingRow } from '../ThingRow';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/api/generated/homeport', () => ({ ...jest.requireActual<typeof import('@/api/generated/homeport')>('@/api/generated/homeport'), useGetMe: jest.fn(() => mockMe) }));

const mockLinds = linds;
const mockMe = loaded(me());
const ID = '11111111-1111-4111-8111-111111111111';

describe('opening a thing of any kind', () => {
  beforeEach(() => jest.clearAllMocks());

  it('finds its screen by its kind, with dashes where the API has underscores', () => {
    expect(thingHref({ kind: 'page', id: ID })).toEqual({ pathname: '/[kind]/[id]', params: { kind: 'page', id: ID } });
    expect(thingHref({ kind: 'checklist', id: ID })).toEqual({ pathname: '/[kind]/[id]', params: { kind: 'checklist', id: ID } });
    expect(thingHref({ kind: 'vault_item', id: ID })).toEqual({ pathname: '/[kind]/[id]', params: { kind: 'vault-item', id: ID } });
  });

  it('opens it from anywhere with one helper', async () => {
    function Opens() {
      const open = useOpenThing();
      return <Text onPress={() => open({ kind: 'bill', id: ID })}>open</Text>;
    }
    await render(<Opens />);
    await userEvent.setup().press(screen.getByText('open'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'bill', id: ID } });
  });

  it('tells an id from any other word in an address', () => {
    expect(looksLikeId(ID)).toBe(true);
    expect(looksLikeId('note')).toBe(false);
    expect(looksLikeId(undefined)).toBe(false);
  });

  it('has an icon and a word for each kind, and a plain one for a kind it has not met', () => {
    expect(kindOf('page')).toEqual({ icon: FileText, name: 'Page', a: 'a page' });
    expect(kindOf('checklist')).toEqual({ icon: SquareCheck, name: 'List', a: 'a list' });
    expect(kindOf('wish_list')).toEqual({ icon: File, name: 'Thing', a: 'a thing' });
    // Every kind the API has today has its own word.
    for (const kind of Object.values(ThingKind)) expect(kindOf(kind).name).not.toBe('Thing');
    expect(kindOf(undefined).name).toBe('Thing');
  });
});

describe('a thing as a row', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls a photo or a video that has no title by what it is', async () => {
    await render(onPhone(<ThingRow look="grouped" thing={thing({ kind: 'photo', title: '', glance: 'Sat 7 Nov · Lake Bled' })} />));
    expect(screen.getByRole('button', { name: 'Photo. Photo. Sat 7 Nov · Lake Bled' })).toBeOnTheScreen();
  });

  it('shows its title, where it stands and who sees it, and opens it', async () => {
    await render(onPhone(<ThingRow thing={thing({ kind: 'checklist', title: 'Party prep', glance: '4 of 9 done', chip: everyone })} />));
    expect(screen.getByText('Party prep')).toBeOnTheScreen();
    expect(screen.getByText('4 of 9 done')).toBeOnTheScreen();
    expect(screen.getByLabelText('Seen by: The Linds')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Party prep. List. 4 of 9 done' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'checklist', id: ID } });
  });

  it('shows the words a search found inside it in place of where it stands', async () => {
    await render(onPhone(<ThingRow thing={thing({ glance: 'Edited yesterday', chip: withAlex })} line="“…all four passports and…”" />));
    expect(screen.getByText('“…all four passports and…”')).toBeOnTheScreen();
    expect(screen.queryByText('Edited yesterday')).toBeNull();
    expect(screen.getByLabelText('Seen by: Alex and you')).toBeOnTheScreen();
  });

  it('in a group it ends in an arrow, or in whatever the list puts there, and does what the list says', async () => {
    const onPress = jest.fn();
    await render(onPhone(<ThingRow look="grouped" first thing={thing({ title: '' })} trailing={<Text>ticked</Text>} onPress={onPress} />));
    expect(screen.getByText('Untitled')).toBeOnTheScreen();
    expect(screen.getByText('ticked')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Seen by/)).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Untitled. Page' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
