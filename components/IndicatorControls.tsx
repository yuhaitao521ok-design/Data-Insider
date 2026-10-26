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
  type: IndicatorType;
  draft: Record<string, number>;
}

/**
 * 指标菜单：图表工具栏只保留一个「指标」按钮，
 * 添加 / 移除 / 参数全部在菜单内完成，避免指标标签占满工具栏。
 */
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

  const findConfig = (type: IndicatorType) => configs.find((config) => config.type === type);

  function openMenu() {
    setMenuOpen((open) => !open);
    setEditing(null);
    setError(null);
  }

  function addIndicator(type: IndicatorType) {
    const params = defaultParams(type);
    if (!findConfig(type)) {
      onChange([...configs, { id: type, type, params }]);
    }
    setEditing({ type, draft: params });
    setError(null);
  }

  function removeIndicator(type: IndicatorType) {
    onChange(configs.filter((config) => config.type !== type));
    if (editing?.type === type) {
      setEditing(null);
      setError(null);
    }
  }

  function startEdit(type: IndicatorType) {
    const config = findConfig(type);
    if (!config) return;
    if (editing?.type === type) {
      setEditing(null);
      setError(null);
      return;
    }
    setEditing({ type, draft: { ...config.params } });
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

    const params = normalizeParams(editing.type, editing.draft);
    const exists = findConfig(editing.type);
    onChange(
      exists
        ? configs.map((config) =>
            config.type === editing.type ? { ...config, params } : config,
          )
        : [...configs, { id: editing.type, type: editing.type, params }],
    );
    setEditing(null);
    setError(null);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={openMenu}
        aria-label="技术指标"
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
        <div className="absolute right-0 top-full z-50 mt-1.5 max-h-[min(72vh,560px)] w-[340px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-[var(--shadow-pop)] scroll-thin rise">
          <div className="flex items-center justify-between px-2 pb-1 pt-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">技术指标</p>
            <span className="num text-[10px] text-muted-foreground/70">
              {configs.length} / {INDICATOR_TYPES.length} 已启用
            </span>
          </div>

          {INDICATOR_TYPES.map((type) => {
            const definition = INDICATOR_DEFINITIONS[type];
            const config = findConfig(type);
            const active = Boolean(config);
            const expanded = editing?.type === type;

            return (
              <div
                key={type}
                className={`rounded-md transition-colors ${expanded ? "bg-muted/50" : ""}`}
              >
                <div className="flex items-start gap-2 px-2 py-2">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[9px] font-medium ${
                      active
                        ? "border-accent/30 bg-accent-soft text-accent"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {type.slice(0, 1)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[12.5px] font-medium">{definition.name}</span>
                        {active && <span className="text-[10px] text-accent">已添加</span>}
                      </span>

                      <span className="flex shrink-0 items-center gap-1">
                        {active ? (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(type)}
                              aria-label={`${definition.name} 参数`}
                              aria-expanded={expanded}
                              className={`inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[10px] transition-colors ${
                                expanded
                                  ? "border-accent/40 bg-accent-soft text-accent"
                                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                              }`}
                            >
                              <svg
                                width="9"
                                height="9"
                                viewBox="0 0 24 24"
                                fill="none"
                                aria-hidden="true"
                              >
                                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                                <path
                                  d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10 2.1 2.1m0-14.2-2.1 2.1m-10 10-2.1 2.1"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                />
                              </svg>
                              参数
                            </button>
                            <button
                              type="button"
                              onClick={() => removeIndicator(type)}
                              aria-label={`移除 ${definition.name}`}
                              className="inline-flex h-6 items-center rounded-md border border-border px-1.5 text-[10px] text-muted-foreground transition-colors hover:border-negative/40 hover:bg-negative-soft hover:text-negative-text"
                            >
                              移除
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addIndicator(type)}
                            aria-label={`添加 ${definition.name}`}
                            className="inline-flex h-6 items-center rounded-md border border-accent/30 bg-accent-soft px-2 text-[10px] font-medium text-accent transition-colors hover:border-accent/50"
                          >
                            添加
                          </button>
                        )}
                      </span>
                    </div>

                    <p className="mt-0.5 text-[10.5px] leading-4 text-muted-foreground">
                      {definition.description}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground/80">
                      {definition.location === "overlay" ? "主图叠加" : "副图"} · 默认{" "}
                      {Object.values(definition.defaults).join(" / ")}
                      {config && ` · 当前 ${paramsSummary(type, config.params)}`}
                    </p>
                  </div>
                </div>

                {editing && editing.type === type && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      apply();
                    }}
                    className="mx-2 mb-2 rounded-md border border-border bg-background/70 p-2.5"
                  >
                    <div className="space-y-1.5">
                      {definition.fields.map((field) => (
                        <label key={field.key} className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-muted-foreground">{field.label}</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            value={
                              Number.isFinite(editing.draft[field.key])
                                ? editing.draft[field.key]
                                : ""
                            }
                            onChange={(event) => updateDraft(field.key, event.target.value)}
                            className="num h-7 w-[88px] rounded-md border border-border bg-background px-2 text-right text-[12px] focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-accent/20"
                            aria-label={`${type} ${field.label}`}
                          />
                        </label>
                      ))}
                    </div>

                    {error && (
                      <p className="mt-1.5 text-[10.5px] leading-4 text-negative-text">{error}</p>
                    )}

                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!editing) return;
                          setEditing({ ...editing, draft: defaultParams(type) });
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
            );
          })}

          <p className="border-t border-border px-2 py-1.5 text-[10px] leading-4 text-muted-foreground/70">
            同一类型指标只保留一个；添加后点「参数」即可在下方调整，无需关闭菜单。
          </p>
        </div>
      )}

    </div>
  );
}
