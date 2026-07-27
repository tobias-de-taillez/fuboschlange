import init, { solveSingleLoop as solveWasm, solveSingleLoopWithProgress as solveWasmWithProgress } from "../wasm/pkg/single_loop_solver.js";
import type { SolveResult, SolveSingleLoopInput } from "./types";
import type { SolvePhase } from "../worker/protocol";
let ready: Promise<void> | undefined;
let initialized = false;
export function initializeSolver(): Promise<void> { return ready ??= init().then(() => { initialized = true; }); }
export function solveSingleLoop(input: SolveSingleLoopInput): SolveResult { if (!initialized) throw new Error("initializeSolver() must resolve before solveSingleLoop()"); return solveWasm(input) as SolveResult; }
export function solveSingleLoopWithProgress(input: SolveSingleLoopInput,onProgress:(phase:SolvePhase)=>void):SolveResult { if(!initialized) throw new Error("initializeSolver() must resolve before solveSingleLoop()"); return solveWasmWithProgress(input,onProgress) as SolveResult; }
