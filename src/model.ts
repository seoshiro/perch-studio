export type Kind =
  | "sofa"
  | "armchair"
  | "table"
  | "chair"
  | "desk"
  | "bed"
  | "wardrobe"
  | "shelf"
  | "console"
  | "rug"
  | "plant"
  | "lamp";
export type Finish = "clay" | "moss" | "linen" | "ink";
export type Floor = "oak" | "walnut" | "stone";
export type Light = "day" | "warm" | "evening";
export type Side = "north" | "east" | "south" | "west";
export interface Furniture {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  finish: Finish;
}
export interface Opening {
  id: string;
  kind: "door" | "window";
  side: Side;
  offset: number;
  width: number;
}
export interface Room {
  width: number;
  depth: number;
  height: number;
  floor: Floor;
  light: Light;
  openings: Opening[];
}
export interface Layout {
  id: string;
  name: string;
  room: Room;
  items: Furniture[];
}
export interface Project {
  app: "perch";
  version: 1;
  name: string;
  currentId: string;
  layouts: Layout[];
  updatedAt: string;
}
export interface Point {
  x: number;
  y: number;
}
export interface Warning {
  type: "outside" | "collision" | "door" | "height" | "opening";
  ids: string[];
}
export const LIMITS = { items: 60, layouts: 8, openings: 8, bytes: 262144 };
export const FINISHES: Record<Finish, string> = {
  clay: "#b45f46",
  moss: "#66705b",
  linen: "#d8cbb6",
  ink: "#404d51",
};
export const CATALOG: {
  kind: Kind;
  width: number;
  depth: number;
  height: number;
  category: "seating" | "surfaces" | "storage" | "accents";
}[] = [
  { kind: "sofa", width: 2.2, depth: 0.9, height: 0.82, category: "seating" },
  {
    kind: "armchair",
    width: 0.82,
    depth: 0.86,
    height: 0.82,
    category: "seating",
  },
  { kind: "chair", width: 0.48, depth: 0.5, height: 0.85, category: "seating" },
  {
    kind: "table",
    width: 1.6,
    depth: 0.85,
    height: 0.74,
    category: "surfaces",
  },
  { kind: "desk", width: 1.4, depth: 0.65, height: 0.75, category: "surfaces" },
  {
    kind: "console",
    width: 1.5,
    depth: 0.38,
    height: 0.62,
    category: "storage",
  },
  { kind: "bed", width: 1.6, depth: 2.1, height: 0.65, category: "seating" },
  {
    kind: "wardrobe",
    width: 1.5,
    depth: 0.6,
    height: 2.1,
    category: "storage",
  },
  { kind: "shelf", width: 0.9, depth: 0.32, height: 1.7, category: "storage" },
  { kind: "rug", width: 2.5, depth: 1.8, height: 0.015, category: "accents" },
  { kind: "plant", width: 0.5, depth: 0.5, height: 1.1, category: "accents" },
  { kind: "lamp", width: 0.4, depth: 0.4, height: 1.5, category: "accents" },
];
export const uid = () => crypto.randomUUID();
export const clone = <T>(value: T): T => structuredClone(value);
export const round = (n: number) => Math.round(n * 1000) / 1000;
export const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));
export const normalizeAngle = (n: number) => round(((n % 360) + 360) % 360);
export function corners(item: Furniture): Point[] {
  const a = (item.rotation * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, y]) => ({
    x: round(item.x + ((x * item.width) / 2) * c - ((y * item.depth) / 2) * s),
    y: round(item.y + ((x * item.width) / 2) * s + ((y * item.depth) / 2) * c),
  }));
}
export function polygonsOverlap(a: Point[], b: Point[]): boolean {
  for (const p of [a, b])
    for (let i = 0; i < p.length; i++) {
      const next = p[(i + 1) % p.length],
        normal = { x: -(next.y - p[i].y), y: next.x - p[i].x };
      const length = Math.hypot(normal.x, normal.y);
      if (length < 1e-9) continue;
      const pa = a.map((q) => (q.x * normal.x + q.y * normal.y) / length),
        pb = b.map((q) => (q.x * normal.x + q.y * normal.y) / length);
      if (
        Math.max(...pa) <= Math.min(...pb) + 0.005 ||
        Math.max(...pb) <= Math.min(...pa) + 0.005
      )
        return false;
    }
  return true;
}
export function doorPolygon(o: Opening, r: Room): Point[] {
  const hinge =
    o.side === "north"
      ? { x: o.offset, y: 0 }
      : o.side === "south"
        ? { x: o.offset, y: r.depth }
        : o.side === "west"
          ? { x: 0, y: o.offset }
          : { x: r.width, y: o.offset };
  const start = o.side === "west" || o.side === "east" ? Math.PI / 2 : 0;
  const delta =
    o.side === "south" || o.side === "west" ? -Math.PI / 2 : Math.PI / 2;
  return [
    hinge,
    ...Array.from({ length: 33 }, (_, i) => {
      const a = start + (delta * i) / 32;
      return {
        x: hinge.x + Math.cos(a) * o.width,
        y: hinge.y + Math.sin(a) * o.width,
      };
    }),
  ];
}
export function warnings(layout: Layout): Warning[] {
  const out: Warning[] = [];
  for (const item of layout.items) {
    if (
      corners(item).some(
        (p) =>
          p.x < -0.005 ||
          p.y < -0.005 ||
          p.x > layout.room.width + 0.005 ||
          p.y > layout.room.depth + 0.005,
      )
    )
      out.push({ type: "outside", ids: [item.id] });
    if (item.height > layout.room.height + 0.005)
      out.push({ type: "height", ids: [item.id] });
    if (item.kind !== "rug")
      for (const opening of layout.room.openings.filter(
        (o) => o.kind === "door",
      ))
        if (polygonsOverlap(corners(item), doorPolygon(opening, layout.room)))
          out.push({ type: "door", ids: [item.id, opening.id] });
  }
  for (let i = 0; i < layout.items.length; i++)
    for (let j = i + 1; j < layout.items.length; j++) {
      const a = layout.items[i],
        b = layout.items[j];
      if (a.kind === "rug" || b.kind === "rug") continue;
      if (polygonsOverlap(corners(a), corners(b)))
        out.push({ type: "collision", ids: [a.id, b.id] });
    }
  for (let i = 0; i < layout.room.openings.length; i++)
    for (let j = i + 1; j < layout.room.openings.length; j++) {
      const a = layout.room.openings[i],
        b = layout.room.openings[j];
      if (
        a.side === b.side &&
        Math.min(a.offset + a.width, b.offset + b.width) -
          Math.max(a.offset, b.offset) >
          0.005
      )
        out.push({ type: "opening", ids: [a.id, b.id] });
    }
  return out;
}
export function fit(item: Furniture, r: Room): Furniture {
  const points = corners({ ...item, x: 0, y: 0 }),
    ex = Math.max(...points.map((p) => Math.abs(p.x))),
    ey = Math.max(...points.map((p) => Math.abs(p.y)));
  return {
    ...item,
    x: round(ex > r.width / 2 ? r.width / 2 : clamp(item.x, ex, r.width - ex)),
    y: round(ey > r.depth / 2 ? r.depth / 2 : clamp(item.y, ey, r.depth - ey)),
  };
}
export function move(
  item: Furniture,
  x: number,
  y: number,
  r: Room,
  snap: boolean,
): Furniture {
  const grid = snap ? 0.1 : 0.001;
  return fit(
    {
      ...item,
      x: round(Math.round(x / grid) * grid),
      y: round(Math.round(y / grid) * grid),
    },
    r,
  );
}
export function makeItem(kind: Kind, r: Room): Furniture {
  const base = CATALOG.find((c) => c.kind === kind)!;
  return fit(
    {
      id: uid(),
      kind,
      x: r.width / 2,
      y: r.depth / 2,
      width: base.width,
      depth: base.depth,
      height: base.height,
      rotation: 0,
      finish: "clay",
    },
    r,
  );
}
export function starter(
  preset: "living" | "work" | "sleep" = "living",
): Layout {
  const room: Room = {
    width: 5.2,
    depth: 4.2,
    height: 2.7,
    floor: "oak",
    light: "day",
    openings: [
      { id: uid(), kind: "door", side: "south", offset: 0.4, width: 0.9 },
      { id: uid(), kind: "window", side: "north", offset: 1.3, width: 2 },
    ],
  };
  const make = (
    kind: Kind,
    x: number,
    y: number,
    rotation = 0,
    finish: Finish = "clay",
    changes: Partial<Furniture> = {},
  ): Furniture => ({
    ...makeItem(kind, room),
    x,
    y,
    rotation,
    finish,
    ...changes,
  });
  const items =
    preset === "living"
      ? [
          make("rug", 2.7, 2.3, 0, "linen", { width: 3.3, depth: 2.5 }),
          make("sofa", 2.6, 0.72, 0),
          make("armchair", 4.3, 2.7, 270, "moss"),
          make("table", 2.7, 2.25, 0, "linen", {
            width: 1.35,
            depth: 0.65,
            height: 0.36,
          }),
          make("console", 2.9, 3.93, 0, "ink"),
          make("plant", 0.45, 0.45, 0, "moss"),
          make("lamp", 4.34, 0.65, 0, "ink"),
        ]
      : preset === "work"
        ? [
            make("rug", 2.85, 2.4, 0, "linen"),
            make("desk", 2.5, 0.75, 0, "linen"),
            make("chair", 2.5, 1.5, 180, "moss"),
            make("shelf", 0.28, 1.4, 90, "ink"),
            make("armchair", 4.1, 3.1, 270, "clay"),
            make("plant", 4.6, 0.6, 0, "moss"),
            make("lamp", 4.8, 3.6, 0, "ink"),
          ]
        : [
            make("rug", 2.75, 2.5, 0, "linen", { width: 3, depth: 2.3 }),
            make("bed", 2.7, 1.5, 0, "linen"),
            make("console", 1.4, 0.5, 0, "ink", {
              width: 0.5,
              depth: 0.4,
              height: 0.5,
            }),
            make("console", 4, 0.5, 0, "ink", {
              width: 0.5,
              depth: 0.4,
              height: 0.5,
            }),
            make("wardrobe", 4.75, 2.95, 90, "moss"),
            make("plant", 0.6, 0.65, 0, "moss"),
          ];
  return { id: uid(), name: preset, room, items };
}
export function initialProject(): Project {
  const layout = starter();
  return {
    app: "perch",
    version: 1,
    name: "A room to settle into",
    currentId: layout.id,
    layouts: [layout],
    updatedAt: new Date().toISOString(),
  };
}
const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
export class ProjectError extends Error {
  code: "format" | "limit" | "value";
  constructor(code: "format" | "limit" | "value") {
    super(code);
    this.code = code;
  }
}
function object(x: unknown) {
  if (!isObject(x)) throw new ProjectError("format");
  return x;
}
function str(x: unknown, max = 80) {
  if (
    typeof x !== "string" ||
    !x.trim() ||
    x.length > max ||
    /[\u0000-\u001f]/.test(x)
  )
    throw new ProjectError("value");
  return x.trim();
}
function id(x: unknown) {
  const s = str(x);
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(s)) throw new ProjectError("value");
  return s;
}
function num(x: unknown, min: number, max: number) {
  if (typeof x !== "number" || !Number.isFinite(x) || x < min || x > max)
    throw new ProjectError("value");
  return round(x);
}
function en<T extends string>(x: unknown, vals: readonly T[]): T {
  if (!vals.includes(x as T)) throw new ProjectError("value");
  return x as T;
}
function arr(x: unknown, max: number): unknown[] {
  if (!Array.isArray(x)) throw new ProjectError("format");
  if (x.length > max) throw new ProjectError("limit");
  return x;
}
function unique(ids: string[]) {
  if (new Set(ids).size !== ids.length) throw new ProjectError("value");
}
export function validateProject(input: unknown): Project {
  const p = object(input);
  if (p.app !== "perch" || p.version !== 1) throw new ProjectError("format");
  const layouts = arr(p.layouts, LIMITS.layouts).map((value) => {
    const l = object(value),
      r = object(l.room),
      width = num(r.width, 2, 12),
      depth = num(r.depth, 2, 12);
    const openings = arr(r.openings, LIMITS.openings).map((v) => {
      const o = object(v),
        side = en(o.side, ["north", "east", "south", "west"] as const),
        span = side === "north" || side === "south" ? width : depth,
        w = num(o.width, 0.3, Math.min(4, span));
      return {
        id: id(o.id),
        kind: en(o.kind, ["door", "window"] as const),
        side,
        offset: num(o.offset, 0, span - w + 0.001),
        width: w,
      };
    });
    const items = arr(l.items, LIMITS.items).map((v) => {
      const f = object(v);
      return {
        id: id(f.id),
        kind: en(
          f.kind,
          CATALOG.map((c) => c.kind),
        ),
        x: num(f.x, -10, 30),
        y: num(f.y, -10, 30),
        width: num(f.width, 0.1, 5),
        depth: num(f.depth, 0.1, 5),
        height: num(f.height, 0.01, 3),
        rotation: normalizeAngle(num(f.rotation, -36000, 36000)),
        finish: en(f.finish, ["clay", "moss", "linen", "ink"] as const),
      };
    });
    unique([...items.map((i) => i.id), ...openings.map((o) => o.id)]);
    return {
      id: id(l.id),
      name: str(l.name),
      room: {
        width,
        depth,
        height: num(r.height, 2, 4),
        floor: en(r.floor, ["oak", "walnut", "stone"] as const),
        light: en(r.light, ["day", "warm", "evening"] as const),
        openings,
      },
      items,
    };
  });
  if (!layouts.length) throw new ProjectError("value");
  unique(layouts.map((l) => l.id));
  const currentId = id(p.currentId);
  if (!layouts.some((l) => l.id === currentId)) throw new ProjectError("value");
  const date = str(p.updatedAt, 40);
  if (Number.isNaN(Date.parse(date))) throw new ProjectError("value");
  return {
    app: "perch",
    version: 1,
    name: str(p.name),
    currentId,
    layouts,
    updatedAt: date,
  };
}
export function parseProject(text: string): Project {
  if (new TextEncoder().encode(text).length > LIMITS.bytes)
    throw new ProjectError("limit");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ProjectError("format");
  }
  return validateProject(value);
}
export interface History {
  past: Project[];
  present: Project;
  future: Project[];
}
export function commit(h: History, p: Project): History {
  if (JSON.stringify(h.present) === JSON.stringify(p)) return h;
  return { past: [...h.past, h.present].slice(-80), present: p, future: [] };
}
export function undo(h: History): History {
  if (!h.past.length) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past.at(-1)!,
    future: [h.present, ...h.future].slice(0, 80),
  };
}
export function redo(h: History): History {
  if (!h.future.length) return h;
  return {
    past: [...h.past, h.present].slice(-80),
    present: h.future[0],
    future: h.future.slice(1),
  };
}
export const STORAGE_KEY = "perch.project.v1",
  BACKUP_KEY = "perch.backup.v1";
