/// <reference lib="webworker" />
//! Planning a whole room takes tens of seconds — three certified spirals on one
//! nub lattice, each of them searched rather than constructed. On the page's own
//! thread that is a frozen tab with no way to show progress or take the next
//! click, so it runs here.

import init, { planRoom } from "../wasm/pkg/single_loop_solver.js";
import type { RoomWorkerRequest, RoomWorkerResponse } from "./room-protocol";

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

/** The wasm module is loaded once and reused; every plan pays for it otherwise. */
let ready: Promise<unknown> | undefined;

scope.onmessage = async (event: MessageEvent<RoomWorkerRequest>) => {
  const request = event.data;
  try {
    ready ??= init();
    await ready;
    scope.postMessage({
      id: request.id,
      ok: true,
      plan: planRoom(request.input),
    } satisfies RoomWorkerResponse);
  } catch (error) {
    scope.postMessage({
      id: request.id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    } satisfies RoomWorkerResponse);
  }
};
