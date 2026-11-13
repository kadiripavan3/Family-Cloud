import { useRouter } from 'expo-router';
import { ArrowLeftRight, Bell, ChevronRight, CloudUpload, Download, Route, Settings, Shield, Users } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGetJourneySwitch, useGetMe, useGetOverview, useGetStorage } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { TAB_BAR_ROOM } from '@/features/home/places';
import { AppSwitchSheet } from '@/features/journeyLink/AppSwitchSheet';
import { formatBytes } from '@/features/library/sizes';
import { PHONE_SECURITY, type PhoneSecurity, phoneSecurityKey } from '@/features/settings/security';
import { firstName } from '@/lib/names';
import { useKept } from '@/lib/useKept';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { RoundButton } from '@/ui/RoundButton';
import { Row, RowGroup } from '@/ui/Rows';
import { Stat } from '@/ui/Stat';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 12.1 You: the same profile card as Journey, because it is the same person. Under it: circles, storage,
 * security, notifications and appearance, and the way out. The swap button and the line about the shared
 * account (what you have in Journey, in numbers) both open "Your apps" (10.1), the way to the other app.
 */
export default function You() {
  const router = useRouter();
  const { colors, shadow } = useTheme();
  const me = useGetMe().data;
  const overview = useGetOverview().data;
  // "48 of 200 GB": what the current circle keeps, of what it may keep.
  const storage = useGetStorage(useCircle().id).data;
  const [security] = useKept<PhoneSecurity>(phoneSecurityKey(me?.id), PHONE_SECURITY);
  const journey = useGetJourneySwitch().data;
  const [apps, setApps] = useState(false);
  const profile = me?.profile;
  // The app only opens once the profile is known (the root layout sees to that).
  if (!profile) return null;

  const first = firstName(profile.displayName);
  const says = words.you;
  // The numbers are quiet until they are known: a dash, never a made-up nought.
  const count = (value: number | undefined) => (value === undefined ? '–' : words.common.number(value));
  const kept = overview ? says.size(overview.bytesKept) : '–';
  // What the account holds in Journey: its numbers there, or that there is no profile yet. Quiet until it is known.
  const inJourney = !journey ? '–' : !journey.available ? words.together.apps.off : journey.journey ? words.together.apps.counts(journey.journey.journeys ?? 0, journey.journey.following ?? 0) : (journey.note ?? words.together.apps.noProfileYet);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_ROOM }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, paddingTop: 4, paddingBottom: 6, paddingHorizontal: layout.barGutter }}>
          <RoundButton label={says.swap} icon={(c) => <ArrowLeftRight size={20} color={c} />} onPress={() => setApps(true)} />
          <RoundButton label={says.settings} icon={(c) => <Settings size={20} color={c} />} onPress={() => router.push('/settings')} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: layout.barGutter, paddingTop: 22, paddingBottom: 20, paddingHorizontal: 18, borderRadius: radius.panel, backgroundColor: colors.surface, boxShadow: shadow.md }}>
          <View style={{ flex: 1.15, alignItems: 'center' }}>
            <Avatar uri={profile.avatarUrl} name={profile.displayName} size={96} />
            <Txt variant="title" accessibilityRole="header" numberOfLines={2} center style={{ marginTop: 8 }}>
              {first}
            </Txt>
            {/* The whole name under the first one, when there is more of it. */}
            {profile.displayName.trim() === first ? null : (
              <Txt variant="caption" color="muted" numberOfLines={1}>
                {profile.displayName}
              </Txt>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Stat layout="stack" size="titleSmall" value={count(overview?.circles.length)} label={says.stats.circles} />
            <Stat layout="stack" size="titleSmall" divider value={count(overview?.notes)} label={says.stats.notes} />
            <Stat layout="stack" size="titleSmall" divider value={kept} label={says.stats.kept} />
          </View>
        </View>

        <NoteBox
          soft
          icon={() => (
            <View style={{ width: 28, height: 28, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
              <Route size={16} color={colors.onAccent} strokeWidth={2.2} />
            </View>
          )}
          title={says.account.title}
          trailing={<RoundArrow label={words.together.apps.rowSpoken(inJourney)} onPress={() => setApps(true)} />}
          style={{ alignItems: 'center', marginTop: 14, marginHorizontal: layout.barGutter }}>
          {inJourney}
        </NoteBox>

        <View style={{ marginTop: 14 }}>
          <RowGroup>
            <Row first icon={(c) => <Users size={18} color={c} />} label={says.rows.circles} note={overview?.circles.length ? overview.circles.join(', ') : undefined} onPress={() => router.push('/circles')} />
            <Row icon={(c) => <CloudUpload size={18} color={c} />} label={says.rows.storage} note={storage ? says.rows.storageNote(formatBytes(storage.usedBytes), formatBytes(storage.quotaBytes)) : undefined} onPress={() => router.push('/settings/storage')} />
            <Row icon={(c) => <Shield size={18} color={c} />} label={says.rows.privacy} note={says.rows.privacyNote(security.faceId, security.lockAfterMinutes)} onPress={() => router.push('/settings/security')} />
            <Row icon={(c) => <Bell size={18} color={c} />} label={says.rows.notificationsAndAppearance} onPress={() => router.push('/settings')} />
            <Row icon={(c) => <Download size={18} color={c} />} label={says.rows.leaving} onPress={() => router.push('/settings/leaving')} />
          </RowGroup>
        </View>
      </ScrollView>

      <AppSwitchSheet visible={apps} onClose={() => setApps(false)} />
    </SafeAreaView>
  );
}

/** The arrow at the end of the line about the shared account. It is small, and its touch area is not. */
function RoundArrow({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} hitSlop={14} onPress={onPress} style={{ alignSelf: 'center' }}>
      <ChevronRight size={18} color={colors.muted} />
    </Tap>
  );
}