export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function load(store: Store): {
  project: Project | null;
  status: "new" | "loaded" | "recovered" | "broken" | "unavailable";
} {
  try {
    const main = store.getItem(STORAGE_KEY),
      backup = store.getItem(BACKUP_KEY);
    if (!main && !backup) return { project: null, status: "new" };
    if (main)
      try {
        return { project: parseProject(main), status: "loaded" };
      } catch {
        /* try backup */
      }
    if (backup)
      try {
        return { project: parseProject(backup), status: "recovered" };
      } catch {
        /* show recovery state */
      }
    return { project: null, status: "broken" };
  } catch {
    return { project: null, status: "unavailable" };
  }
}
export function save(store: Store, p: Project): boolean {
  try {
    const previous = store.getItem(STORAGE_KEY),
      serialized = JSON.stringify(p);
    if (previous === serialized) return true;
    if (previous)
      try {
        parseProject(previous);
        store.setItem(BACKUP_KEY, previous);
      } catch {
        /* preserve good backup */
      }
    store.setItem(STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}
export function coverage(l: Layout): number {
  return round(
    (l.items
      .filter((f) => f.kind !== "rug")
      .reduce((sum, f) => sum + f.width * f.depth, 0) /
      (l.room.width * l.room.depth)) *
      100,
  );
}
