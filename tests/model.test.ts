import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialProject,
  starter,
  corners,
  polygonsOverlap,
  doorPolygon,
  warnings,
  fit,
  move,
  clone,
  commit,
  undo,
  redo,
  parseProject,
  validateProject,
  save,
  load,
  STORAGE_KEY,
  BACKUP_KEY,
  CATALOG,
  normalizeAngle,
  LIMITS,
} from "../src/model.ts";
import type { Furniture, History, Project, Store } from "../src/model.ts";
import {
  countLabel,
  displayName,
  keys,
  locales,
  translator,
} from "../src/i18n.ts";
function storage() {
  const data = new Map<string, string>();
  const store: Store = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
  return { data, store };
}
const base = (): Furniture => ({
  ...starter().items.find((i) => i.kind === "sofa")!,
  x: 2,
  y: 2,
  width: 2,
  depth: 1,
  rotation: 0,
});
test("rotated footprints preserve area and place the quarter-turn correctly", () => {
  const f = base(),
    p = corners({ ...f, rotation: 90 });
  assert.deepEqual(p, [
    { x: 2.5, y: 1 },
    { x: 2.5, y: 3 },
    { x: 1.5, y: 3 },
    { x: 1.5, y: 1 },
  ]);
  for (let rotation = 0; rotation < 360; rotation += 7) {
    const c = corners({ ...f, rotation });
    const area = Math.abs(
      c.reduce(
        (a, p, i) => a + p.x * c[(i + 1) % 4].y - p.y * c[(i + 1) % 4].x,
        0,
      ) / 2,
    );
    assert.ok(Math.abs(area - 2) < 0.005);
  }
});
test("SAT is symmetric, detects rotated overlaps, and allows touching edges", () => {
  const a = base(),
    touch = { ...a, x: 4 },
    overlap = { ...a, x: 3.4, rotation: 45 };
  assert.equal(polygonsOverlap(corners(a), corners(touch)), false);
  assert.equal(polygonsOverlap(corners(a), corners(overlap)), true);
  for (let r = 0; r < 360; r += 13) {
    const b = { ...a, x: 2.7, y: 2.4, rotation: r };
    assert.equal(
      polygonsOverlap(corners(a), corners(b)),
      polygonsOverlap(corners(b), corners(a)),
    );
  }
});
test("all four door swings stay inward, preserve hinges and detect furniture", () => {
  const room = starter().room;
  for (const side of ["north", "east", "south", "west"] as const) {
    const opening = {
      id: "door",
      kind: "door" as const,
      side,
      offset: 0.5,
      width: 0.9,
    };
    const p = doorPolygon(opening, room);
    assert.ok(
      p.every(
        (q) =>
          q.x >= -0.001 &&
          q.y >= -0.001 &&
          q.x <= room.width + 0.001 &&
          q.y <= room.depth + 0.001,
      ),
    );
    const hinge = p[0];
    for (const q of p.slice(1))
      assert.ok(
        Math.abs(Math.hypot(q.x - hinge.x, q.y - hinge.y) - 0.9) < 1e-6,
      );
    const midpoint = p[17];
    const item = {
      ...base(),
      x: (midpoint.x + hinge.x) / 2,
      y: (midpoint.y + hinge.y) / 2,
      width: 0.2,
      depth: 0.2,
    };
    const l = {
      ...starter(),
      room: { ...room, openings: [opening] },
      items: [item],
    };
    assert.ok(warnings(l).some((w) => w.type === "door"));
  }
});
test("rugs allow intentional overlaps; solid pieces and boundaries are checked", () => {
  const a = base();
  const l = {
    ...starter(),
    items: [a, { ...a, id: "rug", kind: "rug" as const }],
  };
  assert.deepEqual(warnings(l), []);
  l.items[1] = { ...a, id: "solid" };
  assert.equal(warnings(l)[0].type, "collision");
  l.items = [{ ...a, x: 0 }];
  assert.ok(warnings(l).some((w) => w.type === "outside"));
});
test("furniture height and overlapping openings produce specific notes", () => {
  const l = starter();
  l.items = [{ ...base(), height: 3 }];
  l.room.openings = [
    { id: "a", kind: "door", side: "north", offset: 0.5, width: 1 },
    { id: "b", kind: "window", side: "north", offset: 1, width: 1 },
  ];
  assert.ok(warnings(l).some((w) => w.type === "height"));
  assert.ok(warnings(l).some((w) => w.type === "opening"));
});
test("fitting and snap stay inside a room at every orientation", () => {
  const r = starter().room;
  for (const c of CATALOG)
    for (let rotation = 0; rotation < 360; rotation += 11) {
      const item = { ...base(), ...c, rotation };
      for (const [x, y] of [
        [-3, -3],
        [20, 20],
        [2.17, 1.93],
      ]) {
        const moved = move(item, x, y, r, true);
        assert.ok(
          corners(moved).every(
            (p) =>
              p.x >= -0.002 &&
              p.y >= -0.002 &&
              p.x <= r.width + 0.002 &&
              p.y <= r.depth + 0.002,
          ),
        );
      }
    }
  const oversized = fit(
    { ...base(), width: 5, depth: 5 },
    { ...r, width: 2, depth: 2 },
  );
  assert.equal(oversized.x, 1);
  assert.equal(oversized.y, 1);
  assert.equal(normalizeAngle(-15), 345);
});
test("furnished presets are valid, have no fit conflicts and remain independent", () => {
  for (const preset of ["living", "work", "sleep"] as const) {
    const l = starter(preset),
      p = initialProject();
    p.layouts = [l];
    p.currentId = l.id;
    validateProject(p);
    assert.deepEqual(warnings(l), [], preset);
  }
  const p = initialProject(),
    l = clone(p.layouts[0]);
  l.id = "variant";
  p.layouts.push(l);
  l.items[0].width = 1;
  assert.notEqual(p.layouts[0].items[0].width, 1);
});
test("undo and redo restore complete room data; a new change discards future", () => {
  let h: History = { past: [], present: initialProject(), future: [] };
  const first = clone(h.present),
    changed = clone(first);
  changed.layouts[0].items[0].rotation = 45;
  changed.layouts[0].room.width = 7;
  h = commit(h, changed);
  assert.deepEqual(undo(h).present, first);
  assert.deepEqual(redo(undo(h)).present, changed);
  const after = clone(first);
  after.name = "Different";
  h = commit(undo(h), after);
  assert.equal(h.future.length, 0);
  assert.equal(commit(h, clone(after)), h);
  for (let i = 0; i < 100; i++) {
    const p = clone(h.present);
    p.name = `Room ${i}`;
    h = commit(h, p);
  }
  assert.equal(h.past.length, 80);
});
test("portable JSON round-trip restores every field and all layouts", () => {
  const p = initialProject();
  const other = starter("work");
  p.layouts.push(other);
  p.currentId = other.id;
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
});
test("invalid, hostile, excessive and malformed imports are rejected without mutation", () => {
  const good = initialProject(),
    original = clone(good);
  const failures: ((p: Project) => void)[] = [
    (p) => {
      p.version = 2 as 1;
    },
    (p) => {
      p.layouts[0].items[0].width = NaN;
    },
    (p) => {
      p.layouts[0].room.width = 1;
    },
    (p) => {
      p.layouts[0].items[0].x = Infinity;
    },
    (p) => {
      p.layouts[0].items[0].kind = "script" as Furniture["kind"];
    },
    (p) => {
      p.layouts[0].items[1].id = p.layouts[0].items[0].id;
    },
    (p) => {
      p.currentId = "missing";
    },
    (p) => {
      p.layouts = Array.from({ length: 9 }, () => clone(p.layouts[0]));
    },
    (p) => {
      p.layouts[0].items = Array.from({ length: 61 }, () =>
        clone(p.layouts[0].items[0]),
      );
    },
    (p) => {
      p.layouts[0].room.openings[0].offset = 30;
    },
  ];
  for (const alter of failures) {
    const p = clone(good);
    alter(p);
    assert.throws(() => validateProject(p));
  }
  assert.throws(() => parseProject("{"));
  assert.throws(() => parseProject(" ".repeat(LIMITS.bytes + 1)));
  assert.throws(() => validateProject(null));
  assert.deepEqual(good, original);
  const hostile = JSON.parse(JSON.stringify(good));
  hostile.__proto__ = { polluted: true };
  const sanitized = validateProject(hostile);
  assert.equal(Object.hasOwn(sanitized, "__proto__"), false);
  assert.equal(Object.hasOwn({}, "polluted"), false);
});
test("autosave/reload and valid backup recovery preserve data", () => {
  const { store, data } = storage(),
    a = initialProject(),
    b = clone(a);
  b.name = "Edited";
  assert.equal(save(store, a), true);
  assert.equal(save(store, b), true);
  assert.deepEqual(load(store).project, b);
  assert.deepEqual(parseProject(data.get(BACKUP_KEY)!), a);
  save(store, b);
  assert.deepEqual(parseProject(data.get(BACKUP_KEY)!), a);
  data.set(STORAGE_KEY, "broken");
  assert.equal(load(store).status, "recovered");
  assert.deepEqual(load(store).project, a);
  save(store, b);
  assert.deepEqual(parseProject(data.get(BACKUP_KEY)!), a);
  data.set(STORAGE_KEY, "broken");
  data.set(BACKUP_KEY, "broken");
  assert.equal(load(store).status, "broken");
});
test("storage failures are surfaced and never claim a saved result", () => {
  const denied: Store = {
    getItem: () => {
      throw Error("denied");
    },
    setItem: () => {
      throw Error("quota");
    },
  };
  assert.equal(load(denied).status, "unavailable");
  assert.equal(save(denied, initialProject()), false);
  const { store, data } = storage();
  const a = initialProject();
  save(store, a);
  const quota: Store = {
    getItem: store.getItem,
    setItem: (k, v) => {
      if (k === STORAGE_KEY) throw Error("quota");
      store.setItem(k, v);
    },
  };
  const b = clone(a);
  b.name = "Unsaved";
  assert.equal(save(quota, b), false);
  assert.deepEqual(parseProject(data.get(STORAGE_KEY)!), a);
});
test("all interface keys have complete English, Russian and Kazakh copy", () => {
  for (const locale of locales)
    for (const key of keys) {
      const value = translator(locale)(key);
      assert.ok(
        typeof value === "string" && value.trim().length > 0,
        `${locale}/${key}`,
      );
    }
});
test("count labels follow Russian numeric forms and preserve user-authored names", () => {
  for (const [n, noun] of [
    [0, "предметов"],
    [1, "предмет"],
    [2, "предмета"],
    [5, "предметов"],
    [7, "предметов"],
    [11, "предметов"],
    [12, "предметов"],
    [14, "предметов"],
    [21, "предмет"],
    [22, "предмета"],
    [25, "предметов"],
    [60, "предметов"],
    [101, "предмет"],
    [111, "предметов"],
  ] as const)
    assert.equal(countLabel(n, "ru"), `${n} ${noun}`);
  assert.equal(countLabel(1, "en"), "1 piece");
  assert.equal(countLabel(2, "en"), "2 pieces");
  assert.equal(countLabel(7, "kk"), "7 бұйым");
  assert.equal(countLabel(1, "ru", "layouts"), "1 вариант");
  assert.equal(countLabel(2, "ru", "layouts"), "2 варианта");
  assert.equal(countLabel(5, "ru", "layouts"), "5 вариантов");
  for (const locale of locales)
    assert.equal(
      displayName("Living room - Copy", translator(locale)),
      "Living room - Copy",
    );
});
