import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useId,
} from "react";
import type { KeyboardEvent, ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Armchair,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileJson,
  FileText,
  Grid2X2,
  HelpCircle,
  Image,
  Layers,
  Maximize2,
  Move,
  Plus,
  Redo2,
  RotateCw,
  Ruler,
  Save,
  Settings2,
  Sun,
  Trash2,
  Undo2,
  Upload,
  X,
  TriangleAlert,
} from "lucide-react";
import Plan, { Footprint } from "./Plan.tsx";
import type { SceneHandle } from "./Scene.tsx";
import {
  BACKUP_KEY,
  CATALOG,
  FINISHES,
  LIMITS,
  ProjectError,
  clamp,
  clone,
  commit,
  coverage,
  initialProject,
  load,
  makeItem,
  move,
  normalizeAngle,
  parseProject,
  redo,
  round,
  save,
  starter,
  uid,
  undo,
  warnings,
} from "./model.ts";
import type {
  Finish,
  Floor,
  Furniture,
  History,
  Kind,
  Layout,
  Light,
  Opening,
  Project,
  Side,
  Store,
} from "./model.ts";
import { displayName, format, locales, translator } from "./i18n.ts";
import type { Key, Locale } from "./i18n.ts";
const Scene = lazy(() => import("./Scene.tsx"));
type Modal =
  | "export"
  | "compare"
  | "help"
  | "report"
  | "import"
  | "deleteLayout"
  | "backup"
  | null;
