import { afterEach, expect, it, vi } from 'vitest';
import { memoryQueueStore, waitForSlot, queueNumber } from '../src/lib/work-queue';

afterEach(() => vi.unstubAllEnvs());
const signal = () => new AbortController().signal;
it('admits only one worker and promotes waiting jobs in FIFO order', async () => {
  vi.stubEnv('MAX_CONCURRENT_JOBS', '1');
  const store = memoryQueueStore();
  const release = await waitForSlot(store, signal());
  const firstPosition = vi.fn(),
    secondPosition = vi.fn();
  const first = waitForSlot(store, signal(), firstPosition);
  const second = waitForSlot(store, signal(), secondPosition);
  await vi.waitFor(() => {
    expect(firstPosition).toHaveBeenCalledWith(1);
    expect(secondPosition).toHaveBeenCalledWith(2);
  });
  await release();
  const releaseFirst = await first;
  const entries = await store.update((entries) => structuredClone(entries));
  expect(entries.filter((entry) => entry.active)).toHaveLength(1);
  expect(entries).toHaveLength(2);
  await releaseFirst();
  await releaseFirst(); // Idempotent releases cannot free someone else's slot.
  await (
    await second
  )();
  expect(await store.update((entries) => entries.length)).toBe(0);
});
it('bounds the queue, removes cancelled waiters and never starts their work', async () => {
  vi.stubEnv('MAX_CONCURRENT_JOBS', '1');
  vi.stubEnv('MAX_QUEUED_JOBS', '1');
  const store = memoryQueueStore();
  const release = await waitForSlot(store, signal());
  const controller = new AbortController();
  const position = vi.fn();
  const pending = waitForSlot(store, controller.signal, position);
  const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(position).toHaveBeenCalledWith(1));
  await expect(waitForSlot(store, signal())).rejects.toMatchObject({ code: 'error.queueFull' });
  controller.abort();
  await cancelled;
  expect(await store.update((entries) => entries.length)).toBe(1);
  await release();
});
it('times out and removes a waiter without disturbing an active worker', async () => {
  vi.stubEnv('MAX_CONCURRENT_JOBS', '1');
  vi.stubEnv('QUEUE_TIMEOUT_MS', '20');
  const store = memoryQueueStore();
  const release = await waitForSlot(store, signal());
  await expect(waitForSlot(store, signal())).rejects.toMatchObject({ code: 'error.queueTimeout' });
  expect(await store.update((entries) => entries.length)).toBe(1);
  await release();
});
it('recovers expired crash leases and rejects an already cancelled request', async () => {
  const store = memoryQueueStore();
  await store.update((entries) => entries.push({ id: 'crashed', until: Date.now() - 1, active: true }));
  const controller = new AbortController();
  controller.abort();
  await expect(waitForSlot(store, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  const release = await waitForSlot(store, signal());
  expect(await store.update((entries) => entries.some((entry) => entry.id === 'crashed'))).toBe(false);
  await release();
});
it('uses safe bounds for invalid capacity settings', () => {
  for (const value of ['NaN', '-1', '0', 'Infinity', '1.5']) {
    vi.stubEnv('MAX_CONCURRENT_JOBS', value);
    expect(queueNumber('MAX_CONCURRENT_JOBS', 2, 16)).toBe(2);
  }
});
