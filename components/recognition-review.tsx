"use client";
import { useState } from "react";
import {
  ScanLine,
  Plus,
  Trash2,
  ArrowRight,
  Check,
  LoaderCircle,
  Crop,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Choice } from "./room-controls";
import ChordVoicing from "./chord-voicing-editor";
import { CHORDS } from "@/lib/chords";
import { type Arrangement } from "@/lib/arrangement";
import {
  recognitionIssues,
  recognizedFret,
  recognizedChord,
  recognitionBeatCount,
  type RecognitionDraft,
  type RecognizedBar,
  type RecognizedNote,
} from "@/lib/recognition";

export type RecognitionProgress = { message: string; value: number };
export default function RecognitionReview({
  open,
  onOpenChange,
  draft,
  onChange,
  onAppend,
  onReselect,
  onDiscard,
  progress,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft?: RecognitionDraft;
  onChange: (draft: RecognitionDraft) => void;
  onAppend: () => void;
  onReselect: () => void;
  onDiscard: () => void;
  progress?: RecognitionProgress;
  error?: string;
}) {
  const [barId, setBarId] = useState(""),
    [noteId, setNoteId] = useState("");
  const bar = draft?.bars.find((b) => b.id === barId) ?? draft?.bars[0];
  const index = draft?.bars.findIndex((b) => b.id === bar?.id) ?? 0;
  const selected = bar?.notes.find((n) => n.id === noteId) ?? bar?.notes[0];
  const limit = draft ? recognitionBeatCount(draft.meter) : 8;
  const issues = draft ? recognitionIssues(draft) : [];
  function patchBar(patch: Partial<RecognizedBar>) {
    if (draft && bar)
      onChange({
        ...draft,
        bars: draft.bars.map((b) => (b.id === bar.id ? { ...b, ...patch } : b)),
      });
  }
  function patchNote(patch: Partial<RecognizedNote>) {
    if (!bar || !selected) return;
    patchBar({
      notes: bar.notes.map((n) =>
        n.id === selected.id
          ? {
              ...n,
              ...patch,
              reviewed:
                patch.reviewed ??
                (patch.fret === null
                  ? false
                  : n.fret !== null || patch.fret !== undefined),
            }
          : n,
      ),
      notesConfirmed: false,
      ...(patch.tick !== undefined || patch.stringIndex !== undefined
        ? { rhythmConfirmed: false }
        : {}),
    });
  }
  function addNote() {
    if (!bar || bar.notes.length >= 48) return;
    const note: RecognizedNote = {
      id: crypto.randomUUID(),
      x: bar.x + bar.w / 2,
      y: 0.5,
      w: 0.012,
      h: 0.12,
      stringIndex: 0,
      fret: null,
      tick: null,
      confidence: 0,
      reviewed: false,
    };
    patchBar({
      notes: [...bar.notes, note],
      notesConfirmed: false,
      rhythmConfirmed: false,
    });
    setNoteId(note.id);
  }
  const choose = (id: string) => {
    setNoteId(id);
  };
  const tickLabel = (tick: number) =>
    draft?.meter === "6/8"
      ? `第 ${tick + 1} 个八分拍点`
      : `第 ${Math.floor(tick / 2) + 1} 拍${tick % 2 ? "后半" : ""}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="recognition-dialog">
        <DialogHeader>
          <DialogTitle>
            <ScanLine size={20} />
            片段识别与校正
          </DialogTitle>
          <DialogDescription>
            {progress
              ? "正在读取框选片段，原谱保持不变。"
              : "先对照原图核对音符与节奏，再加入可编辑谱面。"}
          </DialogDescription>
        </DialogHeader>
        {progress ? (
          <div className="recognition-working" role="status">
            <LoaderCircle size={30} className="spin" />
            <h3>{progress.message}</h3>
            <progress max={1} value={progress.value} />
            <p>在当前浏览器处理，曲谱图片不会发送到外部识别服务。</p>
            <button
              className="button secondary-button"
              onClick={() => onOpenChange(false)}
            >
              取消识别
            </button>
          </div>
        ) : error ? (
          <div className="recognition-error" role="alert">
            <ScanLine size={30} />
            <h3>这个片段暂时没有读出</h3>
            <p>{error}</p>
            <button className="button primary" onClick={onReselect}>
              <Crop size={16} />
              重新框选
            </button>
          </div>
        ) : draft && bar ? (
          <>
            <div className="recognition-controls">
              <div
                className="recognition-bars"
                role="group"
                aria-label="识别小节"
              >
                {draft.bars.map((b, i) => (
                  <button
                    key={b.id}
                    aria-pressed={b.id === bar.id}
                    aria-label={`核对第 ${i + 1} 小节`}
                    onClick={() => {
                      setBarId(b.id);
                      setNoteId("");
                    }}
                  >
                    {b.notesConfirmed && b.rhythmConfirmed ? (
                      <Check size={12} />
                    ) : (
                      <span>{i + 1}</span>
                    )}
                    第 {i + 1} 小节
                  </button>
                ))}
              </div>
              <Choice
                label="识别片段拍号"
                value={draft.meter}
                onChange={(v) =>
                  onChange({
                    ...draft,
                    meter: v as Arrangement["meter"],
                    bars: draft.bars.map((b) => ({
                      ...b,
                      rhythmConfirmed: false,
                      notes: b.notes.map((n) => ({
                        ...n,
                        tick:
                          n.tick !== null &&
                          n.tick <
                            recognitionBeatCount(v as Arrangement["meter"])
                            ? n.tick
                            : null,
                      })),
                    })),
                  })
                }
                options={["4/4", "3/4", "6/8"].map((v) => ({
                  value: v,
                  label: v,
                }))}
              />
            </div>
            <div className="recognition-body">
              <div className="recognition-compare">
                <section className="recognition-source">
                  <header>
                    <strong>原图片段</strong>
                    <span>
                      原谱第 {draft.pageNumber} 页 · 第 {index + 1} 小节
                    </span>
                  </header>
                  <svg
                    viewBox={`${Math.max(0, bar.x * draft.width - 8)} 0 ${bar.w * draft.width + 16} ${draft.height}`}
                    role="group"
                    aria-label="识别原图对照"
                  >
                    <defs>
                      <clipPath id={"source-crop-" + bar.id}>
                        <rect
                          x={Math.max(0, bar.x * draft.width - 8)}
                          y="0"
                          width={bar.w * draft.width + 16}
                          height={draft.height}
                        />
                      </clipPath>
                    </defs>
                    <g clipPath={"url(#source-crop-" + bar.id + ")"}>
                      <image
                        href={draft.image}
                        x="0"
                        y="0"
                        width={draft.width}
                        height={draft.height}
                      />
                      {bar.notes.map((n, i) => (
                        <g
                          key={n.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`原图音符 ${i + 1}，${n.fret ?? "待识别"} 品`}
                          onClick={() => choose(n.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              choose(n.id);
                            }
                          }}
                          className={
                            "recognition-box " +
                            (n.id === selected?.id ? "selected " : "") +
                            (!n.reviewed ? "uncertain" : "")
                          }
                        >
                          <rect
                            x={n.x * draft.width - 3}
                            y={n.y * draft.height - 3}
                            width={n.w * draft.width + 6}
                            height={n.h * draft.height + 6}
                            rx="2"
                          />
                        </g>
                      ))}
                    </g>
                  </svg>
                  <p>可能误读或漏读，请对照原图；点框校正数字。</p>
                </section>
                <section className="recognition-notation">
                  <header>
                    <strong>识别草稿</strong>
                    <span>{bar.notes.length} 个音符 · 点击数字校正</span>
                  </header>
                  <svg
                    viewBox="0 0 420 190"
                    role="group"
                    aria-label="识别草稿六线谱"
                  >
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <g key={i}>
                        <text
                          x="8"
                          y={45 + i * 23}
                          className="recognition-string"
                        >
                          {i + 1}
                        </text>
                        <line
                          x1="30"
                          x2="412"
                          y1={40 + i * 23}
                          y2={40 + i * 23}
                        />
                      </g>
                    ))}
                    {Array.from({ length: limit }, (_, tick) => (
                      <text
                        key={tick}
                        x={30 + ((tick + 0.5) * 382) / limit}
                        y="181"
                        textAnchor="middle"
                        className="recognition-beat"
                      >
                        {draft.meter === "6/8"
                          ? tick + 1
                          : tick % 2
                            ? "+"
                            : tick / 2 + 1}
                      </text>
                    ))}
                    {bar.notes
                      .filter((n) => n.tick !== null && n.tick < limit)
                      .map((n, i) => (
                        <g
                          key={n.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`草稿音符 ${i + 1}，${n.fret ?? "待填写"} 品，${6 - n.stringIndex} 弦`}
                          onClick={() => choose(n.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              choose(n.id);
                            }
                          }}
                          className={
                            "recognition-note " +
                            (n.id === selected?.id ? "selected " : "") +
                            (!n.reviewed ? "uncertain" : "")
                          }
                        >
                          <rect
                            x={30 + ((n.tick! + 0.5) * 382) / limit - 14}
                            y={40 + (5 - n.stringIndex) * 23 - 12}
                            width="28"
                            height="24"
                            rx="4"
                          />
                          <text
                            x={30 + ((n.tick! + 0.5) * 382) / limit}
                            y={46 + (5 - n.stringIndex) * 23}
                            textAnchor="middle"
                          >
                            {n.marker === "cross" ? "×" : (n.fret ?? "?")}
                          </text>
                        </g>
                      ))}
                  </svg>
                  {bar.notes.some((n) => n.tick === null) && (
                    <div className="recognition-unplaced">
                      待安排拍点：
                      {bar.notes
                        .filter((n) => n.tick === null)
                        .map((n) => (
                          <button key={n.id} onClick={() => choose(n.id)}>
                            {6 - n.stringIndex} 弦 · {n.fret ?? "?"} 品
                          </button>
                        ))}
                    </div>
                  )}
                </section>
              </div>
              <div className="recognition-note-editor">
                {selected ? (
                  <>
                    <span
                      className={
                        selected.reviewed
                          ? "recognition-known"
                          : "recognition-uncertain"
                      }
                    >
                      {selected.reviewed
                        ? "已读出 / 已校正"
                        : selected.marker === "cross"
                          ? recognizedFret(bar, selected) !== null
                            ? "× 按当前和弦：" +
                              recognizedFret(bar, selected) +
                              " 品"
                            : "× 需要选择对应的和弦按法"
                          : "数字把握不足，请核对"}
                    </span>
                    <label>
                      品位
                      <input
                        aria-label="识别音符品位"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="待填写"
                        value={
                          selected.marker === "cross"
                            ? "×"
                            : (selected.fret ?? "")
                        }
                        onChange={(e) => {
                          const text = e.target.value;
                          if (/^[xX×]$/.test(text))
                            patchNote({ marker: "cross", fret: null });
                          else if (text === "")
                            patchNote({
                              fret: null,
                              marker: undefined,
                              reviewed: false,
                            });
                          else if (/^\d{1,2}$/.test(text) && Number(text) <= 24)
                            patchNote({
                              fret: Number(text),
                              marker: undefined,
                            });
                        }}
                      />
                    </label>
                    <button
                      className={
                        "button " +
                        (selected.marker === "cross"
                          ? "primary"
                          : "secondary-button")
                      }
                      onClick={() => patchNote({ marker: "cross", fret: null })}
                    >
                      × 按和弦拨弦
                    </button>
                    <label>
                      弦位
                      <Choice
                        label="识别音符弦位"
                        value={String(selected.stringIndex)}
                        onChange={(v) => patchNote({ stringIndex: Number(v) })}
                        options={[5, 4, 3, 2, 1, 0].map((v) => ({
                          value: String(v),
                          label: `${6 - v} 弦`,
                        }))}
                      />
                    </label>
                    <label>
                      拍点
                      <Choice
                        label="识别音符拍点"
                        value={
                          selected.tick === null
                            ? "unknown"
                            : String(selected.tick)
                        }
                        onChange={(v) =>
                          patchNote({
                            tick: v === "unknown" ? null : Number(v),
                          })
                        }
                        options={[
                          { value: "unknown", label: "待确定" },
                          ...Array.from({ length: limit }, (_, v) => ({
                            value: String(v),
                            label: tickLabel(v),
                          })),
                        ]}
                      />
                    </label>
                    <button
                      className="button secondary-button"
                      onClick={() => {
                        patchBar({
                          notes: bar.notes.filter((n) => n.id !== selected.id),
                          notesConfirmed: false,
                          rhythmConfirmed: false,
                        });
                        setNoteId("");
                      }}
                    >
                      <Trash2 size={14} />
                      移除误识别
                    </button>
                  </>
                ) : (
                  <p>这一小节没有读到数字。可补入音符，或核对后确认为空拍。</p>
                )}
                <button
                  className="button secondary-button"
                  disabled={bar.notes.length >= 48}
                  onClick={addNote}
                >
                  <Plus size={14} />
                  补入音符
                </button>
              </div>
              <div className="recognition-confirm">
                <label className="recognition-chord">
                  和弦标记
                  <Choice
                    label="识别和弦标记"
                    value={
                      !bar.chordName
                        ? "none"
                        : CHORDS.some((c) => c.name === bar.chordName)
                          ? bar.chordName
                          : "custom"
                    }
                    onChange={(v) =>
                      patchBar({
                        chordName:
                          v === "none" ? "" : v === "custom" ? "自定和弦" : v,
                        chord:
                          v === "custom"
                            ? {
                                name: "自定和弦",
                                frets: [-1, -1, -1, -1, -1, -1],
                                fingers: [0, 0, 0, 0, 0, 0],
                              }
                            : undefined,
                        notesConfirmed: false,
                      })
                    }
                    options={[
                      { value: "none", label: "未填写（× 需和弦）" },
                      { value: "custom", label: "按原谱自定和弦" },
                      ...[...new Set(CHORDS.map((c) => c.name))].map(
                        (name) => ({ value: name, label: name }),
                      ),
                    ]}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={bar.notesConfirmed}
                    disabled={bar.notes.some(
                      (n) => recognizedFret(bar, n) === null,
                    )}
                    onChange={(e) =>
                      patchBar({
                        notesConfirmed: e.target.checked,
                        notes: bar.notes.map((n) => ({
                          ...n,
                          reviewed:
                            e.target.checked && recognizedFret(bar, n) !== null,
                        })),
                      })
                    }
                  />
                  {bar.notes.length
                    ? "已核对本小节的品位、弦位与和弦"
                    : "已确认这一小节为空拍"}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={bar.rhythmConfirmed}
                    disabled={bar.notes.some((n) => n.tick === null)}
                    onChange={(e) =>
                      patchBar({ rhythmConfirmed: e.target.checked })
                    }
                  />
                  已对照原谱确认本小节拍点
                </label>
              </div>
              <div className="recognition-harmony-changes">
                <header>
                  <strong>小节内换和弦</strong>
                  <button
                    className="button secondary-button"
                    disabled={(bar.chordChanges?.length ?? 0) >= limit - 1}
                    onClick={() =>
                      patchBar({
                        chordChanges: [
                          ...(bar.chordChanges ?? []),
                          {
                            id: crypto.randomUUID(),
                            tick: null,
                            chordName: "",
                          },
                        ],
                        notesConfirmed: false,
                        rhythmConfirmed: false,
                      })
                    }
                  >
                    添加换和弦
                  </button>
                </header>
                {(bar.chordChanges ?? []).map((change, i) => {
                  const update = (patch: Partial<typeof change>) =>
                    patchBar({
                      chordChanges: bar.chordChanges!.map((c) =>
                        c.id === change.id ? { ...c, ...patch } : c,
                      ),
                      notesConfirmed: false,
                      rhythmConfirmed: false,
                    });
                  return (
                    <div className="recognition-harmony-change" key={change.id}>
                      <span>第 {i + 1} 次换和弦</span>
                      <Choice
                        label={"换和弦 " + (i + 1) + " 的拍点"}
                        value={
                          change.tick === null ? "unknown" : String(change.tick)
                        }
                        onChange={(v) =>
                          update({ tick: v === "unknown" ? null : Number(v) })
                        }
                        options={[
                          { value: "unknown", label: "待确定拍点" },
                          ...Array.from({ length: limit - 1 }, (_, t) => ({
                            value: String(t + 1),
                            label: tickLabel(t + 1),
                          })),
                        ]}
                      />
                      <Choice
                        label={"换和弦 " + (i + 1) + " 的和弦"}
                        value={
                          CHORDS.some((c) => c.name === change.chordName)
                            ? change.chordName
                            : "custom"
                        }
                        onChange={(v) =>
                          update({
                            chordName: v === "custom" ? "自定和弦" : v,
                            chord:
                              v === "custom"
                                ? {
                                    name: "自定和弦",
                                    frets: [-1, -1, -1, -1, -1, -1],
                                    fingers: [0, 0, 0, 0, 0, 0],
                                  }
                                : undefined,
                          })
                        }
                        options={[
                          { value: "custom", label: "按原谱自定和弦" },
                          ...[...new Set(CHORDS.map((c) => c.name))].map(
                            (name) => ({ value: name, label: name }),
                          ),
                        ]}
                      />
                      <button
                        className="icon-button"
                        aria-label={"删除第 " + (i + 1) + " 次换和弦"}
                        onClick={() =>
                          patchBar({
                            chordChanges: bar.chordChanges!.filter(
                              (c) => c.id !== change.id,
                            ),
                            notesConfirmed: false,
                            rhythmConfirmed: false,
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                      {
                        <ChordVoicing
                          chord={
                            recognizedChord(change) ?? {
                              name: change.chordName || "自定和弦",
                              frets: [-1, -1, -1, -1, -1, -1],
                              fingers: [0, 0, 0, 0, 0, 0],
                            }
                          }
                          onChange={(chord) =>
                            update({ chord, chordName: chord.name })
                          }
                        />
                      }
                    </div>
                  );
                })}
              </div>
              {bar.chordName && (
                <ChordVoicing
                  chord={
                    recognizedChord(bar) ?? {
                      name: bar.chordName,
                      frets: [-1, -1, -1, -1, -1, -1],
                      fingers: [0, 0, 0, 0, 0, 0],
                    }
                  }
                  onChange={(chord) =>
                    patchBar({
                      chord,
                      chordName: chord.name,
                      notesConfirmed: false,
                    })
                  }
                />
              )}
              <p className="recognition-rhythm-hint">
                {bar.notes.some((n) => n.marker === "cross") &&
                  "× 按本小节选定和弦拨对应弦，数字使用明确品位；请核对和弦按法是否与原谱一致。"}
                拍点目前按音符列均匀分配，请确认或修改；暂不支持自动判断复杂节奏、十六分音符和三连音。
              </p>
            </div>
            <footer className="recognition-footer">
              <button className="button secondary-button" onClick={onReselect}>
                <Crop size={14} />
                重新框选
              </button>
              <button className="button secondary-button" onClick={onDiscard}>
                <Trash2 size={14} />
                丢弃草稿
              </button>
              <span>
                {issues.length
                  ? issues[0]
                  : "已核对全部小节，将追加为一个新段落。"}
              </span>
              <button
                className="button primary"
                disabled={issues.length > 0}
                onClick={onAppend}
              >
                加入编排
                <ArrowRight size={15} />
              </button>
            </footer>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
