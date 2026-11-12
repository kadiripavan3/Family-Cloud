type Task = () => Promise<void> | void;

const tasks = new Set<Task>();
let running = false;

/** How long signing out waits for the goodbyes: someone without a connection still gets signed out. */
const PATIENCE_MS = 3000;

/**
 * Something to do while the person is still signed in, just before they are signed out: taking this phone
 * off the list for notifications, for one. Returns a function that takes the task away again.
 */
export function beforeSignOut(task: Task): () => void {
  tasks.add(task);
  return () => {
    tasks.delete(task);
  };
}

/**
 * Called by the session as the first step of signing out. It never fails and never takes long. A task that
 * itself ends in "you are signed out" (an expired sign-in) comes back here and finds the work already going.
 */
export async function runBeforeSignOut(): Promise<void> {
  if (running || tasks.size === 0) return;
  running = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const all = Promise.allSettled([...tasks].map(async (task) => task()));
    const patience = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, PATIENCE_MS);
    });
    await Promise.race([all, patience]);
  } finally {
    if (timer) clearTimeout(timer);
    running = false;
  }
}
