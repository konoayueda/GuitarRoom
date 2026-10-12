"use client";
import {
  useRef,
  useState,
  useImperativeHandle,
  type Ref,
  type KeyboardEvent,
  type MouseEvent,
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
import { ScoreStrokeTools } from "./score-stroke-tools";
import { initialArrangementForScore } from "@/lib/score-key";
import { ScoreContextMenu, type ScoreMenuEntry } from "./score-context-menu";
import VocalTools from "./vocal-tools";
import VocalRhythmTools from "./vocal-rhythm-tools";
import {
  lyricLineCount,
  addLyricLine,
  removeLyricLine,
  setLyricPosition,
  setLyricText,
  setLyricAnchor,
  setLyricLayout,
  setLyricExtend,
  alignLyricPhrase,
  lyricSyllables,
  lyricVocalNote,
  writtenVocalNotes,
  setVocalNote,
  deleteVocalNote,
  moveVocalNote,
  toggleVocalTie,
  vocalNoteDuration,
  vocalInputAvailability,
  type VocalInputAvailability,
} from "@/lib/vocal-score";
import { rhythmShape } from "@/lib/notation";
import { resolveLyricFontSize } from "@/lib/lyric-style";
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
import { ScoreChordPicker } from "./score-chord-picker";
import { setScoreChord } from "@/lib/score-chord-edit";
import { CHORDS, type Chord } from "@/lib/chords";
import {
  arrangementSchema,
  arrangementProblems,
  barTicks,
  buildPlayback,
  durationOptions,
  GRID_OPTIONS,
  beatLabel,
  durationLabel,
  writtenNotes,
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
  type ArrangementVocalNote,
} from "@/lib/arrangement";
import {
  splitEvent,
  resizeEvent,
  durationCapacity,
} from "@/lib/arrangement-edit";
import {
  putScoreNote,
  removeScoreNote,
  setNoteDuration,
  scoreNoteDuration,
  scoreTieAvailability,
  toggleScoreTie,
} from "@/lib/continuous-note-edit";
import type { Score } from "@/lib/models";
import { Choice, downloadBlob } from "./room-controls";
import { useArrangementPlayer } from "./arrangement-player";
import ArrangementPreview, {
  type ScoreSelection,
  type ScoreContextTarget,
} from "./arrangement-preview";
import { toast } from "sonner";

export type ArrangementEditorHandle = {
  appendRecognition: (draft: RecognitionDraft) => void;
};
type EditorHistoryFrame = {
  arrangement: Arrangement;
  lane: "guitar" | "vocal" | "lyrics";
  selected: ScoreSelection;
  lyricCursor: { barId: string; tick: number; verse: number };
  vocalCursor: { barId: string; tick: number };
};
type EditorHistoryEntry = EditorHistoryFrame | Arrangement;
function normalizeEditorHistoryFrame(
  entry: EditorHistoryEntry,
  fallback: EditorHistoryFrame,
): EditorHistoryFrame {
  if ("arrangement" in entry) return entry;
  const arrangement = entry;
  const bars = listBars(arrangement);
  const size = barTicks(arrangement.meter);
  const validPoint = (point: { barId: string; tick: number }) => ({
    barId: bars.some((item) => item.bar.id === point.barId)
      ? point.barId
      : (bars[0]?.bar.id ?? ""),
    tick: Math.max(0, Math.min(size - 1, point.tick)),
  });
  const lyricCursor = {
    ...validPoint(fallback.lyricCursor),
    verse: Math.min(
      lyricLineCount(arrangement) - 1,
      fallback.lyricCursor.verse,
    ),
  };
  const sourceLyric = listBars(fallback.arrangement)
    .find((item) => item.bar.id === fallback.lyricCursor.barId)
    ?.bar.lyrics?.find(
      (lyric) =>
        lyric.tick === fallback.lyricCursor.tick &&
        lyric.verse === fallback.lyricCursor.verse,
    );
  const sourceVocalId = sourceLyric
    ? lyricVocalNote(
        fallback.arrangement,
        fallback.lyricCursor.barId,
        sourceLyric,
      )?.id
    : undefined;
  if (sourceVocalId) {
    const matches = bars.flatMap(({ bar }) =>
      (bar.lyrics ?? [])
        .filter(
          (lyric) =>
            lyric.verse === lyricCursor.verse &&
            lyricVocalNote(arrangement, bar.id, lyric)?.id === sourceVocalId,
        )
        .map((lyric) => ({ barId: bar.id, tick: lyric.tick })),
    );
    if (matches.length === 1) Object.assign(lyricCursor, matches[0]);
  }
  return {
    ...fallback,
    arrangement,
    selected: cursorAt(
      arrangement,
      cursorTick(fallback.arrangement, fallback.selected) ?? 0,
      fallback.selected.stringIndex,
    ) ?? { barId: "", eventId: "" },
    lyricCursor,
    vocalCursor: validPoint(fallback.vocalCursor),
  };
}
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
  const initialArrangement =
    score.arrangement ?? initialArrangementForScore(score.key);
  const value = draft ?? initialArrangement;
  const [contextTarget, setContextTarget] = useState<ScoreContextTarget | null>(
    null,
  );
  const [lane, setLane] = useState<"guitar" | "vocal" | "lyrics">("guitar");
  const [vocalCursor, setVocalCursor] = useState({ barId: "", tick: 0 });
  const [lyricCursor, setLyricCursor] = useState({
    barId: "",
    tick: 0,
    verse: 0,
  });
  const [lyricMode, setLyricMode] = useState<"time" | "layout">("layout");
  const [lyricEntryMode, setLyricEntryMode] = useState<"auto" | "free">("auto");
  const [vocalDuration, setVocalDuration] = useState(12);
  const [playbackPart, setPlaybackPart] = useState<"both" | "guitar" | "vocal">(
    "both",
  );
  const [grid, setGrid] = useState("12");
  const [inputDuration, setInputDuration] = useState(12);
  const [anchor, setAnchor] = useState<ScoreSelection | null>(null);
  const [rangeMode, setRangeMode] = useState(false);
  const [clipboard, setClipboard] = useState<ScorePassage | null>(null);
  const [properties, setProperties] = useState(false);
  const [chordPickerTarget, setChordPickerTarget] =
    useState<ScoreSelection | null>(null);
  const chordPickerTargetRef = useRef<ScoreSelection | null>(null);
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const [selected, setSelected] = useState<ScoreSelection>({
    barId: "",
    eventId: "",
  });
  const [saving, setSaving] = useState(false),
    [history, setHistory] = useState<EditorHistoryEntry[]>([]),
    [future, setFuture] = useState<EditorHistoryEntry[]>([]);
  const [scope, setScope] = useState("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [loop, setLoop] = useState(false);
  const lyricSession = useRef({ key: "", changed: false });
  const digits = useRef({ cell: "", time: 0, value: "", changed: false });
  const bars = listBars(value),
    limit = barTicks(value.meter),
    issues = arrangementProblems(value);
  const lines = lyricLineCount(value);
  const lyricSelection = {
    ...lyricCursor,
    verse: Math.min(lines - 1, lyricCursor.verse),
  };
  const selectedLyric = bars
    .find((b) => b.bar.id === lyricSelection.barId)
    ?.bar.lyrics?.find(
      (l) => l.tick === lyricSelection.tick && l.verse === lyricSelection.verse,
    );
  const linkedVocal = selectedLyric
    ? lyricVocalNote(value, lyricSelection.barId, selectedLyric)
    : undefined;
  const phraseLength = selectedLyric
    ? lyricSyllables(selectedLyric.text).length
    : 0;
  const lyricEndOptions = linkedVocal
    ? writtenVocalNotes(value)
        .filter((n) => n.degree > 0 && n.startTick > linkedVocal.startTick)
        .map((n) => ({
          value: "note:" + n.id,
          label:
            "第 " +
            (Math.floor(n.startTick / limit) + 1) +
            " 小节 · 第 " +
            Number(
              (1 + n.tick / (value.meter === "6/8" ? 12 : 24)).toFixed(3),
            ) +
            " 拍 · " +
            n.degree,
        }))
    : [];
  const selectedVocal = bars
    .find((b) => b.bar.id === vocalCursor.barId)
    ?.bar.vocalNotes?.find((n) => n.tick === vocalCursor.tick);
  const voiceDuration = selectedVocal?.durationTicks ?? vocalDuration;
  const voiceAvailability =
    bars.some((b) => b.bar.id === vocalCursor.barId) &&
    Number.isInteger(vocalCursor.tick) &&
    vocalCursor.tick >= 0 &&
    vocalCursor.tick < limit
      ? vocalInputAvailability(
          value,
          vocalCursor.barId,
          vocalCursor.tick,
          voiceDuration,
          { scope: "segment" },
        )
      : undefined;
  function voiceInputReason(
    available: VocalInputAvailability,
    duration = voiceDuration,
  ) {
    if (available.coveredBy) {
      const note = available.coveredBy;
      return `此位置仍在第 ${note.barNumber} 小节 · ${beatLabel(note.tick, value.meter)}的唱音 ${note.degree} 持续区间内。先缩短该音，或选择空白时段。`;
    }
    if (!available.fits)
      return available.boundary === "note"
        ? `到下个唱音只剩 ${durationLabel(available.availableTicks)}，当前${durationLabel(duration)}会覆盖它。请选择较短时值。`
        : `距曲谱结尾只剩 ${durationLabel(available.availableTicks)}，当前${durationLabel(duration)}超出曲谱。请缩短时值或添加小节。`;
    return "当前时值可写入；浅色区间表示已有唱音持续的时间。";
  }
  const activeLaneCursor = lane === "vocal" ? vocalCursor : lyricSelection;
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
  const currentDuration = scoreNoteDuration(value, selected) ?? inputDuration;
  const selectionSpan = scoreSpan(value, selected, anchor, currentDuration);
  const allWritten = writtenNotes(value);
  const selectedWritten = allWritten.find(
    (n) =>
      n.eventId === selected.eventId &&
      n.offsetTick === selected.tick &&
      n.stringIndex === selected.stringIndex,
  );
  const tieAction = scoreTieAvailability(value, selected);
  const previousWritten = selectedWritten
    ? allWritten
        .filter(
          (n) =>
            n.stringIndex === selectedWritten.stringIndex &&
            n.startTick < selectedWritten.startTick,
        )
        .at(-1)
    : undefined;
  const previousTied =
    !!previousWritten?.tieToNext &&
    tieCandidate(allWritten, previousWritten) === selectedWritten;
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
      playbackPart,
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
  function historyFrame(): EditorHistoryFrame {
    return {
      arrangement: value,
      lane,
      selected: { ...selected },
      lyricCursor: { ...lyricCursor },
      vocalCursor: { ...vocalCursor },
    };
  }
  function restoreHistoryCursor(frame: EditorHistoryFrame) {
    setLane(frame.lane);
    setSelected(frame.selected);
    setLyricCursor(frame.lyricCursor);
    setVocalCursor(frame.vocalCursor);
    setAnchor(null);
    setRangeMode(false);
    requestAnimationFrame(() => {
      let selector: string | undefined;
      if (frame.lane === "lyrics")
        selector =
          '[data-lyric-cell="' +
          CSS.escape(
            frame.lyricCursor.barId +
              ":" +
              frame.lyricCursor.tick +
              ":" +
              frame.lyricCursor.verse,
          ) +
          '"]';
      else if (frame.lane === "vocal")
        selector =
          '[data-vocal-cell="' +
          CSS.escape(frame.vocalCursor.barId + ":" + frame.vocalCursor.tick) +
          '"]';
      else if (
        frame.selected.tick !== undefined &&
        frame.selected.stringIndex !== undefined
      ) {
        const bar = listBars(frame.arrangement).find(
          (item) => item.bar.id === frame.selected.barId,
        )?.bar;
        if (!bar) return;
        let tick = frame.selected.tick;
        for (const event of bar.events) {
          if (event.id === frame.selected.eventId) break;
          tick += event.durationTicks;
        }
        selector =
          '[data-note-cell="' +
          CSS.escape(
            frame.selected.barId +
              ":" +
              tick +
              ":" +
              frame.selected.stringIndex,
          ) +
          '"]';
      }
      const target = selector
        ? document.querySelector<HTMLElement | SVGGElement>(
            ".editable-score " + selector,
          )
        : undefined;
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }
  function change(next: Arrangement, coalesce = false, preserveVoices = false) {
    if (!preserveVoices) next = repairNoteLinks(next);
    lyricSession.current = { key: "", changed: false };
    if (locked || JSON.stringify(next) === JSON.stringify(value)) return;
    digits.current = { cell: "", time: 0, value: "", changed: false };
    player.stop();
    if (!coalesce) setHistory((old) => [...old.slice(-29), historyFrame()]);
    setFuture([]);
    onDraft(
      JSON.stringify(next) === JSON.stringify(initialArrangement)
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
    lyricSession.current = { key: "", changed: false };
    if (locked || !history.length) return;
    const frame = normalizeEditorHistoryFrame(history.at(-1)!, historyFrame());
    const old = frame.arrangement;
    restoreHistoryCursor(frame);
    digits.current = { cell: "", time: 0, value: "", changed: false };
    player.stop();
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [...f, historyFrame()]);
    onDraft(
      JSON.stringify(old) === JSON.stringify(initialArrangement)
        ? undefined
        : old,
    );
  }
  function redo() {
    lyricSession.current = { key: "", changed: false };
    if (locked || !future.length) return;
    const frame = normalizeEditorHistoryFrame(future.at(-1)!, historyFrame());
    const next = frame.arrangement;
    restoreHistoryCursor(frame);
    digits.current = { cell: "", time: 0, value: "", changed: false };
    player.stop();
    setHistory((h) => [...h, historyFrame()]);
    setFuture((f) => f.slice(0, -1));
    onDraft(
      JSON.stringify(next) === JSON.stringify(initialArrangement)
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
  function editLyric(barId: string, tick: number, verse: number, text: string) {
    if (locked) return;
    const previous =
      bars
        .find((b) => b.bar.id === barId)
        ?.bar.lyrics?.find((l) => l.tick === tick && l.verse === verse)?.text ??
      "";
    const nextText = text.slice(0, 120);
    if (previous === nextText) return;
    const key = barId + ":" + tick + ":" + verse;
    const coalesce =
      lyricSession.current.key === key && lyricSession.current.changed;
    change(
      setLyricText(value, barId, tick, verse, nextText, lyricEntryMode),
      coalesce,
      true,
    );
    lyricSession.current = { key, changed: true };
  }
  function chooseLane(next: "guitar" | "vocal" | "lyrics") {
    if (next === "lyrics" && lane !== "lyrics") setLyricMode("layout");
    setLane(next);
    if (bars.length) {
      if (!bars.some((b) => b.bar.id === vocalCursor.barId))
        setVocalCursor({ barId: bars[0].bar.id, tick: 0 });
      if (!bars.some((b) => b.bar.id === lyricCursor.barId))
        setLyricCursor({ barId: bars[0].bar.id, tick: 0, verse: 0 });
    }
  }
  function selectVocal(barId: string, tick: number) {
    if (locked) return;
    setLane("vocal");
    setVocalCursor({ barId, tick });
    setAnchor(null);
    setRangeMode(false);
    const duration = bars
      .find((item) => item.bar.id === barId)
      ?.bar.vocalNotes?.find((note) => note.tick === tick)?.durationTicks;
    if (duration) setVocalDuration(Math.min(96, duration));
  }
  function selectLyric(barId: string, tick: number, verse: number) {
    if (locked) return;
    if (lane !== "lyrics") setLyricMode("layout");
    setLane("lyrics");
    setLyricCursor({ barId, tick, verse });
    const lyric = bars
      .find((b) => b.bar.id === barId)
      ?.bar.lyrics?.find((l) => l.tick === tick && l.verse === verse);
    if (lyric) setLyricEntryMode(lyric.anchorMode ?? "auto");
    setAnchor(null);
    setRangeMode(false);
  }
  function lyricAnchorChange(mode: "auto" | "free") {
    if (locked) return;
    try {
      if (selectedLyric)
        change(
          setLyricAnchor(
            value,
            lyricSelection.barId,
            lyricSelection.tick,
            lyricSelection.verse,
            mode,
          ),
          false,
          true,
        );
      setLyricEntryMode(mode);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  function layoutLyric(
    barId: string,
    verse: number,
    tick: number,
    offsetX: number,
    offsetY: number,
  ) {
    if (locked) return;
    try {
      change(
        setLyricLayout(value, barId, tick, verse, offsetX, offsetY),
        false,
        true,
      );
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  function extendLyric(id?: string) {
    if (locked || !selectedLyric) return;
    try {
      change(
        setLyricExtend(
          value,
          lyricSelection.barId,
          lyricSelection.tick,
          lyricSelection.verse,
          id,
        ),
        false,
        true,
      );
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  function alignSelectedLyrics() {
    if (locked || phraseLength < 2) return;
    try {
      const result = alignLyricPhrase(
        value,
        lyricSelection.barId,
        lyricSelection.tick,
        lyricSelection.verse,
      );
      change(result.arrangement, false, true);
      setLyricCursor(result.cursor);
      setLyricEntryMode("auto");
      setLyricMode("layout");
      lyricSession.current = { key: "", changed: false };
      toast.success(
        `已将 ${result.count} 个字逐字对齐到唱音，可撤销这次分配。`,
      );
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  function focusVocal(cursor = vocalCursor) {
    requestAnimationFrame(() => {
      const cell = document.querySelector<SVGGElement>(
        '[data-vocal-cell="' +
          CSS.escape(cursor.barId + ":" + cursor.tick) +
          '"]',
      );
      cell?.focus({ preventScroll: true });
      cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }
  function writeVocal(patch: Partial<ArrangementVocalNote>) {
    if (locked || !vocalCursor.barId) return;
    try {
      const scope =
        selectedVocal && patch.durationTicks === undefined && patch.degree !== 0
          ? "chain"
          : "segment";
      const duration =
        patch.durationTicks ??
        (scope === "chain"
          ? (vocalNoteDuration(value, vocalCursor.barId, vocalCursor.tick) ??
            voiceDuration)
          : voiceDuration);
      const available = vocalInputAvailability(
        value,
        vocalCursor.barId,
        vocalCursor.tick,
        duration,
        { scope },
      );
      if (!available.fits) throw Error(voiceInputReason(available, duration));
      change(
        setVocalNote(
          value,
          vocalCursor.barId,
          vocalCursor.tick,
          {
            degree: selectedVocal?.degree ?? 1,
            octave: selectedVocal?.octave ?? 0,
            accidental: selectedVocal?.accidental ?? 0,
            ...patch,
            durationTicks: duration,
          },
          { scope },
        ),
      );
    } catch (error) {
      toast.error((error as Error).message);
    }
    focusVocal();
  }
  function voiceDurationChange(ticks: number) {
    if (locked || !Number.isInteger(ticks) || ticks < 1 || ticks > 96) return;
    setVocalDuration(ticks);
    const subdivision = String(
      Math.min(Number(grid), rhythmShape(ticks)?.base ?? ticks, 12),
    );
    const gridValue = rhythmShape(ticks)?.triplet
      ? String(Math.min(ticks, 16))
      : subdivision;
    if (GRID_OPTIONS.some((option) => option.value === gridValue))
      setGrid(gridValue);
    if (selectedVocal) writeVocal({ durationTicks: ticks });
    else focusVocal();
  }
  function voiceTie() {
    if (locked) return;
    try {
      change(toggleVocalTie(value, vocalCursor.barId, vocalCursor.tick));
    } catch (error) {
      toast.error((error as Error).message);
    }
    focusVocal();
  }
  function moveLyric(
    barId: string,
    verse: number,
    tick: number,
    absolute: number,
  ) {
    if (locked) return;
    const item = bars[Math.floor(absolute / limit)];
    if (!item || absolute < 0) {
      toast.error("位置超出曲谱，请先添加小节。");
      return;
    }
    try {
      const lyric = bars
        .find((b) => b.bar.id === barId)
        ?.bar.lyrics?.find((l) => l.tick === tick && l.verse === verse);
      if (lyric)
        change(
          setLyricPosition(value, barId, verse, tick, absolute),
          false,
          !lyricVocalNote(value, barId, lyric),
        );
      setLyricCursor({ barId: item.bar.id, tick: absolute % limit, verse });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  function lanePosition(barId: string, tick: number) {
    const i = bars.findIndex((b) => b.bar.id === barId);
    if (i < 0 || tick < 0 || tick >= limit) return;
    const absolute = i * limit + tick;
    if (lane === "lyrics") {
      moveLyric(
        lyricSelection.barId,
        lyricSelection.verse,
        lyricSelection.tick,
        absolute,
      );
      return;
    }
    if (locked) return;
    try {
      if (selectedVocal)
        change(
          moveVocalNote(value, vocalCursor.barId, vocalCursor.tick, absolute),
        );
      setVocalCursor({ barId, tick });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  function nudgeLane(delta: number) {
    const i = bars.findIndex((b) => b.bar.id === activeLaneCursor.barId),
      absolute = i * limit + activeLaneCursor.tick + delta;
    const item = bars[Math.floor(absolute / limit)];
    if (!item || absolute < 0) {
      toast.error("位置超出曲谱，请先添加小节。");
      return;
    }
    lanePosition(item.bar.id, absolute % limit);
  }
  function moveVocalCursor(direction: number) {
    const index = bars.findIndex((item) => item.bar.id === vocalCursor.barId);
    if (locked || index < 0) return;
    const current = index * limit + vocalCursor.tick;
    let target = current + direction * voiceDuration;
    const starts = writtenVocalNotes(value).map((note) => note.startTick);
    const closer = starts.filter((start) =>
      direction > 0
        ? start > current && start < target
        : start < current && start > target,
    );
    if (closer.length)
      target = direction > 0 ? Math.min(...closer) : Math.max(...closer);
    const item = bars[Math.floor(target / limit)];
    if (item && target >= 0) {
      const cursor = { barId: item.bar.id, tick: target % limit };
      selectVocal(cursor.barId, cursor.tick);
      focusVocal(cursor);
    }
  }
  function vocalKey(
    event: KeyboardEvent<SVGGElement>,
    barId: string,
    tick: number,
  ) {
    if (editorKey(event)) return;
    if (locked || event.ctrlKey || event.metaKey || event.altKey) return;
    if (barId !== vocalCursor.barId || tick !== vocalCursor.tick) {
      selectVocal(barId, tick);
      return;
    }
    if (/^[0-7]$/.test(event.key)) {
      event.preventDefault();
      writeVocal({ degree: Number(event.key) });
    } else if (["Delete", "Backspace"].includes(event.key)) {
      event.preventDefault();
      try {
        change(deleteVocalNote(value, barId, tick));
      } catch (error) {
        toast.error((error as Error).message);
      }
      focusVocal();
    } else if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      writeVocal({ degree: 0, octave: 0, accidental: 0 });
    } else if (event.key.toLowerCase() === "l") {
      event.preventDefault();
      voiceTie();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      writeVocal({
        octave: Math.max(
          -2,
          Math.min(
            2,
            (selectedVocal?.octave ?? 0) + (event.key === "ArrowUp" ? 1 : -1),
          ),
        ),
      });
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      moveVocalCursor(event.key === "ArrowRight" ? 1 : -1);
    } else if (["+", "=", "-", "_", ".", "/"].includes(event.key)) {
      event.preventDefault();
      const shape = rhythmShape(voiceDuration),
        base = shape?.base ?? 12;
      voiceDurationChange(
        event.key === "."
          ? base * (shape?.dots === 0 ? 1.5 : shape?.dots === 1 ? 1.75 : 1)
          : event.key === "/"
            ? shape?.triplet
              ? base
              : (base * 2) / 3
            : voiceDuration * (["+", "="].includes(event.key) ? 0.5 : 2),
      );
    }
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
  function focusChordTarget(target: ScoreSelection) {
    const bar = document.querySelector(
      '.editable-score [data-preview-bar="' + CSS.escape(target.barId) + '"]',
    );
    const eventId = CSS.escape(target.eventId);
    const hit =
      bar?.querySelector<SVGGElement>(
        '[data-score-chord-event="' + eventId + '"]',
      ) ??
      bar?.querySelector<SVGGElement>(
        '[data-preview-event="' + eventId + '"] .score-chord-target',
      );
    hit?.focus({ preventScroll: true });
  }
  function applyStroke(
    stroke: NonNullable<ArrangementEvent["stroke"]>,
    target: ScoreSelection = selected,
  ) {
    if (locked) return;
    const bar = bars.find(({ bar }) => bar.id === target.barId)?.bar;
    const previous = bar?.events.find((event) => event.id === target.eventId);
    if (!bar || !previous || (!previous.chord && !previous.notes?.length))
      return;
    setSelected({ ...target });
    setLane("guitar");
    setAnchor(null);
    setRangeMode(false);
    digits.current = { cell: "", time: 0, value: "", changed: false };
    if (
      (previous.stroke ?? (value.pattern === "strum" ? "down" : "pluck")) !==
      stroke
    ) {
      editBar(bar.id, (bar) => ({
        ...bar,
        events: bar.events.map((event) =>
          event.id === target.eventId ? { ...event, stroke } : event,
        ),
      }));
    }
    requestAnimationFrame(() => {
      if (target.tick !== undefined && target.stringIndex !== undefined)
        restoreFocus(target);
      else focusChordTarget(target);
    });
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
    if (lane === "vocal") {
      focusVocal();
      return;
    }
    if (lane === "lyrics") return;
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
    setLane("guitar");
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
    if (n)
      setInputDuration(
        Math.min(96, scoreNoteDuration(value, selection) ?? n.durationTicks),
      );
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
    try {
      // Resize each selected tie chain once; continuations belong to their selected head.
      const continued = new Set(
        targets
          .filter((n) => n.tieToNext)
          .map((n) => tieCandidate(allWritten, n))
          .filter(Boolean)
          .map((n) => n!.eventId + ":" + n!.offsetTick + ":" + n!.stringIndex),
      );
      let next = value;
      for (const note of [...targets].reverse()) {
        if (
          continued.has(
            note.eventId + ":" + note.offsetTick + ":" + note.stringIndex,
          )
        )
          continue;
        next = setNoteDuration(
          next,
          {
            barId: note.barId,
            eventId: note.eventId,
            tick: note.offsetTick,
            stringIndex: note.stringIndex,
          },
          ticks,
        );
      }
      setInputDuration(ticks);
      // Tuplet input needs its own subdivisions; keep existing onsets in place.
      if (
        rhythmShape(ticks)?.triplet ||
        rhythmShape(currentDuration)?.triplet
      ) {
        const subdivision = String(Math.min(ticks, 16));
        if (GRID_OPTIONS.some((option) => option.value === subdivision))
          setGrid(subdivision);
      }
      if (targets.length) change(next);
    } catch (error) {
      toast.error((error as Error).message);
    }
    restoreFocus();
  }
  function toggleTie() {
    if (locked) return;
    try {
      change(toggleScoreTie(value, selected));
      toast.success(
        tieAction.action === "disconnect"
          ? "已取消延音连接"
          : tieAction.action === "create"
            ? "已补上续音并连接延音"
            : "已连接同音，试听只拨一次",
      );
    } catch (error) {
      toast.error((error as Error).message);
    }
    restoreFocus();
  }
  function togglePreviousTie() {
    if (locked || !selectedWritten) return;
    if (!previousWritten) {
      toast.error(
        "前面还没有同弦音符，请先写好前音，或使用「延音」补上后面的续音。",
      );
      restoreFocus();
      return;
    }
    if (
      previousWritten.fret !== selectedWritten.fret ||
      selectedWritten.fret < 0
    ) {
      toast.error("延音需要同弦同品；当前音与前一个音的品位不同。");
      restoreFocus();
      return;
    }
    try {
      change(
        toggleScoreTie(value, {
          barId: previousWritten.barId,
          eventId: previousWritten.eventId,
          tick: previousWritten.offsetTick,
          stringIndex: previousWritten.stringIndex,
        }),
      );
      toast.success(
        previousTied ? "已取消与前音的连接" : "已接到前一个同音，试听只拨一次",
      );
    } catch (error) {
      toast.error((error as Error).message);
    }
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
    change(clearPassage(value, span, false));
    setAnchor(null);
    setRangeMode(false);
    restoreFocus();
  }
  function copy(cut = false) {
    if (locked || !selectionSpan) return;
    setClipboard(copyPassage(value, selectionSpan));
    if (cut) change(clearPassage(value, selectionSpan));
    toast.success(cut ? "已剪切片段" : "已复制片段", {
      description: "包含和弦、音符和歌词；粘贴将覆盖光标后的相同时长。",
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
    if (e.key === " " && target.closest(".vocal-lane-hit,.vocal-note-target")) {
      e.preventDefault();
      if (player.playing) player.stop();
      else if (!invalid && !saving && bars.length) void play();
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
    try {
      change(
        fret === null
          ? removeScoreNote(value, selection)
          : putScoreNote(
              value,
              selection,
              fret,
              scoreNoteDuration(value, selection) ?? inputDuration,
              marker,
            ),
        coalesce,
      );
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    }
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
      else if (e.key.toLowerCase() === "l") {
        if (e.shiftKey) togglePreviousTie();
        else toggleTie();
      } else if (e.key === ".")
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
  function openChordPicker(target: ScoreSelection) {
    if (
      locked ||
      !bars.some(
        ({ bar }) =>
          bar.id === target.barId &&
          bar.events.some((e) => e.id === target.eventId),
      )
    )
      return;
    chordPickerTargetRef.current = { ...target };
    setChordPickerTarget({ ...target });
    setLane("guitar");
    setAnchor(null);
    setRangeMode(false);
  }
  function closeChordPicker(open: boolean) {
    if (open) return;
    chordPickerTargetRef.current = null;
    setChordPickerTarget(null);
  }
  function applyChordAt(chord: Chord, target: ScoreSelection): boolean {
    if (locked) return false;
    try {
      const next = setScoreChord(value, target, chord);
      change(next.arrangement);
      setSelected(next.cursor);
      setLane("guitar");
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    }
  }
  function applyPickedChord(chord: Chord): boolean {
    const target = chordPickerTargetRef.current;
    return target ? applyChordAt(chord, target) : false;
  }
  function focusAfterChordPicker() {
    if (locked) return;
    requestAnimationFrame(() => {
      if (selected.tick !== undefined && selected.stringIndex !== undefined)
        restoreFocus();
      else focusChordTarget(selected);
    });
  }
  const pickerBar = bars.find(({ bar }) => bar.id === chordPickerTarget?.barId);
  const pickerEvent = pickerBar?.bar.events.find(
    (e) => e.id === chordPickerTarget?.eventId,
  );
  const pickerOnset =
    pickerBar && pickerEvent
      ? pickerBar.bar.events
          .slice(0, pickerBar.bar.events.indexOf(pickerEvent))
          .reduce((sum, e) => sum + e.durationTicks, 0) +
        (chordPickerTarget?.tick ?? 0)
      : 0;
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
    const written = selectedWritten;
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
              ? `${6 - selected.stringIndex!} 弦 · ${beatLabel(chosen.bar.events.slice(0, chosen.bar.events.indexOf(event)).reduce((n, e) => n + e.durationTicks, 0) + selected.tick!, value.meter)}`
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
                    value={String(currentDuration)}
                    options={durationOptions(96, currentDuration)}
                    onChange={(v) => applyDuration(Number(v))}
                  />
                </label>
                <button
                  className={
                    "button " +
                    (note.tieToNext ? "primary" : "secondary-button")
                  }
                  aria-pressed={!!note.tieToNext}
                  disabled={!written}
                  title={tieAction.reason}
                  onClick={toggleTie}
                >
                  {note.tieToNext ? "取消延音连接" : "连接 / 补上续音"}
                </button>
                <button
                  className="button secondary-button"
                  onClick={togglePreviousTie}
                  aria-pressed={previousTied}
                >
                  {previousTied ? "取消与前音连接" : "接到前一个同音"}
                </button>
                <small>{tieAction.reason}</small>
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
              <button
                aria-label="选择全部和弦"
                onClick={() => openChordPicker({ barId, eventId: event.id })}
              >
                <Plus size={14} />
                全部和弦…
              </button>
              {["C", "Am", "G", "D", "Em", "Fmaj7"].map((name) => (
                <button
                  key={name}
                  aria-label={`换成 ${name} 和弦`}
                  aria-pressed={event.chord?.name === name}
                  onClick={() =>
                    applyChordAt(
                      CHORDS.find((c) => c.name === name)!,
                      { barId, eventId: event.id },
                    )
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
                    if (v === "rest")
                      editEvent({ chord: null, notes: undefined });
                    else if (v !== "-1")
                      applyChordAt(CHORDS[Number(v)], {
                        barId,
                        eventId: event.id,
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
                    applyStroke(v as NonNullable<ArrangementEvent["stroke"]>)
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
            <span>
              {event.notes.length ? "已单独编辑音符" : "暂未填写吉他音符"}
            </span>
            {event.chord && (
              <button onClick={() => editEvent({ notes: undefined })}>
                <RotateCcw size={12} />
                {event.notes.length ? "恢复自动伴奏" : "生成自动伴奏"}
              </button>
            )}
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
  function contextSelect(target: ScoreContextTarget) {
    setContextTarget(target);
    if (locked) return;
    if ("selection" in target) {
      const selection =
        target.kind === "guitar"
          ? (target.sourceSelection ?? target.selection)
          : target.selection;
      const tick = cursorTick(value, selection);
      // Keep an existing passage when right-clicking inside its selection.
      if (
        target.kind === "guitar" &&
        anchor &&
        selectionSpan &&
        tick !== undefined &&
        tick >= selectionSpan.start &&
        tick < selectionSpan.end
      ) {
        setLane("guitar");
      } else {
        setRangeMode(false);
        setAnchor(null);
        select(selection);
      }
    } else if (target.kind === "vocal") selectVocal(target.barId, target.tick);
    else if (target.kind === "lyrics")
      selectLyric(target.barId, target.tick, target.verse);
    else {
      const bar = bars.find((item) => item.bar.id === target.barId)?.bar;
      if (bar?.events.length) {
        setLane("guitar");
        setSelected({ barId: bar.id, eventId: bar.events[0].id });
        setAnchor(null);
        setRangeMode(false);
      }
    }
  }
  function contextRequest(event: MouseEvent<HTMLDivElement>) {
    if (
      !(event.target instanceof Element) ||
      !event.target.closest(
        "[data-preview-bar], [data-score-bar-header], [data-staff-start]",
      )
    )
      event.stopPropagation();
  }
  function contextFocus() {
    if (locked || chordPickerTargetRef.current) return;
    requestAnimationFrame(() => {
      if (chordPickerTargetRef.current) return;
      if (contextTarget?.kind === "score")
        document
          .querySelector<SVGGElement>(".editable-score [data-tab-clef]")
          ?.focus({ preventScroll: true });
      else if (lane === "vocal") focusVocal();
      else if (lane === "lyrics") {
        const key = CSS.escape(
          lyricSelection.barId +
            ":" +
            lyricSelection.tick +
            ":" +
            lyricSelection.verse,
        );
        const target = document.querySelector<HTMLElement | SVGGElement>(
          `[data-lyric-drag="${key}"], textarea[data-lyric-cell="${key}"]`,
        );
        target?.focus({ preventScroll: true });
      } else if (
        selected.tick !== undefined &&
        selected.stringIndex !== undefined
      )
        restoreFocus();
      else focusChordTarget(selected);
    });
  }
  const contextBarId =
    contextTarget && "selection" in contextTarget
      ? contextTarget.selection.barId
      : contextTarget?.barId;
  const contextBar = bars.find((item) => item.bar.id === contextBarId);
  const contextKind = contextTarget?.kind;
  const contextDuration =
    contextKind === "vocal" ? voiceDuration : currentDuration;
  const contextShape = rhythmShape(contextDuration);
  const contextBase = contextShape?.base ?? 12;
  const contextDotted =
    contextBase *
    (contextShape?.dots === 0 ? 1.5 : contextShape?.dots === 1 ? 1.75 : 1);
  const contextTriplet = contextShape?.triplet
    ? contextBase
    : (contextBase * 2) / 3;
  const menuItem = (
    id: string,
    label: string,
    onSelect: () => void,
    disabled = false,
    checked?: boolean,
  ): ScoreMenuEntry => ({
    id,
    label,
    onSelect,
    disabled: locked || disabled,
    checked,
  });
  const contextGroups: ScoreMenuEntry[][] = [];
  const contextChordCursor =
    contextTarget && "selection" in contextTarget
      ? contextTarget.selection
      : contextBar?.bar.events[0]
        ? { barId: contextBar.bar.id, eventId: contextBar.bar.events[0].id }
        : undefined;
  const contextChordEvent = contextBar?.bar.events.find(
    (e) => e.id === contextChordCursor?.eventId,
  );
  if (
    contextKind === "guitar" ||
    contextKind === "chord" ||
    contextKind === "bar"
  ) {
    contextGroups.push([
      menuItem(
        "chord-add",
        contextChordEvent?.chord && !(contextChordCursor?.tick ?? 0)
          ? "更换和弦…"
          : "添加和弦…",
        () => {
          if (contextChordCursor) openChordPicker(contextChordCursor);
        },
        !contextChordCursor,
      ),
    ]);
  }
  if (
    contextKind === "guitar" ||
    contextKind === "chord" ||
    contextKind === "bar"
  ) {
    const available =
      !!contextChordEvent &&
      !!(contextChordEvent.chord || contextChordEvent.notes?.length);
    const stroke =
      contextChordEvent?.stroke ??
      (value.pattern === "strum" ? "down" : "pluck");
    contextGroups.push(
      (
        [
          ["pluck", "同时拨弦"],
          ["down", "向下扫弦"],
          ["up", "向上扫弦"],
        ] as const
      ).map(([option, label]) =>
        menuItem(
          "chord-" + option,
          label,
          () => {
            if (contextChordCursor) applyStroke(option, contextChordCursor);
          },
          !available,
          available && stroke === option,
        ),
      ),
    );
  }
  if (contextKind === "guitar" || contextKind === "vocal") {
    const setDuration =
      contextKind === "vocal" ? voiceDurationChange : applyDuration;
    contextGroups.push([
      {
        id: "duration",
        label: "音符时值",
        disabled: locked,
        children: [96, 48, 24, 12, 6, 3].map((ticks) =>
          menuItem(
            "duration-" + ticks,
            durationLabel(ticks),
            () => setDuration(ticks),
            false,
            contextDuration === ticks,
          ),
        ),
      },
      {
        ...menuItem(
          "dot",
          "附点 / 复附点",
          () => setDuration(contextDotted),
          !Number.isInteger(contextDotted) || contextDotted > 96,
          !!contextShape?.dots,
        ),
        shortcut: ".",
      },
      {
        ...menuItem(
          "triplet",
          "三连音",
          () => setDuration(contextTriplet),
          contextTriplet < 2 || contextTriplet > 96,
          !!contextShape?.triplet,
        ),
        shortcut: "/",
      },
    ]);
    if (contextKind === "guitar") {
      contextGroups.push([
        {
          ...menuItem(
            "tie",
            "延音到后音",
            toggleTie,
            !currentNote,
            !!currentNote?.tieToNext,
          ),
          shortcut: "L",
        },
        {
          ...menuItem(
            "previous-tie",
            "接到前音",
            togglePreviousTie,
            !currentNote,
            previousTied,
          ),
          shortcut: "Shift+L",
        },
        menuItem("chord-note", "× 按当前和弦拨弦", () =>
          putChordNote(selected),
        ),
        {
          ...menuItem(
            "rest",
            anchor ? "选中片段设为休止" : "当前时值设为休止",
            rest,
          ),
          shortcut: "R",
        },
        {
          ...menuItem(
            "clear-note",
            anchor ? "清除选中片段" : "清除这个单音",
            () => {
              if (anchor && selectionSpan)
                change(clearPassage(value, selectionSpan));
              else putNote(selected, null);
            },
            !currentNote && !anchor,
          ),
          danger: true,
          shortcut: "Delete",
        },
      ]);
      contextGroups.push([
        {
          ...menuItem(
            "copy",
            "复制片段",
            () => copy(),
            currentTick === undefined,
          ),
          shortcut: "Ctrl+C",
        },
        {
          ...menuItem(
            "cut",
            "剪切片段",
            () => copy(true),
            currentTick === undefined,
          ),
          shortcut: "Ctrl+X",
        },
        {
          ...menuItem(
            "paste",
            "覆盖粘贴",
            paste,
            !clipboard || currentTick === undefined,
          ),
          shortcut: "Ctrl+V",
        },
      ]);
    } else {
      contextGroups.push([
        {
          id: "vocal-pitch",
          label: "唱音 / 休止",
          disabled: locked,
          children: Array.from({ length: 8 }, (_, degree) =>
            menuItem(
              "vocal-degree-" + degree,
              degree === 0 ? "0 · 休止" : String(degree),
              () => writeVocal({ degree }),
              false,
              selectedVocal?.degree === degree,
            ),
          ),
        },
        menuItem(
          "octave-up",
          "升高一个八度",
          () =>
            writeVocal({
              octave: Math.min(2, (selectedVocal?.octave ?? 0) + 1),
            }),
          (selectedVocal?.octave ?? 0) >= 2 || selectedVocal?.degree === 0,
        ),
        menuItem(
          "octave-down",
          "降低一个八度",
          () =>
            writeVocal({
              octave: Math.max(-2, (selectedVocal?.octave ?? 0) - 1),
            }),
          (selectedVocal?.octave ?? 0) <= -2 || selectedVocal?.degree === 0,
        ),
        {
          ...menuItem(
            "tie",
            "延音到后音",
            voiceTie,
            !selectedVocal || selectedVocal.degree === 0,
            !!selectedVocal?.tieToNext,
          ),
          shortcut: "L",
        },
        menuItem("nudge-earlier", "提前一个八分音符", () => nudgeLane(-12)),
        menuItem("nudge-later", "延后一个八分音符", () => nudgeLane(12)),
        {
          ...menuItem(
            "vocal-clear",
            "清除这个唱音",
            () => {
              change(
                deleteVocalNote(value, vocalCursor.barId, vocalCursor.tick),
              );
            },
            !selectedVocal,
          ),
          danger: true,
          shortcut: "Delete",
        },
      ]);
    }
  } else if (contextKind === "lyrics") {
    contextGroups.push([
      menuItem("lyric-edit", "填写 / 修改歌词", () => {
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLTextAreaElement>(
              `textarea[data-lyric-cell="${CSS.escape(lyricSelection.barId + ":" + lyricSelection.tick + ":" + lyricSelection.verse)}"]`,
            )
            ?.focus({ preventScroll: true }),
        );
      }),
      menuItem(
        "lyric-align-phrase",
        "逐字对齐唱音",
        alignSelectedLyrics,
        phraseLength < 2,
      ),
      menuItem(
        "lyric-add-line",
        "增加一行歌词",
        () => {
          change(addLyricLine(value), false, true);
          setLyricCursor({ ...lyricSelection, verse: lines });
        },
        lines >= 8,
      ),
      menuItem(
        "lyric-anchor-auto",
        "歌词跟随唱音",
        () => lyricAnchorChange("auto"),
        false,
        (selectedLyric?.anchorMode ?? lyricEntryMode) === "auto",
      ),
      menuItem(
        "lyric-anchor-free",
        "歌词独立起唱",
        () => lyricAnchorChange("free"),
        false,
        (selectedLyric?.anchorMode ?? lyricEntryMode) === "free",
      ),
    ]);
    contextGroups.push([
      menuItem(
        "lyric-mode-time",
        "调整起唱时间",
        () => setLyricMode("time"),
        false,
        lyricMode === "time",
      ),
      menuItem(
        "lyric-mode-layout",
        "调整文字排版",
        () => setLyricMode("layout"),
        false,
        lyricMode === "layout",
      ),
      menuItem(
        "nudge-earlier",
        "提前一个八分音符",
        () => nudgeLane(-12),
        !selectedLyric,
      ),
      menuItem(
        "nudge-later",
        "延后一个八分音符",
        () => nudgeLane(12),
        !selectedLyric,
      ),
      menuItem(
        "lyric-reset-layout",
        "重置文字位置",
        () =>
          layoutLyric(
            lyricSelection.barId,
            lyricSelection.verse,
            lyricSelection.tick,
            0,
            0,
          ),
        !selectedLyric,
      ),
      {
        ...menuItem(
          "lyric-clear",
          "清除这个歌词",
          () =>
            editLyric(
              lyricSelection.barId,
              lyricSelection.tick,
              lyricSelection.verse,
              "",
            ),
          !selectedLyric,
        ),
        danger: true,
      },
    ]);
  } else if (contextKind === "score") {
    contextGroups.push([
      {
        id: "meter",
        label: "拍号",
        disabled: locked,
        children: (["4/4", "3/4", "6/8"] as const).map((meter) =>
          menuItem(
            "meter-" + meter.replace("/", "-"),
            meter,
            () => change({ ...value, meter }),
            false,
            value.meter === meter,
          ),
        ),
      },
      {
        id: "vocal-key",
        label: "唱音调号 · 1 = " + (value.vocalKey ?? "C"),
        disabled: locked,
        children: (
          [
            "C",
            "C#",
            "D",
            "Eb",
            "E",
            "F",
            "F#",
            "G",
            "Ab",
            "A",
            "Bb",
            "B",
          ] as const
        ).map((key) =>
          menuItem(
            "vocal-key-" + key,
            "1 = " + key,
            () => change({ ...value, vocalKey: key }),
            false,
            (value.vocalKey ?? "C") === key,
          ),
        ),
      },
    ]);
  } else if (contextKind === "chord") {
    contextGroups.push([
      menuItem("properties", "编辑和弦与按法", () => setProperties(true)),
      menuItem(
        "split",
        "拆分这段和弦",
        split,
        !event || event.durationTicks < 2,
      ),
    ]);
  }
  if (contextBar && contextKind !== "score") {
    contextGroups.push([
      menuItem(
        "bar-insert",
        "后面插入空白小节",
        () => barAction(contextBar.bar.id, "insert"),
        bars.length >= 128 || contextBar.section.bars.length >= 32,
      ),
      menuItem(
        "bar-copy",
        "复制这个小节",
        () => barAction(contextBar.bar.id, "copy"),
        bars.length >= 128 || contextBar.section.bars.length >= 32,
      ),
      {
        ...menuItem("bar-delete", "删除这个小节", () =>
          barAction(contextBar.bar.id, "delete"),
        ),
        danger: true,
      },
    ]);
  }
  contextGroups.push([
    { ...menuItem("undo", "撤销", undo, !history.length), shortcut: "Ctrl+Z" },
    {
      ...menuItem("redo", "重做", redo, !future.length),
      shortcut: "Ctrl+Shift+Z",
    },
  ]);
  const contextOnset =
    contextTarget && "selection" in contextTarget
      ? cursorTick(value, contextTarget.selection)
      : contextTarget && "tick" in contextTarget
        ? contextTarget.tick
        : undefined;
  const contextDetail =
    contextOnset === undefined
      ? ""
      : " · " +
        beatLabel(contextOnset % limit, value.meter) +
        (contextTarget?.kind === "guitar" &&
        contextTarget.selection.stringIndex !== undefined
          ? " · " + (6 - contextTarget.selection.stringIndex) + " 弦"
          : "");
  const contextLabel =
    contextKind === "score"
      ? "谱首 · 拍号与唱音调号" + (locked ? "（停止试听或保存后可编辑）" : "")
      : "第 " +
        (contextBar?.number ?? "—") +
        " 小节 · " +
        (contextKind === "guitar"
          ? anchor
            ? "已选片段"
            : "吉他音符"
          : contextKind === "vocal"
            ? "唱音简谱"
            : contextKind === "lyrics"
              ? "第 " + (lyricSelection.verse + 1) + " 行歌词"
              : contextKind === "chord"
                ? "和弦"
                : "小节") +
        contextDetail +
        (locked ? "（停止试听或保存后可编辑）" : "");

  return (
    <div
      className="arrangement-editor direct-arrangement gp-arrangement"
      onKeyDown={editorKey}
    >
      <ScoreChordPicker
        open={!!chordPickerTarget}
        onOpenChange={closeChordPicker}
        onSelect={applyPickedChord}
        currentChord={pickerEvent?.chord}
        customChords={bars.flatMap(({ bar }) =>
          bar.events.flatMap((event) => (event.chord ? [event.chord] : [])),
        )}
        disabled={locked}
        targetLabel={
          pickerBar
            ? "第 " +
              pickerBar.number +
              " 小节 · " +
              beatLabel(pickerOnset, value.meter)
            : undefined
        }
        onCloseAutoFocus={focusAfterChordPicker}
      />
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
            自动伴奏音型
            <Choice
              label="试听音型"
              value={value.pattern}
              onChange={(v) =>
                change({ ...value, pattern: v as Arrangement["pattern"] })
              }
              options={[
                { value: "strum", label: "整组和弦" },
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
        <div
          className="score-track-tabs"
          role="group"
          aria-label="选择编辑声部"
        >
          {(["guitar", "vocal", "lyrics"] as const).map((part) => (
            <button
              key={part}
              aria-pressed={lane === part}
              disabled={locked}
              onClick={() => chooseLane(part)}
            >
              {part === "guitar"
                ? "吉他六线谱"
                : part === "vocal"
                  ? "唱音简谱"
                  : "歌词"}
            </button>
          ))}
          <span>吉他与人声共用节拍，各自编排</span>
        </div>
        {lane === "vocal" && (
          <VocalRhythmTools
            duration={voiceDuration}
            onDuration={voiceDurationChange}
            locked={locked}
            canWrite={!!vocalCursor.barId && voiceAvailability?.fits !== false}
            onRest={() => writeVocal({ degree: 0, octave: 0, accidental: 0 })}
            onTie={voiceTie}
            canTie={!!selectedVocal && selectedVocal.degree !== 0}
            tied={!!selectedVocal?.tieToNext}
            onMove={moveVocalCursor}
            location={
              "第 " +
              (bars.find((item) => item.bar.id === vocalCursor.barId)?.number ??
                1) +
              " 小节 · " +
              beatLabel(vocalCursor.tick, value.meter)
            }
          />
        )}
        {lane === "guitar" ? (
          <ScoreNoteTools
            duration={currentDuration}
            onDuration={applyDuration}
            locked={locked}
            onRest={rest}
            onTie={toggleTie}
            tied={!!currentNote?.tieToNext}
            canTie={!!currentNote}
            tieHint={tieAction.reason}
            onPreviousTie={togglePreviousTie}
            previousTied={previousTied}
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
                      beatLabel(currentTick % limit, value.meter) +
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
                : "点击谱面定位，选择时值后输入品位；跨小节自动延音"
            }
            onHelp={() => setHelp((v) => !v)}
            help={help}
          />
        ) : (
          <VocalTools
            lane={lane}
            locked={locked}
            bars={bars.map((b) => ({ id: b.bar.id, number: b.number }))}
            barId={activeLaneCursor.barId}
            tick={activeLaneCursor.tick}
            meter={value.meter}
            lineCount={lines}
            verse={lyricSelection.verse}
            onVerse={(verse) =>
              selectLyric(lyricSelection.barId, lyricSelection.tick, verse)
            }
            onAddLine={() => {
              try {
                change(addLyricLine(value), false, true);
                setLyricCursor({ ...lyricSelection, verse: lines });
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
            onDeleteLine={() => {
              try {
                change(
                  removeLyricLine(value, lyricSelection.verse),
                  false,
                  true,
                );
                setLyricCursor({
                  ...lyricSelection,
                  verse: Math.min(lyricSelection.verse, lines - 2),
                });
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
            onPosition={lanePosition}
            onNudge={nudgeLane}
            lyricMode={lyricMode}
            onLyricMode={setLyricMode}
            lyricAnchor={
              selectedLyric
                ? (selectedLyric.anchorMode ?? "auto")
                : lyricEntryMode
            }
            onLyricAnchor={lyricAnchorChange}
            lyric={selectedLyric}
            lyricBound={!!linkedVocal}
            onLyricLayout={(x, y) =>
              layoutLyric(
                lyricSelection.barId,
                lyricSelection.verse,
                lyricSelection.tick,
                x,
                y,
              )
            }
            lyricFontSize={value.lyricFontSize}
            onLyricFontSize={(size) =>
              change(
                { ...value, lyricFontSize: resolveLyricFontSize(size) },
                false,
                true,
              )
            }
            lyricEndOptions={lyricEndOptions}
            onLyricExtend={extendLyric}
            onAlignPhrase={alignSelectedLyrics}
            phraseLength={phraseLength}
            vocal={selectedVocal}
            vocalDuration={voiceDuration}
            inputStatus={
              voiceAvailability
                ? {
                    fits: voiceAvailability.fits,
                    reason: voiceInputReason(voiceAvailability),
                    suggestedDuration: voiceAvailability.suggestedDuration,
                  }
                : undefined
            }
            gridLabel={
              GRID_OPTIONS.find((option) => option.value === grid)?.label ??
              "当前网格"
            }
            grid={grid}
            onGrid={setGrid}
            onDuration={voiceDurationChange}
            onPitch={writeVocal}
            onFocus={focusVocal}
            onDelete={() => {
              if (lane === "lyrics")
                editLyric(
                  lyricSelection.barId,
                  lyricSelection.tick,
                  lyricSelection.verse,
                  "",
                );
              else {
                change(
                  deleteVocalNote(value, vocalCursor.barId, vocalCursor.tick),
                );
                focusVocal();
              }
            }}
            onTie={voiceTie}
            vocalKey={value.vocalKey ?? "C"}
            onKey={(key) =>
              change({ ...value, vocalKey: key as Arrangement["vocalKey"] })
            }
            onUndo={undo}
            onRedo={redo}
            canUndo={!!history.length}
            canRedo={!!future.length}
          />
        )}
        {lane === "guitar" && (
          <ScoreStrokeTools
            stroke={
              event?.stroke ??
              (event ? (value.pattern === "strum" ? "down" : "pluck") : "pluck")
            }
            onStroke={(stroke) => applyStroke(stroke)}
            locked={locked}
            enabled={!!event && !!(event.chord || event.notes?.length)}
            canChooseChord={!!event}
            chordName={event?.chord?.name}
            location={
              chosen && event
                ? "第 " +
                  chosen.number +
                  " 小节 · " +
                  beatLabel(
                    chosen.bar.events
                      .slice(0, chosen.bar.events.indexOf(event))
                      .reduce((sum, event) => sum + event.durationTicks, 0),
                    value.meter,
                  ) +
                  "起"
                : "点击谱面选择位置"
            }
            onChooseChord={() =>
              openChordPicker(
                event?.chord
                  ? { barId: selected.barId, eventId: selected.eventId }
                  : selected,
              )
            }
          />
        )}
        {lane === "guitar" && currentTick !== undefined && (
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
                change({
                  ...sampleArrangement(score.demoId!, currentPageId),
                  vocalKey: value.vocalKey ?? "C",
                })
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
            "gp-score-workspace " +
            (properties && lane === "guitar" ? "properties-open" : "")
          }
        >
          <div className="gp-score-paper">
            <ScoreContextMenu
              label={contextLabel}
              groups={contextGroups}
              onContextMenu={contextRequest}
              onClose={contextFocus}
            >
              <ArrangementPreview
                arrangement={value}
                title={score.title}
                capo={score.capo}
                position={player.position}
                editing={{
                  onContextMenu: contextSelect,
                  onChordAdd: (target) => {
                    setSelected(target);
                    openChordPicker(target);
                  },
                  gridStep: Number(grid),
                  selected,
                  locked,
                  onSelect: select,
                  onKey: noteKey,
                  inspector: () => null,
                  onLyricChange: editLyric,
                  lyricSelected: lane === "lyrics" ? lyricSelection : undefined,
                  onLyricSelect: selectLyric,
                  onLyricMove: moveLyric,
                  lyricActive: lane === "lyrics",
                  lyricMode,
                  onLyricLayout: layoutLyric,
                  vocalActive: lane === "vocal",
                  vocalSelected: lane === "vocal" ? vocalCursor : undefined,
                  onVocalSelect: selectVocal,
                  onVocalKey: vocalKey,
                  onLyricBegin: (barId, tick, verse) => {
                    lyricSession.current = {
                      key: barId + ":" + tick + ":" + verse,
                      changed: false,
                    };
                  },
                  onLyricEnd: () => {
                    lyricSession.current = { key: "", changed: false };
                  },
                  onLyricHistory: (command) => {
                    if (command === "redo") redo();
                    else undo();
                  },
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
                                s.id === id
                                  ? { ...s, label: e.target.value }
                                  : s,
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
                              [next[si - 1], next[si]] = [
                                next[si],
                                next[si - 1],
                              ];
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
                              [next[si], next[si + 1]] = [
                                next[si + 1],
                                next[si],
                              ];
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
            </ScoreContextMenu>
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
            label="试听声部"
            value={playbackPart}
            onChange={(part) => setPlaybackPart(part as typeof playbackPart)}
            options={[
              { value: "both", label: "吉他 + 唱音" },
              { value: "guitar", label: "吉他" },
              { value: "vocal", label: "唱音旋律" },
            ]}
          />
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
              : "按当前谱面试听 · 唱音使用合成旋律音色"}
          </small>
        </div>
      </div>
    </div>
  );
}
