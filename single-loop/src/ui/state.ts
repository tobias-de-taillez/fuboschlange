import type{Point,SolveSingleLoopInput,SolveResult}from"../api/types";export interface EditorState{polygon:Point[];selectedEdge:number;centerOffsetMm:number;spacingMm:number;clearanceMm:number;result?:SolveResult;solving:boolean;phase?:string}
export function createEditorState():EditorState{return{polygon:[{x:0,y:0},{x:6000,y:0},{x:6000,y:4000},{x:0,y:4000}],selectedEdge:0,centerOffsetMm:3000,spacingMm:150,clearanceMm:75,solving:false}}
export function moveVertex(state:EditorState,index:number,point:Point):EditorState{return{...state,polygon:state.polygon.map((value,i)=>i===index?{...point}:value)}}
export function selectEdge(state:EditorState,index:number):EditorState{return{...state,selectedEdge:index}}
export function toInput(state:EditorState):SolveSingleLoopInput{return{polygon:state.polygon.map(point=>({...point})),connection:{edgeIndex:state.selectedEdge,centerOffsetMm:state.centerOffsetMm},requestedSpacingMm:state.spacingMm,wallClearanceMm:state.clearanceMm}}
