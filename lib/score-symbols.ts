import { durationLabel } from "./arrangement";
export function symbolHelp(name: string, description: string, priority = 10) {
  return {
    "data-score-symbol": name,
    "data-score-explanation": description,
    "data-help-priority": priority,
  };
}
export function rhythmExplanation(ticks: number) {
  let a = ticks,
    b = 24;
  while (b) {
    [a, b] = [b, a % b];
  }
  const beats =
    ticks % 24 === 0 ? String(ticks / 24) : `${ticks / a}/${24 / a}`;
  return `${durationLabel(ticks)}，持续 ${beats} 个四分拍。`;
}
export function noteHelp(
  note: {
    stringIndex: number;
    fret: number;
    durationTicks: number;
    marker?: "cross";
    tieToNext?: boolean;
  },
  chordName?: string,
) {
  const string = 6 - note.stringIndex;
  const name =
    note.marker === "cross"
      ? "× 按和弦拨弦"
      : note.fret === 0
        ? "0 空弦"
        : `${note.fret} 品`;
  const action =
    note.marker === "cross"
      ? note.fret < 0
        ? "请先补全当前和弦在这根弦上的按法。"
        : `按好${chordName ? " " + chordName + " " : ""}和弦，拨响第 ${string} 弦（${note.fret === 0 ? "空弦" : note.fret + " 品"}）。`
      : `拨响第 ${string} 弦，${note.fret === 0 ? "左手不按品位" : "按第 " + note.fret + " 品（相对变调夹）"}。`;
  return symbolHelp(
    name,
    action +
      rhythmExplanation(note.durationTicks) +
      (note.tieToNext ? "与后一个同音相连，只在这里拨弦一次。" : ""),
    30,
  );
}
