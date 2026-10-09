import type { Arrangement } from "@/lib/arrangement";
import { symbolHelp } from "@/lib/score-symbols";

/** Space before the first measure; the staff continues into that measure. */
export const SCORE_STAFF_START_WIDTH = 120;

export default function ScoreStaffStart({
  meter,
  vocalKey = "C",
  staffTop,
  staffBottom,
  vocalTop,
  showVocal,
  firstSystem,
}: {
  meter: Arrangement["meter"];
  vocalKey?: Arrangement["vocalKey"];
  staffTop: number;
  staffBottom: number;
  vocalTop: number;
  showVocal: boolean;
  firstSystem: boolean;
}) {
  const [numerator, denominator] = meter.split("/");
  const height = staffBottom - staffTop;
  const center = (staffTop + staffBottom) / 2;
  const keyY = showVocal ? vocalTop + 48 : staffBottom + 68;
  const bracketTop = staffTop - 12;
  const bracketBottom = firstSystem ? keyY + 14 : staffBottom + 18;
  const meterExplanation =
    meter === "6/8"
      ? "上方 6 表示每小节有六个八分音符单位，下方 8 表示以八分音符为单位。通常分成两组，每组三个八分音符。"
      : `上方 ${numerator} 表示每小节有 ${numerator} 拍，下方 ${denominator} 表示以四分音符为一拍。`;

  return (
    <g
      className="score-staff-start"
      data-staff-start="true"
      data-staff-start-first={firstSystem}
      fill="#171717"
      stroke="#171717"
    >
      <path
        {...symbolHelp(
          "谱表起始括线",
          "标示这一行谱表的开始，并在组合谱表中表示声部的关联。它是排版标记，不是反复符号，也不改变音符时值。",
          20,
        )}
        d={`M24 ${bracketTop} Q24 ${bracketTop + 10} 12 ${bracketTop + 12} V${bracketBottom - 12} Q24 ${bracketBottom - 10} 24 ${bracketBottom}`}
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        role="img"
        aria-label="谱表起始括线"
        tabIndex={0}
      />
      <line
        x1="26"
        x2="26"
        y1={staffTop}
        y2={bracketBottom - 8}
        strokeWidth="1.2"
      />
      {Array.from({ length: 6 }, (_, row) => (
        <line
          key={row}
          x1="26"
          x2={SCORE_STAFF_START_WIDTH + 26}
          y1={staffTop + (row * height) / 5}
          y2={staffTop + (row * height) / 5}
          strokeWidth="1.2"
        />
      ))}
      <g
        {...symbolHelp(
          "TAB · 吉他六线谱",
          "TAB 是 tablature（指法谱）的缩写。六条线分别对应六根弦，从上到下是 1 弦到 6 弦；线上数字表示所按品位，不是唱音的音高数字。",
          20,
        )}
        stroke="none"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="30"
        textAnchor="middle"
        role="img"
        aria-label="TAB，吉他六线谱"
        data-tab-clef="true"
        tabIndex={0}
      >
        {["T", "A", "B"].map((letter, index) => (
          <text key={letter} x="51" y={center - 30 + index * 30 + 10}>
            {letter}
          </text>
        ))}
      </g>
      {firstSystem && (
        <>
          <g
            {...symbolHelp(`${meter} 拍号`, meterExplanation, 20)}
            stroke="none"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize="36"
            textAnchor="middle"
            role="img"
            aria-label={`${meter} 拍号`}
            data-time-signature={meter}
            tabIndex={0}
          >
            <text x="94" y={center - 4}>
              {numerator}
            </text>
            <text x="94" y={center + 33}>
              {denominator}
            </text>
          </g>
          <text
            {...symbolHelp(
              `1 = ${vocalKey} · 唱音调号`,
              `简谱中的 1（do）以 ${vocalKey} 为音高基准。它决定唱音数字的实际音高，不表示变调夹位置，也不单凭这一标记判断歌曲是大调或小调。可在唱音设置中修改。`,
              20,
            )}
            x="73"
            y={keyY}
            stroke="none"
            fontFamily="Arial, sans-serif"
            fontSize="22"
            textAnchor="middle"
            role="img"
            aria-label={`唱音调号，1 等于 ${vocalKey}`}
            data-vocal-key={vocalKey}
            tabIndex={0}
          >
            1 = {vocalKey}
          </text>
        </>
      )}
    </g>
  );
}
