//! The room worker's wire types, kept out of the worker module itself so the
//! page can import them without dragging the WebWorker lib into its own
//! compilation — the same split `protocol.ts` makes for the solver worker.

export interface RoomWorkerRequest {
  id: number;
  input: unknown;
}

export type RoomWorkerResponse =
  | { id: number; ok: true; plan: unknown }
  | { id: number; ok: false; message: string };
