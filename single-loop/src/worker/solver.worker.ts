/// <reference lib="webworker" />
import { initializeSolver, solveSingleLoopWithProgress } from "../api/wasm";
import type { WorkerRequest, WorkerResponse } from "./protocol";
const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage=async(event:MessageEvent<WorkerRequest>)=>{const request=event.data;if(request.type!=="solve")return;try{await initializeSolver();const result=solveSingleLoopWithProgress(request.input,phase=>scope.postMessage({type:"progress",id:request.id,phase} satisfies WorkerResponse));scope.postMessage({type:"result",id:request.id,result} satisfies WorkerResponse);}catch(error){scope.postMessage({type:"fatal",id:request.id,message:error instanceof Error?error.message:String(error)} satisfies WorkerResponse);}};
