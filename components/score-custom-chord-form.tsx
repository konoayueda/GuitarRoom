"use client";

import { useRef, useState, type FormEvent } from "react";
import type { Chord } from "@/lib/chords";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ScoreChordDiagram from "./score-chord-diagram";

export type ScoreCustomChordFormProps = {
  onSelect: (chord: Chord) => void;
  onCancel: () => void;
  disabled?: boolean;
  initialName?: string;
};

function parseFret(text: string) {
  const value = text.trim();
  if (!value) return -1;
  if (!/^\d+$/.test(value)) return;
  const fret = Number(value);
  if (!Number.isInteger(fret) || fret < 0 || fret > 24) return;
  return fret;
}

export function ScoreCustomChordForm({
  onSelect,
  onCancel,
  disabled = false,
  initialName = "",
}: ScoreCustomChordFormProps) {
  const [name, setName] = useState(() => initialName.slice(0, 40));
  const [frets, setFrets] = useState<string[]>(() => Array(6).fill(""));
  const [nameTouched, setNameTouched] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const composing = useRef(false);
  const chordName = name.trim();
  const parsed = frets.map(parseFret);
  const invalidFrets = parsed.some((fret) => fret === undefined);
  const hasSound = parsed.some((fret) => fret !== undefined && fret >= 0);
  const valid = !!chordName && !invalidFrets && hasSound;
  const preview: Chord = {
    name: chordName || "未命名和弦",
    frets: parsed.map((fret) => fret ?? -1),
    fingers: [0, 0, 0, 0, 0, 0],
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || composing.current) return;
    setAttempted(true);
    if (!valid) return;
    onSelect(structuredClone(preview));
  };

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-4"
      aria-label="自定义和弦按法"
      onSubmit={submit}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          (composing.current ||
            event.nativeEvent.isComposing ||
            event.nativeEvent.keyCode === 229)
        ) {
          event.preventDefault();
        }
      }}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <div className="space-y-2">
          <label className="block space-y-2 text-sm">
            <span className="flex items-center justify-between gap-2">
              <span className="font-medium">和弦名称</span>
              <span className="text-xs text-muted-foreground">
                {name.length} / 40
              </span>
            </span>
            <Input
              aria-label="自定义和弦名称"
              placeholder="填写你要显示在谱面上的名称"
              value={name}
              maxLength={40}
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              aria-invalid={(nameTouched || attempted) && !chordName}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => setNameTouched(true)}
            />
          </label>
          {(nameTouched || attempted) && !chordName && (
            <p className="text-xs text-destructive" role="alert">
              请填写和弦名称，不能只输入空格。
            </p>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            名称将显示在谱面和弦图上。
          </p>
        </div>
        <fieldset disabled={disabled} className="space-y-2">
          <legend className="mb-2 text-sm font-medium">
            六弦品位 · 6 弦 → 1 弦
          </legend>
          <p className="text-xs leading-relaxed text-muted-foreground">
            从最粗的 6 弦到最细的 1 弦。空白表示不弹，0 表示空弦，按弦填写
            1–24。
          </p>
          <div className="grid grid-cols-3 items-start gap-3 sm:grid-cols-6">
            {frets.map((value, index) => {
              const string = 6 - index;
              const invalid = parsed[index] === undefined;
              return (
                <label
                  key={string}
                  className="block min-w-0 space-y-1.5 text-sm"
                >
                  <span className="text-xs text-muted-foreground">
                    {string} 弦
                  </span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    aria-label={`自定义和弦第 ${string} 弦品位`}
                    aria-invalid={invalid}
                    value={value}
                    placeholder="不弹"
                    className="px-2 text-center font-mono"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) =>
                      setFrets((previous) =>
                        previous.map((fret, slot) =>
                          slot === index ? event.target.value : fret,
                        ),
                      )
                    }
                  />
                  {invalid && (
                    <span
                      className="block text-xs text-destructive"
                      role="alert"
                    >
                      填 0–24 的整数
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">按法预览</p>
          <svg
            viewBox="0 0 84 98"
            className="mx-auto h-36 w-32"
            role="img"
            aria-label={`${preview.name}，6 弦到 1 弦：${preview.frets.map((fret) => (fret < 0 ? "不弹" : `${fret} 品`)).join("、")}`}
            data-custom-chord-preview
            data-custom-chord-frets={preview.frets.join(",")}
          >
            <ScoreChordDiagram chord={preview} x={0} y={0} />
          </svg>
          {invalidFrets && (
            <p className="text-xs leading-relaxed text-destructive">
              非法品位暂按不弹预览，修正后才能加入谱面。
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0 space-y-3 border-t pt-3">
        <p
          className={
            "text-xs leading-relaxed " +
            (attempted && !valid ? "text-destructive" : "text-muted-foreground")
          }
          role="status"
          aria-live="polite"
        >
          {disabled
            ? "停止试听或等待保存完成后可编辑。"
            : invalidFrets
              ? "请先修正非法品位。"
              : !chordName
                ? "填写和弦名称，并至少选择一根要弹的弦。"
                : !hasSound
                  ? "至少一根弦需要填写 0–24；六根弦全不弹不能加入谱面。"
                  : "按法已就绪，加入后可继续在谱面上编排。"}
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            返回和弦库
          </Button>
          <Button type="submit" disabled={disabled || !valid}>
            加入谱面
          </Button>
        </div>
      </div>
    </form>
  );
}
