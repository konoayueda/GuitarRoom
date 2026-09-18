import { CHORDS, type Chord } from "./chords";
import {
  barTicks,
  arrangementSchema,
  type Arrangement,
  type ArrangementSection,
} from "./arrangement";

export type RecognitionRect = { x: number; y: number; w: number; h: number };
export type RecognizedNote = RecognitionRect & {
  id: string;
  stringIndex: number;
  fret: number | null;
  tick: number | null;
  marker?: "cross";
  confidence: number;
  reviewed: boolean;
};
export type RecognizedChordChange = {
  id: string;
  tick: number | null;
  chordName: string;
  chord?: Chord;
};
export type RecognizedBar = {
  id: string;
  x: number;
  w: number;
  chordName: string;
  chord?: Chord;
  chordChanges?: RecognizedChordChange[];
  notes: RecognizedNote[];
  rhythmConfirmed: boolean;
  notesConfirmed: boolean;
};
export type RecognitionDraft = {
  id: string;
  pageId: string;
  pageNumber: number;
  rotation: number;
  rect: RecognitionRect;
  image: string;
  width: number;
  height: number;
  meter: Arrangement["meter"];
  bars: RecognizedBar[];
  warnings: string[];
};
export function chordLabelsForBar(
  bar: RecognizedBar,
  words: { text: string; x: number }[],
): Pick<RecognizedBar, "chordName" | "chordChanges"> {
  const names = words
    .map((word) => ({
      name: word.text
        .trim()
        .replaceAll("♯", "#")
        .replaceAll("♭", "b")
        .replace(/^([#b])([A-G])(.*)$/, "$2$1$3"),
      x: word.x,
    }))
    .filter(
      (word) =>
        word.x >= bar.x &&
        word.x < bar.x + bar.w &&
        /^[A-G][#b]?(?:m|maj|min|sus|add|dim|aug)?[0-9]*(?:\/[A-G][#b]?)?$/.test(
          word.name,
        ),
    )
    .sort((a, b) => a.x - b.x);
  return {
    chordName: names[0]?.name ?? bar.chordName,
    chordChanges: names
      .slice(1)
      .filter((word, i) => word.name !== names[i].name)
      .map((word) => {
        const nearest = [...bar.notes].sort(
          (a, b) =>
            Math.abs(a.x + a.w / 2 - word.x) - Math.abs(b.x + b.w / 2 - word.x),
        )[0];
        return {
          id: crypto.randomUUID(),
          chordName: word.name,
          tick: nearest?.tick ?? null,
        };
      }),
  };
}
export function recognizedChord(
  bar: Pick<RecognizedBar, "chord" | "chordName">,
) {
  return bar.chord ?? CHORDS.find((c) => c.name === bar.chordName) ?? null;
}
export function recognizedChordAt(bar: RecognizedBar, tick: number | null) {
  const change = [...(bar.chordChanges ?? [])]
    .filter((c) => c.tick !== null && tick !== null && c.tick <= tick)
    .sort((a, b) => b.tick! - a.tick!)[0];
  return recognizedChord(change ?? bar);
}
export function recognizedFret(bar: RecognizedBar, note: RecognizedNote) {
  const fret =
    note.marker === "cross"
      ? recognizedChordAt(bar, note.tick)?.frets[note.stringIndex]
      : note.fret;
  return typeof fret === "number" &&
    Number.isInteger(fret) &&
    fret >= 0 &&
    fret <= 24
    ? fret
    : null;
}
export function recognitionIssues(draft: RecognitionDraft) {
  const problems: string[] = [];
  if (!draft.bars.length) problems.push("没有可加入的小节，请重新框选。");
  if (draft.bars.length > 8)
    problems.push("一次最多加入 8 个小节，请重新框选较短片段。");
  draft.bars.forEach((bar, i) => {
    if (bar.notes.length > 48)
      problems.push(`第 ${i + 1} 小节音符过多，请分成较短片段。`);
    if (!bar.notesConfirmed)
      problems.push(`第 ${i + 1} 小节的品位与弦位尚未核对`);
    if (!bar.rhythmConfirmed) problems.push(`第 ${i + 1} 小节的节奏尚未确认`);
    const changeTicks = new Set<number>();
    for (const change of bar.chordChanges ?? []) {
      if (
        change.tick === null ||
        !Number.isInteger(change.tick) ||
        change.tick <= 0 ||
        change.tick >= recognitionBeatCount(draft.meter) ||
        changeTicks.has(change.tick)
      )
        problems.push("第 " + (i + 1) + " 小节的换和弦拍点尚未确认或重复");
      else changeTicks.add(change.tick);
      if (!recognizedChord(change))
        problems.push("第 " + (i + 1) + " 小节请填写换和弦的按法");
    }
    const occupied = new Set<string>();
    for (const note of bar.notes) {
      if (
        !Number.isInteger(note.stringIndex) ||
        note.stringIndex < 0 ||
        note.stringIndex > 5
      )
        problems.push(`第 ${i + 1} 小节有无效的弦位`);
      if (recognizedFret(bar, note) === null)
        problems.push(
          note.marker === "cross"
            ? `第 ${i + 1} 小节的 × 需要对应弦的和弦按法，请选和弦或改为数字`
            : `第 ${i + 1} 小节还有待填写的品位`,
        );
      if (
        note.tick === null ||
        !Number.isInteger(note.tick) ||
        note.tick < 0 ||
        note.tick >= recognitionBeatCount(draft.meter)
      )
        problems.push(`第 ${i + 1} 小节还有待确定的拍点`);
      const key = note.tick + ":" + note.stringIndex;
      if (occupied.has(key))
        problems.push(`第 ${i + 1} 小节的同一弦、同一拍点有重复音符`);
      occupied.add(key);
    }
  });
  return [...new Set(problems)];
}
export function appendRecognizedSection(
  current: Arrangement,
  draft: RecognitionDraft,
): Arrangement {
  const issues = recognitionIssues(draft);
  if (issues.length) throw new Error(issues[0]);
  const count = current.sections.reduce((n, s) => n + s.bars.length, 0);
  if (current.sections.length >= 16 || count + draft.bars.length > 128)
    throw new Error(
      "当前编排已接近容量上限，请先整理段落或小节。识别草稿已保留。",
    );
  if (current.sections.length && current.meter !== draft.meter)
    throw new Error(
      `当前编排使用 ${current.meter}，请把识别草稿拍号调整为一致后再加入。`,
    );
  const section: ArrangementSection = {
    id: crypto.randomUUID(),
    label: `识别片段 · 第 ${draft.pageNumber} 页`,
    repeat: 1,
    bars: draft.bars.map((bar) => ({
      id: crypto.randomUUID(),
      pageId: draft.pageId,
      events: [
        { tick: 0, chord: recognizedChord(bar) },
        ...(bar.chordChanges ?? []).map((c) => ({
          tick: c.tick!,
          chord: recognizedChord(c),
        })),
      ]
        .sort((a, b) => a.tick - b.tick)
        .map((change, i, changes) => {
          const end = changes[i + 1]?.tick ?? recognitionBeatCount(draft.meter);
          return {
            id: crypto.randomUUID(),
            chord: change.chord,
            stroke: "pluck" as const,
            durationTicks: (end - change.tick) * 12,
            notes: bar.notes
              .filter((n) => n.tick! >= change.tick && n.tick! < end)
              .map((n) => ({
                offsetTick: (n.tick! - change.tick) * 12,
                stringIndex: n.stringIndex,
                fret: recognizedFret(bar, n)!,
                durationTicks: 12,
                ...(n.marker === "cross" ? { marker: "cross" as const } : {}),
              })),
          };
        }),
    })),
  };
  const next = {
    ...current,
    meter: current.sections.length ? current.meter : draft.meter,
    sections: [...current.sections, section],
  };
  if (!arrangementSchema.safeParse(next).success)
    throw new Error("请先补齐当前编排的时值，再加入识别片段。识别草稿已保留。");
  return next;
}

type Box = { x0: number; y0: number; x1: number; y1: number; count: number };
export type TabGeometry = {
  width: number;
  height: number;
  lines: number[];
  gap: number;
  boundaries: number[];
  gray: Uint8Array;
  ink: Uint8Array;
  glyphs: (Box & { stringIndex: number })[];
};
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
function runs(values: number[], threshold: number) {
  const found: { start: number; end: number; center: number }[] = [];
  for (let i = 0; i < values.length; i++)
    if (values[i] >= threshold) {
      const start = i;
      let weight = 0,
        position = 0;
      while (i < values.length && values[i] >= threshold) {
        weight += values[i];
        position += values[i] * i;
        i++;
      }
      found.push({ start, end: i - 1, center: position / weight });
    }
  return found;
}
export function analyseTabGeometry(image: ImageData): TabGeometry {
  const { width: w, height: h, data } = image;
  const gray = new Uint8Array(w * h),
    hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) {
    const a = data[i * 4 + 3] / 255;
    gray[i] = Math.round(
      (data[i * 4] * 0.299 +
        data[i * 4 + 1] * 0.587 +
        data[i * 4 + 2] * 0.114) *
        a +
        255 * (1 - a),
    );
    hist[gray[i]]++;
  }
  let bg = 255,
    total = 0;
  for (let i = 0; i < 256; i++) {
    total += hist[i];
    if (total >= gray.length * 0.85) {
      bg = i;
      break;
    }
  }
  const threshold = Math.max(95, bg - 30),
    rows = new Array<number>(h).fill(0);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (gray[y * w + x] < threshold) rows[y]++;
  const strongest = Math.max(...rows),
    peaks = runs(rows, Math.max(w * 0.4, strongest * 0.6));
  const groups: number[][] = [];
  for (let i = 0; i <= peaks.length - 6; i++) {
    const lines = peaks.slice(i, i + 6).map((p) => p.center),
      gaps = lines.slice(1).map((y, j) => y - lines[j]),
      gap = median(gaps);
    if (gap >= 5 && gaps.every((g) => Math.abs(g - gap) < gap * 0.22))
      groups.push(lines);
  }
  if (!groups.length)
    throw new Error(
      "没有找到完整的六条弦线。请框选清晰、水平的一行六线谱，并包含上下留白。暂不支持斜拍或手写谱。",
    );
  if (groups.length > 1)
    throw new Error("检测到多组六线谱。请一次只框选一行、1–4 个完整小节。");
  const lines = groups[0],
    gap = median(lines.slice(1).map((y, j) => y - lines[j]));
  const y0 = Math.ceil(lines[0]),
    y1 = Math.floor(lines[5]),
    columns = new Array<number>(w).fill(0);
  for (let x = 0; x < w; x++)
    for (let y = y0; y <= y1; y++)
      if (gray[y * w + x] < threshold) columns[x]++;
  // Stacked digits may cover most of a column; a real bar line is continuous.
  for (let x = 0; x < w; x++) {
    let longestGap = 0,
      currentGap = 0;
    for (let y = y0; y <= y1; y++) {
      currentGap = gray[y * w + x] < threshold ? 0 : currentGap + 1;
      longestGap = Math.max(longestGap, currentGap);
    }
    if (longestGap > Math.max(1, Math.floor(gap * 0.06))) columns[x] = 0;
  }
  const raw = runs(columns, (y1 - y0 + 1) * 0.97).map((r) => r.center),
    boundaries: number[] = [];
  for (const x of raw) {
    if (!boundaries.length || x - boundaries.at(-1)! > gap * 0.8)
      boundaries.push(x);
    else boundaries[boundaries.length - 1] = (boundaries.at(-1)! + x) / 2;
  }
  if (boundaries.length < 2)
    throw new Error(
      "没有找到完整的小节边界。请把左右小节线一起框入，再试一次。",
    );
  if (boundaries.length > 9)
    throw new Error("框选的小节过多，请缩小为一行中的 1–4 个小节。");
  if (boundaries.some((x, i) => i > 0 && x - boundaries[i - 1] < gap * 2))
    throw new Error("小节边界不够清晰，请换一张更清晰的图片或重新框选。");
  const lineValues: number[] = [];
  for (const y of lines)
    for (let x = 0; x < w; x += 3)
      if (gray[Math.round(y) * w + x] < threshold)
        lineValues.push(gray[Math.round(y) * w + x]);
  const lineGray = median(lineValues),
    digitThreshold = threshold;
  const ink = new Uint8Array(w * h);
  const minY = Math.max(0, Math.floor(lines[0] - gap * 1.1)),
    maxY = Math.min(h - 1, Math.ceil(lines[5] + gap * 0.7));
  for (let y = minY; y <= maxY; y++)
    for (let x = Math.floor(boundaries[0]) + 2; x < boundaries.at(-1)! - 1; x++)
      if (gray[y * w + x] < digitThreshold) ink[y * w + x] = 1;
  // Remove bar lines and long horizontal rules, keeping vertical strokes through digits.
  const thickness = Math.max(1, Math.ceil(gap * 0.07));
  for (const x of boundaries)
    for (let dx = -thickness; dx <= thickness; dx++)
      for (let y = minY; y <= maxY; y++) {
        const px = Math.round(x) + dx;
        if (px >= 0 && px < w) ink[y * w + px] = 0;
      }
  if (lineGray < threshold)
    for (const line of lines) {
      const ly = Math.round(line);
      for (let x = 1; x < w - 1; x++) {
        let run = 0;
        for (let dx = -Math.round(gap * 1.5); dx <= Math.round(gap * 1.5); dx++)
          if (x + dx >= 0 && x + dx < w && gray[ly * w + x + dx] < threshold)
            run++;
        if (run < gap * 2.5) continue;
        const above =
            gray[Math.max(0, ly - thickness - 2) * w + x] < digitThreshold,
          below =
            gray[Math.min(h - 1, ly + thickness + 2) * w + x] < digitThreshold;
        if (!above && !below)
          for (let dy = -thickness; dy <= thickness; dy++)
            if (ly + dy >= 0 && ly + dy < h) ink[(ly + dy) * w + x] = 0;
      }
    }
  const seen = new Uint8Array(w * h),
    stack: number[] = [],
    boxes: Box[] = [];
  for (let y = minY; y <= maxY; y++)
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (!ink[start] || seen[start]) continue;
      seen[start] = 1;
      stack.push(start);
      const box: Box = { x0: x, x1: x, y0: y, y1: y, count: 0 };
      while (stack.length) {
        const at = stack.pop()!,
          py = Math.floor(at / w),
          px = at % w;
        box.count++;
        box.x0 = Math.min(box.x0, px);
        box.x1 = Math.max(box.x1, px);
        box.y0 = Math.min(box.y0, py);
        box.y1 = Math.max(box.y1, py);
        for (const dy of [-1, 0, 1])
          for (const dx of [-1, 0, 1]) {
            const nx = px + dx,
              ny = py + dy;
            if (nx < 0 || nx >= w || ny < minY || ny > maxY) continue;
            const next = ny * w + nx;
            if (ink[next] && !seen[next]) {
              seen[next] = 1;
              stack.push(next);
            }
          }
      }
      const bh = box.y1 - box.y0 + 1,
        bw = box.x1 - box.x0 + 1;
      if (
        bh >= gap * 0.3 &&
        bh <= gap * 1.65 &&
        bw >= gap * 0.05 &&
        bw <= gap * 2.8 &&
        box.count >= gap * 0.3
      )
        boxes.push(box);
    }
  if (boxes.length > 256)
    throw new Error("片段包含太多细碎符号，请换清晰图片或缩小框选范围。");
  const assigned = boxes
    .map((b) => {
      const center = (b.y0 + b.y1) / 2 + gap * 0.22;
      let row = 0;
      for (let i = 1; i < 6; i++)
        if (Math.abs(lines[i] - center) < Math.abs(lines[row] - center))
          row = i;
      return { ...b, stringIndex: 5 - row };
    })
    .filter(
      (b) =>
        Math.abs((b.y0 + b.y1) / 2 + gap * 0.22 - lines[5 - b.stringIndex]) <
        gap * 0.52,
    );
  const glyphs: TabGeometry["glyphs"] = [];
  for (let stringIndex = 0; stringIndex < 6; stringIndex++) {
    const list = assigned
      .filter((b) => b.stringIndex === stringIndex)
      .sort((a, b) => a.x0 - b.x0);
    for (const b of list) {
      const previous = glyphs.at(-1);
      if (
        previous &&
        previous.stringIndex === stringIndex &&
        !boundaries.some((x) => x > previous.x1 && x < b.x0) &&
        b.x0 - previous.x1 < gap * 0.37 &&
        b.x1 - previous.x0 < gap * 1.9
      ) {
        previous.x1 = b.x1;
        previous.y0 = Math.min(previous.y0, b.y0);
        previous.y1 = Math.max(previous.y1, b.y1);
        previous.count += b.count;
      } else glyphs.push({ ...b });
    }
  }
  if (!glyphs.length)
    throw new Error(
      "找到弦线，但没有识别到可用的品位数字。请框选包含音符的片段。",
    );
  return { width: w, height: h, gray, ink, lines, gap, boundaries, glyphs };
}

export const recognitionBeatCount = (meter: Arrangement["meter"]) =>
  barTicks(meter) / 12;
