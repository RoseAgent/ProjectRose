// Concurrency scheduler for LLM calls.
//
// Currently a pass-through stub — concurrent execution is already achieved
// via Promise.all inside create_subagents and explore tools.
//
// To add microtask-window batching (fire all "ready" calls that arrive
// within the same microtask boundary together), replace the body of
// scheduleStreamChat with:
//
//   return new Promise<T>((resolve, reject) => {
//     pendingCalls.push({ fn: fn as () => Promise<unknown>, resolve, reject })
//     if (!flushScheduled) {
//       flushScheduled = true
//       Promise.resolve().then(() => {
//         flushScheduled = false
//         const batch = pendingCalls.splice(0)
//         Promise.all(batch.map(({ fn, resolve, reject }) => fn().then(resolve).catch(reject)))
//       })
//     }
//   })
//
// No call sites need to change — the interface is already in place.

export function scheduleStreamChat<T>(fn: () => Promise<T>): Promise<T> {
  return fn()
}
