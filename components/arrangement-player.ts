"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { audioContext, pluck } from "@/lib/audio";
import {
  buildPlayback,
  buildPlaybackAttacks,
  tickSeconds,
  type Arrangement,
  type PlaybackEvent,
  type PlaybackPlan,
} from "@/lib/arrangement";

export type PlaybackPosition = {
  event: PlaybackEvent;
  tickInBar: number;
  loopPass: number;
};
export function startArrangementAudio(
  plan: PlaybackPlan,
  arrangement: Arrangement,
  capo: number,
  loop: boolean,
  onPosition: (p: PlaybackPosition) => void,
  onEnd: () => void,
) {
  const ctx = audioContext(),
    seconds = tickSeconds(arrangement.bpm),
    startAt = ctx.currentTime + 0.07;
  const sources = new Set<AudioBufferSourceNode>();
  const notes = buildPlaybackAttacks(plan, arrangement, capo);
  let cursor = 0,
    pass = 0,
    last = -1,
    frame = 0,
    closed = false;
  function add(midi: number, at: number, end: number) {
    const source = pluck(midi, at, 0.26, end);
    sources.add(source);
    source.addEventListener("ended", () => sources.delete(source), {
      once: true,
    });
  }
  function schedule() {
    if (!notes.length) return;
    const now = ctx.currentTime;
    while (true) {
      if (cursor >= notes.length) {
        if (!loop) return;
        cursor = 0;
        pass++;
      }
      const note = notes[cursor],
        at = startAt + (pass * plan.totalTicks + note.startTick) * seconds;
      if (at >= now + 0.12) return;
      if (at >= now - 0.025) {
        const end = at + note.gateTicks * seconds;
        const start =
          Math.max(now, at) +
          Math.min(
            note.delaySeconds,
            Math.max(0, (end - Math.max(now, at)) * 0.5),
          );
        if (end > start) add(note.midi, start, end);
      }
      cursor++;
    }
  }
  const timer = setInterval(schedule, 25);
  function close() {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    cancelAnimationFrame(frame);
    for (const source of sources) {
      try {
        source.stop();
      } catch {}
    }
    sources.clear();
  }
  function paint() {
    if (closed) return;
    const absolute = Math.floor((ctx.currentTime - startAt) / seconds);
    if (!loop && absolute >= plan.totalTicks) {
      close();
      onEnd();
      return;
    }
    if (absolute >= 0 && absolute !== last) {
      last = absolute;
      const tick = absolute % plan.totalTicks;
      const entry = plan.events.find(
        (e) => tick >= e.startTick && tick < e.endTick,
      );
      if (entry)
        onPosition({
          event: entry,
          tickInBar: tick - entry.bar.startTick,
          loopPass: Math.floor(absolute / plan.totalTicks) + 1,
        });
    }
    frame = requestAnimationFrame(paint);
  }
  schedule();
  frame = requestAnimationFrame(paint);
  return close;
}
export function useArrangementPlayer(
  arrangement: Arrangement,
  capo: number,
  active: boolean,
  range: { from: string; to: string } | undefined,
  loop: boolean,
  stopWhen = false,
) {
  const [playing, setPlaying] = useState(false),
    [position, setPosition] = useState<PlaybackPosition | null>(null);
  const dispose = useRef<(() => void) | null>(null),
    generation = useRef(0);
  const stop = useCallback(() => {
    generation.current++;
    dispose.current?.();
    dispose.current = null;
    setPlaying(false);
    setPosition(null);
  }, []);
  useEffect(() => {
    // Changes to the score or transport invalidate scheduled browser audio.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    stop();
    return () => {
      // This is a cancellation counter, not a mounted DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      dispose.current?.();
      dispose.current = null;
    };
  }, [arrangement, capo, active, range?.from, range?.to, loop, stop]);
  useEffect(() => {
    // Starting the metronome stops any independently scheduled arrangement audio.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stopWhen) stop();
  }, [stopWhen, stop]);
  async function play() {
    stop();
    const run = generation.current;
    const plan = buildPlayback(arrangement, range);
    if (!plan.totalTicks || !active) return;
    await audioContext().resume();
    if (run !== generation.current) return;
    setPlaying(true);
    dispose.current = startArrangementAudio(
      plan,
      arrangement,
      capo,
      loop,
      setPosition,
      () => {
        dispose.current = null;
        setPlaying(false);
        setPosition(null);
      },
    );
  }
  return { playing, position, play, stop };
}
