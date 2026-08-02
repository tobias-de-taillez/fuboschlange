import { pathData } from "./svg-path";
import type { Heading8, PlateModel } from "../plate/types";
import type { Point } from "../api/types";

export interface PlateLayerVisibility {
  room: boolean;
  wallDomain: boolean;
  raster: boolean;
  cells: boolean;
  nopps: boolean;
  forbidden: boolean;
  anchors: boolean;
  acceptedEdges: boolean;
  rejectedEdges: boolean;
  witnesses: boolean;
}

export const DEFAULT_PLATE_LAYERS: PlateLayerVisibility = {
  room: true,
  wallDomain: true,
  raster: true,
  cells: true,
  nopps: true,
  forbidden: true,
  anchors: true,
  acceptedEdges: true,
  rejectedEdges: true,
  witnesses: true,
};

export function renderPlateScene(
  svg: SVGSVGElement,
  model: PlateModel,
  layers: PlateLayerVisibility,
): void {
  const bounds = worldBounds(model.polygon);
  const margin = 75;
  svg.setAttribute(
    "viewBox",
    `${fmt(bounds.min.x - margin)} ${fmt(bounds.min.y - margin)} ${fmt(bounds.max.x - bounds.min.x + 2 * margin)} ${fmt(bounds.max.y - bounds.min.y + 2 * margin)}`,
  );
  const polygonPoints = model.polygon.map(pointString).join(" ");
  const localBounds = plateLocalBounds(model);
  const groups: string[] = [];

  pushLayer(groups, layers.room, "room", `<polygon class="plate-room" points="${polygonPoints}"/>`);
  pushLayer(
    groups,
    layers.wallDomain,
    "wall-domain",
    `<polygon class="wall-domain" data-clearance-mm="${fmt(model.wallClearanceMm)}" points="${polygonPoints}"/>`,
  );
  pushLayer(groups, layers.raster, "raster", rasterMarkup(model, localBounds, 75));
  pushLayer(groups, layers.cells, "cells", cellMarkup(model, localBounds));
  pushLayer(
    groups,
    layers.nopps,
    "noppen",
    model.nopps.map(nopp => `<circle class="nopp ${nopp.noppType.toLowerCase()}" cx="${fmt(nopp.center.x)}" cy="${fmt(nopp.center.y)}" r="${fmt(nopp.renderedRadiusMm)}"/>`).join(""),
  );
  pushLayer(
    groups,
    layers.forbidden,
    "forbidden",
    model.nopps.map(nopp => `<circle class="forbidden ${nopp.noppType.toLowerCase()}" cx="${fmt(nopp.center.x)}" cy="${fmt(nopp.center.y)}" r="${fmt(nopp.forbiddenRadiusMm)}"/>`).join(""),
  );
  pushLayer(
    groups,
    layers.anchors,
    "anchors",
    model.graph.nodes.map(node => {
      const direction = headingVector(node.localPose.heading);
      const worldDirection = {
        x: model.transform.u.x * direction.x + model.transform.v.x * direction.y,
        y: model.transform.u.y * direction.x + model.transform.v.y * direction.y,
      };
      const end = { x: node.worldPoint.x + 18 * worldDirection.x, y: node.worldPoint.y + 18 * worldDirection.y };
      return `<g class="pose-anchor" data-node="${node.id}"><circle cx="${fmt(node.worldPoint.x)}" cy="${fmt(node.worldPoint.y)}" r="4"/><line x1="${fmt(node.worldPoint.x)}" y1="${fmt(node.worldPoint.y)}" x2="${fmt(end.x)}" y2="${fmt(end.y)}"/></g>`;
    }).join(""),
  );
  pushLayer(
    groups,
    layers.acceptedEdges,
    "accepted-edges",
    model.graph.edges.map(edge => `<path class="accepted-edge" data-template="${escapeAttribute(edge.templateId)}" d="${pathData(edge.primitives)}"/>`).join(""),
  );
  pushLayer(
    groups,
    layers.rejectedEdges,
    "rejected-edges",
    model.graph.rejectedEdges.map(edge => `<path class="rejected-edge" data-code="${escapeAttribute(edge.code)}" data-template="${escapeAttribute(edge.templateId)}" d="${pathData(edge.primitives)}"/>`).join(""),
  );
  pushLayer(
    groups,
    layers.witnesses,
    "witnesses",
    model.graph.rejectedEdges.flatMap(edge => edge.witness === null ? [] : [`<circle class="rejection-witness" data-code="${escapeAttribute(edge.code)}" cx="${fmt(edge.witness.x)}" cy="${fmt(edge.witness.y)}" r="6"/>`]).join(""),
  );
  svg.innerHTML = groups.join("");
}

