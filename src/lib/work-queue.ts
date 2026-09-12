import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { MediaError } from './errors';

export type QueueEntry = { id: string; until: number; active: boolean };
export type QueueStore = {
  update<T>(change: (entries: QueueEntry[]) => T): Promise<T>;
};
export function queueNumber(name: string, fallback: number, max: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, max) : fallback;
}
export function memoryQueueStore(): QueueStore {
  const entries: QueueEntry[] = [];
  return {
    async update(change) {
      return change(entries);
    },
  };
}
const shared = globalThis as typeof globalThis & { mediaWorkQueue?: QueueStore };
export const localQueue = (shared.mediaWorkQueue ??= memoryQueueStore());

// One ordered record makes admission, FIFO promotion and release atomic, including
// across serverless instances when backed by Blob conditional writes.
export async function waitForSlot(
  store: QueueStore,
  signal: AbortSignal,
  onPosition: (position: number) => void = () => {},
) {
  const id = randomUUID();
  const capacity = queueNumber('MAX_CONCURRENT_JOBS', 2, 16);
  const maxWaiting = queueNumber('MAX_QUEUED_JOBS', 20, 100);
  const deadline = Date.now() + queueNumber('QUEUE_TIMEOUT_MS', 60000, 120000);
  const lease = queueNumber('REQUEST_TIMEOUT_MS', 240000, 900000) + 15000;
  let registered = false;
  const remove = () =>
    store.update((entries) => {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index >= 0) entries.splice(index, 1);
    });
  try {
    while (true) {
      signal.throwIfAborted();
      const result = await store.update((entries) => {
        const now = Date.now();
        for (let i = entries.length - 1; i >= 0; i--) if (entries[i].until <= now) entries.splice(i, 1);
        let own = entries.find((entry) => entry.id === id);
        if (!own) {
          if (registered || now >= deadline) throw new MediaError('error.queueTimeout', 503);
          if (entries.length >= capacity + maxWaiting) throw new MediaError('error.queueFull', 429);
          own = { id, until: deadline, active: false };
          entries.push(own);
        }
        const active = entries.filter((entry) => entry.active).length;
        const waiting = entries.filter((entry) => !entry.active);
        const index = waiting.findIndex((entry) => entry.id === id);
        // Only claim our own lease: absent/disconnected waiters cannot consume workers.
        if (!own.active && index < capacity - active) {
          own.active = true;
          own.until = now + lease;
        }
        return { active: own.active, position: index + 1 };
      });
      registered = true;
      signal.throwIfAborted();
      if (result.active) {
        let released = false;
        return async () => {
          if (released) return;
          await remove();
          released = true;
        };
      }
      onPosition(result.position);
      await delay(Math.min(1000, Math.max(1, deadline - Date.now())), undefined, { signal });
    }
  } catch (error) {
    // Expiration is the fallback if a disconnected instance cannot reach storage.
    if (registered) await remove().catch(() => {});
    throw error;
  }
}
