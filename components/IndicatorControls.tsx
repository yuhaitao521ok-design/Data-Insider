"use client";

import { useEffect, useRef, useState } from "react";
import {
  INDICATOR_DEFINITIONS,
  INDICATOR_TYPES,
  defaultParams,
  normalizeParams,
  paramsSummary,
  validateParams,
  type IndicatorConfig,
  type IndicatorType,
} from "@/lib/indicators";

interface IndicatorControlsProps {
  configs: IndicatorConfig[];
  onChange: (configs: IndicatorConfig[]) => void;
}

interface EditingState {
  id: string;
  type: IndicatorType;
  draft: Record<string, number>;
}

export default function IndicatorControls({ configs, onChange }: IndicatorControlsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !editing) return;

    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setEditing(null);
        setError(null);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setEditing(null);
        setError(null);
      }
    }

    document.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen, editing]);

  function toggle(type: IndicatorType) {
    if (configs.some((config) => config.type === type)) {
      onChange(configs.filter((config) => config.type !== type));
      setEditing(null);
    } else {
      onChange([...configs, { id: type, type, params: defaultParams(type) }]);
    }
    setMenuOpen(false);
    setError(null);
  }

  function openSettings(config: IndicatorConfig) {
    setEditing({ id: config.id, type: config.type, draft: { ...config.params } });
    setMenuOpen(false);
    setError(null);
  }

  function updateDraft(key: string, value: string) {
    if (!editing) return;
    setEditing({
      ...editing,
      draft: { ...editing.draft, [key]: value === "" ? Number.NaN : Number(value) },
    });
    setError(null);
  }

  function apply() {
    if (!editing) return;
    const message = validateParams(editing.type, editing.draft);
    if (message) {
      setError(message);
      return;
    }
    onChange(
      configs.map((config) =>
        config.id === editing.id
          ? { ...config, params: normalizeParams(editing.type, editing.draft) }
          : config,
      ),
    );
    setEditing(null);
    setError(null);
  }

  const editingDefinition = editing ? INDICATOR_DEFINITIONS[editing.type] : null;

  return (
    <div ref={rootRef} className="flex flex-wrap items-center gap-1.5">
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setMenuOpen((open) => !open);
            setEditing(null);
            setError(null);
          }}
          aria-expanded={menuOpen}
          aria-haspopup="true"
          className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] transition-colors ${
            configs.length > 0
              ? "border-accent/30 bg-accent-soft text-accent hover:border-accent/50"
              : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          指标
          {configs.length > 0 && (
            <span className="num rounded bg-accent/15 px-1 text-[9px] leading-4">
              {configs.length}
            </span>
          )}
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-50 mt-1.5 w-[302px] rounded-lg border border-border bg-popover p-1 shadow-[var(--shadow-pop)] rise">
            <p className="px-2 pb-1 pt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              技术指标
            </p>

            {INDICATOR_TYPES.map((type) => {
              const definition = INDICATOR_DEFINITIONS[type];
              const active = configs.some((config) => config.type === type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggle(type)}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[9px] font-medium ${
                      active
                        ? "border-accent/30 bg-accent-soft text-accent"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {type.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-medium">{definition.name}</span>
                      <span
                        className={`shrink-0 text-[10px] ${
                          active ? "text-accent" : "text-muted-foreground"
                        }`}
                      >
                        {active ? "移除" : "添加"}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[10.5px] leading-4 text-muted-foreground">
                      {definition.description}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground/80">
                      {definition.location === "overlay" ? "主图叠加" : "副图"} · 默认{" "}
                      {Object.values(definition.defaults).join(" / ")}
                    </span>
                  </span>
                </button>
              );
            })}

            <p className="border-t border-border px-2 py-1.5 text-[10px] text-muted-foreground/70">
              添加后点击指标标签即可调整参数
            </p>
          </div>
        )}

      </div>

      {configs.map((config) => (
        <div key={config.id} className="relative">
          <div
            className={`inline-flex h-7 items-center overflow-hidden rounded-lg border bg-card text-[11px] ${
              editing?.id === config.id ? "border-accent/40 ring-1 ring-accent/20" : "border-border"
            }`}
          >
            <button
              type="button"
              onClick={() => openSettings(config)}
              className="inline-flex h-full items-center gap-1 px-2 transition-colors hover:bg-muted"
              title={`调整 ${config.type} 参数`}
            >
              <span className="font-medium">{config.type}</span>
              <span className="num text-muted-foreground">
                {paramsSummary(config.type, config.params)}
              </span>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10 2.1 2.1m0-14.2-2.1 2.1m-10 10-2.1 2.1"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(configs.filter((item) => item.id !== config.id));
                if (editing?.id === config.id) setEditing(null);
              }}
              className="flex h-full w-6 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-negative-soft hover:text-negative-text"
              aria-label={`移除 ${config.type}`}
              title={`移除 ${config.type}`}
            >
              ×
            </button>
          </div>

          {editing?.id === config.id && editingDefinition && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                apply();
              }}
              className="absolute right-0 top-full z-50 mt-1.5 w-[252px] rounded-lg border border-border bg-popover p-3 shadow-[var(--shadow-pop)] rise"
            >
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-medium">{config.type} 参数</p>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setError(null);
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded text-[13px] leading-none text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="关闭参数设置"
                >
                  ×
                </button>
              </div>

              <div className="mt-2 space-y-1.5">
                {editingDefinition.fields.map((field) => (
                  <label key={field.key} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">{field.label}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={
                        Number.isFinite(editing.draft[field.key]) ? editing.draft[field.key] : ""
                      }
                      onChange={(event) => updateDraft(field.key, event.target.value)}
                      className="num h-7 w-[84px] rounded-md border border-border bg-background px-2 text-right text-[12px] focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-accent/20"
                      aria-label={`${config.type} ${field.label}`}
                    />
                  </label>
                ))}
              </div>

              {error && <p className="mt-1.5 text-[10.5px] leading-4 text-negative-text">{error}</p>}

              <div className="mt-2.5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!editing) return;
                    setEditing({ ...editing, draft: defaultParams(editing.type) });
                    setError(null);
                  }}
                  className="h-7 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  重置默认
                </button>
                <button
                  type="submit"
                  className="h-7 rounded-md bg-accent px-2.5 text-[11px] font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
                >
                  应用
                </button>
              </div>
            </form>
          )}

        </div>
      ))}

    </div>
  );
}
