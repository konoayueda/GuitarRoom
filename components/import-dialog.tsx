"use client";
import { useState, useRef } from "react";
import {
  Upload,
  FileText,
  ImageIcon,
  ArrowUp,
  ArrowDown,
  X,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Choice, api } from "./room-controls";
import { toast } from "sonner";
import type { Score } from "@/lib/models";
export default function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onImported: (s: Score) => void;
}) {
  const [files, setFiles] = useState<File[]>([]),
    [title, setTitle] = useState(""),
    [artist, setArtist] = useState(""),
    [key, setKey] = useState("C"),
    [capo, setCapo] = useState(0),
    [tags, setTags] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  function choose(list: File[]) {
    setError("");
    const next = [...files, ...list];
    if (
      next.length > 20 ||
      next.some(
        (f) =>
          ![
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",
          ].includes(f.type),
      )
    ) {
      setError("请选择最多 20 张 JPG、PNG、WebP 图片，或一份 PDF。");
      return;
    }
    if (next.some((f) => f.type === "application/pdf") && next.length > 1) {
      setError("PDF 请单独导入；多张图片可以组成一份谱。");
      return;
    }
    if (
      next.some((f) => f.size > 20 * 1024 * 1024) ||
      next.reduce((s, f) => s + f.size, 0) > 40 * 1024 * 1024
    ) {
      setError("单文件最多 20 MB，总计最多 40 MB。");
      return;
    }
    setFiles(next);
    if (!title && next.length) setTitle(next[0].name.replace(/\.[^.]+$/, ""));
  }
  function reorder(i: number, d: number) {
    setFiles((old) => {
      const copy = [...old];
      [copy[i], copy[i + d]] = [copy[i + d], copy[i]];
      return copy;
    });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) return;
    setBusy(true);
    setError("");
    try {
      let pdfPages = 1;
      if (files[0].type === "application/pdf") {
        const { countPdf } = await import("@/lib/pdf");
        try {
          pdfPages = await countPdf(files[0]);
        } catch {
          throw new Error(
            "这份 PDF 无法读取，可能已加密或损坏。请先解锁或另存后重试。",
          );
        }
        if (pdfPages > 200)
          throw new Error("每份曲谱最多 200 页，请先拆分 PDF。");
      }
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      form.append("pdfPages", String(pdfPages));
      form.append(
        "metadata",
        JSON.stringify({
          title: title.trim(),
          artist: artist.trim(),
          key,
          capo,
          tuning: "E A D G B E",
          tags: tags
            .split(/[,，]/)
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      );
      const score = await api<Score>("/api/scores", {
        method: "POST",
        body: form,
      });
      onImported(score);
      onOpenChange(false);
      setFiles([]);
      setTitle("");
      setArtist("");
      setTags("");
      toast.success(`已导入 ${score.pages.length} 页曲谱`, {
        description:
          score.pages.length > 1
            ? "打开曲谱后，可在顶部页面预览中选择需要的页。"
            : undefined,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
    >
      <DialogContent className="import-dialog">
        <DialogHeader>
          <DialogTitle>收好一份新曲谱</DialogTitle>
          <DialogDescription>
            导入图片或 PDF，原文件和你的练习笔记会一起保留。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="import-form">
          <div
            className="upload-zone"
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                input.current?.click();
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy) choose(Array.from(e.dataTransfer.files));
            }}
          >
            <Upload size={29} />
            <strong>
              {files.length ? "继续添加图片" : "把曲谱拖到这里，或点击选择"}
            </strong>
            <span>JPG / PNG / WebP / PDF · 单文件最多 20 MB</span>
            <input
              ref={input}
              hidden
              type="file"
              multiple
              disabled={busy}
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              onChange={(e) => {
                choose(Array.from(e.target.files || []));
                e.target.value = "";
              }}
            />
          </div>
          {files.length > 0 && (
            <div className="file-list">
              {files.map((f, i) => (
                <div className="file-row" key={f.name + i}>
                  {f.type === "application/pdf" ? (
                    <FileText size={17} />
                  ) : (
                    <ImageIcon size={17} />
                  )}
                  <span>
                    {i + 1}. {f.name}
                  </span>
                  <small>{(f.size / 1024 / 1024).toFixed(1)} MB</small>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={"上移第" + (i + 1) + "页"}
                    disabled={i === 0 || busy}
                    onClick={() => reorder(i, -1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={"下移第" + (i + 1) + "页"}
                    disabled={i === files.length - 1 || busy}
                    onClick={() => reorder(i, 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={"移除" + f.name}
                    disabled={busy}
                    onClick={() =>
                      setFiles((fs) => fs.filter((_, n) => n !== i))
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="form-grid">
            <label>
              曲名
              <input
                required
                maxLength={100}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="这份曲谱叫什么？"
              />
            </label>
            <label>
              歌手 / 作者
              <input
                maxLength={100}
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="选填"
              />
            </label>
            <label>
              调性
              <Choice
                label="曲谱调性"
                value={key}
                onChange={setKey}
                options={[
                  "C",
                  "C♯",
                  "D",
                  "E♭",
                  "E",
                  "F",
                  "F♯",
                  "G",
                  "A♭",
                  "A",
                  "B♭",
                  "B",
                ].map((k) => ({ value: k, label: k + " 调" }))}
              />
            </label>
            <label>
              变调夹
              <input
                type="number"
                min={0}
                max={12}
                value={capo}
                onChange={(e) => setCapo(Number(e.target.value))}
              />
            </label>
            <label className="span-two">
              标签
              <input
                value={tags}
                maxLength={200}
                onChange={(e) => setTags(e.target.value)}
                placeholder="例如：弹唱，民谣，想学（用逗号分隔）"
              />
            </label>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="button secondary-button"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              取消
            </button>
            <button
              className="button primary"
              disabled={busy || !files.length || !title.trim()}
            >
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Upload size={16} />
              )}{" "}
              {busy ? "正在保存…" : "存入曲谱库"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