function NumberField({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit,
  locale,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  locale: Locale;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value)),
    [error, setError] = useState(false),
    id = useId();
  useEffect(() => {
    setDraft(String(value));
    setError(false);
  }, [value]);
  const apply = () => {
    const n = Number(draft.replace(",", "."));
    if (draft.trim() === "" || !Number.isFinite(n) || n < min || n > max) {
      setError(true);
      return;
    }
    setError(false);
    if (round(n) !== value) onChange(round(n));
  };
  return (
    <label className={`number-field ${error ? "invalid" : ""}`} htmlFor={id}>
      <span>
        {label}
        <small>{unit}</small>
      </span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            apply();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setDraft(String(value));
            setError(false);
          }
        }}
        aria-invalid={error}
        aria-describedby={`${id}-range`}
        data-step={step}
      />
      <small id={`${id}-range`} className="field-range">
        {error
          ? translator(locale)("rangeError")
          : `${format(min, locale)}–${format(max, locale)} ${unit ?? ""}`}
      </small>
    </label>
  );
}
function NameField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (n: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const apply = () => {
    const n = draft.trim().replace(/[\u0000-\u001f]/g, "");
    if (n) {
      if (n !== value) onChange(n);
    } else setDraft(value);
  };
  return (
    <input
      aria-label={label}
      className="name-input"
      value={draft}
      maxLength={80}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={apply}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
function download(content: string | Blob, name: string, type: string) {
  const blob =
      typeof content === "string" ? new Blob([content], { type }) : content,
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function fileName(name: string) {
  return (
    name
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .trim()
      .slice(0, 60)
      .replace(/\s+/g, "-") || "perch-room"
  );
}
function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "wide" : ""}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const b = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            onClose();
        }
      }}
    >
      <header>
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={translator(
            (document.documentElement.lang || "en") as Locale,
          )("close")}
        >
          <X size={21} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function initLocale(): Locale {
  try {
    const l = localStorage.getItem("perch.locale");
    if (locales.includes(l as Locale)) return l as Locale;
  } catch {
    /* defaults work without storage */
  }
  return "en";
}
function browserStore(): Store {
  try {
    return window.localStorage;
  } catch {
    return {
      getItem: () => {
        throw Error("storage unavailable");
      },
      setItem: () => {
        throw Error("storage unavailable");
      },
    };
  }
}
export default function App() {
  const [locale, setLocale] = useState<Locale>(initLocale),
    t = translator(locale);
  const [initial] = useState(() => {
    const result = load(browserStore()),
      project = result.project ?? initialProject();
    if (!result.project) project.name = t("roomStudy");
    return { ...result, project };
  });
  const [history, setHistory] = useState<History>({
      past: [],
      present: initial.project,
      future: [],
    }),
    project = history.present;
  const layout = project.layouts.find((l) => l.id === project.currentId)!;
  const [selected, setSelected] = useState<string | null>(null),
    [preview, setPreview] = useState<Furniture | null>(null),
    [tab, setTab] = useState<"room" | "furniture" | "layouts">("furniture"),
    [view, setView] = useState<"split" | "scene" | "plan">("split"),
    [category, setCategory] = useState("all"),
    [snap, setSnap] = useState(true),
    [measure, setMeasure] = useState(true);
  const [modal, setModal] = useState<Modal>(null),
    [pending, setPending] = useState<Project | null>(null),
    [message, setMessage] = useState(""),
    [saveState, setSaveState] = useState<"saving" | "saved" | "error">(
      initial.status === "unavailable" ? "error" : "saved",
    ),
    [saveBlocked, setSaveBlocked] = useState(initial.status === "broken"),
    [notice, setNotice] = useState(
      initial.status === "recovered"
        ? "recovered"
        : initial.status === "broken"
          ? "broken"
          : "",
    );
  const [compareIds, setCompareIds] = useState<[string, string]>([
      layout.id,
      layout.id,
    ]),
    [reportImage, setReportImage] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null),
    exportPlan = useRef<HTMLDivElement>(null),
    scene = useRef<SceneHandle | null>(null),
    savedProject = useRef(project),
    lastSavedProject = useRef<Project | null>(
      initial.status === "loaded" ? initial.project : null,
    ),
    allowSave = useRef(!saveBlocked);
  savedProject.current = project;
  allowSave.current = !saveBlocked;
  // A new snapshot is pending immediately, before the save effect runs.
  const visibleSaveState =
    saveState === "error"
      ? "error"
      : lastSavedProject.current === project
        ? "saved"
        : "saving";
  const selectedItem = layout.items.find((i) => i.id === selected) ?? null,
    shownItem = preview?.id === selected ? preview : selectedItem,
    notes = warnings({
      ...layout,
      items: layout.items.map((i) => (preview?.id === i.id ? preview : i)),
    });
  const update = useCallback(
    (change: (p: Project) => void) =>
      setHistory((h) => {
        const next = clone(h.present);
        change(next);
        if (JSON.stringify(next) === JSON.stringify(h.present)) return h;
        next.updatedAt = new Date().toISOString();
        return commit(h, next);
      }),
    [],
  );
  const changeLayout = useCallback(
    (change: (l: Layout) => void) =>
      update((p) => change(p.layouts.find((l) => l.id === p.currentId)!)),
    [update],
  );
  const announce = (key: Key) => {
    setMessage("");
    setTimeout(() => setMessage(t(key)), 10);
  };
  const editItem = (item: Furniture) => {
    changeLayout((l) => {
      const index = l.items.findIndex((i) => i.id === item.id);
      if (index >= 0) l.items[index] = item;
    });
  };
  const changeItem = (patch: Partial<Furniture>) => {
    if (!selectedItem) return;
    editItem({
      ...selectedItem,
      ...patch,
      rotation: normalizeAngle(patch.rotation ?? selectedItem.rotation),
    });
  };
  const select = (id: string) => {
    setSelected(id);
  };
  const remove = () => {
    if (!selectedItem) return;
    changeLayout((l) => {
      l.items = l.items.filter((i) => i.id !== selectedItem.id);
    });
    setSelected(null);
    announce("removed");
  };
  const add = (kind: Kind) => {
    if (layout.items.length >= LIMITS.items) {
      setMessage(t("maxItems"));
      return;
    }
    const item = makeItem(kind, layout.room);
    changeLayout((l) => {
      l.items.push(item);
    });
    setSelected(item.id);
    announce("added");
  };
  const duplicate = () => {
    if (!selectedItem) return;
    if (layout.items.length >= LIMITS.items) {
      setMessage(t("maxItems"));
      return;
    }
    const copy = move(
      { ...selectedItem, id: uid() },
      selectedItem.x + 0.2,
      selectedItem.y + 0.2,
      layout.room,
      snap,
    );
    changeLayout((l) => l.items.push(copy));
    setSelected(copy.id);
    announce("added");
  };
  const nudge = (dx: number, dy: number) => {
    if (selectedItem)
      editItem(
        move(
          selectedItem,
          selectedItem.x + dx,
          selectedItem.y + dy,
          layout.room,
          false,
        ),
      );
  };
  const keyMove = (e: KeyboardEvent) => {
    if (
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      (e.target as HTMLElement).closest("input,select,textarea,button")
    )
      return;
    const step = e.shiftKey ? 0.01 : 0.1;
    if (e.key.startsWith("Arrow") && selectedItem) {
      e.preventDefault();
      nudge(
        e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
        e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0,
      );
    }
    if (e.key.toLowerCase() === "r" && selectedItem) {
      e.preventDefault();
      changeItem({ rotation: selectedItem.rotation + 15 });
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selectedItem) {
      e.preventDefault();
      remove();
    }
  };
  const onSceneReady = useCallback((api: SceneHandle | null) => {
    scene.current = api;
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `PERCH — ${t("studio")}`;
    try {
      localStorage.setItem("perch.locale", locale);
    } catch {
      /* interface still works */
    }
  }, [locale]);
  useEffect(() => {
    setPreview(null);
    if (selected && !layout.items.some((i) => i.id === selected))
      setSelected(null);
  }, [project.currentId, layout.items]);
  useEffect(() => {
    if (saveBlocked) return;
    if (lastSavedProject.current === project) {
      setSaveState("saved");
      return;
    }
    setSaveState("saving");
    const timer = setTimeout(() => {
      const success = save(browserStore(), project);
      if (success) lastSavedProject.current = project;
      setSaveState(success ? "saved" : "error");
    }, 400);
    return () => clearTimeout(timer);
  }, [project, saveBlocked]);
  useEffect(() => {
    const flush = () => {
      if (allowSave.current) save(browserStore(), savedProject.current);
    };
    const hidden = () => {
      if (document.hidden) flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if (
        modal ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setPreview(null);
        setHistory((h) => (e.shiftKey ? redo(h) : undo(h)));
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        setPreview(null);
        setHistory(redo);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [modal]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  const changeRoom = (patch: Partial<Layout["room"]>) =>
    changeLayout((l) => {
      l.room = { ...l.room, ...patch };
      l.room.openings = l.room.openings.map((o) => {
        const span =
          o.side === "north" || o.side === "south"
            ? l.room.width
            : l.room.depth;
        const width = Math.min(o.width, span);
        return { ...o, width, offset: clamp(o.offset, 0, span - width) };
      });
    });
  const addOpening = (kind: Opening["kind"]) => {
    if (layout.room.openings.length >= LIMITS.openings) {
      setMessage(t("maxOpenings"));
      return;
    }
    changeLayout((l) =>
      l.room.openings.push({
        id: uid(),
        kind,
        side: kind === "door" ? "south" : "north",
        offset: 0.5,
        width: kind === "door" ? 0.9 : 1.4,
      }),
    );
  };
  const editOpening = (id: string, patch: Partial<Opening>) =>
    changeLayout((l) => {
      l.room.openings = l.room.openings.map((o) => {
        if (o.id !== id) return o;
        const next = { ...o, ...patch },
          span =
            next.side === "north" || next.side === "south"
              ? l.room.width
              : l.room.depth;
        next.width = Math.min(next.width, span);
        next.offset = round(clamp(next.offset, 0, span - next.width));
        return next;
      });
    });
  const copyLayout = () => {
    if (project.layouts.length >= LIMITS.layouts) {
      setMessage(t("maxLayouts"));
      return;
    }
    update((p) => {
      const current = clone(p.layouts.find((l) => l.id === p.currentId)!);
      current.id = uid();
      current.name = `${displayName(current.name, t).slice(0, 65)} · ${t("copy")}`;
      current.items = current.items.map((i) => ({ ...i, id: uid() }));
      current.room.openings = current.room.openings.map((o) => ({
        ...o,
        id: uid(),
      }));
      p.layouts.push(current);
      p.currentId = current.id;
    });
    setSelected(null);
  };
  const addPreset = (preset: "living" | "work" | "sleep") => {
    if (project.layouts.length >= LIMITS.layouts) {
      setMessage(t("maxLayouts"));
      return;
    }
    update((p) => {
      const l = starter(preset);
      p.layouts.push(l);
      p.currentId = l.id;
    });
    setSelected(null);
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > LIMITS.bytes) throw new ProjectError("limit");
      const parsed = parseProject(await file.text());
      setPending(parsed);
      setModal("import");
    } catch (e) {
      setMessage(
        t(
          e instanceof ProjectError
            ? e.code === "format"
              ? "invalidFormat"
              : e.code === "limit"
                ? "invalidLimit"
                : "invalidValue"
            : "invalidFormat",
        ),
      );
    } finally {
      if (input.current) input.current.value = "";
    }
  };
  const restoreBackup = () => {
    try {
      const backup = localStorage.getItem(BACKUP_KEY);
      if (!backup) throw Error();
      setPending(parseProject(backup));
      setModal("backup");
    } catch {
      setMessage(t("noBackup"));
    }
  };
  const openCompare = () => {
    setCompareIds([
      project.currentId,
      project.layouts.find((l) => l.id !== project.currentId)?.id ??
        project.currentId,
    ]);
    setModal("compare");
  };
  const exportJson = () => {
    download(
      JSON.stringify(project, null, 2),
      `${fileName(project.name)}.perch.json`,
      "application/json",
    );
    announce("exported");
  };
  const exportSvg = () => {
    const svg = exportPlan.current?.querySelector("svg");
    if (!svg) return;
    download(
      `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`,
      `${fileName(displayName(layout.name, t))}-plan.svg`,
      "image/svg+xml",
    );
    announce("exported");
  };
  const exportPng = () => {
    const url = scene.current?.capture();
    if (!url) {
      setMessage(t("imageUnavailable"));
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName(displayName(layout.name, t))}-room.png`;
    a.click();
    announce("exported");
  };
  const openReport = () => {
    setReportImage(scene.current?.capture() ?? null);
    setModal("report");
  };
  const warningText = (note: (typeof notes)[number]) => {
    if (note.type === "opening") return t("openingOverlap");
    const names = note.ids
      .map((id) => layout.items.find((f) => f.id === id))
      .filter((i): i is Furniture => !!i)
      .map((i) => t(i.kind));
    return note.type === "collision"
      ? `${names.join(" + ")}: ${t("collision")}`
      : `${names[0]}: ${t(note.type === "outside" ? "outside" : note.type === "height" ? "tooTall" : "doorConflict")}`;
  };
  return (
    <>
      <div className="app-shell">
        <a className="skip-link" href="#room-controls">
          {t("skip")}
        </a>
        <header className="app-header">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <strong>PERCH</strong>
            <span className="brand-description">{t("studio")}</span>
          </div>
          <div className="header-tools">
            <select
              aria-label={t("language")}
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
            >
              <option value="en">EN</option>
              <option value="ru">RU</option>
              <option value="kk">KK</option>
            </select>
            <button
              className="icon-button"
              aria-label={t("help")}
              onClick={() => setModal("help")}
            >
              <HelpCircle size={19} />
            </button>
            <button className="export-main" onClick={() => setModal("export")}>
              <Download size={17} />
              {t("export")}
            </button>
          </div>
        </header>
        <div className="project-bar">
          <div className="project-name">
            <span className="eyebrow">PERCH / 001</span>
            <NameField
              label={t("project")}
              value={project.name}
              onChange={(name) =>
                update((p) => {
                  p.name = name;
                })
              }
            />
          </div>
          <div className="project-actions">
            <span
              className={`save-indicator ${visibleSaveState === "error" ? "error" : ""}`}
            >
              {visibleSaveState === "saved" ? (
                <Check size={14} />
              ) : visibleSaveState === "saving" ? (
                <Save size={14} />
              ) : (
                <TriangleAlert size={14} />
              )}
              <span>
                {saveBlocked
                  ? t("broken")
                  : visibleSaveState === "saved"
                    ? t("local")
                    : visibleSaveState === "saving"
                      ? t("saving")
                      : t("saveError")}
              </span>
            </span>
            <button
              className="icon-button"
              aria-label={t("undo")}
              disabled={!history.past.length}
              onClick={() => {
                setPreview(null);
                setHistory(undo);
              }}
            >
              <Undo2 size={18} />
            </button>
            <button
              className="icon-button"
              aria-label={t("redo")}
              disabled={!history.future.length}
              onClick={() => {
                setPreview(null);
                setHistory(redo);
              }}
            >
              <Redo2 size={18} />
            </button>
          </div>
        </div>
        {notice && (
          <div className="notice" role="status">
            <TriangleAlert size={19} />
            <p>{t(notice as "recovered" | "broken")}</p>
            {saveBlocked ? (
              <button
                onClick={() => {
                  setSaveBlocked(false);
                  setNotice("");
                }}
              >
                {t("keepDemo")}
              </button>
            ) : (
              <button
                className="icon-button"
                onClick={() => setNotice("")}
                aria-label={t("close")}
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}
        <main className="studio-grid">
          <aside className="library-panel" id="room-controls">
            <nav className="panel-tabs" aria-label={t("studio")}>
              {(["room", "furniture", "layouts"] as const).map((key) => (
                <button
                  key={key}
                  aria-pressed={tab === key}
                  className={tab === key ? "active" : ""}
                  onClick={() => setTab(key)}
                >
                  {key === "room" ? (
                    <Settings2 size={16} />
                  ) : key === "furniture" ? (
                    <Armchair size={16} />
                  ) : (
                    <Layers size={16} />
                  )}
                  <span>{t(key)}</span>
                </button>
              ))}
            </nav>
            <div className="library-content">
              {tab === "room" && (
                <>
                  <div className="section-heading">
                    <Ruler size={18} />
                    <h2>{t("roomSize")}</h2>
                  </div>
                  <div className="field-grid">
                    <NumberField
                      label={t("width")}
                      value={layout.room.width}
                      min={2}
                      max={12}
                      unit={t("meters")}
                      locale={locale}
                      onChange={(width) => changeRoom({ width })}
                    />
                    <NumberField
                      label={t("depth")}
                      value={layout.room.depth}
                      min={2}
                      max={12}
                      unit={t("meters")}
                      locale={locale}
                      onChange={(depth) => changeRoom({ depth })}
                    />
                    <NumberField
                      label={t("height")}
                      value={layout.room.height}
                      min={2}
                      max={4}
                      unit={t("meters")}
                      locale={locale}
                      onChange={(height) => changeRoom({ height })}
                    />
                    <div className="area-readout">
                      <small>{t("area")}</small>
                      <strong>
                        {format(layout.room.width * layout.room.depth, locale)}
                        <small>m²</small>
                      </strong>
                    </div>
                  </div>
                  <div className="section-heading">
                    <Sun size={18} />
                    <h2>{t("materials")}</h2>
                  </div>
                  <label className="select-field">
                    {t("floor")}
                    <select
                      aria-label={t("floor")}
                      value={layout.room.floor}
                      onChange={(e) =>
                        changeRoom({ floor: e.target.value as Floor })
                      }
                    >
                      {(["oak", "walnut", "stone"] as const).map((key) => (
                        <option key={key} value={key}>
                          {t(key)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="select-field">
                    {t("light")}
                    <select
                      aria-label={t("light")}
                      value={layout.room.light}
                      onChange={(e) =>
                        changeRoom({ light: e.target.value as Light })
                      }
                    >
                      {(["day", "warm", "evening"] as const).map((key) => (
                        <option key={key} value={key}>
                          {t(key)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="section-heading">
                    <Maximize2 size={17} />
                    <h2>{t("openings")}</h2>
                  </div>
                  <div className="opening-add">
                    <button onClick={() => addOpening("door")}>
                      <Plus size={15} />
                      {t("addDoor")}
                    </button>
                    <button onClick={() => addOpening("window")}>
                      <Plus size={15} />
                      {t("addWindow")}
                    </button>
                  </div>
                  {layout.room.openings.map((o, index) => {
                    const span =
                      o.side === "north" || o.side === "south"
                        ? layout.room.width
                        : layout.room.depth;
                    return (
                      <section className="opening-card" key={o.id}>
                        <div className="item-title">
                          <strong>
                            {t(o.kind)} {index + 1}
                          </strong>
                          <button
                            className="icon-button"
                            aria-label={`${t("remove")} ${t(o.kind)} ${index + 1}`}
                            onClick={() =>
                              changeLayout((l) => {
                                l.room.openings = l.room.openings.filter(
                                  (i) => i.id !== o.id,
                                );
                              })
                            }
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <label className="select-field">
                          {t("side")}
                          <select
                            value={o.side}
                            onChange={(e) =>
                              editOpening(o.id, {
                                side: e.target.value as Side,
                              })
                            }
                          >
                            {(["north", "east", "south", "west"] as const).map(
                              (key) => (
                                <option key={key} value={key}>
                                  {t(key)}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <div className="field-grid">
                          <NumberField
                            label={t("offset")}
                            value={o.offset}
                            min={0}
                            max={round(span - o.width)}
                            unit={t("meters")}
                            locale={locale}
                            onChange={(offset) => editOpening(o.id, { offset })}
                          />
                          <NumberField
                            label={t("width")}
                            value={o.width}
                            min={0.3}
                            max={Math.min(4, span)}
                            unit={t("meters")}
                            locale={locale}
                            onChange={(width) => editOpening(o.id, { width })}
                          />
                        </div>
                      </section>
                    );
                  })}
                </>
              )}
              {tab === "furniture" && (
                <>
                  <div className="catalog-intro">
                    <div>
                      <span className="eyebrow">{t("furniture")} / 12</span>
                      <h2>{t("catalog")}</h2>
                    </div>
                    <Armchair size={24} />
                  </div>
                  <p className="panel-note">{t("catalogNote")}</p>
                  <label className="filter-label">
                    <select
                      aria-label={t("catalog")}
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {(
                        [
                          "all",
                          "seating",
                          "surfaces",
                          "storage",
                          "accents",
                        ] as const
                      ).map((c) => (
                        <option key={c} value={c}>
                          {t(c)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} />
                  </label>
                  <div className="catalog-grid">
                    {CATALOG.filter(
                      (c) => category === "all" || c.category === category,
                    ).map((c) => (
                      <button
                        className="catalog-card"
                        key={c.kind}
                        onClick={() => add(c.kind)}
                        aria-label={`${t("add")}: ${t(c.kind)}`}
                      >
                        <div className="catalog-drawing">
                          <svg viewBox="-1.5 -1.5 3 3" aria-hidden="true">
                            <Footprint
                              item={{
                                ...c,
                                id: "thumb",
                                x: 0,
                                y: 0,
                                rotation: 0,
                                finish:
                                  c.kind === "armchair" || c.kind === "plant"
                                    ? "moss"
                                    : c.kind === "sofa"
                                      ? "clay"
                                      : "linen",
                              }}
                            />
                          </svg>
                          <span className="catalog-plus">
                            <Plus size={14} />
                          </span>
                        </div>
                        <strong>{t(c.kind)}</strong>
                        <span>
                          {format(c.width, locale)} × {format(c.depth, locale)}{" "}
                          {t("meters")}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {tab === "layouts" && (
                <>
                  <div className="section-heading">
                    <Layers size={18} />
                    <h2>{t("alternatives")}</h2>
                  </div>
                  <div className="variant-list">
                    {project.layouts.map((l, index) => (
                      <button
                        className={`variant-card ${l.id === layout.id ? "active" : ""}`}
                        aria-pressed={l.id === layout.id}
                        key={l.id}
                        onClick={() => {
                          update((p) => {
                            p.currentId = l.id;
                          });
                          setSelected(null);
                        }}
                      >
                        <div className="variant-plan">
                          <Plan
                            layout={l}
                            locale={locale}
                            readonly
                            measure={false}
                          />
                        </div>
                        <span>
                          <small>{String(index + 1).padStart(2, "0")}</small>
                          <strong>{displayName(l.name, t)}</strong>
                          <small>
                            {format(l.room.width * l.room.depth, locale)} m² ·{" "}
                            {l.items.length} {t("quantity").toLowerCase()}
                          </small>
                        </span>
                        {l.id === layout.id && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                  <div className="variant-actions">
                    <button className="primary" onClick={copyLayout}>
                      <Copy size={17} />
                      {t("newLayout")}
                    </button>
                    <button
                      onClick={openCompare}
                      disabled={project.layouts.length < 2}
                    >
                      <Grid2X2 size={17} />
                      {t("compare")}
                    </button>
                  </div>
                  <p className="panel-note">{t("maxLayouts")}</p>
                  <div className="section-heading">
                    <Plus size={18} />
                    <h2>{t("presets")}</h2>
                  </div>
                  <div className="preset-list">
                    {(["living", "work", "sleep"] as const).map((p) => (
                      <button key={p} onClick={() => addPreset(p)}>
                        {t(p)}
                        <Plus size={16} />
                      </button>
                    ))}
                  </div>
                  <p className="panel-note">{t("presetNote")}</p>
                  <button
                    className="danger subtle"
                    onClick={() => setModal("deleteLayout")}
                    disabled={project.layouts.length === 1}
                  >
                    <Trash2 size={16} />
                    {t("deleteLayout")}
                  </button>
                </>
              )}
            </div>
            <div className="library-footer">
              <span className="tiny-square" />
              {t("privacy")}
            </div>
          </aside>
          <section className="workspace" aria-label={t("studio")}>
            <div className="workspace-heading">
              <div>
                <span className="eyebrow">
                  {String(
                    project.layouts.findIndex((l) => l.id === layout.id) + 1,
                  ).padStart(2, "0")}{" "}
                  / {t("layouts")}
                </span>
                <NameField
                  label={t("rename")}
                  value={displayName(layout.name, t)}
                  onChange={(name) =>
                    changeLayout((l) => {
                      l.name = name;
                    })
                  }
                />
              </div>
              <div className="view-switch" aria-label={t("studio")}>
                <button
                  className={view === "scene" ? "active" : ""}
                  aria-pressed={view === "scene"}
                  onClick={() => setView("scene")}
                >
                  3D
                </button>
                <button
                  className={view === "plan" ? "active" : ""}
                  aria-pressed={view === "plan"}
                  onClick={() => setView("plan")}
                >
                  {t("plan")}
                </button>
                <button
                  className={view === "split" ? "active" : ""}
                  aria-pressed={view === "split"}
                  onClick={() => setView("split")}
                  aria-label={t("split")}
                >
                  <Grid2X2 size={17} />
                </button>
              </div>
            </div>
            <div className={`view-stack view-${view}`}>
              {view !== "plan" && (
                <Suspense
                  fallback={<div className="scene-loading">{t("loading")}</div>}
                >
                  <Scene
                    layout={layout}
                    selected={selected}
                    preview={preview}
                    locale={locale}
                    onSelect={select}
                    onReady={onSceneReady}
                    forceFailure={new URLSearchParams(location.search).has(
                      "no3d",
                    )}
                  />
                </Suspense>
              )}
              {view !== "scene" && (
                <div className="plan-shell">
                  <div className="plan-topline">
                    <span className="scene-index">02 / {t("plan")}</span>
                    <div className="plan-options">
                      <label>
                        <input
                          type="checkbox"
                          checked={snap}
                          onChange={(e) => setSnap(e.target.checked)}
                        />
                        {t("snap")}
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={measure}
                          onChange={(e) => setMeasure(e.target.checked)}
                        />
                        <Ruler size={16} />
                        <span className="measure-label">{t("measure")}</span>
                      </label>
                    </div>
                  </div>
                  <div className="plan-container">
                    <Plan
                      layout={layout}
                      locale={locale}
                      selected={selected}
                      snap={snap}
                      measure={measure}
                      preview={preview}
                      onSelect={select}
                      onPreview={setPreview}
                      onCommit={editItem}
                      onKey={keyMove}
                    />
                  </div>
                  <p className="canvas-hint">{t("planHint")}</p>
                </div>
              )}
            </div>
            <div className="workspace-footer">
              <span>
                {format(layout.room.width, locale)} ×{" "}
                {format(layout.room.depth, locale)} {t("meters")}
                <i /> {format(layout.room.width * layout.room.depth, locale)} m²
              </span>
              <span>
                <Armchair size={15} />
                {layout.items.length} / {LIMITS.items}
              </span>
            </div>
            {selectedItem && (
              <div className="mobile-edit-bar">
                <button
                  onClick={() =>
                    document
                      .querySelector(".inspector")
                      ?.scrollIntoView({ block: "start" })
                  }
                >
                  <Settings2 size={17} />
                  {t("editPiece")}
                </button>
                <button
                  onClick={() =>
                    document
                      .querySelector(".workspace")
                      ?.scrollIntoView({ block: "start" })
                  }
                  aria-label={t("backToRoom")}
                >
                  <Grid2X2 size={17} />
                </button>
              </div>
            )}
          </section>
          <aside className="inspector">
            <div className="inspector-heading">
              <Move size={18} />
              <span>{t("selection")}</span>
            </div>
            <div className="inspector-content">
              {shownItem ? (
                <>
                  <div className="selected-title">
                    <h2>{t(shownItem.kind)}</h2>
                    <span>
                      {layout.items.findIndex((i) => i.id === shownItem.id) +
                        1 <
                      10
                        ? "0"
                        : ""}
                      {layout.items.findIndex((i) => i.id === shownItem.id) + 1}
                    </span>
                  </div>
                  <div className="section-heading compact">
                    <h3>{t("size")}</h3>
                  </div>
                  <div className="field-grid">
                    <NumberField
                      label={t("width")}
                      value={shownItem.width}
                      min={0.1}
                      max={5}
                      unit={t("meters")}
                      locale={locale}
                      onChange={(width) => changeItem({ width })}
                    />
                    <NumberField
                      label={t("depth")}
                      value={shownItem.depth}
                      min={0.1}
                      max={5}
                      unit={t("meters")}
                      locale={locale}
                      onChange={(depth) => changeItem({ depth })}
                    />
                    <NumberField
                      label={t("height")}
                      value={shownItem.height}
                      min={0.01}
                      max={3}
                      unit={t("meters")}
                      locale={locale}
                      onChange={(height) => changeItem({ height })}
                    />
                    <NumberField
                      label={t("rotation")}
                      value={shownItem.rotation}
                      min={0}
                      max={360}
                      unit="°"
                      locale={locale}
                      onChange={(rotation) => changeItem({ rotation })}
                    />
                  </div>
                  <div className="section-heading compact">
                    <h3>{t("position")}</h3>
                  </div>
                  <div className="field-grid">
                    <NumberField
                      label={t("x")}
                      value={shownItem.x}
                      min={-10}
                      max={30}
                      unit={t("meters")}
                      locale={locale}
                      onChange={(x) => changeItem({ x })}
                    />
                    <NumberField
                      label={t("y")}
                      value={shownItem.y}
                      min={-10}
                      max={30}
                      unit={t("meters")}
                      locale={locale}
                      onChange={(y) => changeItem({ y })}
                    />
                  </div>
                  <div className="nudge-controls">
                    <button
                      aria-label={t("left")}
                      onClick={() => nudge(-0.1, 0)}
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <button aria-label={t("up")} onClick={() => nudge(0, -0.1)}>
                      <ArrowUp size={18} />
                    </button>
                    <button
                      aria-label={t("down")}
                      onClick={() => nudge(0, 0.1)}
                    >
                      <ArrowDown size={18} />
                    </button>
                    <button
                      aria-label={t("right")}
                      onClick={() => nudge(0.1, 0)}
                    >
                      <ArrowRight size={18} />
                    </button>
                    <button
                      aria-label={t("turn")}
                      onClick={() =>
                        changeItem({ rotation: shownItem.rotation + 15 })
                      }
                    >
                      <RotateCw size={18} />
                    </button>
                  </div>
                  <div className="section-heading compact">
                    <h3>{t("finish")}</h3>
                  </div>
                  <div className="swatches">
                    {(Object.keys(FINISHES) as Finish[]).map((f) => (
                      <button
                        key={f}
                        style={{ background: FINISHES[f] }}
                        aria-label={t(f)}
                        title={t(f)}
                        aria-pressed={shownItem.finish === f}
                        onClick={() => changeItem({ finish: f })}
                      >
                        {shownItem.finish === f && <Check size={17} />}
                      </button>
                    ))}
                  </div>
                  <div className="item-actions">
                    <button onClick={duplicate}>
                      <Copy size={16} />
                      {t("duplicate")}
                    </button>
                    <button
                      className="danger icon-button"
                      onClick={remove}
                      aria-label={t("delete")}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </>
              ) : (
                <div className="selection-empty">
                  <Move size={26} />
                  <h2>{t("noSelection")}</h2>
                  <p>{t("selectHint")}</p>
                </div>
              )}
              <div className="section-heading">
                <Armchair size={17} />
                <h3>
                  {t("pieces")}{" "}
                  <span className="count">{layout.items.length}</span>
                </h3>
              </div>
              <div className="item-list">
                {layout.items.length ? (
                  layout.items.map((f, index) => (
                    <button
                      key={f.id}
                      aria-pressed={selected === f.id}
                      className={selected === f.id ? "active" : ""}
                      onClick={() => select(f.id)}
                    >
                      <span
                        className="finish-dot"
                        style={{ background: FINISHES[f.finish] }}
                      />
                      <span>{t(f.kind)}</span>
                      <small>{String(index + 1).padStart(2, "0")}</small>
                    </button>
                  ))
                ) : (
                  <p className="panel-note">{t("empty")}</p>
                )}
              </div>
              <section
                className={`fit-panel ${notes.length ? "has-notes" : ""}`}
              >
                <div className="fit-heading">
                  {notes.length ? (
                    <TriangleAlert size={18} />
                  ) : (
                    <Check size={18} />
                  )}
                  <h3>{t("fitChecks")}</h3>
                  <span>{notes.length}</span>
                </div>
                {notes.length ? (
                  <ul>
                    {notes.map((note, index) => (
                      <li key={index}>
                        <button onClick={() => setSelected(note.ids[0])}>
                          {warningText(note)}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t("clear")}</p>
                )}
                <p className="fit-note">{t("warningsNote")}</p>
              </section>
            </div>
          </aside>
        </main>
        <footer className="app-footer">
          <span>PERCH · {t("reportDisclaimer")}</span>
          <button onClick={() => setModal("help")}>{t("help")}</button>
        </footer>
        {message && (
          <div className="toast" role="status">
            {message}
            <button onClick={() => setMessage("")} aria-label={t("close")}>
              <X size={16} />
            </button>
          </div>
        )}
        <div className="export-plan" ref={exportPlan} aria-hidden="true">
          <Plan layout={layout} locale={locale} readonly />
        </div>
        <input
          className="visually-hidden"
          ref={input}
          type="file"
          accept=".json,application/json"
          aria-label={t("import")}
          onChange={(e) => void importFile(e.target.files?.[0])}
        />
      </div>
      {modal && (
        <Dialog
          title={t(
            modal === "export"
              ? "exportTitle"
              : modal === "compare"
                ? "compare"
                : modal === "help"
                  ? "help"
                  : modal === "report"
                    ? "report"
                    : modal === "import"
                      ? "importTitle"
                      : modal === "backup"
                        ? "backupTitle"
                        : "deleteTitle",
          )}
          onClose={() => setModal(null)}
          wide={modal === "compare" || modal === "report"}
        >
          {modal === "export" && (
            <>
              <p className="dialog-description">{t("exportNote")}</p>
              <div className="export-options">
                <button onClick={exportJson}>
                  <FileJson size={24} />
                  <span>
                    <strong>{t("json")}</strong>
                    <small>{t("jsonNote")}</small>
                  </span>
                  <Download size={18} />
                </button>
                <button onClick={exportSvg}>
                  <Ruler size={24} />
                  <span>
                    <strong>{t("svg")}</strong>
                    <small>{t("svgNote")}</small>
                  </span>
                  <Download size={18} />
                </button>
                <button onClick={exportPng}>
                  <Image size={24} />
                  <span>
                    <strong>{t("png")}</strong>
                    <small>{t("pngNote")}</small>
                  </span>
                  <Download size={18} />
                </button>
                <button onClick={openReport}>
                  <FileText size={24} />
                  <span>
                    <strong>{t("report")}</strong>
                    <small>{t("reportNote")}</small>
                  </span>
                  <ChevronDown size={18} />
                </button>
              </div>
              <div className="import-actions">
                <button
                  onClick={() => {
                    setModal(null);
                    input.current?.click();
                  }}
                >
                  <Upload size={17} />
                  {t("import")}
                </button>
                <button onClick={restoreBackup}>
                  <Undo2 size={17} />
                  {t("backup")}
                </button>
              </div>
              <p className="panel-note">{t("privacy")}</p>
            </>
          )}
          {(modal === "import" ||
            modal === "backup" ||
            modal === "deleteLayout") && (
            <>
              <p className="dialog-description">
                {t(
                  modal === "import"
                    ? "importBody"
                    : modal === "backup"
                      ? "backupBody"
                      : "deleteBody",
                )}
              </p>
              {pending && modal !== "deleteLayout" && (
                <div className="import-summary">
                  <strong>{pending.name}</strong>
                  <span>
                    {pending.layouts.length} {t("layouts").toLowerCase()} ·{" "}
                    {pending.layouts.reduce(
                      (sum, l) => sum + l.items.length,
                      0,
                    )}{" "}
                    {t("quantity").toLowerCase()}
                  </span>
                </div>
              )}
              <div className="dialog-actions">
                <button
                  onClick={() => {
                    setModal(null);
                    setPending(null);
                  }}
                >
                  {t("cancel")}
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    if (modal === "deleteLayout") {
                      update((p) => {
                        p.layouts = p.layouts.filter(
                          (l) => l.id !== p.currentId,
                        );
                        p.currentId = p.layouts[0].id;
                      });
                    } else if (pending) {
                      setHistory((h) => commit(h, pending));
                      setPending(null);
                      setSaveBlocked(false);
                      setNotice("");
                      announce("imported");
                    }
                    setSelected(null);
                    setPreview(null);
                    setModal(null);
                  }}
                >
                  {t("confirm")}
                </button>
              </div>
            </>
          )}
          {modal === "help" && (
            <>
              <p className="dialog-description">{t("helpText")}</p>
              <div className="help-block">
                <Ruler size={22} />
                <p>{t("keyboard")}</p>
              </div>
              <div className="help-block">
                <Save size={22} />
                <p>{t("privacy")}</p>
              </div>
              <div className="help-block">
                <TriangleAlert size={22} />
                <p>
                  {t("reportDisclaimer")} {t("warningsNote")}
                </p>
              </div>
              <p className="panel-note">{t("reduceInfo")}</p>
            </>
          )}
          {modal === "compare" && (
            <div className="compare-grid">
              {compareIds.map((id, index) => {
                const l =
                  project.layouts.find((l) => l.id === id) ??
                  project.layouts[0];
                return (
                  <section key={index}>
                    <label className="select-field">
                      {t(index === 0 ? "layoutA" : "layoutB")}
                      <select
                        value={l.id}
                        onChange={(e) =>
                          setCompareIds((ids) =>
                            index === 0
                              ? [e.target.value, ids[1]]
                              : [ids[0], e.target.value],
                          )
                        }
                      >
                        {project.layouts.map((v) => (
                          <option key={v.id} value={v.id}>
                            {displayName(v.name, t)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="compare-plan">
                      <Plan layout={l} locale={locale} readonly />
                    </div>
                    <div className="compare-stats">
                      <span>
                        {format(l.room.width * l.room.depth, locale)} m²
                        <small>{t("area")}</small>
                      </span>
                      <span>
                        {l.items.length}
                        <small>{t("quantity")}</small>
                      </span>
                      <span>
                        {warnings(l).length}
                        <small>{t("fitChecks")}</small>
                      </span>
                    </div>
                    <p className="panel-note">
                      {t("footprint")}: {format(coverage(l), locale, 0)}%
                    </p>
                  </section>
                );
              })}
            </div>
          )}
          {modal === "report" && (
            <>
              <div className="report-actions">
                <button className="primary" onClick={() => window.print()}>
                  <FileText size={17} />
                  {t("print")}
                </button>
              </div>
              <article className="print-report">
                <div className="report-brand">
                  PERCH<span>{t("report")}</span>
                </div>
                <h1>{project.name}</h1>
                <p className="report-subtitle">
                  {displayName(layout.name, t)} ·{" "}
                  {format(layout.room.width, locale)} ×{" "}
                  {format(layout.room.depth, locale)} ×{" "}
                  {format(layout.room.height, locale)} {t("meters")} ·{" "}
                  {format(layout.room.width * layout.room.depth, locale)} m²
                </p>
                <div className="report-visuals">
                  {reportImage && (
                    <img
                      className="report-image"
                      src={reportImage}
                      alt={t("reportView")}
                    />
                  )}
                  <div className="report-plan">
                    <Plan layout={layout} locale={locale} readonly />
                  </div>
                </div>
                <h2>{t("furniture")}</h2>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("furniture")}</th>
                      <th>
                        {t("dimensions")} ({t("meters")})
                      </th>
                      <th>{t("rotation")}</th>
                      <th>{t("finish")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {layout.items.map((f, index) => (
                      <tr key={f.id}>
                        <td>{index + 1}</td>
                        <td>{t(f.kind)}</td>
                        <td>
                          {format(f.width, locale)} × {format(f.depth, locale)}{" "}
                          × {format(f.height, locale)}
                        </td>
                        <td>{format(f.rotation, locale)}°</td>
                        <td>{t(f.finish)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <h2>{t("fitChecks")}</h2>
                {notes.length ? (
                  <ul>
                    {notes.map((n, i) => (
                      <li key={i}>{warningText(n)}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{t("clear")}</p>
                )}
                <p className="report-disclaimer">
                  {t("warningsNote")} {t("reportDisclaimer")}
                </p>
              </article>
            </>
          )}
        </Dialog>
      )}
    </>
  );
}
