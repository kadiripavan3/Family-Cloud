import { Download, type LucideIcon, Route, Ticket, UserMinus, UserPlus } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { ActivityButton, ActivityLine } from '@/api/generated/homeport';
import { kindOf } from '@/features/things/kinds';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Emoji } from '@/ui/Emoji';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { sentenceOf } from './rows';
import { lineWhen } from './when';

/** The icon in front of a line that has no face and no emoji, by what happened. Anything else gets its thing's own icon. */
const ICONS: Partial<Record<NonNullable<ActivityLine['kind']>, LucideIcon>> = { guest_pass: Ticket, joined: UserPlus, left: UserMinus, export: Download };

/** The buttons a line draws at its end. "Not now" stands on the sheet the line opens, as the drawing has one button. */
const DRAWN = (button: ActivityButton) => button.act !== 'decline_ask';

type Props = {
  line: ActivityLine;
  /** New since the person last opened Activity here: the line stands on the soft accent. */
  fresh: boolean;
  /** What the line opens when pressed. Without it the line is plain. */
  onPress?: () => void;
  /** A button of the line was pressed. */
  onButton: (button: ActivityButton) => void;
  /** The button that is doing its work right now, by its `act`. */
  busy?: string | null;
};

/**
 * One line of Activity: who (one face, two, an emoji or an icon), the sentence with its names and titles in
 * bold, when it happened and the API's small note, the picture it is about, and what can be done right
 * here (Allow, Pay). Pressing the line opens what it is about.
 */
export function ActivityLineRow({ line, fresh, onPress, onButton, busy }: Props) {
  const { colors } = useTheme();
  const sentence = sentenceOf(line);
  const under = words.activity.under(lineWhen(line.at, line.kind === 'list'), line.note, line.kind === 'board');
  const buttons = (line.buttons ?? []).filter(DRAWN);
  const content = (
    <>
      <Lead line={line} ground={fresh ? colors.accentSoft : colors.bg} />
      <View style={{ flex: 1 }}>
        <Txt variant="callout" numberOfLines={4}>
          {(line.sentence ?? []).map((part, index) =>
            part.bold ? (
              <Txt key={index} variant="callout" weight={800}>
                {part.text}
              </Txt>
            ) : (
              part.text
            ),
          )}
        </Txt>
        {under ? (
          <Txt variant="footnote" color="muted" style={{ marginTop: 3 }}>
            {under}
          </Txt>
        ) : null}
      </View>
      {line.imageUrl ? <Photo uri={line.imageUrl} radius="tile" style={{ width: 48, height: 48 }} /> : null}
    </>
  );
  const frame = { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 } as const;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 11, paddingHorizontal: layout.rowGutter, backgroundColor: fresh ? colors.accentSoft : 'transparent' }}>
      {onPress ? (
        <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([fresh ? words.activity.fresh : null, sentence, under])} scaleTo={0.985} onPress={onPress} style={frame}>
          {content}
        </Tap>
      ) : (
        <View accessible accessibilityLabel={words.common.spoken([fresh ? words.activity.fresh : null, sentence, under])} style={frame}>
          {content}
        </View>
      )}
      {buttons.map((button) => (
        <Button
          key={button.act}
          label={button.label ?? ''}
          spoken={words.activity.buttonSpoken(button.label ?? '', sentence)}
          size="sm"
          // The answer to a question is the one thing on the page to do; paying is quieter, as on Today.
          variant={button.act === 'allow_ask' ? 'primary' : 'soft'}
          inline
          loading={busy === button.act}
          disabled={!!busy && busy !== button.act}
          onPress={() => onButton(button)}
        />
      ))}
    </View>
  );
}

/** What stands in front: the face of who did it, two faces, the thing's own emoji, Journey's mark, or an icon on a tile. */
function Lead({ line, ground }: { line: ActivityLine; ground: string }) {
  const { colors } = useTheme();
  const [first, second] = line.people ?? [];
  if (first && second) {
    return (
      <View style={{ width: 44, height: 44 }}>
        <View style={{ position: 'absolute', left: 0, top: 0 }}>
          <Avatar uri={first.avatarUrl} name={first.name ?? ''} size={32} ring={ground} />
        </View>
        <View style={{ position: 'absolute', right: 0, bottom: 0 }}>
          <Avatar uri={second.avatarUrl} name={second.name ?? ''} size={32} ring={ground} />
        </View>
      </View>
    );
  }
  if (first) return <Avatar uri={first.avatarUrl} name={first.name ?? ''} size={44} />;
  if (line.emoji) {
    return (
      <Tile>
        <Emoji char={line.emoji} size={24} />
      </Tile>
    );
  }
  if (line.kind === 'kept') {
    return (
      <Tile ground={colors.accent}>
        <Route size={22} color={colors.onAccent} strokeWidth={2.2} />
      </Tile>
    );
  }
  // A guest has no picture: their first letter stands where a face would, as for anyone without one.
  const guest = line.kind === 'guest_pass' ? line.sentence?.find((part) => part.bold)?.text : undefined;
  if (guest) return <Avatar name={guest} size={44} />;
  const Icon = (line.kind && ICONS[line.kind]) ?? kindOf(line.thingKind).icon;
  return (
    <Tile>
      <Icon size={20} color={colors.text} />
    </Tile>
  );
}

function Tile({ children, ground }: { children: ReactNode; ground?: string }) {
  const { colors } = useTheme();
  return <View style={{ width: 44, height: 44, borderRadius: radius.thumb, alignItems: 'center', justifyContent: 'center', backgroundColor: ground ?? colors.fill }}>{children}</View>;
}
