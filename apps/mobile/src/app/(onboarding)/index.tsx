import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { openPage } from '@/api/config';
import { ApiError, messageFor } from '@/api/fetcher';
import { saveProfile, useGetMe } from '@/api/generated/homeport';
import { type LocalPhoto, uploadPhoto } from '@/api/upload';
import { useOnboarding } from '@/auth/onboarding';
import { useSession } from '@/auth/session';
import { signInService } from '@/auth/signIn';
import { ProfilePhoto } from '@/features/media/ProfilePhoto';
import { useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { CheckRow } from '@/ui/CheckRow';
import { Field } from '@/ui/Field';
import { Heading, Lead } from '@/ui/Heading';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { rich } from '@/ui/rich';
import { words } from '@/words';

/** Create your profile: a face and a name the people in your circles recognise. Setting up a circle comes next. */
export default function CreateProfile() {
  const { colors } = useTheme();
  const router = useRouter();
  const session = useSession();
  const onboarding = useOnboarding();
  const cache = useCache();
  // Coming back from the next step, the profile already exists and this screen changes it.
  const existing = useGetMe().data?.profile;
  const [displayName, setDisplayName] = useState(existing?.displayName ?? '');
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [photoProblem, setPhotoProblem] = useState<string | null>(null);
  // Asked once, when the profile is made. Homeport's accounts are for people aged 13 and over.
  const [oldEnough, setOldEnough] = useState(false);

  // A name the sign-in already knows is offered, not asked for again: Apple hands it over once, at the
  // first sign-in. Whatever the person has typed meanwhile stays.
  const isNew = !existing;
  useEffect(() => {
    if (!isNew) return;
    let current = true;
    void signInService
      .suggestedName()
      .catch(() => null)
      .then((name) => {
        if (current && name) setDisplayName((typed) => typed || name.slice(0, 50));
      });
    return () => {
      current = false;
    };
  }, [isNew]);

  const save = useMutation({
    mutationFn: async () => {
      // The photo goes up first; the profile is saved with it.
      const avatarMediaId = photo ? await uploadPhoto(photo) : undefined;
      return saveProfile({ displayName: displayName.trim(), avatarMediaId, ageConfirmed: existing ? undefined : oldEnough });
    },
    onSuccess: async (profile) => {
      await cache.profileSaved(profile);
      router.push('/setup');
    },
  });
  const failed = save.error instanceof ApiError ? save.error : null;
  // What the API says about the name is shown under the name; anything else (no connection, the photo) above the button.
  const problem = photoProblem ?? (save.isError && !failed?.fields.displayName ? messageFor(save.error) : null);
  const canContinue = displayName.trim().length > 0 && (!!existing || oldEnough);

  return (
    <Screen
      header={<AppBar leading="none" />}
      footer={
        <>
          {problem ? (
            <Txt variant="caption" color="danger" center accessibilityLiveRegion="polite">
              {problem}
            </Txt>
          ) : null}
          <Button
            label={words.common.continue}
            size="lg"
            block
            disabled={!canContinue}
            loading={save.isPending}
            onPress={() => {
              onboarding.begin(); // stay in the sign-up steps once the profile exists
              setPhotoProblem(null);
              save.mutate();
            }}
          />
          <Button label={words.onboarding.profile.differentEmail} variant="quiet" block onPress={() => void session.signOut()} />
        </>
      }>
      <Heading style={{ marginTop: 6 }}>{words.onboarding.profile.title}</Heading>
      <Lead>{words.onboarding.profile.body}</Lead>

      <View style={{ marginTop: 22, marginBottom: 20 }}>
        <ProfilePhoto
          uri={photo?.uri ?? existing?.avatarUrl}
          name={displayName}
          onPicked={(picked) => {
            setPhoto(picked);
            setPhotoProblem(null);
          }}
          onProblem={setPhotoProblem}
        />
      </View>

      <Field
        label={words.profile.name}
        value={displayName}
        onChangeText={setDisplayName}
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
        maxLength={50}
        returnKeyType="done"
        error={failed?.fields.displayName}
      />
      {existing ? null : (
        <CheckRow
          label={words.onboarding.profile.oldEnough}
          checked={oldEnough}
          onChange={setOldEnough}
          style={{ marginTop: 18 }}
          note={
            <Txt variant="footnote" color="muted">
              {rich(words.onboarding.profile.agree, {
                terms: (text) => (
                  <Txt variant="footnote" weight={700} accessibilityRole="link" onPress={() => openPage('/terms')} style={{ color: colors.accentText }}>
                    {text}
                  </Txt>
                ),
                privacy: (text) => (
                  <Txt variant="footnote" weight={700} accessibilityRole="link" onPress={() => openPage('/privacy')} style={{ color: colors.accentText }}>
                    {text}
                  </Txt>
                ),
              })}
            </Txt>
          }
        />
      )}
    </Screen>
  );
}
