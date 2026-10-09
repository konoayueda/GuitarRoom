"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Check, Plus, Search } from "lucide-react";
import { CHORDS, type Chord } from "@/lib/chords";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ScoreChordDiagram from "./score-chord-diagram";
import { ScoreCustomChordForm } from "./score-custom-chord-form";

export type ScoreChordPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (chord: Chord) => boolean | void;
  customChords?: Chord[];
  currentChord?: Chord | null;
  disabled?: boolean;
  targetLabel?: string;
  onCloseAutoFocus?: () => void;
};

const rootPitch: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

function searchChord(text: string) {
  const compact = text
    .replace(/\s+/g, "")
    .replace(/♯/g, "#")
    .replace(/♭/g, "b");
  const match = compact.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!match) return;
  const pitch =
    (rootPitch[match[1].toUpperCase()] +
      (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0) +
      12) %
    12;
  const rawSuffix = match[3];
  const suffix = /^M(?:aj)?(?:\d|$)/.test(rawSuffix)
    ? rawSuffix.replace(/^M(?:aj)?/, "maj").toLowerCase()
    : rawSuffix.toLowerCase();
  return { pitch, suffix: suffix === "maj" ? "" : suffix };
}

function matchesChord(chord: Chord, query: string) {
  if (!query.trim()) return true;
  const wanted = searchChord(query);
  const candidate = searchChord(chord.name);
  if (!wanted || !candidate) {
    const normalize = (text: string) =>
      text
        .replace(/\s+/g, "")
        .replace(/♯/g, "#")
        .replace(/♭/g, "b")
        .toLowerCase();
    return normalize(chord.name).includes(normalize(query));
  }
  if (wanted.pitch !== candidate.pitch) return false;
  const minor = (suffix: string) =>
    suffix.startsWith("m") && !suffix.startsWith("maj");
  if (minor(wanted.suffix) !== minor(candidate.suffix)) return false;
  return candidate.suffix.startsWith(wanted.suffix);
}

function sameChord(first: Chord, second?: Chord | null) {
  return (
    first.name === second?.name &&
    first.frets.every((fret, index) => fret === second.frets[index]) &&
    first.fingers.every((finger, index) => finger === second.fingers[index])
  );
}

function fretText(chord: Chord) {
  return chord.frets.map((fret) => (fret < 0 ? "×" : String(fret))).join(" ");
}

