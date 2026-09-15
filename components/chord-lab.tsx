"use client";
import { useEffect, useRef, useState } from "react";
import {
  Play,
  Square,
  Heart,
  Plus,
  ArrowRight,
  Volume2,
  X,
  Bookmark,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CHORDS,
  NOTES,
  midiNotes,
  identify,
  transition,
  type Chord,
} from "@/lib/chords";
import { audioContext, playChord, pluck } from "@/lib/audio";
import { api, jsonBody, Choice } from "./room-controls";
import { toast } from "sonner";
type Saved = {
  id: string;
  name: string;
  frets: number[];
  note: string;
  capo: number;
};
export function ChordDiagram({
  frets,
  fingers = [],
  small = false,
}: {
  frets: number[];
  fingers?: number[];
  small?: boolean;
}) {
  const pressed = frets.filter((f) => f > 0),
    base =
      pressed.length && Math.max(...pressed) > 5 ? Math.min(...pressed) : 1;
  return (
    <svg
      className={small ? "chord-diagram small" : "chord-diagram"}
      viewBox="0 0 180 200"
      role="img"
      aria-label={
        "六弦到一弦按法：" + frets.map((f) => (f < 0 ? "不弹" : f)).join("，")
      }
    >
      <text x="9" y="63" fontSize="12" fill="#92816c">
        {base}fr
      </text>
      {[0, 1, 2, 3, 4, 5].map((s) => (
        <g key={s}>
          <line
            x1={40 + s * 23}
            y1="42"
            x2={40 + s * 23}
            y2="177"
            stroke="#b7a58b"
            strokeWidth={1.6 - s * 0.15}
          />
          <text
            x={40 + s * 23}
            y="195"
            textAnchor="middle"
            fill="#998974"
            fontSize="10"
          >
            {6 - s}
          </text>
          {frets[s] <= 0 ? (
            <text
              x={40 + s * 23}
              y="29"
              textAnchor="middle"
              fontSize="15"
              fill="#8e7256"
            >
              {frets[s] < 0 ? "×" : "○"}
            </text>
          ) : (
            <g>
              <circle
                cx={40 + s * 23}
                cy={42 + (frets[s] - base + 0.5) * 27}
                r="9"
                fill="#b9573d"
              />
              <text
                x={40 + s * 23}
                y={46 + (frets[s] - base + 0.5) * 27}
                fill="white"
                fontSize="9"
                textAnchor="middle"
              >
                {fingers[s] || ""}
              </text>
            </g>
          )}
        </g>
      ))}
      {[0, 1, 2, 3, 4, 5].map((f) => (
        <line
          key={f}
          x1="40"
          y1={42 + f * 27}
          x2="155"
          y2={42 + f * 27}
          stroke="#b7a58b"
          strokeWidth={f === 0 && base === 1 ? 4 : 1}
        />
      ))}
    </svg>
  );
}
export default function ChordLab({
  onBackToScore,
}: {
  onBackToScore?: () => void;
}) {
  const [mode, setMode] = useState("name"),
    [chosen, setChosen] = useState("C"),
    [variant, setVariant] = useState(0),
    [frets, setFrets] = useState<number[]>(CHORDS[0].frets),
    [capo, setCapo] = useState(0),
    [query, setQuery] = useState(""),
    [saving, setSaving] = useState(false),
    [saveOpen, setSaveOpen] = useState(false),
    [saveName, setSaveName] = useState(""),
    [saveNote, setSaveNote] = useState(""),
    [saved, setSaved] = useState<Saved[]>([]),
    [from, setFrom] = useState("C"),
    [to, setTo] = useState("Am"),
    [progression, setProgression] = useState<Chord[]>([]),
    [playing, setPlaying] = useState(false),
    [current, setCurrent] = useState(-1),
    [bpm, setBpm] = useState(72);
  const candidates = identify(frets, capo),
    midis = midiNotes(frets, capo),
    names = [...new Set(CHORDS.map((c) => c.name))];
  const variants = CHORDS.filter((c) => c.name === chosen),
    shape = variants[variant] || variants[0],
    guide = transition(
      CHORDS.find((c) => c.name === from)!,
      CHORDS.find((c) => c.name === to)!,
    );
  useEffect(() => {
    void api<Saved[]>("/api/fingerings")
      .then(setSaved)
      .catch(() => {});
  }, []);
  const pace = useRef(bpm);
  useEffect(() => {
    pace.current = bpm;
  }, [bpm]);
  useEffect(() => {
    if (!playing || !progression.length) return;
    let ended = false,
      timer: ReturnType<typeof setTimeout>,
      nodes: AudioBufferSourceNode[] = [];
    let i = 0;
    const tick = async () => {
      if (ended) return;
      setCurrent(i);
      try {
        nodes = await playChord(progression[i].frets, capo);
        if (ended) {
          nodes.forEach((n) => {
            try {
              n.stop();
            } catch {}
          });
          return;
        }
      } catch {
        setPlaying(false);
        toast.error("无法播放声音。");
        return;
      }
      i = (i + 1) % progression.length;
      timer = setTimeout(tick, 240000 / pace.current);
    };
    void tick();
    return () => {
      ended = true;
      clearTimeout(timer);
      nodes.forEach((n) => {
        try {
          n.stop();
        } catch {}
      });
      setCurrent(-1);
    };
  }, [playing, progression, capo]);
  function pick(name: string, n = 0) {
    setChosen(name);
    setVariant(n);
    setFrets(CHORDS.filter((c) => c.name === name)[n].frets);
  }
  async function audition() {
    try {
      await playChord(frets, capo);
    } catch {
      toast.error("无法播放声音，请检查浏览器声音设置。");
    }
  }
  async function save() {
    setSaving(true);
    try {
      const s = await api<Saved>("/api/fingerings", {
        method: "POST",
        ...jsonBody({
          id: "shape-" + frets.join("_") + "-" + capo,
          name: saveName.trim(),
          frets,
          capo,
          note: saveNote,
        }),
      });
      setSaved((old) => [s, ...old.filter((x) => x.id !== s.id)]);
      setSaveOpen(false);
      toast.success("这个按法已收藏");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="lab-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">EXPLORE THE FRETBOARD</div>
          <h1>
            和弦实验室<span className="title-dot">.</span>
          </h1>
          <p>找一个按法，听一种声音，再把它们连起来。</p>
        </div>
        {onBackToScore && (
          <button className="button secondary-button" onClick={onBackToScore}>
            返回曲谱
            <ArrowRight size={16} />
          </button>
        )}
      </div>
      <div className="lab-main">
        <section className="lab-board">
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="lab-tabs">
              <TabsTrigger value="name">按名称查指型</TabsTrigger>
              <TabsTrigger value="fret">点指板反查</TabsTrigger>
            </TabsList>
          </Tabs>
          {mode === "name" ? (
            <>
              <input
                className="chord-search"
                aria-label="搜索和弦名称"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索 C、Am、Fmaj7…"
              />
              <div className="chord-presets">
                {names
                  .filter((n) => n.toLowerCase().includes(query.toLowerCase()))
                  .map((n) => (
                    <button
                      className={chosen === n ? "active" : ""}
                      key={n}
                      onClick={() => pick(n)}
                    >
                      {n}
                    </button>
                  ))}
              </div>
              {!names.some((n) =>
                n.toLowerCase().includes(query.toLowerCase()),
              ) && (
                <p className="muted-text">
                  首版收录常用和弦；也可以切换到指板反查。
                </p>
              )}
              <div className="diagram-and-info">
                <ChordDiagram
                  frets={frets}
                  fingers={shape?.frets === frets ? shape.fingers : []}
                />
                <div>
                  <h3>{chosen}</h3>
                  <p>弦号从左到右为 6 → 1</p>
                  <p>○ 空弦 · × 不弹 · 圆点数字为手指</p>
                  <div className="variant-pills">
                    {variants.map((v, i) => (
                      <button
                        key={i}
                        className={variant === i ? "active" : ""}
                        onClick={() => pick(chosen, i)}
                      >
                        按法 {i + 1}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="fret-caption">逐弦选择品位，或设为空弦 / 不弹。</p>
              <div className="fret-scroll">
                <div className="fretboard">
                  {frets.map((f, s) => (
                    <div className="fret-row" key={s}>
                      <span>
                        {6 - s} 弦{" "}
                        <small>{["E", "A", "D", "G", "B", "E"][s]}</small>
                      </span>
                      {Array.from({ length: 14 }, (_, n) => n - 1).map((n) => (
                        <button
                          aria-label={
                            6 -
                            s +
                            "弦" +
                            (n === -1 ? "不弹" : n === 0 ? "空弦" : n + "品")
                          }
                          aria-pressed={n === f}
                          className={n === f ? "active" : ""}
                          key={n}
                          onClick={() =>
                            setFrets((old) =>
                              old.map((v, i) => (i === s ? n : v)),
                            )
                          }
                        >
                          {n === -1 ? "×" : n === 0 ? "○" : n}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <button
                className="text-button"
                onClick={() => setFrets([-1, -1, -1, -1, -1, -1])}
              >
                清空指板
              </button>
            </>
          )}
          <div className="lab-settings">
            <label>
              变调夹
              <Choice
                label="和弦变调夹"
                value={String(capo)}
                onChange={(v) => setCapo(Number(v))}
                options={Array.from({ length: 13 }, (_, i) => ({
                  value: String(i),
                  label: i === 0 ? "不使用" : i + " 品",
                }))}
              />
            </label>
            <span>品位相对变调夹计算</span>
          </div>
        </section>
        <aside className="chord-result">
          <span className="eyebrow">当前发声</span>
          <h2>
            {candidates[0]?.name ||
              (midis.length === 1 ? NOTES[midis[0] % 12] : "—")}
          </h2>
          <p>
            {candidates[0]?.label ||
              (midis.length ? "暂未匹配到常见和弦" : "选择指型开始探索")}
          </p>
          <div className="note-chips">
            {[...new Set(midis.map((n) => n % 12))].map((n) => (
              <button
                key={n}
                aria-label={"试听" + NOTES[n]}
                onClick={async () => {
                  try {
                    await audioContext().resume();
                    pluck(midis.find((m) => m % 12 === n)!);
                  } catch {
                    toast.error("无法播放声音");
                  }
                }}
              >
                {NOTES[n]}
              </button>
            ))}
          </div>
          <span className="notes-help">点击音名，听组成音</span>
          <button
            className="button primary full-width"
            disabled={!midis.length}
            onClick={audition}
          >
            <Volume2 size={17} />
            试听和弦
          </button>
          <button
            className="button secondary-button full-width"
            disabled={!candidates.length}
            onClick={() => {
              setSaveName(candidates[0]?.name || chosen);
              setSaveNote("");
              setSaveOpen(true);
            }}
          >
            <Heart size={16} />
            收藏这个按法
          </button>
          {candidates.length > 1 && (
            <div className="other-names">
              同音组还可以叫：
              {candidates
                .slice(1)
                .map((c) => c.name)
                .join("、")}
            </div>
          )}
          <button
            className="text-button"
            disabled={!candidates.length || progression.length >= 8}
            onClick={() =>
              setProgression((p) => [
                ...p,
                {
                  name: candidates[0]?.name || chosen,
                  frets: [...frets],
                  fingers: [],
                },
              ])
            }
          >
            <Plus size={15} />
            加入练习进行
          </button>
        </aside>
      </div>
      <section className="transition-panel">
        <div>
          <div className="eyebrow">ONE CHANGE AT A TIME</div>
          <h2>下一步，怎么换？</h2>
          <p>对照两种常用指法，先找到可以保留的位置。</p>
        </div>
        <div className="transition-pickers">
          <Choice
            label="起始和弦"
            value={from}
            onChange={setFrom}
            options={names.map((n) => ({ value: n, label: n }))}
          />
          <ArrowRight size={18} />
          <Choice
            label="目标和弦"
            value={to}
            onChange={setTo}
            options={names.map((n) => ({ value: n, label: n }))}
          />
        </div>
        <div className="transition-detail">
          <div className="mini-chord">
            <strong>{from}</strong>
            <ChordDiagram
              frets={CHORDS.find((c) => c.name === from)!.frets}
              fingers={CHORDS.find((c) => c.name === from)!.fingers}
              small
            />
          </div>
          <ArrowRight size={20} />
          <div className="mini-chord">
            <strong>{to}</strong>
            <ChordDiagram
              frets={CHORDS.find((c) => c.name === to)!.frets}
              fingers={CHORDS.find((c) => c.name === to)!.fingers}
              small
            />
          </div>
          <div className="transition-instructions">
            <span className="guide-label">可以保留</span>
            <p>
              {guide.held.length
                ? guide.held
                    .map(
                      (h) =>
                        ["", "食指", "中指", "无名指", "小指"][h.finger] +
                        "：" +
                        h.string +
                        " 弦 " +
                        h.fret +
                        " 品",
                    )
                    .join("；")
                : "这两个指型没有保持同一指法的位置。"}
            </p>
            <span className="guide-label">需要准备</span>
            <p>
              {guide.moving.length
                ? guide.moving
                    .map((f) => ["", "食指", "中指", "无名指", "小指"][f])
                    .join("、") + "移向目标指型。"
                : "手指已在目标位置，留意发声与闷音。"}{" "}
              实际落指时机还要结合下一拍的拨弦顺序。
            </p>
            <small>
              当前为手动指型对照；根据曲谱自动安排落指顺序将在后续加入。
            </small>
          </div>
        </div>
      </section>
      <section className="progression-panel">
        <div className="section-heading">
          <h2>我的和弦进行</h2>
          <span>最多 8 个和弦 · 每个和弦 4 拍</span>
        </div>
        <div className="progression-slots">
          {progression.length ? (
            progression.map((ch, i) => (
              <div key={i} className={current === i ? "playing" : ""}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <strong>{ch.name}</strong>
                <button
                  aria-label={"移除进行中的第" + (i + 1) + "个和弦"}
                  onClick={() => {
                    setPlaying(false);
                    setProgression((p) => p.filter((_, n) => n !== i));
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            ))
          ) : (
            <p className="muted-text">
              在上方找到喜欢的和弦，点击「加入练习进行」。
            </p>
          )}
        </div>
        <div className="progression-controls">
          <label>
            速度
            <input
              type="number"
              min={30}
              max={240}
              aria-label="和弦进行速度"
              value={bpm}
              onChange={(e) =>
                setBpm(
                  Math.max(30, Math.min(240, Number(e.target.value) || 72)),
                )
              }
            />
            BPM
          </label>
          <button
            className="button primary"
            disabled={!progression.length}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? <Square size={15} /> : <Play size={15} />}{" "}
            {playing ? "停止循环" : "循环试听"}
          </button>
        </div>
      </section>
      {saved.length > 0 && (
        <section className="saved-shapes">
          <h2>
            <Bookmark size={18} />
            我的指型收藏
          </h2>
          <div>
            {saved.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setMode("fret");
                  setFrets(s.frets);
                  setCapo(s.capo);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <strong>{s.name}</strong>
                <span>{s.frets.map((f) => (f < 0 ? "×" : f)).join(" · ")}</span>
                <small>{s.note || "Capo " + s.capo}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>收藏这个按法</DialogTitle>
            <DialogDescription>
              保留具体品位和变调夹位置，再写一句自己的备注。
            </DialogDescription>
          </DialogHeader>
          <div className="form-grid">
            <label className="span-two">
              名称
              <input
                value={saveName}
                maxLength={60}
                onChange={(e) => setSaveName(e.target.value)}
              />
            </label>
            <label className="span-two">
              指法备注
              <textarea
                value={saveNote}
                maxLength={500}
                onChange={(e) => setSaveNote(e.target.value)}
                placeholder="例如：副歌用这个，接 G 更顺手。"
              />
            </label>
          </div>
          <button
            className="button primary"
            disabled={saving || !saveName.trim()}
            onClick={save}
          >
            {saving ? "保存中…" : "保存按法"}
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
