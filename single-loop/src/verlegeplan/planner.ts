import type { RoomPlan, RoomPlanInput } from "./types";
import type { RoomWorkerRequest, RoomWorkerResponse } from "../worker/room-protocol";

export interface Planner {
  plan(input: RoomPlanInput): Promise<RoomPlan>;
  /** Kills the running worker; every pending promise rejects with AbortError. */
  abort(): void;
}

/**
 * One plan at a time, off the page's thread, abortable.
 *
 * A run takes minutes; starting a new one must not wait for the old. Abort
 * terminates the worker outright — wasm has no cancellation — and a fresh
 * worker is built for the next run. Each request carries an id, so a late
 * answer from a dead worker can never resolve a newer request.
 */
export function workerPlanner(factory: () => Worker): Planner {
  let worker: Worker | null = null;
  let next = 0;
  const pending = new Map<
    number,
    { resolve: (plan: RoomPlan) => void; reject: (why: Error) => void }
  >();

  // A worker that dies — a bad import, a wasm that will not load — otherwise
  // just goes quiet and the page says "rechnet …" for ever. Fail the waiting
  // requests instead, with what the browser said.
  const fail = (why: string) => {
    for (const [id, waiting] of pending) {
      pending.delete(id);
      waiting.reject(new Error(why));
    }
  };

  const attach = (target: Worker) => {
    target.onerror = (event) => fail(event.message || "Der Rechen-Worker ist abgestürzt");
    target.onmessageerror = () => fail("Der Rechen-Worker hat eine unlesbare Antwort geschickt");
    target.onmessage = (event: MessageEvent<RoomWorkerResponse>) => {
      const message = event.data;
      const waiting = pending.get(message.id);
      if (!waiting) return;
      pending.delete(message.id);
      if (message.ok) waiting.resolve(message.plan as RoomPlan);
      else waiting.reject(new Error(message.message));
    };
  };

  return {
    plan(input) {
      if (!worker) {
        worker = factory();
        attach(worker);
      }
      return new Promise<RoomPlan>((resolve, reject) => {
        const id = ++next;
        pending.set(id, { resolve, reject });
        worker!.postMessage({ id, input } satisfies RoomWorkerRequest);
      });
    },
    abort() {
      if (!worker) return;
      worker.terminate();
      worker = null;
      const aborted = [...pending.values()];
      pending.clear();
      for (const waiting of aborted) {
        waiting.reject(new DOMException("Abgebrochen", "AbortError"));
      }
    },
  };
}
