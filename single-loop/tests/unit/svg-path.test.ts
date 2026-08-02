import{expect,it}from"vitest";import{pathData}from"../../src/render/svg-path";
it("emits exact SVG arc commands",()=>{expect(pathData([{kind:"arc",start:{x:80,y:0},end:{x:0,y:80},center:{x:0,y:0},radiusMm:80,sweepRad:Math.PI/2}])).toBe("M 80 0 A 80 80 0 0 1 0 80")});
it("uses the large arc flag",()=>{expect(pathData([{kind:"arc",start:{x:80,y:0},end:{x:0,y:-80},center:{x:0,y:0},radiusMm:80,sweepRad:1.5*Math.PI}])).toContain("A 80 80 0 1 1")});
