"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Square, Clock3, Minus, Plus } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { audioContext } from "@/lib/audio";
import { toast } from "sonner";
export function useMetronome() {
  const [bpm, setBpm] = useState(72),
    [running, setRunning] = useState(false),
    [beat, setBeat] = useState(-1),
    [beats, setBeats] = useState(4);
  const tempo = useRef(bpm),
    meter = useRef(beats);
  useEffect(() => {
    tempo.current = bpm;
    meter.current = beats;
  }, [bpm, beats]);
  useEffect(() => {
    if (!running) return;
    const ctx = audioContext(),
      gain = ctx.createGain();
    gain.gain.value = 0.2;
    gain.connect(ctx.destination);
    let next = ctx.currentTime + 0.06,
      index = 0;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const timer = setInterval(() => {
      while (next < ctx.currentTime + 0.12) {
        const osc = ctx.createOscillator(),
          env = ctx.createGain();
        osc.frequency.value = index === 0 ? 1200 : 800;
        env.gain.setValueAtTime(0.001, next);
        env.gain.exponentialRampToValueAtTime(1, next + 0.003);
        env.gain.exponentialRampToValueAtTime(0.001, next + 0.05);
        osc.connect(env);
        env.connect(gain);
        osc.start(next);
        osc.stop(next + 0.06);
        osc.onended = () => {
          osc.disconnect();
          env.disconnect();
        };
        const current = index;
        timeouts.push(
          setTimeout(
            () => setBeat(current),
            Math.max(0, (next - ctx.currentTime) * 1000),
          ),
        );
        next += 60 / tempo.current;
        index = (index + 1) % meter.current;
        while (timeouts.length > 20) timeouts.shift();
      }
    }, 25);
    return () => {
      clearInterval(timer);
      timeouts.forEach(clearTimeout);
      gain.disconnect();
    };
  }, [running]);
  async function toggle() {
    setBeat(-1);
    if (running) {
      setRunning(false);
      return;
    }
    try {
      await audioContext().resume();
      setRunning(true);
    } catch {
      toast.error("无法启动声音，请检查浏览器声音设置。");
    }
  }
  return { bpm, setBpm, running, beat, beats, setBeats, toggle };
}
export function MetronomeControls({
  compact = false,
  metronome,
}: {
  compact?: boolean;
  metronome: ReturnType<typeof useMetronome>;
}) {
  const { bpm, setBpm, running, beat, beats, setBeats, toggle } = metronome;
  return (
    <div className={"quick-practice " + (compact ? "metronome-compact" : "")}>
      <div className="section-line">
        <span>
          <Clock3 size={16} />
          节拍器
        </span>
        <button
          className="meter-button"
          aria-label="切换每小节拍数"
          onClick={() => setBeats((b) => (b === 4 ? 3 : b === 3 ? 6 : 4))}
        >
          {beats}/4
        </button>
      </div>
      <div className="tempo-stepper">
        <button
          className="icon-button"
          aria-label="减慢速度"
          disabled={bpm <= 30}
          onClick={() => setBpm((n) => n - 1)}
        >
          <Minus size={15} />
        </button>
        <div className="tempo-number">
          {bpm}
          <span>BPM</span>
        </div>
        <button
          className="icon-button"
          aria-label="加快速度"
          disabled={bpm >= 240}
          onClick={() => setBpm((n) => n + 1)}
        >
          <Plus size={15} />
        </button>
      </div>
      <Slider
        aria-label="节拍器速度"
        value={[bpm]}
        min={30}
        max={240}
        step={1}
        onValueChange={(v) => setBpm(v[0])}
      />
      <div className="beat-dots">
        {Array.from({ length: beats }, (_, i) => (
          <i key={i} className={beat === i ? "active" : ""} />
        ))}
      </div>
      <p>给每一次换和弦，留出时间。</p>
      <button className="button secondary-button" onClick={toggle}>
        {running ? (
          <Square size={14} fill="currentColor" />
        ) : (
          <Play size={15} />
        )}{" "}
        {running ? "停止节拍" : "开始节拍"}
      </button>
    </div>
  );
}

export default function Metronome({ compact = false }: { compact?: boolean }) {
  const metronome = useMetronome();
  return <MetronomeControls compact={compact} metronome={metronome} />;
}
