import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Camera, Plus, Minus, RotateCcw } from "lucide-react";
import { furnitureGroup, disposeTree } from "./furniture3d.ts";
import { clamp } from "./model.ts";
import type { Furniture, Layout, Side } from "./model.ts";
import type { Locale } from "./i18n.ts";
import { translator } from "./i18n.ts";
export interface SceneHandle {
  capture: () => string | null;
}
interface Props {
  layout: Layout;
  selected: string | null;
  preview: Furniture | null;
  locale: Locale;
  onSelect: (id: string) => void;
  onReady: (api: SceneHandle | null) => void;
  forceFailure?: boolean;
}
class RoomRenderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  world = new THREE.Group();
  selection = new THREE.Group();
  ray = new THREE.Raycaster();
  layout: Layout;
  itemGroups: THREE.Group[] = [];
  walls: { side: Side; group: THREE.Group }[] = [];
  yaw = Math.PI / 4;
  pitch = 0.63;
  zoom = 1;
  raf = 0;
  visible = true;
  dead = false;
  width = 1;
  height = 1;
  selected: string | null = null;
  constructor(
    public host: HTMLDivElement,
    layout: Layout,
    public onSelect: (id: string) => void,
    public fail: () => void,
  ) {
    this.layout = layout;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.setClearColor("#e9e5de");
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.host.append(this.renderer.domElement);
    this.scene.add(this.world, this.selection);
    this.update(layout, null);
  }
  update(layout: Layout, selected: string | null, preview?: Furniture | null) {
    this.layout = layout;
    this.selected = selected;
    disposeTree(this.world);
    this.world.clear();
    this.itemGroups = [];
    this.walls = [];
    const r = layout.room;
    const box = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material,
      parent: THREE.Group = this.world,
    ) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const floorMat = new THREE.MeshStandardMaterial({
      color:
        r.floor === "oak"
          ? "#c4ac89"
          : r.floor === "walnut"
            ? "#877056"
            : "#bcbdb5",
      roughness: 0.83,
    });
    box(
      r.width + 0.18,
      0.14,
      r.depth + 0.18,
      r.width / 2,
      -0.08,
      r.depth / 2,
      new THREE.MeshStandardMaterial({ color: "#d2c7b6", roughness: 0.7 }),
    );
    box(r.width, 0.025, r.depth, r.width / 2, -0.005, r.depth / 2, floorMat);
    const seams = new THREE.MeshStandardMaterial({
      color: r.floor === "walnut" ? "#6c5945" : "#ae9b7f",
      roughness: 0.9,
    });
    if (r.floor !== "stone")
      for (let x = 0.22; x < r.width; x += 0.22) {
        box(0.008, 0.001, r.depth, x, 0.009, r.depth / 2, seams);
        for (
          let z = (Math.floor(x / 0.22) % 2) * 1.35 + 1.35;
          z < r.depth;
          z += 2.7
        )
          box(0.215, 0.001, 0.007, x - 0.11, 0.009, z, seams);
      }
    else {
      const line = new THREE.MeshStandardMaterial({
        color: "#a2a59c",
        roughness: 1,
      });
      for (let x = 0.6; x < r.width; x += 0.6)
        box(0.007, 0.001, r.depth, x, 0.009, r.depth / 2, line);
      for (let z = 0.6; z < r.depth; z += 0.6)
        box(r.width, 0.001, 0.007, r.width / 2, 0.009, z, line);
    }
    const wallMat = new THREE.MeshStandardMaterial({
        color: "#eee9df",
        roughness: 0.96,
      }),
      trim = new THREE.MeshStandardMaterial({
        color: "#ded7ca",
        roughness: 0.86,
      });
    for (const side of ["north", "east", "south", "west"] as Side[]) {
      const group = new THREE.Group();
      this.world.add(group);
      this.walls.push({ side, group });
      const horizontal = side === "north" || side === "south",
        span = horizontal ? r.width : r.depth;
      const wallBox = (
        from: number,
        to: number,
        base: number,
        height: number,
        material = wallMat,
        thick = 0.09,
      ) => {
        if (to - from < 0.005 || height < 0.005) return;
        const a = (from + to) / 2;
        box(
          horizontal ? to - from : thick,
          height,
          horizontal ? thick : to - from,
          horizontal ? a : side === "west" ? -0.05 : r.width + 0.05,
          base + height / 2,
          horizontal ? (side === "north" ? -0.05 : r.depth + 0.05) : a,
          material,
          group,
        );
      };
      // Merge opening intervals before constructing walls. Overlapping openings never create negative geometry.
      const openings = r.openings
        .filter((o) => o.side === side)
        .toSorted((a, b) => a.offset - b.offset);
      let edge = 0;
      for (const o of openings) {
        wallBox(edge, o.offset, 0, r.height);
        const start = Math.max(edge, o.offset),
          end = Math.min(span, o.offset + o.width);
        if (end > start) {
          const top =
              o.kind === "door"
                ? Math.min(2.1, r.height - 0.15)
                : Math.min(2.15, r.height - 0.15),
            bottom = o.kind === "door" ? 0 : 0.82;
          wallBox(start, end, top, r.height - top);
          if (bottom) wallBox(start, end, 0, bottom);
          wallBox(start, end, bottom, 0.04, trim, 0.13);
          if (o.kind === "window") {
            const glass = new THREE.MeshStandardMaterial({
              color: "#b8d0cb",
              transparent: true,
              opacity: 0.32,
              roughness: 0.35,
              side: THREE.DoubleSide,
            });
            wallBox(
              start,
              end,
              bottom + 0.04,
              top - bottom - 0.04,
              glass,
              0.012,
            );
            wallBox(
              (start + end) / 2 - 0.017,
              (start + end) / 2 + 0.017,
              bottom,
              top - bottom,
              trim,
              0.11,
            );
          }
        }
        edge = Math.max(edge, o.offset + o.width);
      }
      wallBox(edge, span, 0, r.height);
      wallBox(0, span, 0.035, 0.075, trim, 0.115);
    }
    for (const item of layout.items) {
      const actual = preview?.id === item.id ? preview : item,
        group = furnitureGroup(actual);
      this.world.add(group);
      this.itemGroups.push(group);
    }
    const hemi = new THREE.HemisphereLight(
      "#fff5df",
      "#857768",
      r.light === "evening" ? 1.3 : 2.6,
    );
    this.world.add(hemi);
    const sun = new THREE.DirectionalLight(
      r.light === "day"
        ? "#fff7e8"
        : r.light === "warm"
          ? "#ffe0b0"
          : "#eed4be",
      r.light === "evening" ? 2.1 : 3.2,
    );
    sun.position.set(r.width * 0.4, 8, -4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(
      this.width < 550 ? 512 : 1024,
      this.width < 550 ? 512 : 1024,
    );
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    sun.shadow.normalBias = 0.025;
    sun.shadow.bias = -0.0001;
    sun.shadow.radius = 3;
    this.world.add(sun);
    const fill = new THREE.DirectionalLight("#dae6e6", 1);
    fill.position.set(-5, 4, 6);
    this.world.add(fill);
    this.renderer.toneMappingExposure =
      r.light === "evening" ? 0.92 : r.light === "warm" ? 1.13 : 1.25;
    this.drawSelection(preview);
    this.request();
  }
  drawSelection(preview?: Furniture | null) {
    disposeTree(this.selection);
    this.selection.clear();
    const item =
      preview?.id === this.selected
        ? preview
        : this.layout.items.find((f) => f.id === this.selected);
    if (!item) return;
    const pts = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ].map(
      ([x, z]) =>
        new THREE.Vector3(
          x * (item.width / 2 + 0.05),
          0.035,
          z * (item.depth / 2 + 0.05),
        ),
    );
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: "#ab432d" }),
    );
    line.position.set(item.x, 0, item.y);
    line.rotation.y = (-item.rotation * Math.PI) / 180;
    this.selection.add(line);
  }
  interaction(selected: string | null, preview: Furniture | null) {
    this.selected = selected;
    for (const group of this.itemGroups) {
      const original = this.layout.items.find(
        (f) => f.id === group.userData.itemId,
      );
      if (!original) continue;
      const item = preview?.id === original.id ? preview : original;
      group.position.set(item.x, 0, item.y);
      group.rotation.y = (-item.rotation * Math.PI) / 180;
    }
    this.drawSelection(preview);
    this.request();
  }
  size() {
    const rect = this.host.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.request();
  }
  view(kind: "front" | "angle" | "top" | "reset") {
    this.yaw = kind === "front" ? 0 : Math.PI / 4;
    this.pitch = kind === "top" ? 1.32 : kind === "front" ? 0.42 : 0.63;
    this.zoom = 1;
    this.request();
  }
  request() {
    if (this.dead || this.raf || !this.visible || document.hidden) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }
  render() {
    if (this.dead) return;
    const r = this.layout.room,
      target = new THREE.Vector3(r.width / 2, r.height * 0.36, r.depth / 2);
    const radius = Math.hypot(r.width + 0.2, r.depth + 0.2, r.height) / 2,
      fov =
        2 *
        Math.atan(
          Math.tan((this.camera.fov * Math.PI) / 360) *
            Math.min(1, this.camera.aspect),
        );
    const dist = ((radius / Math.sin(fov / 2)) * 1.04) / this.zoom;
    this.camera.position.set(
      target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * dist,
      target.y + Math.sin(this.pitch) * dist,
      target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * dist,
    );
    this.camera.lookAt(target);
    for (const wall of this.walls)
      wall.group.visible =
        wall.side === "north"
          ? this.camera.position.z > target.z
          : wall.side === "south"
            ? this.camera.position.z < target.z
            : wall.side === "west"
              ? this.camera.position.x > target.x
              : this.camera.position.x < target.x;
    this.renderer.render(this.scene, this.camera);
  }
  pick(x: number, y: number) {
    const rect = this.host.getBoundingClientRect();
    this.ray.setFromCamera(
      new THREE.Vector2(
        ((x - rect.left) / rect.width) * 2 - 1,
        (-(y - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    for (const hit of this.ray.intersectObjects(this.itemGroups, true)) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (obj.userData.itemId) {
          this.onSelect(obj.userData.itemId as string);
          return;
        }
        obj = obj.parent;
      }
    }
  }
  capture() {
    if (this.dead) return null;
    try {
      this.render();
      return this.renderer.domElement.toDataURL("image/png");
    } catch {
      return null;
    }
  }
  dispose() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.world.traverse((o) => {
      if (o instanceof THREE.DirectionalLight) o.shadow.dispose();
    });
    disposeTree(this.world);
    disposeTree(this.selection);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
export default function Scene({
  layout,
  selected,
  preview,
  locale,
  onSelect,
  onReady,
  forceFailure = false,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    runtime = useRef<RoomRenderer | null>(null),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0),
    t = translator(locale);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  useEffect(() => {
    const node = host.current!;
    let instance: RoomRenderer | null = null;
    setError(false);
    try {
      if (forceFailure) throw Error("WebGL disabled");
      instance = new RoomRenderer(
        node,
        layout,
        (id) => selectRef.current(id),
        () => setError(true),
      );
      runtime.current = instance;
      onReady({ capture: () => instance?.capture() ?? null });
    } catch {
      setError(true);
      onReady(null);
      return;
    }
    const resize = new ResizeObserver(() => instance?.size());
    resize.observe(node);
    instance.size();
    const observer = new IntersectionObserver(
      (entries) => {
        if (instance) {
          instance.visible = entries[0].isIntersecting;
          instance.request();
        }
      },
      { threshold: 0 },
    );
    observer.observe(node);
    const visibility = () => instance?.request();
    document.addEventListener("visibilitychange", visibility);
    const lost = (e: Event) => {
      e.preventDefault();
      setError(true);
      onReady(null);
    };
    instance.renderer.domElement.addEventListener("webglcontextlost", lost);
    let pointer: {
      id: number;
      x: number;
      y: number;
      startX: number;
      startY: number;
    } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || pointer) return;
      node.focus();
      pointer = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
      };
      node.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!pointer || pointer.id !== e.pointerId || !instance) return;
      instance.yaw -= (e.clientX - pointer.x) * 0.009;
      instance.pitch = clamp(
        instance.pitch + (e.clientY - pointer.y) * 0.006,
        0.3,
        1.32,
      );
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      instance.request();
    };
    const up = (e: PointerEvent) => {
      if (pointer?.id !== e.pointerId) return;
      if (
        Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY) < 5
      )
        instance?.pick(e.clientX, e.clientY);
      pointer = null;
      if (node.hasPointerCapture(e.pointerId))
        node.releasePointerCapture(e.pointerId);
    };
    const cancel = () => {
      pointer = null;
    };
    const wheel = (e: WheelEvent) => {
      if (!instance || !node.matches(":focus-within")) return;
      e.preventDefault();
      instance.zoom = clamp(
        instance.zoom * Math.exp(-e.deltaY * 0.001),
        0.65,
        1.8,
      );
      instance.request();
    };
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", cancel);
    node.addEventListener("lostpointercapture", cancel);
    node.addEventListener("wheel", wheel, { passive: false });
    return () => {
      resize.disconnect();
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", cancel);
      node.removeEventListener("lostpointercapture", cancel);
      node.removeEventListener("wheel", wheel);
      instance?.renderer.domElement.removeEventListener(
        "webglcontextlost",
        lost,
      );
      instance?.dispose();
      runtime.current = null;
      onReady(null);
    };
    // The renderer is created once per retry; layout edits use the synchronized update below.
  }, [attempt, forceFailure]);
  useEffect(() => {
    runtime.current?.world.traverse((o) => {
      if (o instanceof THREE.DirectionalLight) o.shadow.dispose();
    });
    runtime.current?.update(layout, selected);
  }, [layout]);
  useEffect(() => {
    runtime.current?.interaction(selected, preview);
  }, [selected, preview, layout]);
  return (
    <div className="scene-shell">
      <div
        className="scene-canvas"
        ref={host}
        tabIndex={0}
        role="group"
        aria-label={t("viewHelp")}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            if (runtime.current) {
              runtime.current.yaw += e.key === "ArrowLeft" ? -0.15 : 0.15;
              runtime.current.request();
            }
          }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            if (runtime.current) {
              runtime.current.pitch = clamp(
                runtime.current.pitch + (e.key === "ArrowUp" ? 0.08 : -0.08),
                0.3,
                1.32,
              );
              runtime.current.request();
            }
          }
        }}
      />
      {error && (
        <div className="webgl-error" role="status">
          <Camera size={32} />
          <p>{t("noWebGL")}</p>
          <button onClick={() => setAttempt((n) => n + 1)}>{t("retry")}</button>
        </div>
      )}
      <div className="scene-caption">
        <span className="scene-index">01 / {t("scene")}</span>
        <span className="desktop-hint">{t("sceneHint")}</span>
        <span className="mobile-hint">{t("mobileSceneHint")}</span>
      </div>
      <div className="camera-toolbar" aria-label={t("viewHelp")}>
        <button
          onClick={() => runtime.current?.view("angle")}
          title={t("viewAngle")}
          aria-label={t("viewAngle")}
        >
          <Camera size={18} />
        </button>
        <button
          onClick={() => runtime.current?.view("front")}
          title={t("viewFront")}
          aria-label={t("viewFront")}
        >
          F
        </button>
        <button
          onClick={() => runtime.current?.view("top")}
          title={t("viewTop")}
          aria-label={t("viewTop")}
        >
          T
        </button>
        <span />
        <button
          onClick={() => {
            const r = runtime.current;
            if (r) {
              r.zoom = clamp(r.zoom * 1.15, 0.65, 1.8);
              r.request();
            }
          }}
          aria-label={t("zoomIn")}
        >
          <Plus size={18} />
        </button>
        <button
          onClick={() => {
            const r = runtime.current;
            if (r) {
              r.zoom = clamp(r.zoom / 1.15, 0.65, 1.8);
              r.request();
            }
          }}
          aria-label={t("zoomOut")}
        >
          <Minus size={18} />
        </button>
        <button
          onClick={() => runtime.current?.view("reset")}
          aria-label={t("resetView")}
        >
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  );
}