interface Bounds { min: Point; max: Point }

function worldBounds(points: Point[]): Bounds {
  const first = points[0] ?? { x: 0, y: 0 };
  const bounds = { min: { ...first }, max: { ...first } };
  for (const point of points) {
    bounds.min.x = Math.min(bounds.min.x, point.x);
    bounds.min.y = Math.min(bounds.min.y, point.y);
    bounds.max.x = Math.max(bounds.max.x, point.x);
    bounds.max.y = Math.max(bounds.max.y, point.y);
  }
  return bounds;
}

function plateLocalBounds(model: PlateModel): Bounds {
  const points = model.polygon.map(point => {
    const dx = point.x - model.transform.origin.x;
    const dy = point.y - model.transform.origin.y;
    return {
      x: dx * model.transform.u.x + dy * model.transform.u.y,
      y: dx * model.transform.v.x + dy * model.transform.v.y,
    };
  });
  return worldBounds(points);
}

function toWorld(model: PlateModel, point: Point): Point {
  return {
    x: model.transform.origin.x + model.transform.u.x * point.x + model.transform.v.x * point.y,
    y: model.transform.origin.y + model.transform.u.y * point.x + model.transform.v.y * point.y,
  };
}

function rasterMarkup(model: PlateModel, bounds: Bounds, pitch: number): string {
  const lines: string[] = [];
  const minX = Math.floor(bounds.min.x / pitch) * pitch;
  const maxX = Math.ceil(bounds.max.x / pitch) * pitch;
  const minY = Math.floor(bounds.min.y / pitch) * pitch;
  const maxY = Math.ceil(bounds.max.y / pitch) * pitch;
  for (let x = minX; x <= maxX; x += pitch) {
    const start = toWorld(model, { x, y: minY });
    const end = toWorld(model, { x, y: maxY });
    lines.push(lineMarkup(start, end, "raster-line"));
  }
  for (let y = minY; y <= maxY; y += pitch) {
    const start = toWorld(model, { x: minX, y });
    const end = toWorld(model, { x: maxX, y });
    lines.push(lineMarkup(start, end, "raster-line"));
  }
  return lines.join("");
}

function cellMarkup(model: PlateModel, bounds: Bounds): string {
  const cells: string[] = [];
  const period = 150;
  const minI = Math.floor(bounds.min.x / period);
  const maxI = Math.ceil(bounds.max.x / period);
  const minJ = Math.floor(bounds.min.y / period);
  const maxJ = Math.ceil(bounds.max.y / period);
  for (let j = minJ; j < maxJ; j += 1) {
    for (let i = minI; i < maxI; i += 1) {
      const corners = [
        toWorld(model, { x: i * period, y: j * period }),
        toWorld(model, { x: (i + 1) * period, y: j * period }),
        toWorld(model, { x: (i + 1) * period, y: (j + 1) * period }),
        toWorld(model, { x: i * period, y: (j + 1) * period }),
      ];
      cells.push(`<polygon class="fundamental-cell" data-cell="${i},${j}" points="${corners.map(pointString).join(" ")}"/>`);
    }
  }
  return cells.join("");
}

function lineMarkup(start: Point, end: Point, className: string): string {
  return `<line class="${className}" x1="${fmt(start.x)}" y1="${fmt(start.y)}" x2="${fmt(end.x)}" y2="${fmt(end.y)}"/>`;
}

function headingVector(heading: Heading8): Point {
  const diagonal = Math.SQRT1_2;
  switch (heading) {
    case "DEG0": return { x: 1, y: 0 };
    case "DEG45": return { x: diagonal, y: diagonal };
    case "DEG90": return { x: 0, y: 1 };
    case "DEG135": return { x: -diagonal, y: diagonal };
    case "DEG180": return { x: -1, y: 0 };
    case "DEG225": return { x: -diagonal, y: -diagonal };
    case "DEG270": return { x: 0, y: -1 };
    case "DEG315": return { x: diagonal, y: -diagonal };
  }
}

function pushLayer(groups: string[], visible: boolean, name: string, markup: string): void {
  if (visible) groups.push(`<g data-layer="${name}">${markup}</g>`);
}

function pointString(point: Point): string {
  return `${fmt(point.x)},${fmt(point.y)}`;
}

function fmt(value: number): string {
  const clean = Math.abs(value) < 1e-12 ? 0 : value;
  return Number(clean.toFixed(6)).toString();
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
