"use client";
import { durationLabel } from "@/lib/arrangement";
import { type barRhythm, type RhythmItem } from "@/lib/notation";
export default function RhythmNotation({
  rhythm,
  x,
  staffTop,
  rowGap,
}: {
  rhythm: ReturnType<typeof barRhythm>;
  x: (tick: number) => number;
  staffTop: number;
  rowGap: number;
}) {
  const bottom = staffTop + 5 * rowGap;
  const beamY = (item: RhythmItem) => bottom + 34 + item.lane * 44;
  const stemX = (item: RhythmItem) => x(item.tick) + item.lane * 5;
  const noteY = (item: RhythmItem) =>
    staffTop + (5 - Math.min(...item.strings)) * rowGap;
  const groupFor = (item: RhythmItem) =>
    rhythm.beamGroups.find((g) => g.includes(item));
  return (
    <g
      className="score-rhythm-notation tab-integrated-rhythm"
      aria-label="六线谱符干与符杠"
    >
      {rhythm.items.map((item, i) => {
        const px = stemX(item),
          py = beamY(item),
          shape = item.shape;
        return (
          <g
            key={i}
            data-rhythm-tick={item.tick}
            data-rhythm-duration={item.duration}
            data-rhythm-lane={item.lane}
            data-rhythm-rest={item.rest}
          >
            <title>
              {item.rest
                ? "休止"
                : "第 " +
                  item.strings.map((s) => 6 - s).join("、") +
                  " 弦"}{" "}
              · {durationLabel(item.duration)}
            </title>
            {!shape ? (
              <text className="rhythm-custom" x={px} y={py} textAnchor="middle">
                {durationLabel(item.duration)}
              </text>
            ) : item.rest ? (
              <>
                {shape.base >= 48 ? (
                  <>
                    <line x1={px - 8} x2={px + 8} y1={py - 12} y2={py - 12} />
                    <rect
                      x={px - 6}
                      y={py - (shape.base === 96 ? 12 : 17)}
                      width="12"
                      height="5"
                    />
                  </>
                ) : shape.base === 24 ? (
                  <path
                    d={`M${px - 3} ${py - 28}l7 7-6 7 7 6q-10-5-7 7`}
                    fill="none"
                  />
                ) : (
                  <>
                    <path d={`M${px + 4} ${py - 25}l-6 22`} fill="none" />
                    {Array.from({ length: shape.beams }, (_, j) => (
                      <g key={j}>
                        <circle cx={px - 3} cy={py - 24 + j * 6} r="2.7" />
                        <path
                          d={`M${px - 3} ${py - 24 + j * 6}q5 3 7-1`}
                          fill="none"
                        />
                      </g>
                    ))}
                  </>
                )}
              </>
            ) : (
              <>
                {shape.base >= 48 && (
                  <ellipse
                    className="tab-long-note"
                    cx={x(item.tick)}
                    cy={noteY(item)}
                    rx="12"
                    ry="10"
                  />
                )}
                {shape.base < 96 && (
                  <line
                    className="rhythm-stem"
                    x1={px}
                    x2={px}
                    y1={noteY(item) + 9}
                    y2={py}
                    data-stem-note-y={noteY(item)}
                  />
                )}
                {shape.beams > 0 &&
                  groupFor(item)?.length === 1 &&
                  Array.from({ length: shape.beams }, (_, j) => (
                    <path
                      key={j}
                      className="rhythm-flag"
                      d={`M${px} ${py - j * 6}q13-7 5-16q5 9-5 12Z`}
                    />
                  ))}
              </>
            )}
            {shape &&
              Array.from({ length: shape.dots }, (_, j) => (
                <circle
                  className="rhythm-dot"
                  key={j}
                  cx={px + 14 + j * 5}
                  cy={item.rest ? py - 14 : noteY(item) - 2}
                  r="1.8"
                />
              ))}
          </g>
        );
      })}
      {rhythm.beamGroups
        .filter((g) => g.length > 1)
        .map((group, gi) => (
          <g key={gi} data-beam-group={gi}>
            {group.flatMap((item, i) =>
              Array.from({ length: item.shape!.beams }, (_, level) => {
                const next = group[i + 1],
                  prev = group[i - 1],
                  py = beamY(item) - level * 6,
                  px = stemX(item);
                if (next && next.shape!.beams > level)
                  return (
                    <line
                      key={i + ":" + level}
                      className="rhythm-beam"
                      data-beam-level={level + 1}
                      x1={px}
                      x2={stemX(next)}
                      y1={py}
                      y2={py}
                    />
                  );
                if (prev && prev.shape!.beams > level) return null;
                return (
                  <line
                    key={i + ":" + level}
                    className="rhythm-beam"
                    data-beam-level={level + 1}
                    x1={px}
                    x2={px + (next ? 1 : -1) * 10}
                    y1={py}
                    y2={py}
                  />
                );
              }),
            )}
          </g>
        ))}
      {rhythm.tuplets.map((group, i) => {
        const first = group.items[0],
          last = group.items.at(-1)!,
          x1 = stemX(first) - 8,
          x2 = stemX(last) + 12,
          py = beamY(first) + 16,
          mid = (x1 + x2) / 2;
        return (
          <g key={i} data-tuplet={group.complete ? "complete" : "partial"}>
            <title>
              {group.complete
                ? "三连音：三音占通常两音的时值"
                : "三连音中的单个时值"}
            </title>
            {group.complete && (
              <path
                className="rhythm-tuplet-bracket"
                d={`M${x1} ${py - 5}v5H${mid - 7}M${mid + 7} ${py}H${x2}v-5`}
                fill="none"
              />
            )}
            <text
              className="rhythm-tuplet-number"
              x={mid}
              y={py + 4}
              textAnchor="middle"
            >
              {group.complete ? "3" : "3:2"}
            </text>
          </g>
        );
      })}
    </g>
  );
}
