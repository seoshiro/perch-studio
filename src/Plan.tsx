import { useEffect, useRef, useState, useId } from "react";
import type { PointerEvent as ReactPointerEvent, KeyboardEvent } from "react";
import { FINISHES, corners, doorPolygon, move, round } from "./model.ts";
import type { Furniture, Layout, Point } from "./model.ts";
import { format, translator } from "./i18n.ts";
import type { Locale } from "./i18n.ts";
export function Footprint({ item }: { item: Furniture }) {
  const w = item.width,
    d = item.depth;
  const common = {
    fill: FINISHES[item.finish],
    stroke: "#393d37",
    strokeWidth: 0.016,
  };
  const rx = Math.min(0.07, w * 0.08);
  return (
    <g>
      <rect
        x={-w / 2}
        y={-d / 2}
        width={w}
        height={d}
        rx={
          item.kind === "plant" || item.kind === "lamp"
            ? Math.min(w, d) / 2
            : rx
        }
        {...common}
        opacity={item.kind === "rug" ? 0.45 : 1}
      />
      {item.kind === "sofa" && (
        <>
          <rect
            x={-w / 2 + 0.1}
            y={-d / 2 + 0.08}
            width={w - 0.2}
            height={0.15}
            rx={0.035}
            fill="#ffffff"
            opacity=".35"
          />
          <path
            d={`M0 ${-d / 2 + 0.23} V${d / 2 - 0.08} M${-w / 2 + 0.16} ${-d / 2 + 0.23} V${d / 2 - 0.08} M${w / 2 - 0.16} ${-d / 2 + 0.23} V${d / 2 - 0.08}`}
            stroke="#fff"
            strokeWidth=".02"
            opacity=".5"
          />
        </>
      )}
      {item.kind === "armchair" && (
        <rect
          x={-w / 2 + 0.1}
          y={-d / 2 + 0.12}
          width={Math.max(0.02, w - 0.2)}
          height={Math.max(0.02, d - 0.2)}
          rx=".08"
          fill="#fff"
          opacity=".25"
        />
      )}
      {item.kind === "bed" && (
        <>
          <rect
            x={-w / 2 + 0.08}
            y={-d / 2 + 0.12}
            width={w / 2 - 0.13}
            height={d * 0.2}
            rx=".04"
            fill="#fff"
            opacity=".7"
          />
          <rect
            x={0.05}
            y={-d / 2 + 0.12}
            width={w / 2 - 0.13}
            height={d * 0.2}
            rx=".04"
            fill="#fff"
            opacity=".7"
          />
          <path
            d={`M${-w / 2 + 0.03} ${-d / 2 + d * 0.38} H${w / 2 - 0.03}`}
            stroke="#fff"
            strokeWidth=".035"
          />
        </>
      )}
      {["wardrobe", "console", "shelf"].includes(item.kind) && (
        <path
          d={`M0 ${-d / 2 + 0.025} V${d / 2 - 0.025}`}
          stroke="#fff"
          opacity=".45"
          strokeWidth=".025"
        />
      )}
      {item.kind === "chair" && (
        <path
          d={`M${-w / 2 + 0.04} ${-d / 2 + 0.08} H${w / 2 - 0.04}`}
          stroke="#fff"
          opacity=".6"
          strokeWidth=".05"
        />
      )}
      {item.kind === "rug" && (
        <rect
          x={-w / 2 + 0.09}
          y={-d / 2 + 0.09}
          width={Math.max(0.01, w - 0.18)}
          height={Math.max(0.01, d - 0.18)}
          rx=".02"
          fill="none"
          stroke="#fff"
          strokeWidth=".02"
        />
      )}
      {item.kind === "plant" && (
        <path
          d={`M${-w * 0.24} 0 Q0 ${-d * 0.5} ${w * 0.22} 0 Q0 ${d * 0.5} ${-w * 0.24} 0`}
          fill="#64704d"
          stroke="#425239"
          strokeWidth=".012"
        />
      )}
      {item.kind === "lamp" && (
        <circle
          r={Math.min(w, d) * 0.25}
          fill="#f5e8b7"
          strokeWidth=".012"
          stroke="#4b463c"
        />
      )}
    </g>
  );
}
interface Props {
  layout: Layout;
  locale: Locale;
  selected?: string | null;
  measure?: boolean;
  snap?: boolean;
  onSelect?: (id: string) => void;
  onPreview?: (item: Furniture | null) => void;
  onCommit?: (item: Furniture) => void;
  onKey?: (e: KeyboardEvent) => void;
  preview?: Furniture | null;
  readonly?: boolean;
}
export default function Plan({
  layout,
  locale,
  selected,
  measure = true,
  snap = false,
  onSelect,
  onPreview,
  onCommit,
  onKey,
  preview,
  readonly = false,
}: Props) {
  const t = translator(locale),
    svgRef = useRef<SVGSVGElement>(null);
  const patternId = `grid-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const drag = useRef<{
    item: Furniture;
    start: Point;
    id: number;
    target: SVGElement;
  } | null>(null);
  const r = layout.room,
    margin = 0.5;
  const [fontSize, setFontSize] = useState(0.24);
  useEffect(() => {
    if (readonly) return;
    const node = svgRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const b = node.getBoundingClientRect(),
        scale = Math.min(b.width / (r.width + 1), b.height / (r.depth + 1));
      if (scale > 0) setFontSize(Math.min(0.34, 13 / scale));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [r.width, r.depth, readonly]);
  const cancel = () => {
    const d = drag.current;
    drag.current = null;
    onPreview?.(null);
    if (d?.target.hasPointerCapture(d.id)) d.target.releasePointerCapture(d.id);
  };
  useEffect(() => {
    if (readonly) return;
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && drag.current) {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      cancel();
    };
  }, []);
  const point = (e: ReactPointerEvent): Point => {
    const svg = svgRef.current!,
      matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      matrix.inverse(),
    );
    return { x: p.x, y: p.y };
  };
  const start = (e: ReactPointerEvent<SVGGElement>, item: Furniture) => {
    if (readonly || e.button !== 0) return;
    e.preventDefault();
    onSelect?.(item.id);
    svgRef.current?.focus();
    drag.current = {
      item: { ...item },
      start: point(e),
      id: e.pointerId,
      target: e.currentTarget,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const update = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const p = point(e);
    onPreview?.(
      move(
        d.item,
        d.item.x + p.x - d.start.x,
        d.item.y + p.y - d.start.y,
        r,
        snap,
      ),
    );
  };
  const finish = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const p = point(e);
    drag.current = null;
    onPreview?.(null);
    const result = move(
      d.item,
      d.item.x + p.x - d.start.x,
      d.item.y + p.y - d.start.y,
      r,
      snap,
    );
    if (result.x !== d.item.x || result.y !== d.item.y) onCommit?.(result);
    if (d.target.hasPointerCapture(d.id)) d.target.releasePointerCapture(d.id);
  };
  const items = layout.items
    .map((item) => (preview?.id === item.id ? preview : item))
    .toSorted(
      (a, b) => (a.kind === "rug" ? -1 : 0) - (b.kind === "rug" ? -1 : 0),
    );
  const chosen = items.find((i) => i.id === selected),
    cornersChosen = chosen ? corners(chosen) : [];
  return (
    <svg
      ref={svgRef}
      className={`plan-svg ${readonly ? "readonly" : ""}`}
      xmlns="http://www.w3.org/2000/svg"
      width={readonly ? 1200 : undefined}
      height={
        readonly ? round((1200 * (r.depth + 1)) / (r.width + 1)) : undefined
      }
      viewBox={`${-margin} ${-margin} ${r.width + margin * 2} ${r.depth + margin * 2}`}
      role={readonly ? "img" : "group"}
      aria-label={`${t("plan")}: ${format(r.width, locale)} × ${format(r.depth, locale)} ${t("meters")}`}
      tabIndex={readonly ? undefined : 0}
      onKeyDown={onKey}
      onPointerMove={update}
      onPointerUp={finish}
      onPointerCancel={cancel}
      onLostPointerCapture={() => {
        if (drag.current) cancel();
      }}
    >
      <title>
        {t("plan")} — {layout.name}
      </title>
      <defs>
        <pattern
          id={patternId}
          width=".1"
          height=".1"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M.1 0H0V.1"
            fill="none"
            stroke="#d5d2c9"
            strokeWidth=".005"
          />
        </pattern>
      </defs>
      <rect
        width={r.width}
        height={r.depth}
        fill="#f2efe7"
        stroke="#383b35"
        strokeWidth=".07"
      />
      <rect width={r.width} height={r.depth} fill={`url(#${patternId})`} />
      {r.openings.map((o) => {
        const horizontal = o.side === "north" || o.side === "south",
          x = horizontal ? o.offset : o.side === "west" ? 0 : r.width,
          y = horizontal ? (o.side === "north" ? 0 : r.depth) : o.offset;
        return (
          <g key={o.id}>
            <path
              d={horizontal ? `M${x} ${y}h${o.width}` : `M${x} ${y}v${o.width}`}
              stroke="#f2efe7"
              strokeWidth=".095"
            />
            {o.kind === "window" ? (
              <path
                d={
                  horizontal ? `M${x} ${y}h${o.width}` : `M${x} ${y}v${o.width}`
                }
                stroke="#567b82"
                strokeWidth=".025"
              />
            ) : (
              <>
                <polygon
                  points={doorPolygon(o, r)
                    .map((p) => `${p.x},${p.y}`)
                    .join(" ")}
                  fill="#bba980"
                  fillOpacity=".1"
                  stroke="#98876d"
                  strokeWidth=".014"
                  strokeDasharray=".05 .04"
                />
                <path
                  d={`M${doorPolygon(o, r)[0].x} ${doorPolygon(o, r)[0].y}L${doorPolygon(o, r).at(-1)!.x} ${doorPolygon(o, r).at(-1)!.y}`}
                  stroke="#77634b"
                  strokeWidth=".035"
                />
              </>
            )}
          </g>
        );
      })}
      {items.map((item) => (
        <g
          key={item.id}
          transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}
          className="plan-piece"
          role={readonly ? undefined : "button"}
          aria-label={`${t(item.kind)}, ${format(item.width, locale)} × ${format(item.depth, locale)} ${t("meters")}`}
          tabIndex={readonly ? undefined : 0}
          aria-pressed={readonly ? undefined : selected === item.id}
          onPointerDown={(e) => start(e, item)}
          onClick={() => onSelect?.(item.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect?.(item.id);
            }
          }}
        >
          <Footprint item={item} />
          {selected === item.id && !readonly && (
            <rect
              x={-item.width / 2 - 0.045}
              y={-item.depth / 2 - 0.045}
              width={item.width + 0.09}
              height={item.depth + 0.09}
              rx=".05"
              fill="none"
              stroke="#a9462e"
              strokeWidth=".035"
            />
          )}
        </g>
      ))}
      {measure && (
        <g
          className="plan-dimensions"
          fill="#4d514a"
          fontFamily="Arial,sans-serif"
          fontSize={readonly ? 0.19 : fontSize}
          textAnchor="middle"
        >
          <path
            d={`M0 -.25H${r.width}M0 -.32V-.17M${r.width} -.32V-.17 M-.25 0V${r.depth}M-.32 0H-.17M-.32 ${r.depth}H-.17`}
            fill="none"
            stroke="#6c7068"
            strokeWidth=".012"
          />
          <rect
            x={r.width / 2 - 0.65}
            y="-.43"
            width="1.3"
            height=".31"
            fill="#f7f5ee"
          />
          <text x={r.width / 2} y="-.15">
            {format(r.width, locale)} {t("meters")}
          </text>
          <text transform={`translate(-.3 ${r.depth / 2}) rotate(-90)`}>
            {format(r.depth, locale)} {t("meters")}
          </text>
          {chosen && !readonly && (
            <>
              <text
                x={chosen.x}
                y={Math.min(
                  r.depth + 0.3,
                  Math.max(...cornersChosen.map((p) => p.y)) + 0.23,
                )}
              >
                {format(chosen.width, locale)} × {format(chosen.depth, locale)}{" "}
                {t("meters")}
              </text>
              <path
                d={`M${chosen.x} 0V${Math.max(0, Math.min(...cornersChosen.map((p) => p.y)))} M0 ${chosen.y}H${Math.max(0, Math.min(...cornersChosen.map((p) => p.x)))}`}
                stroke="#a9462e"
                strokeWidth=".014"
                strokeDasharray=".06 .05"
              />
            </>
          )}
        </g>
      )}
    </svg>
  );
}
