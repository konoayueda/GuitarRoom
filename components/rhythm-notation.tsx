"use client";
import { symbolHelp, rhythmExplanation } from "@/lib/score-symbols";
import { durationLabel } from "@/lib/arrangement";
import {
  type barRhythm,
  type RhythmItem,
  type RhythmShape,
} from "@/lib/notation";

export default function RhythmNotation({
  rhythm,
  x,
  staffTop,
  rowGap,
  staffStart = 26,
  staffEnd,
}: {
  rhythm: ReturnType<typeof barRhythm>;
  x: (tick: number) => number;
  staffTop: number;
  rowGap: number;
  staffStart?: number;
  staffEnd: number;
}) {
  const bottom = staffTop + 5 * rowGap;
  const beamY = (item: RhythmItem) => bottom + 34 + item.lane * 44;
  const stemX = (item: RhythmItem) => x(item.tick) + item.lane * 5;
  const noteY = (string: number) => staffTop + (5 - string) * rowGap;
  const groupFor = (item: RhythmItem) =>
    rhythm.beamGroups.find((g) => g.includes(item));
  return (
    <g
      className="score-rhythm-notation tab-integrated-rhythm"
      aria-label="六线谱符干与符杠"
    >
      {rhythm.items.map((item, i) => {
        const px = item.measureRest ? (staffStart + staffEnd) / 2 : stemX(item),
          py = beamY(item),
          shape = item.shape;
        const highest = item.rest ? 0 : noteY(Math.max(...item.strings)),
          lowest = item.rest ? 0 : noteY(Math.min(...item.strings));
        const restY = rhythm.lanes === 1 ? staffTop + 2 * rowGap : py - 14;
        const holdOffsets =
          shape && !shape.triplet && shape.base >= 48
            ? Array.from(
                { length: shape.base / 24 - 1 },
                (_, j) => (j + 1) * 24,
              )
            : [];
        return (
          <g
            key={i}
            data-rhythm-tick={item.tick}
            data-rhythm-duration={item.duration}
            data-rhythm-lane={item.lane}
            data-rhythm-rest={item.rest}
            data-measure-rest={item.measureRest || undefined}
          >
            {!shape ? (
              <text
                className="rhythm-custom"
                {...symbolHelp(
                  "自定义时值",
                  rhythmExplanation(item.duration),
                  20,
                )}
                x={px}
                y={py}
                textAnchor="middle"
              >
                {durationLabel(item.duration)}
              </text>
            ) : item.rest ? (
              <g
                className="tab-rest-symbol"
                {...symbolHelp(
                  item.measureRest ? "整小节休止" : "休止符",
                  item.measureRest
                    ? "整个小节不拨弦，休止时长按当前拍号计算。"
                    : rhythmExplanation(item.duration) + "这段时值不拨弦。",
                  30,
                )}
                transform={`translate(${px} ${restY})`}
              >
                {shape.base < 48 && (
                  <g className="notation-rest-halo" aria-hidden="true">
                    <RestGlyph shape={shape} />
                  </g>
                )}
                <RestGlyph shape={shape} />
                {Array.from({ length: shape.dots }, (_, j) => (
                  <circle
                    {...symbolHelp(
                      shape.dots === 2 ? "复附点休止" : "附点休止",
                      shape.dots === 2
                        ? "休止时长为原时值的 1.75 倍。"
                        : "休止时长为原时值的 1.5 倍。",
                      45,
                    )}
                    key={j}
                    cx={13 + j * 5}
                    cy="0"
                    r="1.8"
                  />
                ))}
              </g>
            ) : (
              <>
                {shape.triplet && shape.base >= 48 && (
                  <ellipse
                    className="tab-long-note"
                    {...symbolHelp(
                      "长时值三连音",
                      rhythmExplanation(item.duration) +
                        "结合下方三连音标记读谱。",
                      20,
                    )}
                    cx={x(item.tick)}
                    cy={lowest}
                    rx="12"
                    ry="10"
                  />
                )}
                {shape.base < 96 && (
                  <line
                    className="rhythm-stem"
                    {...symbolHelp(
                      item.strings.length > 1 ? "符干 · 同时拨弦" : "符干",
                      (item.strings.length > 1
                        ? "竖线连接的多个音在同一拍位同时拨响。"
                        : "符干与符尾、符杠一起表示音符时值。") +
                        rhythmExplanation(item.duration),
                      10,
                    )}
                    x1={px}
                    x2={px}
                    y1={highest + 9}
                    y2={py}
                    data-stem-note-y={highest}
                    data-stem-low-y={lowest}
                  />
                )}
                {holdOffsets.flatMap((offset) =>
                  item.strings.map((string) => (
                    <g
                      className="tab-sustain-mark"
                      {...symbolHelp(
                        "延时横线",
                        "继续保持前一个音，不在这条横线上重新拨弦。二分音符带一条延时横线，全音符带三条。",
                        35,
                      )}
                      data-hold-tick={item.tick + offset}
                      data-hold-string={6 - string}
                      key={offset + ":" + string}
                      transform={`translate(${x(item.tick + offset)} ${noteY(string)})`}
                    >
                      <rect
                        className="notation-knockout"
                        x="-9"
                        y="-5"
                        width="18"
                        height="10"
                      />
                      <line x1="-6" x2="6" y1="0" y2="0" />
                    </g>
                  )),
                )}
                {shape.beams > 0 &&
                  groupFor(item)?.length === 1 &&
                  Array.from({ length: shape.beams }, (_, j) => (
                    <path
                      key={j}
                      className="rhythm-flag"
                      {...symbolHelp(
                        "符尾",
                        `${shape.beams} 条符尾表示 ${durationLabel(shape.base)}。` +
                          rhythmExplanation(item.duration),
                        25,
                      )}
                      d={`M${px} ${py - j * 6}q13-7 5-16q5 9-5 12Z`}
                    />
                  ))}
                {Array.from({ length: shape.dots }, (_, j) => (
                  <circle
                    className="rhythm-dot"
                    {...symbolHelp(
                      shape.dots === 2 ? "复附点" : "附点",
                      shape.dots === 2
                        ? "在原时值上增加 1/2 和 1/4，总长为原来的 1.75 倍。"
                        : "在原时值上增加一半，总长为原来的 1.5 倍。",
                      45,
                    )}
                    key={j}
                    cx={px + 14 + j * 5}
                    cy={lowest - 2}
                    r="1.8"
                  />
                ))}
              </>
            )}
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
                      {...symbolHelp(
                        "符杠 · 节奏分组",
                        "一条符杠表示八分音符，两条表示十六分，三条表示三十二分。连接的音仍需逐个拨响；6/8 通常按三枚八分音符分组。",
                        25,
                      )}
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
                    {...symbolHelp(
                      "符杠 · 节奏分组",
                      "一条符杠表示八分音符，两条表示十六分，三条表示三十二分。连接的音仍需逐个拨响；6/8 通常按三枚八分音符分组。",
                      25,
                    )}
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
          <g
            {...symbolHelp(
              group.complete ? "三连音" : "三连音时值（未成完整组）",
              group.complete
                ? "三个等长时值占通常两个的时间，组内可以包含休止符。"
                : "3:2 表示连音比例；这里暂未形成完整的三个等长时值。",
              30,
            )}
            key={i}
            data-tuplet={group.complete ? "complete" : "partial"}
          >
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

function RestGlyph({ shape }: { shape: RhythmShape }) {
  if (shape.base >= 48)
    return (
      <>
        <line x1="-8" x2="8" y1="0" y2="0" />
        <rect x="-6" y={shape.base === 96 ? 0 : -6} width="12" height="6" />
      </>
    );
  if (shape.base === 24)
    return <path d="M-3 -14l7 7-6 7 7 6q-10-5-7 7" fill="none" />;
  return (
    <>
      <path d="M4 -11l-6 22" fill="none" />
      {Array.from({ length: shape.beams }, (_, j) => (
        <g key={j}>
          <circle cx="-3" cy={-10 + j * 6} r="2.7" />
          <path d={`M-3 ${-10 + j * 6}q5 3 7-1`} fill="none" />
        </g>
      ))}
    </>
  );
}
