import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { furnitureGroup, disposeTree } from "../src/furniture3d.ts";
import { CATALOG, corners } from "../src/model.ts";
test("every crafted mesh fits its shared footprint and height at extreme dimensions and rotations", () => {
  for (const c of CATALOG)
    for (const [width, depth, height] of [
      [c.width, c.depth, c.height],
      [0.1, 5, 0.01],
      [5, 0.1, 3],
    ])
      for (const rotation of [0, 45, 90, 270]) {
        const f = {
            ...c,
            id: "check",
            x: 2,
            y: 2,
            width,
            depth,
            height,
            rotation,
            finish: "clay" as const,
          },
          g = furnitureGroup(f),
          bounds = new THREE.Box3().setFromObject(g),
          points = corners(f);
        assert.ok(
          bounds.min.x >= Math.min(...points.map((p) => p.x)) - 0.002,
          `${c.kind}/minX`,
        );
        assert.ok(
          bounds.max.x <= Math.max(...points.map((p) => p.x)) + 0.002,
          `${c.kind}/maxX`,
        );
        assert.ok(
          bounds.min.z >= Math.min(...points.map((p) => p.y)) - 0.002,
          `${c.kind}/minZ`,
        );
        assert.ok(
          bounds.max.z <= Math.max(...points.map((p) => p.y)) + 0.002,
          `${c.kind}/maxZ`,
        );
        assert.ok(bounds.max.y <= height + 0.001, `${c.kind}/height`);
        assert.ok(Number.isFinite(bounds.min.y));
        disposeTree(g);
      }
});
test("shared geometry and materials are disposed exactly once per tree", () => {
  const f = {
      ...CATALOG.find((c) => c.kind === "plant")!,
      id: "check",
      x: 0,
      y: 0,
      rotation: 0,
      finish: "moss" as const,
    },
    g = furnitureGroup(f),
    geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      geometries.add(o.geometry);
      materials.add(o.material as THREE.Material);
    }
  });
  let disposedG = 0,
    disposedM = 0;
  geometries.forEach((geo) =>
    geo.addEventListener("dispose", () => disposedG++),
  );
  materials.forEach((mat) =>
    mat.addEventListener("dispose", () => disposedM++),
  );
  disposeTree(g);
  assert.equal(disposedG, geometries.size);
  assert.equal(disposedM, materials.size);
});
