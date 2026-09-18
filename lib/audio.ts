let context: AudioContext | null = null;
export function audioContext() {
  if (!context) context = new AudioContext();
  return context;
}
export function pluck(
  midi: number,
  when?: number,
  volume = 0.35,
  endAt?: number,
) {
  const ctx = audioContext();
  const frequency = 440 * 2 ** ((midi - 69) / 12),
    period = Math.max(2, Math.round(ctx.sampleRate / frequency));
  const startAt = when ?? ctx.currentTime;
  const rate = (frequency * (period - 0.5)) / ctx.sampleRate;
  const bufferSeconds =
    endAt === undefined ? 2 : Math.max(2, (endAt - startAt) * rate + 0.03);
  const buffer = ctx.createBuffer(
      1,
      Math.ceil(ctx.sampleRate * bufferSeconds),
      ctx.sampleRate,
    ),
    data = buffer.getChannelData(0);
  for (let i = 0; i < period; i++) data[i] = (Math.random() * 2 - 1) * 0.65;
  for (let i = period; i < data.length; i++)
    data[i] = 0.496 * (data[i - period] + data[i - period + 1]);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = (frequency * (period - 0.5)) / ctx.sampleRate;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(startAt);
  if (endAt !== undefined) {
    gain.gain.setValueAtTime(volume, Math.max(startAt, endAt - 0.025));
    gain.gain.linearRampToValueAtTime(0, Math.max(startAt + 0.001, endAt));
    source.stop(Math.max(startAt + 0.002, endAt + 0.01));
  }
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
  };
  return source;
}
export async function playChord(frets: number[], capo = 0, spread = 0.04) {
  const ctx = audioContext();
  await ctx.resume();
  const tuning = [40, 45, 50, 55, 59, 64];
  let count = 0;
  return frets.flatMap((f, i) =>
    f < 0
      ? []
      : [
          pluck(
            tuning[i] + f + capo,
            ctx.currentTime + 0.02 + count++ * spread,
          ),
        ],
  );
}
