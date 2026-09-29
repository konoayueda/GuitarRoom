"use client";
import {
  useRef,
  useState,
  useImperativeHandle,
  type Ref,
  type KeyboardEvent,
} from "react";
import {
  appendRecognizedSection,
  type RecognitionDraft,
} from "@/lib/recognition";
import {
  Plus,
  Play,
  Square,
  Repeat2,
  Save,
  Check,
  Music2,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  FileText,
  Download,
  X,
  RotateCcw,
  Scissors,
  ScanLine,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import ScoreNoteTools from "./score-note-tools";
import { rhythmShape } from "@/lib/notation";
import {
  cursorAt,
  cursorTick,
  scoreSpan,
  clearPassage,
  copyPassage,
  pastePassage,
  type ScorePassage,
} from "@/lib/score-editing";
import ChordVoicing from "./chord-voicing-editor";
import { CHORDS } from "@/lib/chords";
import {
  EMPTY_ARRANGEMENT,
  arrangementSchema,
  arrangementProblems,
  barTicks,
  buildPlayback,
  durationOptions,
  GRID_OPTIONS,
  beatLabel,
  writtenNotes,
  noteCapacity,
  tieCandidate,
  repairNoteLinks,
  duplicateBar,
  eventAttacks,
  listBars,
  makeBar,
  makeEvent,
  sampleArrangement,
  tickSeconds,
  type Arrangement,
  type ArrangementBar,
  type ArrangementEvent,
} from "@/lib/arrangement";
import {
  writeNote,
  materializeNotes,
  splitEvent,
  resizeEvent,
  durationCapacity,
} from "@/lib/arrangement-edit";
import type { Score } from "@/lib/models";
import { Choice, downloadBlob } from "./room-controls";
import { useArrangementPlayer } from "./arrangement-player";
import ArrangementPreview, { type ScoreSelection } from "./arrangement-preview";
import { toast } from "sonner";

export type ArrangementEditorHandle = {
  appendRecognition: (draft: RecognitionDraft) => void;
};
export default function ArrangementEditor({
  ref,
  onRecognize,
  onRead,
  stopPlayback,
  score,
  draft,
  onDraft,
  onSave,
  onShowPage,
  currentPageId,
  active,
  onPlay,
}: {
  ref?: Ref<ArrangementEditorHandle>;
  onRecognize: () => void;
  onRead: () => void;
  stopPlayback: boolean;
  score: Score;
  draft?: Arrangement;
  onDraft: (a: Arrangement | undefined, expected?: Arrangement) => void;
  onSave: (a: Arrangement, base?: Arrangement) => Promise<void>;
  onShowPage: (id: string) => void;
  currentPageId: string;
  active: boolean;
  onPlay: () => void;
}) {
  const value = draft ?? score.arrangement ?? EMPTY_ARRANGEMENT;
  const [grid, setGrid] = useState("12");
  const [inputDuration, setInputDuration] = useState(12);
  const [anchor, setAnchor] = useState<ScoreSelection | null>(null);
  const [rangeMode, setRangeMode] = useState(false);
  const [clipboard, setClipboard] = useState<ScorePassage | null>(null);
  const [properties, setProperties] = useState(false);
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const [selected, setSelected] = useState<ScoreSelection>({
    barId: "",
    eventId: "",
  });
  const [saving, setSaving] = useState(false),
    [history, setHistory] = useState<Arrangement[]>([]),
    [future, setFuture] = useState<Arrangement[]>([]);
  const [scope, setScope] = useState("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [loop, setLoop] = useState(false);
  const digits = useRef({ cell: "", time: 0, value: "", changed: false });
  const bars = listBars(value),
    limit = barTicks(value.meter),
    issues = arrangementProblems(value);
  const chosen = bars.find((b) => b.bar.id === selected.barId);
  const event = chosen?.bar.events.find((e) => e.id === selected.eventId);
  const currentTick = cursorTick(value, selected);
  const currentNote =
    event && selected.tick !== undefined
      ? eventAttacks(event, value.pattern).find(
          (n) =>
            n.offsetTick === selected.tick &&
            n.stringIndex === selected.stringIndex,
        )
      : undefined;
  const currentDuration = currentNote?.durationTicks ?? inputDuration;
  const selectionSpan = scoreSpan(value, selected, anchor, currentDuration);
  const allWritten = writtenNotes(value);
  const selectedWritten = allWritten.find(
    (n) =>
      n.eventId === selected.eventId &&
      n.offsetTick === selected.tick &&
      n.stringIndex === selected.stringIndex,
  );
  const tieTarget = selectedWritten
    ? tieCandidate(allWritten, selectedWritten)
    : undefined;
  const range =
    scope === "range" && bars.length
      ? {
          from: bars.some((b) => b.bar.id === from) ? from : bars[0].bar.id,
          to: bars.some((b) => b.bar.id === to)
            ? to
            : bars[bars.length - 1].bar.id,
        }
      : undefined;
  const plan = buildPlayback(value, range),
    player = useArrangementPlayer(
      value,
      score.capo,
      active,
      range,
      loop,
      stopPlayback,
    );
  const locked = saving || player.playing,
    invalid = issues.length > 0 || !arrangementSchema.safeParse(value).success;
  const duration =
    value.bpm > 0 ? Math.round(plan.totalTicks * tickSeconds(value.bpm)) : 0;
  const rangeOptions = bars.map((b) => ({
    value: b.bar.id,
    label: `第 ${b.number} 小节 · ${b.section.label}`,
  }));
  const playingEvent = player.position?.event;
  function change(next: Arrangement, coalesce = false) {
    next = repairNoteLinks(next);
    if (locked || JSON.stringify(next) === JSON.stringify(value)) return;
    digits.current = { cell: "", time: 0, value: "", changed: false };
    player.stop();
    if (!coalesce) setHistory((old) => [...old.slice(-29), value]);
    setFuture([]);
    onDraft(
      JSON.stringify(next) ===
        JSON.stringify(score.arrangement ?? EMPTY_ARRANGEMENT)
        ? undefined
        : next,
    );
  }
  useImperativeHandle(ref, () => ({
    appendRecognition(candidate) {
      if (locked) throw new Error("请等待保存完成或停止试听，再加入识别片段。");
      if (!score.pages.some((p) => p.id === candidate.pageId))
        throw new Error("原谱页面已移除，请重新框选识别。");
      const next = appendRecognizedSection(value, candidate);
      change(next);
      revealBar(next.sections.at(-1)!.bars[0].id);
    },
  }));
  function undo() {
    if (locked || !history.length) return;
    const old = history.at(-1)!;
    const cursor = cursorAt(old, currentTick ?? 0, selected.stringIndex);
    setSelected(cursor ?? { barId: "", eventId: "" });
    setAnchor(null);
    setRangeMode(false);
    restoreFocus(cursor);
    digits.current = { cell: "", time: 0, value: "", changed: false };
    player.stop();
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [...f, value]);
    onDraft(
      JSON.stringify(old) ===
        JSON.stringify(score.arrangement ?? EMPTY_ARRANGEMENT)
        ? undefined
        : old,
    );
  }
  function redo() {
    if (locked || !future.length) return;
    const next = future.at(-1)!;
    const cursor = cursorAt(next, currentTick ?? 0, selected.stringIndex);
    setSelected(cursor ?? { barId: "", eventId: "" });
    setAnchor(null);
    setRangeMode(false);
    restoreFocus(cursor);
    digits.current = { cell: "", time: 0, value: "", changed: false };
    player.stop();
    setHistory((h) => [...h, value]);
    setFuture((f) => f.slice(0, -1));
    onDraft(
      JSON.stringify(next) ===
        JSON.stringify(score.arrangement ?? EMPTY_ARRANGEMENT)
        ? undefined
        : next,
    );
  }
  function editBar(
    id: string,
    edit: (bar: ArrangementBar) => ArrangementBar,
    coalesce = false,
  ) {
    change(
      {
        ...value,
        sections: value.sections.map((s) => ({
          ...s,
          bars: s.bars.map((b) => (b.id === id ? edit(b) : b)),
        })),
      },
      coalesce,
    );
  }
  function editEvent(patch: Partial<ArrangementEvent>) {
    if (chosen && event)
      editBar(chosen.bar.id, (b) => ({
        ...b,
        events: b.events.map((e) =>
          e.id === event.id ? { ...e, ...patch } : e,
        ),
      }));
  }
  function focusCell(selection: ScoreSelection) {
    setSelected(selection);
    requestAnimationFrame(() => {
      const bar = bars.find((b) => b.bar.id === selection.barId)?.bar;
      if (!bar) return;
      let tick = selection.tick ?? 0;
      for (const e of bar.events) {
        if (e.id === selection.eventId) break;
        tick += e.durationTicks;
      }
      const cell = document.querySelector<SVGGElement>(
        '[data-note-cell="' +
          CSS.escape(
            selection.barId + ":" + tick + ":" + selection.stringIndex,
          ) +
          '"]',
      );
      cell?.focus({ preventScroll: true });
      cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }
  function restoreFocus(selection = selected) {
    if (selection.tick !== undefined)
      document
        .querySelector<SVGGElement>(".editable-score .score-note-cell.picked")
        ?.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      const cell = document.querySelector<SVGGElement>(
        ".editable-score .score-note-cell.picked",
      );
      if (selection.tick !== undefined) cell?.focus({ preventScroll: true });
    });
  }
  function select(selection: ScoreSelection, extend = false) {
    if (locked) return;
    digits.current = { cell: "", time: 0, value: "", changed: false };
    if (extend || rangeMode) {
      if (!anchor && selected.tick !== undefined) setAnchor(selected);
    } else setAnchor(null);
    setSelected(selection);
    const ev = bars
      .find((b) => b.bar.id === selection.barId)
      ?.bar.events.find((e) => e.id === selection.eventId);
    const n =
      ev &&
      eventAttacks(ev, value.pattern).find(
        (n) =>
          n.offsetTick === selection.tick &&
          n.stringIndex === selection.stringIndex,
      );
    if (n) setInputDuration(n.durationTicks);
    if (selection.tick === undefined) setProperties(true);
  }
  function moveCursor(direction: number, extend = false) {
    if (locked || currentTick === undefined) return;
    digits.current = { cell: "", time: 0, value: "", changed: false };
    let next: number;
    if (direction > 0) {
      const candidate = currentTick + currentDuration;
      const onset = allWritten.find(
        (n) => n.startTick > currentTick && n.startTick < candidate,
      )?.startTick;
      next = onset ?? candidate;
    } else {
      const previous = allWritten
        .filter((n) => n.startTick < currentTick)
        .at(-1)?.startTick;
      next = Math.max(
        0,
        previous !== undefined && previous >= currentTick - inputDuration
          ? previous
          : currentTick - inputDuration,
      );
    }
    const cursor = cursorAt(value, next, selected.stringIndex);
    if (!cursor) return;
    select(cursor, extend);
    focusCell(cursor);
  }
  function applyDuration(ticks: number) {
    if (locked || !Number.isInteger(ticks) || ticks < 2 || ticks > 96) return;
    const targets =
      anchor && selectionSpan
        ? allWritten.filter(
            (n) =>
              n.startTick >= selectionSpan.start &&
              n.startTick < selectionSpan.end,
          )
        : selectedWritten
          ? [selectedWritten]
          : [];
    if (targets.some((n) => ticks > noteCapacity(allWritten, n))) {
      toast.error(
        "这个时值会覆盖同弦后音或越过小节线，请先留出空拍，跨小节使用延音连接。",
      );
      restoreFocus();
      return;
    }
    setInputDuration(ticks);
    if (targets.length) {
      const keys = new Set(
        targets.map(
          (n) => n.eventId + ":" + n.offsetTick + ":" + n.stringIndex,
        ),
      );
      change({
        ...value,
        sections: value.sections.map((section) => ({
          ...section,
          bars: section.bars.map((bar) => ({
            ...bar,
            events: bar.events.map((e) =>
              targets.some((n) => n.eventId === e.id)
                ? {
                    ...e,
                    notes: materializeNotes(e, value.pattern).map((n) =>
                      keys.has(e.id + ":" + n.offsetTick + ":" + n.stringIndex)
                        ? {
                            ...n,
                            durationTicks: ticks,
                            sustainTicks: undefined,
                            tieToNext: false,
                          }
                        : n,
                    ),
                  }
                : e,
            ),
          })),
        })),
      });
    }
    restoreFocus();
  }
  function toggleTie() {
    if (!selectedWritten || locked) return;
    editEvent({
      notes: materializeNotes(event!, value.pattern).map((n) =>
        n.offsetTick === selected.tick && n.stringIndex === selected.stringIndex
          ? {
              ...n,
              ...(n.tieToNext
                ? { tieToNext: false }
                : tieTarget
                  ? {
                      durationTicks:
                        tieTarget.startTick - selectedWritten.startTick,
                      tieToNext: true,
                    }
                  : {}),
            }
          : n,
      ),
    });
    restoreFocus();
  }
  function rest() {
    if (locked || currentTick === undefined) return;
    const span =
      anchor && selectionSpan
        ? selectionSpan
        : {
            start: currentTick,
            end: Math.min(bars.length * limit, currentTick + currentDuration),
          };
    change(clearPassage(value, span));
    setAnchor(null);
    setRangeMode(false);
    restoreFocus();
  }
  function copy(cut = false) {
    if (locked || !selectionSpan) return;
    setClipboard(copyPassage(value, selectionSpan));
    if (cut) change(clearPassage(value, selectionSpan));
    toast.success(cut ? "已剪切片段" : "已复制片段", {
      description: "包含和弦与休止；粘贴将覆盖光标后的相同时长。",
    });
    restoreFocus();
  }
  function paste() {
    if (locked || currentTick === undefined || !clipboard) return;
    try {
      const next = pastePassage(value, currentTick, clipboard);
      change(next);
      setAnchor(null);
      setRangeMode(false);
      const cursor = cursorAt(next, currentTick, selected.stringIndex);
      if (cursor) {
        setSelected(cursor);
        restoreFocus(cursor);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function editorKey(e: KeyboardEvent<HTMLElement | SVGGElement>): boolean {
    const target = e.target as Element;
    if (
      target.closest(
        'input,textarea,select,[contenteditable="true"],[role="combobox"]',
      )
    )
      return false;
    const cmd = e.ctrlKey || e.metaKey,
      key = e.key.toLowerCase();
    if (cmd && key === "s") {
      e.preventDefault();
      if (draft && !invalid && !locked) void save();
      return true;
    }
    if (cmd && key === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return true;
    }
    if (cmd && key === "y") {
      e.preventDefault();
      redo();
      return true;
    }
    if (!target.closest(".score-note-cell")) return false;
    if (cmd && ["c", "x", "v"].includes(key)) {
      e.preventDefault();
      if (key === "v") paste();
      else copy(key === "x");
      return true;
    }
    if (e.key === " ") {
      e.preventDefault();
      if (player.playing) player.stop();
      else if (!invalid && !saving && bars.length) void play();
      return true;
    }
    return false;
  }
  function putNote(
    selection: ScoreSelection,
    fret: number | null,
    coalesce = false,
    marker?: "cross",
  ) {
    if (
      locked ||
      selection.tick === undefined ||
      selection.stringIndex === undefined
    )
      return false;
    const current = bars
      .find((b) => b.bar.id === selection.barId)
      ?.bar.events.find((e) => e.id === selection.eventId);
    if (
      !current ||
      selection.tick < 0 ||
      selection.tick >= current.durationTicks ||
      selection.stringIndex < 0 ||
      selection.stringIndex > 5 ||
      (fret !== null && (!Number.isInteger(fret) || fret < 0 || fret > 24))
    )
      return false;
    const note = eventAttacks(current, value.pattern).find(
      (n) =>
        n.offsetTick === selection.tick &&
        n.stringIndex === selection.stringIndex,
    );
    if ((note?.fret ?? null) === fret && note?.marker === marker) return false;
    editBar(
      selection.barId,
      (b) => ({
        ...b,
        events: b.events.map((e) =>
          e.id === selection.eventId
            ? writeNote(
                e,
                value.pattern,
                selection.tick!,
                selection.stringIndex!,
                fret,
                inputDuration,
                marker,
              )
            : e,
        ),
      }),
      coalesce,
    );
    return true;
  }
  function putChordNote(selection: ScoreSelection) {
    const event = bars
      .find((b) => b.bar.id === selection.barId)
      ?.bar.events.find((e) => e.id === selection.eventId);
    const fret = event?.chord?.frets[selection.stringIndex ?? -1];
    if (fret === undefined || fret < 0) {
      toast.error("请先为这段选择和弦，并确认这根弦的按法；也可输入数字品位。");
      return;
    }
    putNote(selection, fret, false, "cross");
  }
  function noteKey(e: KeyboardEvent<SVGGElement>, selection: ScoreSelection) {
    if (editorKey(e)) return;
    if (locked || e.ctrlKey || e.metaKey || e.altKey) return;
    if (["+", "=", "-", "_", ".", "/", "r", "R", "l", "L"].includes(e.key)) {
      e.preventDefault();
      const shape = rhythmShape(currentDuration),
        base = shape?.base ?? 12;
      if (e.key.toLowerCase() === "r") rest();
      else if (e.key.toLowerCase() === "l") toggleTie();
      else if (e.key === ".")
        applyDuration(
          base * (shape?.dots === 0 ? 1.5 : shape?.dots === 1 ? 1.75 : 1),
        );
      else if (e.key === "/")
        applyDuration(shape?.triplet ? base : (base * 2) / 3);
      else
        applyDuration(currentDuration * (["+", "="].includes(e.key) ? 0.5 : 2));
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const t =
        Math.floor(currentTick! / limit) * limit +
        (e.key === "End" ? Math.max(0, limit - inputDuration) : 0);
      const cursor = cursorAt(value, t, selection.stringIndex);
      if (cursor) {
        select(cursor, e.shiftKey);
        focusCell(cursor);
      }
      return;
    }
    if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const cell = JSON.stringify(selection),
        now = Date.now();
      const continuing =
        digits.current.cell === cell && now - digits.current.time < 900;
      const combined = continuing ? digits.current.value + e.key : e.key;
      const next = Number(combined) <= 24 ? combined : e.key;
      const merge = continuing && digits.current.changed && next === combined;
      const changed = putNote(selection, Number(next), merge);
      digits.current = {
        cell,
        time: now,
        value: next,
        changed: merge || changed,
      };
    } else if (
      e.key.toLowerCase() === "x" &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault();
      digits.current = { cell: "", time: 0, value: "", changed: false };
      putChordNote(selection);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      digits.current = { cell: "", time: 0, value: "", changed: false };
      if (anchor && selectionSpan) {
        change(clearPassage(value, selectionSpan));
        setAnchor(null);
        setRangeMode(false);
      } else putNote(selection, null);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setAnchor(null);
      setRangeMode(false);
    } else if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      digits.current = { cell: "", time: 0, value: "", changed: false };
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        focusCell({
          ...selection,
          stringIndex: Math.max(
            0,
            Math.min(
              5,
              (selection.stringIndex ?? 5) + (e.key === "ArrowUp" ? 1 : -1),
            ),
          ),
        });
        return;
      }
      moveCursor(e.key === "ArrowRight" ? 1 : -1, e.shiftKey);
    }
  }
  function addSection() {
    if (locked || value.sections.length >= 16 || bars.length >= 128) return;
    const section = {
      id: crypto.randomUUID(),
      label: `段落 ${String.fromCharCode(65 + value.sections.length)}`,
      repeat: 1,
      bars: Array.from({ length: Math.min(4, 128 - bars.length) }, () =>
        makeBar(value.meter, currentPageId),
      ),
    };
    change({ ...value, sections: [...value.sections, section] });
    setSelected({
      barId: section.bars[0].id,
      eventId: section.bars[0].events[0].id,
    });
    revealBar(section.bars[0].id);
  }
  function revealBar(id: string) {
    requestAnimationFrame(() =>
      document
        .querySelector(`.editable-score [data-preview-bar="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  }
  function barAction(
    barId: string,
    action: "copy" | "insert" | "delete" | "left" | "right",
  ) {
    if (locked) return;
    let target: ArrangementBar | undefined;
    const sections = value.sections
      .map((s) => {
        const index = s.bars.findIndex((b) => b.id === barId);
        if (index < 0) return s;
        const next = [...s.bars];
        if (action === "delete") next.splice(index, 1);
        else if (action === "copy" || action === "insert") {
          if (bars.length >= 128 || s.bars.length >= 32) return s;
          target =
            action === "copy"
              ? duplicateBar(next[index], value.pattern)
              : makeBar(value.meter, next[index].pageId ?? currentPageId);
          next.splice(index + 1, 0, target);
        } else {
          const other = index + (action === "left" ? -1 : 1);
          if (other >= 0 && other < next.length)
            [next[index], next[other]] = [next[other], next[index]];
        }
        return { ...s, bars: next };
      })
      .filter((s) => s.bars.length);
    change({ ...value, sections });
    if (target) {
      setSelected({ barId: target.id, eventId: target.events[0].id });
      revealBar(target.id);
    } else if (action === "delete" && selected.barId === barId)
      setSelected({ barId: "", eventId: "" });
  }
  function split() {
    if (locked || !chosen || !event || event.durationTicks < 2) return;
    const next = splitEvent(
      chosen.bar,
      event.id,
      selected.tick || undefined,
      value.pattern,
    );
    editBar(chosen.bar.id, () => next);
    const index = next.events.findIndex((e) => e.id === event.id);
    setSelected({ barId: chosen.bar.id, eventId: next.events[index + 1].id });
  }
  async function save() {
    setSaving(true);
    try {
      await onSave(value, score.arrangement);
      onDraft(undefined, value);
      toast.success("编排已保存", {
        description: "可在「编排阅读」中查看整份谱面并练习。",
        action: { label: "阅读编排", onClick: onRead },
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function play() {
    try {
      onPlay();
      await player.play();
    } catch {
      toast.error("暂时无法启动试听，请检查浏览器的声音设置。");
    }
  }
  function inspector(barId: string) {
    if (!chosen || !event || barId !== selected.barId) return null;
    const noteMode =
      selected.tick !== undefined && selected.stringIndex !== undefined;
    const note = noteMode
      ? eventAttacks(event, value.pattern).find(
          (n) =>
            n.offsetTick === selected.tick &&
            n.stringIndex === selected.stringIndex,
        )
      : undefined;
    const allNotes = writtenNotes(value);
    const written = note
      ? allNotes.find(
          (n) =>
            n.eventId === event.id &&
            n.offsetTick === selected.tick &&
            n.stringIndex === selected.stringIndex,
        )
      : undefined;
    const target = written ? tieCandidate(allNotes, written) : undefined;
    function rhythm(
      patch: Partial<NonNullable<ArrangementEvent["notes"]>[number]>,
    ) {
      if (patch.durationTicks) setInputDuration(patch.durationTicks);
      editEvent({
        notes: materializeNotes(event!, value.pattern).map((n) =>
          n.offsetTick === selected.tick &&
          n.stringIndex === selected.stringIndex
            ? { ...n, ...patch }
            : n,
        ),
      });
    }
    const capacity = durationCapacity(chosen.bar, event.id, limit);
    const issue = issues.find((i) => i.barId === barId);
    return (
      <fieldset
        className="score-inline-editor"
        disabled={locked}
        aria-label={`第 ${chosen.number} 小节就地编辑`}
      >
        <div className="score-inline-heading">
          <strong>
            {noteMode
              ? `${6 - selected.stringIndex!} 弦 · ${beatLabel(chosen.bar.events.slice(0, chosen.bar.events.indexOf(event)).reduce((n, e) => n + e.durationTicks, 0) + selected.tick!)}`
              : `第 ${chosen.number} 小节 · 和弦与节奏`}
          </strong>
          <button
            className="icon-button"
            aria-label="收起就地编辑"
            onClick={() => setSelected({ barId: "", eventId: "" })}
          >
            <X size={15} />
          </button>
        </div>
        {noteMode ? (
          <div className="score-note-input">
            <label>
              品位
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label="当前音符品位"
                placeholder="休止"
                value={note?.marker === "cross" ? "×" : (note?.fret ?? "")}
                onChange={(e) => {
                  const text = e.target.value;
                  if (/^[xX×]$/.test(text)) putChordNote(selected);
                  else if (text === "") putNote(selected, null);
                  else if (/^\d{1,2}$/.test(text) && Number(text) <= 24)
                    putNote(selected, Number(text));
                }}
              />
            </label>
            <button
              className={
                "button " +
                (note?.marker === "cross" ? "primary" : "secondary-button")
              }
              aria-pressed={note?.marker === "cross"}
              onClick={() => putChordNote(selected)}
            >
              × 按和弦拨弦
            </button>
            {note?.marker === "cross" && (
              <span className="chord-tone-resolved">
                {note.fret >= 0
                  ? "当前按法：" + note.fret + " 品"
                  : "请补充和弦按法"}
              </span>
            )}
            <button
              className="button secondary-button"
              onClick={() => putNote(selected, null)}
              disabled={!note}
            >
              <Trash2 size={14} />
              清除音符
            </button>
            <button
              className="button secondary-button"
              onClick={() => setSelected({ barId, eventId: event.id })}
            >
              编辑和弦
            </button>
            {note && written && (
              <>
                <label>
                  音符时值
                  <Choice
                    label="当前音符时值"
                    value={String(note.durationTicks)}
                    options={durationOptions(
                      noteCapacity(allNotes, written),
                      note.durationTicks,
                    )}
                    onChange={(v) =>
                      rhythm({
                        durationTicks: Number(v),
                        sustainTicks: undefined,
                        tieToNext: false,
                      })
                    }
                  />
                </label>
                <button
                  className={
                    "button " +
                    (note.tieToNext ? "primary" : "secondary-button")
                  }
                  aria-pressed={!!note.tieToNext}
                  disabled={!note.tieToNext && !target}
                  onClick={() =>
                    rhythm(
                      note.tieToNext
                        ? { tieToNext: false }
                        : {
                            durationTicks:
                              target!.startTick - written.startTick,
                            tieToNext: true,
                          },
                    )
                  }
                >
                  {note.tieToNext ? "取消延音连接" : "连到下一同音"}
                </button>
                <small>
                  {note.tieToNext
                    ? "连线中的音只拨一次。"
                    : target
                      ? "可连接紧邻的同弦同品音符。"
                      : "下一音需在同弦同品，并位于本小节或下一小节开头。"}
                </small>
              </>
            )}
            <small>
              X / × 随当前和弦拨弦；数字直接指定品位，0
              为空弦。换和弦会保留音符位置与时值。
            </small>
          </div>
        ) : (
          <>
            <div
              className="score-chord-choices"
              role="group"
              aria-label="常用和弦"
            >
              {["C", "Am", "G", "D", "Em", "Fmaj7"].map((name) => (
                <button
                  key={name}
                  aria-label={`换成 ${name} 和弦`}
                  aria-pressed={event.chord?.name === name}
                  onClick={() =>
                    editEvent({
                      chord: structuredClone(
                        CHORDS.find((c) => c.name === name)!,
                      ),
                    })
                  }
                >
                  {name}
                </button>
              ))}
              <button
                aria-label="设为休止"
                onClick={() => editEvent({ chord: null, notes: undefined })}
              >
                休止
              </button>
            </div>
            <div className="score-inline-fields">
              <label>
                按法
                <Choice
                  label="小节和弦"
                  value={
                    event.chord
                      ? String(
                          CHORDS.findIndex(
                            (c) =>
                              c.name === event.chord!.name &&
                              c.frets.join() === event.chord!.frets.join(),
                          ),
                        )
                      : "rest"
                  }
                  onChange={(v) => {
                    if (v !== "-1")
                      editEvent({
                        chord:
                          v === "rest"
                            ? null
                            : structuredClone(CHORDS[Number(v)]),
                        ...(v === "rest" ? { notes: undefined } : {}),
                      });
                  }}
                  options={[
                    { value: "rest", label: "休止" },
                    ...CHORDS.map((c, i) => ({
                      value: String(i),
                      label:
                        c.name +
                        " · " +
                        c.frets.map((f) => (f < 0 ? "×" : f)).join(" "),
                    })),
                    ...(event.chord
                      ? [
                          {
                            value: "-1",
                            label: event.chord.name + " · 自定按法",
                          },
                        ]
                      : []),
                  ]}
                />
              </label>
              <label>
                奏法
                <Choice
                  label="和弦奏法"
                  value={
                    event.stroke ??
                    (value.pattern === "strum" ? "down" : "pluck")
                  }
                  onChange={(v) =>
                    editEvent({ stroke: v as ArrangementEvent["stroke"] })
                  }
                  options={[
                    { value: "pluck", label: "同时拨弦" },
                    { value: "down", label: "向下扫弦（6 → 1）" },
                    { value: "up", label: "向上扫弦（1 → 6）" },
                  ]}
                />
              </label>
              <label>
                时值
                <Choice
                  label="和弦持续时值"
                  value={String(event.durationTicks)}
                  onChange={(v) => {
                    editBar(barId, (b) =>
                      resizeEvent(b, event.id, Number(v), limit),
                    );
                    setSelected({ barId, eventId: event.id });
                  }}
                  options={durationOptions(
                    capacity,
                    event.durationTicks,
                  ).filter(
                    (o) =>
                      Number(o.value) >=
                      Math.max(
                        1,
                        ...(event.notes ?? []).map((n) => n.offsetTick + 1),
                      ),
                  )}
                />
              </label>
            </div>
            {event.chord && (
              <ChordVoicing
                chord={event.chord}
                onChange={(chord) => editEvent({ chord })}
              />
            )}
            <div className="score-inline-actions">
              <button
                className="button secondary-button"
                disabled={
                  event.durationTicks < 2 || chosen.bar.events.length >= 96
                }
                onClick={split}
              >
                <Scissors size={14} />
                拆分时值
              </button>
              <button
                className="button secondary-button"
                onClick={() => editEvent({ chord: null, notes: undefined })}
              >
                <Trash2 size={14} />
                清为空拍
              </button>
            </div>
          </>
        )}
        {event.notes !== undefined && (
          <div className="score-manual-notes">
            <span>已单独编辑音符</span>
            <button onClick={() => editEvent({ notes: undefined })}>
              <RotateCcw size={12} />
              恢复和弦音型
            </button>
          </div>
        )}
        {issue && (
          <div className="timing-issue" role="status">
            <span>{issue.message}</span>
            {issue.gap > 0 && (
              <button
                onClick={() =>
                  editBar(barId, (b) => ({
                    ...b,
                    events: [...b.events, makeEvent(null, issue.gap)],
                  }))
                }
              >
                补齐休止
              </button>
            )}
          </div>
        )}
        {!noteMode && (
          <div className="score-source-link">
            <Choice
              label="关联原谱页面"
              value={chosen.bar.pageId ?? "none"}
              onChange={(v) =>
                editBar(barId, (b) => ({
                  ...b,
                  pageId: v === "none" ? undefined : v,
                }))
              }
              options={[
                { value: "none", label: "不关联原谱" },
                ...score.pages.map((p, i) => ({
                  value: p.id,
                  label: `原谱第 ${i + 1} 页`,
                })),
              ]}
            />
            {chosen.bar.pageId && (
              <button onClick={() => onShowPage(chosen.bar.pageId!)}>
                <FileText size={14} />
                对照上传原谱
              </button>
            )}
          </div>
        )}
      </fieldset>
    );
  }
  return (
    <div
      className="arrangement-editor direct-arrangement gp-arrangement"
      onKeyDown={editorKey}
    >
      <div className="gp-editor-header">
        <div className="score-editor-toolbar">
          <div className="score-editor-title">
            <Music2 size={18} />
            <strong>谱面编排</strong>
            <span className="arrangement-save-state" role="status">
              {saving ? (
                "保存中…"
              ) : draft ? (
                "未保存"
              ) : score.arrangement ? (
                <>
                  <Check size={13} />
                  已保存
                </>
              ) : (
                "新编排"
              )}
            </span>
          </div>
          <div className="score-editor-commands">
            <button className="button secondary-button" onClick={onRead}>
              <FileText size={15} />
              阅读编排
            </button>
            <button
              className="button secondary-button"
              aria-expanded={settings}
              onClick={() => setSettings((v) => !v)}
            >
              谱面设置
            </button>
            <button
              className="button primary"
              disabled={!draft || invalid || locked}
              onClick={save}
            >
              <Save size={14} />
              {saving ? "保存中…" : "保存编排"}
            </button>
          </div>
        </div>
        <fieldset
          disabled={locked}
          hidden={!settings}
          className="score-global-settings"
        >
          <label>
            速度
            <span>
              ♩ ={" "}
              <input
                type="number"
                aria-label="编排速度"
                min={30}
                max={240}
                value={value.bpm}
                onChange={(e) =>
                  change({ ...value, bpm: Number(e.target.value) })
                }
              />
            </span>
          </label>
          <label>
            拍号
            <Choice
              label="编排拍号"
              value={value.meter}
              onChange={(v) =>
                change({ ...value, meter: v as Arrangement["meter"] })
              }
              options={["4/4", "3/4", "6/8"].map((v) => ({
                value: v,
                label: v,
              }))}
            />
          </label>
          <label>
            默认奏法
            <Choice
              label="试听音型"
              value={value.pattern}
              onChange={(v) =>
                change({ ...value, pattern: v as Arrangement["pattern"] })
              }
              options={[
                { value: "strum", label: "和弦扫奏" },
                { value: "arpeggio", label: "八分分解" },
              ]}
            />
          </label>
          <label>
            显示网格
            <Choice
              label="音符输入网格"
              value={grid}
              options={GRID_OPTIONS}
              onChange={(v) => {
                setGrid(v);
              }}
            />
          </label>
          <span className="score-capo">Capo {score.capo} · 标准调弦</span>
          <button className="button secondary-button" onClick={onRecognize}>
            <ScanLine size={15} />
            从原谱识别
          </button>
        </fieldset>
        <ScoreNoteTools
          duration={currentDuration}
          onDuration={applyDuration}
          locked={locked}
          onRest={rest}
          onTie={toggleTie}
          tied={!!currentNote?.tieToNext}
          canTie={!!currentNote?.tieToNext || !!tieTarget}
          onCopy={() => copy()}
          onCut={() => copy(true)}
          onPaste={paste}
          canCopy={currentTick !== undefined}
          canPaste={!!clipboard && currentTick !== undefined}
          onAnchor={() => {
            if (anchor) {
              setAnchor(null);
              setRangeMode(false);
            } else {
              setAnchor(selected);
              setRangeMode(true);
            }
            restoreFocus();
          }}
          selecting={!!anchor}
          onUndo={undo}
          onRedo={redo}
          canUndo={!!history.length}
          canRedo={!!future.length}
          onMove={(direction) => moveCursor(direction, rangeMode)}
          onProperties={() => setProperties((v) => !v)}
          properties={properties}
          location={
            chosen
              ? "第 " +
                chosen.number +
                " 小节" +
                (currentTick !== undefined
                  ? " · " +
                    beatLabel(currentTick % limit) +
                    " · " +
                    (6 - selected.stringIndex!) +
                    " 弦"
                  : " · 和弦") +
                (anchor && selectionSpan
                  ? " · 已选 " +
                    ((selectionSpan.end - selectionSpan.start) / 24)
                      .toFixed(2)
                      .replace(/\.?0+$/, "") +
                    " 拍"
                  : "")
              : "点击谱面定位，选择时值后输入品位"
          }
          onHelp={() => setHelp((v) => !v)}
          help={help}
        />
        {currentTick !== undefined && (
          <div className="gp-fret-entry">
            <select
              aria-label="输入弦位"
              value={selected.stringIndex}
              disabled={locked}
              onChange={(e) => {
                const cursor = {
                  ...selected,
                  stringIndex: Number(e.target.value),
                };
                select(cursor);
                focusCell(cursor);
              }}
            >
              {[5, 4, 3, 2, 1, 0].map((n) => (
                <option key={n} value={n}>
                  {6 - n} 弦
                </option>
              ))}
            </select>
            <label>
              品位
              <input
                aria-label="谱面品位输入"
                inputMode="numeric"
                value={
                  currentNote?.marker === "cross"
                    ? "×"
                    : (currentNote?.fret ?? "")
                }
                placeholder="空位"
                disabled={locked}
                onChange={(e) => {
                  const text = e.target.value;
                  if (/^[xX×]$/.test(text)) putChordNote(selected);
                  else if (text === "") putNote(selected, null);
                  else if (/^\d{1,2}$/.test(text) && Number(text) <= 24)
                    putNote(selected, Number(text));
                }}
              />
            </label>
            <button
              disabled={locked}
              onClick={() => {
                putChordNote(selected);
                restoreFocus();
              }}
            >
              × 按和弦
            </button>
            <button
              disabled={locked || !currentNote}
              onClick={() => {
                putNote(selected, null);
                restoreFocus();
              }}
            >
              清除单音
            </button>
            <span>上下换弦写和音，左右移动到下一拍</span>
          </div>
        )}
      </div>
      {!bars.length ? (
        <div className="arrangement-empty">
          <Music2 size={28} />
          <h3>在谱上写下第一段</h3>
          <p>点选弦上的位置输入品位，或在小节上方加入和弦。</p>
          <button
            className="button primary"
            disabled={locked}
            onClick={addSection}
          >
            <Plus size={16} />
            建立第一段
          </button>
          {score.demoId !== undefined && (
            <button
              className="button secondary-button"
              disabled={locked}
              onClick={() =>
                change(sampleArrangement(score.demoId!, currentPageId))
              }
            >
              载入示范和弦编排
            </button>
          )}
          <small>图片与 PDF 可在「原谱阅读」中对照。</small>
        </div>
      ) : (
        <div
          className={
            "gp-score-workspace " + (properties ? "properties-open" : "")
          }
        >
          <div className="gp-score-paper">
            <ArrangementPreview
              arrangement={value}
              title={score.title}
              capo={score.capo}
              position={player.position}
              editing={{
                gridStep: Number(grid),
                selected,
                locked,
                onSelect: select,
                onKey: noteKey,
                inspector: () => null,
                range: anchor ? selectionSpan : undefined,
                sectionHeading: (id, si) => {
                  const section = value.sections[si];
                  return (
                    <fieldset
                      disabled={locked}
                      className="score-section-heading"
                    >
                      <span className="section-letter">
                        {String.fromCharCode(65 + si)}
                      </span>
                      <input
                        aria-label={`段落 ${si + 1} 名称`}
                        maxLength={30}
                        value={section.label}
                        onChange={(e) =>
                          change({
                            ...value,
                            sections: value.sections.map((s) =>
                              s.id === id ? { ...s, label: e.target.value } : s,
                            ),
                          })
                        }
                      />
                      <Choice
                        label={`段落 ${si + 1} 播放遍数`}
                        value={String(section.repeat)}
                        onChange={(v) =>
                          change({
                            ...value,
                            sections: value.sections.map((s) =>
                              s.id === id ? { ...s, repeat: Number(v) } : s,
                            ),
                          })
                        }
                        options={Array.from({ length: 8 }, (_, i) => ({
                          value: String(i + 1),
                          label: `播放 ${i + 1} 遍`,
                        }))}
                      />
                      <div className="score-section-actions">
                        <button
                          className="icon-button"
                          disabled={si === 0}
                          aria-label={`上移段落 ${si + 1}`}
                          onClick={() => {
                            const next = [...value.sections];
                            [next[si - 1], next[si]] = [next[si], next[si - 1]];
                            change({ ...value, sections: next });
                          }}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          className="icon-button"
                          disabled={si === value.sections.length - 1}
                          aria-label={`下移段落 ${si + 1}`}
                          onClick={() => {
                            const next = [...value.sections];
                            [next[si], next[si + 1]] = [next[si + 1], next[si]];
                            change({ ...value, sections: next });
                          }}
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`删除段落 ${si + 1}`}
                          onClick={() =>
                            change({
                              ...value,
                              sections: value.sections.filter(
                                (s) => s.id !== id,
                              ),
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </fieldset>
                  );
                },
                sectionEnd: (id) => {
                  const section = value.sections.find((s) => s.id === id)!;
                  return (
                    <button
                      className="score-add-bar"
                      disabled={
                        locked ||
                        section.bars.length >= 32 ||
                        bars.length >= 128
                      }
                      onClick={() =>
                        barAction(section.bars.at(-1)!.id, "insert")
                      }
                    >
                      <Plus size={18} />
                      <span>添加小节</span>
                    </button>
                  );
                },
                barTools: (barId) => {
                  const item = bars.find((b) => b.bar.id === barId)!;
                  const index = item.section.bars.findIndex(
                    (b) => b.id === barId,
                  );
                  return (
                    <div className="score-bar-actions">
                      <button
                        title="前移小节"
                        aria-label={`前移第 ${item.number} 小节`}
                        disabled={locked || index === 0}
                        onClick={() => barAction(barId, "left")}
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        title="后移小节"
                        aria-label={`后移第 ${item.number} 小节`}
                        disabled={
                          locked || index === item.section.bars.length - 1
                        }
                        onClick={() => barAction(barId, "right")}
                      >
                        <ChevronRight size={14} />
                      </button>
                      <button
                        title="在后面插入小节"
                        aria-label={`在第 ${item.number} 小节后插入`}
                        disabled={
                          locked ||
                          bars.length >= 128 ||
                          item.section.bars.length >= 32
                        }
                        onClick={() => barAction(barId, "insert")}
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        title="复制小节"
                        aria-label={`复制第 ${item.number} 小节`}
                        disabled={
                          locked ||
                          bars.length >= 128 ||
                          item.section.bars.length >= 32
                        }
                        onClick={() => barAction(barId, "copy")}
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        title="删除小节"
                        aria-label={`删除第 ${item.number} 小节`}
                        disabled={locked}
                        onClick={() => barAction(barId, "delete")}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                },
              }}
            />
            <button
              className="button secondary-button score-add-section"
              disabled={
                locked || value.sections.length >= 16 || bars.length >= 128
              }
              onClick={addSection}
            >
              <Plus size={15} />
              添加段落
            </button>
          </div>
          <aside className="gp-properties" aria-label="谱面属性">
            <header>
              <strong>谱面属性</strong>
              <button
                className="icon-button"
                aria-label="关闭谱面属性"
                onClick={() => setProperties(false)}
              >
                <X size={15} />
              </button>
            </header>
            {chosen && event ? (
              inspector(chosen.bar.id)
            ) : (
              <p>点击音符或小节上方的和弦，在这里查看按法与演奏细节。</p>
            )}
          </aside>
        </div>
      )}
      <div className="arrangement-savebar">
        <button
          className="button secondary-button"
          disabled={!bars.length}
          onClick={() =>
            downloadBlob(
              new Blob(
                [
                  JSON.stringify(
                    {
                      format: "xianjian-arrangement",
                      scoreTitle: score.title,
                      capo: score.capo,
                      arrangement: value,
                    },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              ),
              score.title + "-编排.json",
            )
          }
        >
          <Download size={14} />
          导出编排
        </button>
        <span>
          {invalid
            ? issues[0]?.message || "请检查段落名称、速度或时值"
            : draft
              ? "改动暂留在当前琴房中，请及时保存。"
              : "编排保存在这份曲谱中。"}
        </span>
      </div>
      <div className="arrangement-transport">
        <div className="transport-main">
          <button
            className={
              "button " + (player.playing ? "secondary-button" : "primary")
            }
            disabled={!bars.length || invalid || !plan.totalTicks || saving}
            onClick={player.playing ? player.stop : play}
          >
            {player.playing ? (
              <>
                <Square size={15} fill="currentColor" />
                停止试听
              </>
            ) : (
              <>
                <Play size={15} fill="currentColor" />
                开始试听
              </>
            )}
          </button>
          <div className="transport-position" aria-live="polite">
            {playingEvent ? (
              <>
                <strong>
                  第 {playingEvent.bar.number} 小节 ·{" "}
                  {eventAttacks(playingEvent.event, value.pattern).length
                    ? (playingEvent.event.chord?.name ?? "单音")
                    : "休止"}
                </strong>
                <span>
                  {playingEvent.bar.sectionLabel} · 第{" "}
                  {playingEvent.bar.sectionPass}/
                  {playingEvent.bar.sectionRepeat} 遍
                  {loop ? ` · 循环 ${player.position!.loopPass}` : ""}
                </span>
              </>
            ) : (
              <>
                <strong>{scope === "all" ? "整曲试听" : "选段练习"}</strong>
                <span>
                  {plan.bars.length} 小节（含反复） ·{" "}
                  {Math.floor(duration / 60)}:
                  {String(duration % 60).padStart(2, "0")}
                </span>
              </>
            )}
          </div>
          <button
            className={"icon-button loop-button " + (loop ? "active" : "")}
            aria-label="循环播放"
            aria-pressed={loop}
            title="循环播放"
            onClick={() => setLoop((v) => !v)}
          >
            <Repeat2 size={19} />
          </button>
        </div>
        <div className="transport-range">
          <Choice
            label="试听范围"
            value={scope}
            onChange={setScope}
            options={[
              { value: "all", label: "整曲" },
              { value: "range", label: "选择小节" },
            ]}
          />
          {scope === "range" && bars.length > 0 && (
            <>
              <Choice
                label="起始小节"
                value={range!.from}
                onChange={setFrom}
                options={rangeOptions}
              />
              <span>至</span>
              <Choice
                label="结束小节"
                value={range!.to}
                onChange={setTo}
                options={rangeOptions}
              />
            </>
          )}
          {scope === "range" && plan.totalTicks === 0 && (
            <small role="alert">结束小节应在起始小节之后。</small>
          )}
          <small>
            {scope === "range"
              ? "保留所选段落的播放遍数。"
              : "按当前谱面试听 · 合成拨弦音色"}
          </small>
        </div>
      </div>
    </div>
  );
}
