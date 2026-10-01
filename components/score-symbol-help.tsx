"use client";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
type Tip = {
  source: SVGElement;
  name: string;
  description: string;
  x: number;
  y: number;
};
/** Read geometry through the transparent editing grid; never intercept score clicks. */
export default function ScoreSymbolHelp({
  root,
  revision,
}: {
  root: RefObject<HTMLDivElement | null>;
  revision: unknown;
}) {
  const id = useId(),
    [tip, setTip] = useState<Tip | null>(null),
    box = useRef<HTMLDivElement>(null),
    [position, setPosition] = useState({ left: 12, top: 12 });
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    let pending: ReturnType<typeof setTimeout> | undefined,
      source: SVGElement | undefined,
      dismissed: SVGElement | undefined,
      described: Element | undefined;
    const removeDescription = () => {
      if (described) {
        const words = (described.getAttribute("aria-describedby") ?? "")
          .split(" ")
          .filter((word) => word && word !== id);
        if (words.length)
          described.setAttribute("aria-describedby", words.join(" "));
        else described.removeAttribute("aria-describedby");
        described = undefined;
      }
    };
    const clear = () => {
      clearTimeout(pending);
      source = undefined;
      removeDescription();
      setTip(null);
    };
    const show = (target: SVGElement, x: number, y: number, focus = false) => {
      if (dismissed === target) return;
      if (source === target) {
        setTip((prev) => (prev ? { ...prev, x, y } : prev));
        return;
      }
      clear();
      source = target;
      dismissed = undefined;
      const reveal = () => {
        if (!target.isConnected || !host.getClientRects().length) return;
        const name = target.dataset.scoreSymbol,
          description = target.dataset.scoreExplanation;
        if (!name || !description) return;
        setTip({ source: target, name, description, x, y });
        if (focus) {
          described = target;
          target.setAttribute(
            "aria-describedby",
            [target.getAttribute("aria-describedby") ?? "", id]
              .filter(Boolean)
              .join(" "),
          );
        }
      };
      if (focus) reveal();
      else pending = setTimeout(reveal, 180);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const target = event.target instanceof Element ? event.target : null,
        svg = target?.closest("svg");
      if (!svg) {
        clear();
        dismissed = undefined;
        return;
      }
      const hits = [
        ...svg.querySelectorAll<SVGElement>(
          "[data-score-symbol]:not([data-symbol-focus-only])",
        ),
      ]
        .filter((el) => {
          const r = el.getBoundingClientRect(),
            pad = 5;
          if (!r.width && !r.height) return false;
          if (
            event.clientX < r.left - pad ||
            event.clientX > r.right + pad ||
            event.clientY < r.top - pad ||
            event.clientY > r.bottom + pad
          )
            return false;
          if (el instanceof SVGPathElement) {
            const matrix = el.getScreenCTM();
            if (!matrix) return false;
            const inverse = matrix.inverse();
            return [
              [0, 0],
              [-4, 0],
              [4, 0],
              [0, -4],
              [0, 4],
              [-3, -3],
              [3, 3],
              [-3, 3],
              [3, -3],
            ].some(([dx, dy]) => {
              const p = new DOMPoint(
                event.clientX + dx,
                event.clientY + dy,
              ).matrixTransform(inverse);
              return (
                el.isPointInStroke(p) ||
                (getComputedStyle(el).fill !== "none" && el.isPointInFill(p))
              );
            });
          }
          return true;
        })
        .sort(
          (a, b) =>
            Number(b.dataset.helpPriority ?? 10) -
              Number(a.dataset.helpPriority ?? 10) || area(a) - area(b),
        );
      if (hits[0]) show(hits[0], event.clientX, event.clientY);
      else {
        clear();
        dismissed = undefined;
      }
    };
    const focus = (event: FocusEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest<SVGElement>("[data-score-symbol]")
          : null;
      if (target && target.matches(":focus-visible")) {
        const r = target.getBoundingClientRect();
        show(target, r.left + r.width / 2, r.bottom, true);
      } else clear();
    };
    const leave = () => {
      clear();
      dismissed = undefined;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismissed = source;
        clear();
      }
    };
    const observer = new ResizeObserver(clear);
    observer.observe(host);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("focusin", focus);
    host.addEventListener("focusout", clear);
    document.addEventListener("pointerdown", clear, true);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("scroll", clear, true);
    window.addEventListener("resize", clear);
    window.addEventListener("blur", clear);
    return () => {
      clearTimeout(pending);
      removeDescription();
      observer.disconnect();
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("focusin", focus);
      host.removeEventListener("focusout", clear);
      document.removeEventListener("pointerdown", clear, true);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("scroll", clear, true);
      window.removeEventListener("resize", clear);
      window.removeEventListener("blur", clear);
      setTip(null);
    };
  }, [root, revision, id]);
  useLayoutEffect(() => {
    if (!tip || !box.current) return;
    const r = box.current.getBoundingClientRect();
    setPosition({
      left: Math.max(
        12,
        Math.min(tip.x + 14, window.innerWidth - r.width - 12),
      ),
      top: Math.max(
        12,
        tip.y + 18 + r.height < window.innerHeight - 12
          ? tip.y + 18
          : tip.y - r.height - 14,
      ),
    });
  }, [tip]);
  return tip
    ? createPortal(
        <div
          ref={box}
          id={id}
          role="tooltip"
          className="score-symbol-tooltip"
          style={position}
        >
          <strong>{tip.name}</strong>
          <p>{tip.description}</p>
        </div>,
        document.body,
      )
    : null;
}
function area(el: SVGElement) {
  const r = el.getBoundingClientRect();
  return r.width * r.height;
}
