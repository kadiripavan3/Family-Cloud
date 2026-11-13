import { type JourneyJobResponse, useGetJourneyJob } from '@/api/generated/homeport';

/** How often a running job is asked how far it is. */
const EVERY_MS = 900;

/** True once a job has ended, well or badly: there is nothing more to ask it. */
export function isOver(job: Pick<JourneyJobResponse, 'status'> | null | undefined): boolean {
  return job?.status === 'done' || job?.status === 'failed';
}

/**
 * A job the API runs by itself (keeping a journey, sending a draft), asked again and again until it ends.
 * `started` is the answer that started it, shown until the first asking comes back.
 */
export function useJourneyJob(started: JourneyJobResponse | null | undefined) {
  const asked = useGetJourneyJob(started?.id ?? '', {
    query: { enabled: !!started && !isOver(started), refetchInterval: (query) => (isOver(query.state.data) ? false : EVERY_MS) },
  });
  // A job that was started again has a new start; an answer about the same job is always the newer of the two.
  const job = started && asked.data?.id === started.id ? asked.data : (started ?? null);
  return { job, problem: asked.isError && !asked.data ? asked.error : null };
}
