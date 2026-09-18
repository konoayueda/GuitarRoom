"use client";
import { durationLabel } from "@/lib/arrangement";
import { type barRhythm, type RhythmItem } from "@/lib/notation";
export default function RhythmNotation({
  rhythm,
  x,
  top,
}: {
  rhythm: ReturnType<typeof barRhythm>;
  x: (tick: number) => number;
  top: number;
}) {
  const y = (item: RhythmItem) => top + item.lane * 60;
  const groupFor = (item: RhythmItem) =>
    rhythm.beamGroups.find((group) => group.includes(item));
  return (
    <g className="score-rhythm-notation" aria-label="音符节奏">
      {rhythm.items.map((item, i) => {
        const px = x(item.tick),
          py = y(item),
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
              <text
                x={px}
                y={py + 26}
                textAnchor="middle"
                className="rhythm-custom"
              >
                {durationLabel(item.duration)}
              </text>
            ) : item.rest ? (
              <>
                {shape.base >= 48 ? (
                  <>
                    <line x1={px - 8} x2={px + 8} y1={py + 15} y2={py + 15} />
                    <rect
                      x={px - 6}
                      y={py + (shape.base === 96 ? 15 : 10)}
                      width="12"
                      height="5"
                    />
                  </>
                ) : shape.base === 24 ? (
                  <path
                    d={`M${px - 3} ${py + 5}l7 7-6 7 7 6q-10-5-7 7`}
                    fill="none"
                  />
                ) : (
                  <>
                    <path d={`M${px + 4} ${py + 8}l-6 22`} fill="none" />
                    {Array.from({ length: shape.beams }, (_, j) => (
                      <g key={j}>
                        <circle cx={px - 3} cy={py + 9 + j * 6} r="2.7" />
                        <path
                          d={`M${px - 3} ${py + 9 + j * 6}q5 3 7-1`}
                          fill="none"
                        />
                      </g>
                    ))}
                  </>
                )}
              </>
            ) : (
              <>
                <ellipse
                  cx={px}
                  cy={py + 27}
                  rx="5"
                  ry="3.7"
                  transform={`rotate(-18 ${px} ${py + 27})`}
                  className={shape.base >= 48 ? "rhythm-open" : "rhythm-filled"}
                />
                {shape.base < 96 && (
                  <line
                    className="rhythm-stem"
                    x1={px + 4}
                    x2={px + 4}
                    y1={py + 26}
                    y2={py + 3}
                  />
                )}
                {shape.beams > 0 &&
                  groupFor(item)?.length === 1 &&
                  Array.from({ length: shape.beams }, (_, j) => (
                    <path
                      className="rhythm-flag"
                      key={j}
                      d={`M${px + 4} ${py + 3 + j * 6}q13 7 5 16q5-9-5-12Z`}
                    />
                  ))}
              </>
            )}
            {shape &&
              Array.from({ length: shape.dots }, (_, j) => (
                <circle
                  className="rhythm-dot"
                  key={j}
                  cx={px + 10 + j * 5}
                  cy={py + 24}
                  r="1.8"
                />
              ))}
          </g>
        );
      })}
      {rhythm.beamGroups
        .filter((group) => group.length > 1)
        .map((group, gi) => (
          <g key={gi} data-beam-group={gi}>
            {group.flatMap((item, i) =>
              Array.from({ length: item.shape!.beams }, (_, level) => {
                const next = group[i + 1],
                  prev = group[i - 1],
                  py = y(item) + 3 + level * 6,
                  px = x(item.tick) + 4;
                if (next && next.shape!.beams > level)
                  return (
                    <line
                      className="rhythm-beam"
                      data-beam-level={level + 1}
                      key={i + ":" + level}
                      x1={px}
                      x2={x(next.tick) + 4}
                      y1={py}
                      y2={py}
                    />
                  );
                if (prev && prev.shape!.beams > level) return null;
                const direction = next ? 1 : -1;
                return (
                  <line
                    className="rhythm-beam"
                    data-beam-level={level + 1}
                    key={i + ":" + level}
                    x1={px}
                    x2={px + direction * 10}
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
          x1 = x(first.tick) - 8,
          x2 = x(last.tick) + 12,
          py = y(first) - 8,
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
                d={`M${x1} ${py + 5}v-5H${mid - 7}M${mid + 7} ${py}H${x2}v5`}
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
