"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAX_GROUP_NAME,
  MAX_GROUPS,
  UNGROUPED_NAME,
  type WatchlistGroup,
} from "@/lib/watchlist";

interface GroupPickerProps {
  symbol: string;
  groups: WatchlistGroup[];
  currentGroupId: string | null;
  onAssign: (symbol: string, groupId: string | null) => void;
  /** 返回错误信息；成功返回 null */
  onCreateGroup: (name: string) => string | null;
  onClose: () => void;
}

/** 自选股分组选择器（行内弹层）：选已有分组 / 归入未分组 / 新建分组 */
export default function GroupPicker({
  symbol,
  groups,
  currentGroupId,
  onAssign,
  onCreateGroup,
  onClose,
}: GroupPickerProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  function submit() {
    const message = onCreateGroup(name);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    setName("");
    setCreating(false);
  }

  const optionClass =
    "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] text-foreground/85 transition-colors hover:bg-muted";

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={`${symbol} 分组`}
      className="absolute right-0 top-full z-50 mt-1 w-[186px] rounded-lg border border-border bg-popover p-1.5 shadow-[var(--shadow-pop)] rise"
    >
      <p className="mb-1 px-1 text-[10px] text-muted-foreground">{symbol} 的分组</p>

      <button type="button" onClick={() => onAssign(symbol, null)} className={optionClass}>
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            currentGroupId === null ? "bg-accent" : "bg-muted-foreground/40"
          }`}
        />
        {UNGROUPED_NAME}
      </button>

      {groups.map((group) => (
        <button
          key={group.id}
          type="button"
          onClick={() => onAssign(symbol, group.id)}
          className={optionClass}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              currentGroupId === group.id ? "bg-accent" : "bg-muted-foreground/40"
            }`}
          />
          <span className="truncate">{group.name}</span>
        </button>
      ))}

      <div className="mt-1 border-t border-border pt-1">
        {creating ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={name}
              maxLength={MAX_GROUP_NAME}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
                if (event.key === "Escape") {
                  setCreating(false);
                  setError(null);
                }
              }}
              placeholder="新分组名称"
              aria-label="新分组名称"
              className="h-6 min-w-0 flex-1 rounded-md border border-border bg-card px-1.5 text-[11px] outline-none focus:border-accent/60"
            />
            <button
              type="button"
              onClick={submit}
              className="h-6 rounded-md bg-foreground px-1.5 text-[10.5px] text-background"
            >
              建
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={groups.length >= MAX_GROUPS}
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            ＋ 新建分组
          </button>
        )}
        {error && <p className="mt-1 px-1 text-[10px] text-negative-text">{error}</p>}
      </div>
    </div>
  );
}
