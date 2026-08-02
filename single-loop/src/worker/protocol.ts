import type { SolveResult, SolveSingleLoopInput } from "../api/types";
export type SolvePhase = "normalize"|"generate"|"validate"|"coverage";
export type WorkerRequest={type:"solve";id:number;input:SolveSingleLoopInput};
export type WorkerResponse={type:"progress";id:number;phase:SolvePhase}|{type:"result";id:number;result:SolveResult}|{type:"fatal";id:number;message:string};