export function ScoreChordPicker({
  open,
  onOpenChange,
  onSelect,
  currentChord,
  customChords = [],
  disabled = false,
  targetLabel,
  onCloseAutoFocus,
}: ScoreChordPickerProps) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const chordKey = (chord: Chord) =>
    JSON.stringify([chord.name, chord.frets, chord.fingers]);
  const seen = new Set(CHORDS.map(chordKey));
  const choices = [...CHORDS];
  for (const chord of customChords) {
    const key = chordKey(chord);
    if (!seen.has(key)) {
      seen.add(key);
      choices.push(chord);
    }
  }
  const results = choices
    .map((chord, index) => ({ chord, index }))
    .filter(({ chord }) => matchesChord(chord, query));

  const selectChord = (chord: Chord) => {
    if (disabled) return;
    if (onSelect(structuredClone(chord)) === false) return;
    setCreating(false);
    onOpenChange(false);
  };
  const focusResult = (index: number) => {
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>(
      "button[data-chord-option]",
    );
    if (!buttons?.length) return;
    const button = buttons[Math.max(0, Math.min(buttons.length - 1, index))];
    button.focus({ preventScroll: true });
    button.scrollIntoView({ block: "nearest" });
  };
  const resultKey = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusResult(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) search.current?.focus();
      else focusResult(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusResult(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusResult(results.length - 1);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setCreating(false);
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-hidden p-4 sm:max-w-xl sm:p-6"
        aria-label={creating ? "新建自定义和弦" : "选择和弦按法"}
        onKeyDown={(event) => event.stopPropagation()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          setQuery("");
          setCreating(false);
          requestAnimationFrame(() => search.current?.focus());
        }}
        onCloseAutoFocus={(event) => {
          if (onCloseAutoFocus) {
            event.preventDefault();
            onCloseAutoFocus();
          }
        }}
      >
        <DialogHeader className="pr-7 text-left">
          <DialogTitle>
            {creating ? "新建自定义和弦" : "选择和弦按法"}
          </DialogTitle>
          <DialogDescription>
            {creating
              ? "填写名称和各弦品位，预览后加入谱面。"
              : "选择常用按法或本谱已有的自定义和弦，也可以从零新建。"}
          </DialogDescription>
          {targetLabel && (
            <p
              className="text-xs text-muted-foreground"
              data-chord-target-label
            >
              {targetLabel}
            </p>
          )}
        </DialogHeader>
        {creating ? (
          <ScoreCustomChordForm
            initialName={query}
            disabled={disabled}
            onSelect={selectChord}
            onCancel={() => {
              setCreating(false);
              requestAnimationFrame(() => search.current?.focus());
            }}
          />
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 justify-center"
              disabled={disabled}
              onClick={() => setCreating(true)}
            >
              <Plus className="size-4" />
              新建自定义和弦
            </Button>
            <div className="relative shrink-0">
              <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <Input
                ref={search}
                type="search"
                aria-label="搜索和弦名称"
                autoComplete="off"
                spellCheck={false}
                placeholder="搜索名称，例如 Bm、F#m、Am7"
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.nativeEvent.isComposing ||
                    event.altKey ||
                    event.ctrlKey ||
                    event.metaKey
                  )
                    return;
                  if (
                    event.key === "ArrowDown" &&
                    results.length &&
                    !disabled
                  ) {
                    event.preventDefault();
                    focusResult(0);
                  } else if (
                    event.key === "ArrowUp" &&
                    results.length &&
                    !disabled
                  ) {
                    event.preventDefault();
                    focusResult(results.length - 1);
                  } else if (
                    event.key === "Enter" &&
                    results.length &&
                    !disabled
                  ) {
                    event.preventDefault();
                    selectChord(results[0].chord);
                  }
                }}
              />
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span role="status" aria-live="polite">
                {results.length} 种按法
              </span>
              <span>品位从 6 弦到 1 弦 · × 不弹 · 0 空弦</span>
            </div>
            <div
              ref={list}
              className="grid min-h-0 flex-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2"
              aria-label="和弦按法列表"
            >
              {results.map(({ chord, index }, resultIndex) => {
                const variants = choices.filter(
                  (item) => item.name === chord.name,
                );
                const variantNumber = variants.indexOf(chord) + 1;
                const selected = sameChord(chord, currentChord);
                return (
                  <button
                    key={index}
                    type="button"
                    data-chord-option={index}
                    data-chord-name={chord.name}
                    data-chord-frets={chord.frets.join(",")}
                    aria-label={`${chord.name}${variants.length > 1 ? `，按法 ${variantNumber}` : ""}，6 弦到 1 弦：${fretText(chord)}`}
                    aria-pressed={selected}
                    disabled={disabled}
                    onClick={() => selectChord(chord)}
                    onKeyDown={(event) => resultKey(event, resultIndex)}
                    className={
                      "flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 " +
                      (selected
                        ? "border-primary/50 bg-accent"
                        : "border-border bg-background")
                    }
                  >
                    <svg
                      viewBox="0 0 84 98"
                      className="h-20 w-16 shrink-0"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <ScoreChordDiagram chord={chord} x={0} y={0} />
                    </svg>
                    <span className="min-w-0 flex-1 space-y-2">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-semibold">
                          {chord.name}
                        </span>
                        {index >= CHORDS.length && (
                          <span className="text-xs text-muted-foreground">
                            自定义
                          </span>
                        )}
                        {variants.length > 1 && (
                          <span className="text-xs text-muted-foreground">
                            按法 {variantNumber} / {variants.length}
                          </span>
                        )}
                        {selected && (
                          <Check
                            className="ml-auto size-4 text-primary"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                      <span
                        className="grid grid-cols-6 gap-1 font-mono text-sm"
                        aria-hidden="true"
                      >
                        {chord.frets.map((fret, string) => (
                          <span
                            key={string}
                            className="rounded bg-muted px-1 py-1 text-center"
                          >
                            {fret < 0 ? "×" : fret}
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                );
              })}
              {!results.length && (
                <div
                  className="col-span-full space-y-2 rounded-lg border border-dashed p-5 text-center"
                  role="status"
                >
                  <p className="text-sm">
                    当前和弦库没有匹配「{query}」的按法。
                  </p>
                  <p className="text-xs text-muted-foreground">
                    可以新建自定义和弦，或清空搜索浏览现有按法。
                  </p>
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                {disabled
                  ? "停止试听或等待保存完成后可选择。"
                  : "↑ ↓ 选择 · Enter 确定 · Esc 关闭"}
              </p>
              <DialogClose asChild>
                <Button type="button" variant="outline" size="sm">
                  取消
                </Button>
              </DialogClose>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
