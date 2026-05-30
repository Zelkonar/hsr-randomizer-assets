#!/usr/bin/env tsx
/**
 * Shared helpers for the data scripts.
 */

/** Run `tasks` with at most `limit` in flight, preserving result order. */
export async function withConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  let index = 0;
  async function worker() {
    while (index < tasks.length) results[index] = await tasks[index++]!();
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}
