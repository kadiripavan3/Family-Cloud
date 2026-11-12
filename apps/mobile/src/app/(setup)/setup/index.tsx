import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { createCircle } from '@/api/generated/homeport';
import { switchCircle } from '@/features/circles/current';
import { useFinishSetup } from '@/features/circles/useFinishSetup';
import { NotBuiltYet } from '@/features/states/NotBuiltYet';
import { newClientId } from '@/lib/ids';
import { Button } from '@/ui/Button';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 2 Set up a circle, still to be built: who it is for, its name and people, what to bring in. Until then
 * this offers the one way through that needs no other screen: "Just me for now", a circle of one.
 */
export default function Setup() {
  const cache = useCache();
  const finish = useFinishSetup();
  const clientId = useRef(newClientId());
  const justMe = useMutation({
    mutationFn: () => createCircle({ clientId: clientId.current, kind: 'solo', name: words.circles.yours.justMe }),
    onSuccess: async (circle) => {
      await cache.circleJoined(circle);
      switchCircle(circle.id);
      finish();
    },
  });
  return (
    <NotBuiltYet
      title={words.setup.title}
      action={
        <>
          <Button label={words.setup.kind.justMe} inline loading={justMe.isPending} onPress={() => justMe.mutate()} />
          {justMe.isError ? (
            <Txt variant="caption" color="danger" center accessibilityLiveRegion="polite" style={{ marginTop: 10 }}>
              {messageFor(justMe.error)}
            </Txt>
          ) : null}
        </>
      }
    />
  );
}
