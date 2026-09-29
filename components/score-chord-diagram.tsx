import type { Chord } from "@/lib/chords";
/** Compact print-style fingering, aligned with its change of harmony. */
export default function ScoreChordDiagram({
  chord,
  x,
  y,
}: {
  chord: Chord;
  x: number;
  y: number;
}) {
  const pressed = chord.frets.filter((f) => f > 0),
    low = pressed.length ? Math.min(...pressed) : 1,
    high = pressed.length ? Math.max(...pressed) : 1;
  const base = high <= 4 ? 1 : low,
    rows = Math.max(4, high - base + 1),
    dy = 52 / rows;
  return (
    <g
      className="score-chord-diagram"
      transform={`translate(${x} ${y})`}
      data-chord-name={chord.name}
      role="img"
      aria-label={
        chord.name +
        "，六弦到一弦：" +
        chord.frets.map((f) => (f < 0 ? "不弹" : f + "品")).join("、")
      }
    >
      <title>
        {chord.name} · {chord.frets.map((f) => (f < 0 ? "×" : f)).join(" ")}
      </title>
      <text
        className="score-chord-name"
        x="42"
        y="16"
        textAnchor="middle"
        textLength={chord.name.length > 9 ? 82 : undefined}
        lengthAdjust="spacingAndGlyphs"
      >
        {chord.name}
      </text>
      {base > 1 && (
        <text className="score-chord-position" x="0" y={36 + dy / 2 + 3}>
          {base}
        </text>
      )}
      {[0, 1, 2, 3, 4, 5].map((s) => (
        <line key={s} x1={12 + s * 12} x2={12 + s * 12} y1="36" y2="88" />
      ))}
      {Array.from({ length: rows + 1 }, (_, i) => (
        <line
          key={i}
          x1="12"
          x2="72"
          y1={36 + i * dy}
          y2={36 + i * dy}
          strokeWidth={i === 0 && base === 1 ? 2.5 : 1}
        />
      ))}
      {chord.frets.map((f, s) =>
        f < 0 ? (
          <path key={s} d={`M${9 + s * 12} 25l6 6m-6 0l6-6`} />
        ) : f === 0 ? (
          <circle
            key={s}
            className="score-chord-open"
            cx={12 + s * 12}
            cy="28"
            r="3.2"
          />
        ) : (
          <circle
            key={s}
            className="score-chord-dot"
            cx={12 + s * 12}
            cy={36 + (f - base + 0.5) * dy}
            r={Math.min(4, dy * 0.38)}
          />
        ),
      )}
    </g>
  );
}
