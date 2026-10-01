import * as THREE from "three";
import type { Furniture } from "./model.ts";
import { FINISHES } from "./model.ts";
export function furnitureGroup(item: Furniture): THREE.Group {
  const g = new THREE.Group(),
    w = item.width,
    d = item.depth,
    h = item.height;
  const upholstery = new THREE.MeshStandardMaterial({
    color: FINISHES[item.finish],
    roughness: 0.91,
  });
  const wood = new THREE.MeshStandardMaterial({
    color: "#b7946d",
    roughness: 0.65,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: "#353f3b",
    roughness: 0.5,
  });
  const linen = new THREE.MeshStandardMaterial({
    color: "#e5d8c3",
    roughness: 0.98,
  });
  const leaf = new THREE.MeshStandardMaterial({
    color: "#58684b",
    roughness: 0.83,
  });
  const add = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rotation?: [number, number, number],
  ) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = item.kind !== "rug";
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  const box = (
    bw: number,
    bh: number,
    bd: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material = wood,
  ) =>
    add(
      new THREE.BoxGeometry(
        Math.max(0.008, bw),
        Math.max(0.006, bh),
        Math.max(0.008, bd),
      ),
      mat,
      x,
      y,
      z,
    );
  const rounded = (
    bw: number,
    bh: number,
    bd: number,
    x: number,
    y: number,
    z: number,
    mat = upholstery,
  ) => {
    // Bevelled extruded rectangles: soft edges, very few vertices, no textures.
    const radius = Math.min(0.055, bw / 5, bd / 5, bh / 4),
      shape = new THREE.Shape();
    shape.moveTo(-bw / 2 + radius, -bd / 2);
    shape.lineTo(bw / 2 - radius, -bd / 2);
    shape.quadraticCurveTo(bw / 2, -bd / 2, bw / 2, -bd / 2 + radius);
    shape.lineTo(bw / 2, bd / 2 - radius);
    shape.quadraticCurveTo(bw / 2, bd / 2, bw / 2 - radius, bd / 2);
    shape.lineTo(-bw / 2 + radius, bd / 2);
    shape.quadraticCurveTo(-bw / 2, bd / 2, -bw / 2, bd / 2 - radius);
    shape.lineTo(-bw / 2, -bd / 2 + radius);
    shape.quadraticCurveTo(-bw / 2, -bd / 2, -bw / 2 + radius, -bd / 2);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.008, bh - radius * 2),
      bevelEnabled: true,
      bevelSegments: 1,
      steps: 1,
      bevelSize: radius * 0.45,
      bevelThickness: radius,
      curveSegments: 3,
    });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -bh / 2 + radius, 0);
    return add(geo, mat, x, y, z);
  };
  const cylinder = (
    rt: number,
    rb: number,
    ch: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material = dark,
  ) => add(new THREE.CylinderGeometry(rt, rb, ch, 12), mat, x, y, z);
  const legs = (top: number, thick = 0.035, inset = 0.07) => {
    for (const x of [
      -w / 2 + Math.min(inset, w * 0.2),
      w / 2 - Math.min(inset, w * 0.2),
    ])
      for (const z of [
        -d / 2 + Math.min(inset, d * 0.2),
        d / 2 - Math.min(inset, d * 0.2),
      ])
        cylinder(thick, thick * 0.7, top, x, top / 2, z, wood);
  };
  switch (item.kind) {
    case "sofa":
    case "armchair": {
      const seat = h * 0.47,
        back = d * 0.18,
        arm = Math.min(0.13, w * 0.15);
      legs(h * 0.18, 0.026);
      rounded(w, h * 0.24, d, 0, h * 0.29, 0);
      rounded(
        w - arm * 2,
        h * 0.17,
        d - back - 0.05,
        0,
        seat,
        -back / 2 + 0.02,
      );
      rounded(w, h * 0.45, back, 0, h * 0.76, -d / 2 + back / 2);
      for (const x of [-w / 2 + arm / 2, w / 2 - arm / 2])
        rounded(arm, h * 0.42, d, x, h * 0.58, 0);
      const count = item.kind === "sofa" ? 2 : 1;
      for (let i = 0; i < count; i++)
        rounded(
          (w - arm * 2) / count - 0.025,
          h * 0.12,
          d - back - 0.09,
          -(w - arm * 2) / 2 + ((i + 0.5) * (w - arm * 2)) / count,
          seat + h * 0.1,
          back / 2,
          upholstery,
        );
      if (item.kind === "sofa")
        rounded(
          w * 0.19,
          h * 0.24,
          d * 0.16,
          -w * 0.29,
          h * 0.62,
          -d * 0.24,
          linen,
        );
      break;
    }
    case "table":
    case "desk":
      legs(h - 0.065, 0.028);
      rounded(w, 0.065, d, 0, h - 0.032, 0, wood);
      if (item.kind === "desk") {
        box(w * 0.28, 0.13, d * 0.8, w * 0.28, h - 0.16, 0, upholstery);
        box(0.07, 0.017, 0.015, w * 0.28, h - 0.15, d * 0.4, dark);
      }
      break;
    case "chair":
      legs(h * 0.51, 0.018, 0.035);
      rounded(w, 0.055, d * 0.82, 0, h * 0.53, d * 0.055, upholstery);
      rounded(w, h * 0.35, 0.065, 0, h * 0.8, -d * 0.4, upholstery);
      for (const x of [-w * 0.4, w * 0.4])
        box(0.025, h * 0.42, 0.025, x, h * 0.71, -d * 0.39, dark);
      break;
    case "bed":
      legs(h * 0.2, 0.04, 0.12);
      rounded(w, h * 0.34, d, 0, h * 0.32, 0, wood);
      rounded(w * 0.97, h * 0.3, d * 0.95, 0, h * 0.62, 0.015, linen);
      rounded(w, 0.65 * h, 0.085, 0, h * 0.67, -d / 2 + 0.01, upholstery);
      rounded(w * 0.99, 0.035, d * 0.6, 0, h * 0.795, d * 0.18, upholstery);
      for (const x of [-w * 0.25, w * 0.25])
        rounded(w * 0.42, h * 0.14, d * 0.21, x, h * 0.82, -d * 0.31, linen);
      break;
    case "wardrobe":
    case "console": {
      legs(Math.min(0.16, h * 0.14), 0.025, 0.065);
      box(w, h * 0.86, d, 0, h * 0.57, 0, upholstery);
      for (const x of [-w * 0.25, w * 0.25]) {
        box(w * 0.49, h * 0.83, 0.025, x, h * 0.57, d / 2 + 0.01, upholstery);
        box(
          0.022,
          h * 0.14,
          0.018,
          x + (x < 0 ? w * 0.15 : -w * 0.15),
          h * 0.56,
          d / 2 + 0.035,
          dark,
        );
      }
      box(w + 0.01, 0.035, d + 0.01, 0, h + 0.006, 0, wood);
      break;
    }
    case "shelf": {
      box(0.03, h, d, -w / 2 + 0.015, h / 2, 0, dark);
      box(0.03, h, d, w / 2 - 0.015, h / 2, 0, dark);
      for (let i = 0; i < 5; i++)
        box(w, 0.035, d, 0, 0.04 + (i * (h - 0.07)) / 4, 0, wood);
      for (let i = 0; i < 6; i++)
        box(
          w * 0.07,
          h * 0.12,
          d * 0.5,
          -w * 0.28 + i * w * 0.082,
          h * 0.34,
          d * 0.08,
          i % 2 ? upholstery : linen,
        );
      cylinder(w * 0.12, w * 0.07, h * 0.14, w * 0.21, h * 0.59, 0, linen);
      break;
    }
    case "rug":
      rounded(w, 0.016, d, 0, 0.015, 0, upholstery);
      for (let i = 0; i < 14; i++)
        box(
          w * 0.93,
          0.002,
          0.012,
          0,
          0.028,
          -d * 0.43 + (i * d * 0.86) / 13,
          linen,
        );
      break;
    case "plant": {
      const rad = Math.min(w, d) * 0.3;
      cylinder(rad, rad * 0.72, h * 0.3, 0, h * 0.15, 0, linen);
      cylinder(0.014, 0.018, h * 0.65, 0, h * 0.54, 0, wood);
      const geo = new THREE.SphereGeometry(1, 8, 5);
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4,
          mesh = add(
            geo,
            leaf,
            Math.cos(a) * w * 0.23,
            h * (0.48 + i * 0.047),
            Math.sin(a) * d * 0.22,
          );
        mesh.scale.set(w * 0.22, h * 0.17, d * 0.1);
        mesh.rotation.set(0.4, a, Math.cos(a) * 0.7);
      }
      break;
    }
    case "lamp":
      cylinder(
        Math.min(w, d) * 0.44,
        Math.min(w, d) * 0.44,
        0.025,
        0,
        0.02,
        0,
        dark,
      );
      cylinder(0.014, 0.014, h * 0.8, 0, h * 0.42, 0, dark);
      cylinder(w * 0.28, w * 0.48, h * 0.2, 0, h * 0.87, 0, linen);
      cylinder(
        w * 0.23,
        w * 0.4,
        0.009,
        0,
        h * 0.77,
        0,
        new THREE.MeshStandardMaterial({
          color: "#f6e6b5",
          emissive: "#ebc887",
          emissiveIntensity: 0.4,
        }),
      );
      break;
  }
  // Each furnishing stays inside its declared footprint; tiny bevels are illustrative.
  const bounds = new THREE.Box3().setFromObject(g);
  g.scale.set(
    Math.min(
      1,
      w / (2 * Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x))),
    ),
    Math.min(1, h / bounds.max.y),
    Math.min(
      1,
      d / (2 * Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z))),
    ),
  );
  g.position.set(item.x, 0, item.y);
  g.rotation.y = (-item.rotation * Math.PI) / 180;
  g.userData.itemId = item.id;
  return g;
}
export function disposeTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
      geometries.add(o.geometry);
      const material = o.material;
      if (Array.isArray(material)) material.forEach((m) => materials.add(m));
      else materials.add(material);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
