"use client";

import { useRef, type MouseEventHandler, type ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export type ScoreMenuEntry = {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  onSelect?: () => void;
  children?: ScoreMenuEntry[];
};

type ScoreContextMenuProps = {
  children: ReactNode;
  label: string;
  groups: ScoreMenuEntry[][];
  onContextMenu: MouseEventHandler<HTMLDivElement>;
  onClose: () => void;
};

const contentStyle = {
  minWidth:
    "min(220px, var(--radix-context-menu-content-available-width, calc(100vw - 16px)))",
  maxWidth:
    "min(calc(100vw - 16px), var(--radix-context-menu-content-available-width, calc(100vw - 16px)))",
  maxHeight:
    "min(420px, var(--radix-context-menu-content-available-height, calc(100vh - 16px)))",
};

function isTextControl(target: EventTarget | null) {
  if (
    target instanceof HTMLTextAreaElement &&
    target.hasAttribute("data-lyric-cell") &&
    target !== document.activeElement &&
    target.style.opacity === "0"
  ) {
    return false;
  }
  return (
    target instanceof Element &&
    (target.closest("input, textarea, select") !== null ||
      (target instanceof HTMLElement && target.isContentEditable))
  );
}

function MenuEntry({ entry }: { entry: ScoreMenuEntry }) {
  const content = (
    <>
      <span>{entry.label}</span>
      {entry.shortcut && (
        <ContextMenuShortcut>{entry.shortcut}</ContextMenuShortcut>
      )}
    </>
  );
  const onSelect = () => {
    if (!entry.disabled) entry.onSelect?.();
  };

  if (entry.children?.length) {
    return (
      <ContextMenuSub>
        <ContextMenuSubTrigger
          disabled={entry.disabled}
          data-score-menu-entry={entry.id}
        >
          {content}
        </ContextMenuSubTrigger>
        <ContextMenuPortal>
          <ContextMenuSubContent
            className="score-context-menu z-[100] overflow-y-auto"
            style={contentStyle}
            collisionPadding={8}
            aria-label={entry.label}
          >
            {entry.children.map((child) => (
              <MenuEntry key={child.id} entry={child} />
            ))}
          </ContextMenuSubContent>
        </ContextMenuPortal>
      </ContextMenuSub>
    );
  }

  if (typeof entry.checked === "boolean") {
    return (
      <ContextMenuCheckboxItem
        checked={entry.checked}
        disabled={entry.disabled}
        onSelect={onSelect}
        data-score-menu-entry={entry.id}
        className={entry.danger ? "text-destructive" : undefined}
      >
        {content}
      </ContextMenuCheckboxItem>
    );
  }

  return (
    <ContextMenuItem
      disabled={entry.disabled}
      onSelect={onSelect}
      variant={entry.danger ? "destructive" : "default"}
      data-score-menu-entry={entry.id}
    >
      {content}
    </ContextMenuItem>
  );
}

export function ScoreContextMenu({
  children,
  label,
  groups,
  onContextMenu,
  onClose,
}: ScoreContextMenuProps) {
  const opened = useRef(false);
  const closeMenu = () => {
    if (!opened.current) return;
    opened.current = false;
    onClose();
  };
  const visibleGroups = groups.filter((group) => group.length > 0);

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) opened.current = true;
        // Restore only after the focus trap unmounts, in onCloseAutoFocus.
      }}
    >
      <ContextMenuTrigger asChild>
        <div
          className="score-context-menu-trigger"
          onContextMenuCapture={(event) => {
            if (isTextControl(event.target)) {
              event.stopPropagation();
              return;
            }
            onContextMenu(event);
          }}
          onKeyDownCapture={(event) => {
            if (
              !(
                event.key === "ContextMenu" ||
                (event.shiftKey && event.key === "F10")
              ) ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey ||
              isTextControl(event.target) ||
              !(event.target instanceof Element)
            ) {
              return;
            }
            const rect = event.target.getBoundingClientRect();
            const request = new MouseEvent("contextmenu", {
              bubbles: true,
              cancelable: true,
              button: 2,
              clientX: rect.left + Math.min(rect.width / 2, 24),
              clientY: rect.bottom,
            });
            if (!event.target.dispatchEvent(request)) event.preventDefault();
          }}
        >
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent
        className="score-context-menu z-[100]"
        aria-label="谱面快捷菜单"
        style={contentStyle}
        collisionPadding={8}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          closeMenu();
        }}
      >
        <ContextMenuLabel className="max-w-80 break-words text-xs text-muted-foreground">
          {label}
        </ContextMenuLabel>
        {visibleGroups.map((group, index) => (
          <ContextMenuGroup key={index}>
            <ContextMenuSeparator />
            {group.map((entry) => (
              <MenuEntry key={entry.id} entry={entry} />
            ))}
          </ContextMenuGroup>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
