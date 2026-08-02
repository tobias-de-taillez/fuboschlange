import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { initializeSolver, solveSingleLoop } from "../../src/api/wasm";

describe("wasm solver", () => {
  it("returns typed invalid wall clearance", async () => {
    const bytes = await readFile(`${process.cwd()}/src/wasm/pkg/single_loop_solver_bg.wasm`);
    vi.stubGlobal("fetch", async () => new Response(bytes, { headers: { "Content-Type": "application/wasm" } }));
    await initializeSolver();
    const result = solveSingleLoop({polygon:[{x:0,y:0},{x:600,y:0},{x:600,y:400},{x:0,y:400}],connection:{edgeIndex:0,centerOffsetMm:300},requestedSpacingMm:150,wallClearanceMm:7});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_WALL_CLEARANCE");
  });
});
