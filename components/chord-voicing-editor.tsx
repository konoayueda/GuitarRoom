"use client";
import type { Chord } from "@/lib/chords";
export default function ChordVoicing({
  chord,
  onChange,
}: {
  chord: Chord;
  onChange: (chord: Chord) => void;
}) {
  return (
    <details className="chord-voicing-editor">
      <summary>核对原谱和弦按法</summary>
      <label>
        和弦名称
        <input
          aria-label="自定和弦名称"
          value={chord.name}
          maxLength={30}
          onChange={(e) => onChange({ ...chord, name: e.target.value })}
        />
      </label>
      <div className="chord-voicing-strings">
        {chord.frets.map((fret, i) => (
          <label key={i}>
            {6 - i} 弦
            <input
              aria-label={"和弦第 " + (6 - i) + " 弦品位"}
              inputMode="numeric"
              placeholder="不弹"
              value={fret < 0 ? "" : fret}
              onChange={(e) => {
                const text = e.target.value;
                if (
                  text === "" ||
                  (/^\d{1,2}$/.test(text) && Number(text) <= 24)
                )
                  onChange({
                    ...chord,
                    frets: chord.frets.map((n, j) =>
                      j === i ? (text === "" ? -1 : Number(text)) : n,
                    ),
                    fingers: [0, 0, 0, 0, 0, 0],
                  });
              }}
            />
          </label>
        ))}
      </div>
      <p>
        从六弦到一弦，0 为空弦，留空为不弹。×
        音符使用这里的按法；数字音符保持自己的品位。
      </p>
    </details>
  );
}
