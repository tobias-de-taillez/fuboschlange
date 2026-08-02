import { describe, expect, it, vi } from "vitest";
import { workerPlanner } from "../../src/verlegeplan/planner";

function fakeWorker() {
  const worker = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    onmessageerror: null as (() => void) | null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  };
  return worker;
}

describe("workerPlanner", () => {
  it("resolves the request whose id answers", async () => {
    const worker = fakeWorker();
    const planner = workerPlanner(() => worker as unknown as Worker);
    const promise = planner.plan({} as never);
    worker.onmessage!({ data: { id: 1, ok: true, plan: { circuits: [] } } } as never);
    await expect(promise).resolves.toEqual({ circuits: [] });
  });

  it("abort terminates the worker and rejects pending runs", async () => {
    const worker = fakeWorker();
    const planner = workerPlanner(() => worker as unknown as Worker);
    const promise = planner.plan({} as never);
    planner.abort();
    expect(worker.terminate).toHaveBeenCalledOnce();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("a late answer from a dead worker resolves nothing", async () => {
    const worker = fakeWorker();
    const planner = workerPlanner(() => worker as unknown as Worker);
    const first = planner.plan({} as never);
    planner.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    // the dead worker's handler still exists; answering on it must be a no-op
    expect(() =>
      worker.onmessage!({ data: { id: 1, ok: true, plan: {} } } as never),
    ).not.toThrow();
  });
});
