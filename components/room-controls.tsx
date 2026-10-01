"use client";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
export function Choice({
  value,
  onChange,
  options,
  label,
  className = "",
  disabled = false,
  onCloseAutoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  className?: string;
  disabled?: boolean;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label} className={"room-choice " + className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent onCloseAutoFocus={onCloseAutoFocus}>
        {options.map((o) => (
          <SelectItem value={o.value} key={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = "操作未完成，请重试。";
    try {
      message =
        ((await response.json()) as { error?: string }).error || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}
export function jsonBody(value: unknown) {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  };
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
