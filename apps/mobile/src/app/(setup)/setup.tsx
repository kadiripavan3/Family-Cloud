import { useCache } from '@/api/cache';
import { useOnboarding } from '@/auth/onboarding';
import { NotBuiltYet } from '@/features/states/NotBuiltYet';
import { Button } from '@/ui/Button';
import { words } from '@/words';

/**
 * 2 Set up a circle, still to be built: who it is for, its name and people, what to bring in. Until then this
 * is where sign-up ends: one button that opens the app.
 */
export default function Setup() {
  const onboarding = useOnboarding();
  const cache = useCache();
  const goHome = () => {
    // The app opens on fresh answers: what was loaded during sign-up was for someone without a profile.
    void cache.everything();
    onboarding.finish();
  };
  return <NotBuiltYet title={words.setup.title} action={<Button label={words.common.goHome} onPress={goHome} />} />;
}
