import { useMutation } from '@tanstack/react-query';
import { Image as ImageIcon, SquareCheck, Table } from 'lucide-react-native';
import { useRef } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { createAlbum, createChecklist, createSheet, type EventResponse, getAudience, linkThings, saveAudience, type ThingBrief, unlinkThings } from '@/api/generated/homeport';
import { changeOf, draftOf } from '@/features/sharing/audience';
import { kindOf } from '@/features/things/kinds';
import { useOpenThing } from '@/features/things/open';
import { today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout } from '@/theme';
import { GroupLabel } from '@/ui/Heading';
import { Row, RowGroup } from '@/ui/Rows';
import { Toggle } from '@/ui/Toggle';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Made = 'checklist' | 'sheet' | 'album';

/**
 * Makes one of the three things an event gathers and links it to the event. The new thing starts as yours
 * alone and is then given exactly the event's audience (also who it is hidden from), so a list for a
 * surprise party is as hidden as the party. If that second step fails it stays private, which is the safe way round.
 */
async function make(what: Made, event: EventResponse, clientId: string): Promise<{ id: string }> {
  const name = event.title.trim() || words.things.untitled;
  const made =
    what === 'checklist'
      ? await createChecklist({ clientId, circleId: event.circleId, title: words.plan.event.checklist.title(name), audience: 'me' })
      : what === 'sheet'
        ? await createSheet({ clientId, circleId: event.circleId, title: words.plan.event.budget.title(name), template: 'party_budget', audience: 'me', day: today() })
        : await createAlbum({ clientId, circleId: event.circleId, title: words.plan.event.album.title(name), audience: 'me' });
  if (event.mine && event.chip.audience !== 'me') {
    const audience = await getAudience(event.id);
    await saveAudience(made.id, changeOf(draftOf(audience), audience));
  }
  await linkThings(event.id, made.id);
  return made;
}

type Props = {
  event: EventResponse;
  /** Says a sentence that answers a press (`useNotice`). */
  say: (text: string) => void;
};

/**
 * "For this event": what an event gathers. Each thing linked to it is a row that opens it (its to-do list
 * with how far it is, its budget, a list of gift ideas); whoever may change the event can add a to-do list
 * and a budget when it has none; and the last row is its album, with a switch.
 */
export function EventLinks({ event, say }: Props) {
  const cache = useCache();
  const open = useOpenThing();
  const says = words.plan.event;
  // One id per kind of thing, kept while the screen is open: a second press doesn't make a second one.
  const ids = useRef<Record<Made, string>>({ checklist: newClientId(), sheet: newClientId(), album: newClientId() });

  const add = useMutation({
    mutationFn: (what: Made) => make(what, event, ids.current[what]),
    onSuccess: (made, what) => {
      ids.current[what] = newClientId();
      void Promise.all([cache.eventLinksChanged(event), cache.thingMade(event.circleId)]);
      if (what === 'album') say(says.album.made);
      // A new list is opened straight away, to write its first lines.
      if (what === 'checklist') open({ kind: 'checklist', id: made.id });
    },
  });
  const unlink = useMutation({
    mutationFn: (album: ThingBrief) => unlinkThings(event.id, album.id ?? ''),
    onSuccess: () => {
      void cache.eventLinksChanged(event);
      say(says.album.off);
    },
  });

  const album = event.links.find((link) => link.kind === 'album');
  const rest = event.links.filter((link) => link !== album);
  const canAdd = event.canEdit;
  const has = (kind: string) => rest.some((link) => link.kind === kind);
  const offers = canAdd ? [...(has('checklist') ? [] : (['checklist'] as const)), ...(has('sheet') ? [] : (['sheet'] as const))] : [];
  if (rest.length === 0 && offers.length === 0 && !album && !canAdd) return null;
  const problem = add.isError ? add.error : unlink.isError ? unlink.error : null;

  return (
    <>
      <GroupLabel style={{ marginTop: 18, marginHorizontal: layout.gutter }}>{says.forThis}</GroupLabel>
      <RowGroup>
        {rest.map((link, index) => {
          const Icon = kindOf(link.kind).icon;
          return <Row key={link.id} first={index === 0} icon={(c) => <Icon size={18} color={c} />} label={link.title?.trim() || words.things.untitled} note={link.glance ?? undefined} onPress={() => open(link)} />;
        })}
        {offers.map((what, index) =>
          what === 'checklist' ? (
            <Row key={what} first={rest.length + index === 0} icon={(c) => <SquareCheck size={18} color={c} />} label={says.checklist.add} note={says.checklist.note} onPress={() => add.mutate('checklist')} />
          ) : (
            <Row key={what} first={rest.length + index === 0} icon={(c) => <Table size={18} color={c} />} label={says.budget.add} note={says.budget.note} onPress={() => add.mutate('sheet')} />
          ),
        )}
        {album || canAdd ? (
          <Row
            first={rest.length + offers.length === 0}
            icon={(c) => <ImageIcon size={18} color={c} />}
            label={album ? album.title?.trim() || words.things.untitled : says.album.add}
            note={says.album.note}
            onPress={album ? () => open(album) : undefined}
            trailing={
              canAdd ? (
                <View pointerEvents={add.isPending || unlink.isPending ? 'none' : 'auto'}>
                  <Toggle label={says.album.switch} value={!!album} onChange={(on) => (on ? add.mutate('album') : album ? unlink.mutate(album) : undefined)} />
                </View>
              ) : undefined
            }
          />
        ) : null}
      </RowGroup>
      {problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
          {messageFor(problem)}
        </Txt>
      ) : null}
    </>
  );
}
