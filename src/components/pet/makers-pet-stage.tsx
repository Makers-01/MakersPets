 "use client";

import { useEffect, useMemo, useState } from "react";
import { getPetAssetConfig } from "@/lib/pet-assets";

type PetStageState =
  | "idle"
  | "listening"
  | "thinking"
  | "celebrating"
  | "nudging"
  | "running-left"
  | "running-right";

type MakersPetStageProps = {
  name: string;
  state?: PetStageState;
  bubbleTitle?: string;
  bubbleText?: string | null;
  bubbleOverflowHint?: string | null;
  statusText?: string | null;
  compact?: boolean;
  petId?: string;
  desktop?: boolean;
  desktopBubbleCollapsed?: boolean;
  desktopBubbleBadgeCount?: number;
  onCollapseDesktopBubble?: () => void;
  onExpandDesktopBubble?: () => void;
};

function estimateBubbleLines(text: string) {
  let units = 0;

  for (const char of text) {
    if (char === "\n") {
      units += 16;
      continue;
    }

    if (/\s/.test(char)) {
      units += 0.35;
      continue;
    }

    if (/[A-Za-z0-9.,!?;:'"()[\]{}\-_/]/.test(char)) {
      units += 0.58;
      continue;
    }

    units += 1;
  }

  return units / 14.5;
}

export function MakersPetStage({
  name,
  state = "idle",
  bubbleTitle,
  bubbleText,
  bubbleOverflowHint,
  statusText,
  compact = false,
  petId = "makers",
  desktop = false,
  desktopBubbleCollapsed = false,
  desktopBubbleBadgeCount = 0,
  onCollapseDesktopBubble,
  onExpandDesktopBubble
}: MakersPetStageProps) {
  const asset = useMemo(() => getPetAssetConfig(petId), [petId]);
  const frames = asset.stateFrames[state] ?? asset.stateFrames.idle;
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    setFrameIndex(0);
  }, [state]);

  useEffect(() => {
    if (frames.length <= 1) return;

    const stateFps = asset.stateFps?.[state] ?? asset.fps;

    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % frames.length);
    }, Math.max(220, Math.round(1000 / stateFps)));

    return () => window.clearInterval(timer);
  }, [asset.fps, asset.stateFps, frames, state]);

  const activeFrame = frames[frameIndex] ?? frames[0];
  const displayWidth = compact ? 132 : 192;
  const displayHeight = compact ? 144 : 208;
  const desktopBubbleOverflow =
    desktop && bubbleText ? estimateBubbleLines(bubbleText) > 4 : false;

  return (
    <div
      className={`pet-stage${compact ? " compact" : ""}${desktop ? " desktop-dock" : ""}${
        desktop && desktopBubbleCollapsed ? " bubble-collapsed" : ""
      } is-${state}`}
    >
      {desktop ? (
        <div className="pet-bubble-slot" aria-hidden={!bubbleText}>
          {bubbleText && !desktopBubbleCollapsed ? (
            <div className={`pet-bubble pet-bubble-desktop${desktopBubbleOverflow ? " has-overflow" : ""}`}>
              {onCollapseDesktopBubble ? (
                <button
                  type="button"
                  className="pet-bubble-collapse"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCollapseDesktopBubble();
                  }}
                  aria-label="Collapse bubble"
                  title="Collapse bubble"
                >
                  ↙
                </button>
              ) : null}
              <p>{bubbleText}</p>
              {desktopBubbleOverflow && bubbleOverflowHint ? (
                <span
                  className="pet-bubble-hint"
                  aria-label={bubbleOverflowHint}
                  title={bubbleOverflowHint}
                >
                  ↗
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {!desktop ? <div className="pet-halo" /> : null}
      <div
        className="pet-sprite-viewport"
        style={{
          width: `${displayWidth}px`,
          height: `${displayHeight}px`
        }}
        aria-hidden="true"
      >
        <img
          src={asset.imagePath}
          alt=""
          className="pet-sprite-sheet"
          draggable={false}
          style={{
            width: `${displayWidth * asset.columns}px`,
            height: `${displayHeight * asset.rows}px`,
            transform: `translate(${-activeFrame.col * displayWidth}px, ${-activeFrame.row * displayHeight}px)`
          }}
        />
      </div>
      {desktop && desktopBubbleCollapsed && bubbleText ? (
        <button
          type="button"
          className="pet-bubble-badge"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            onExpandDesktopBubble?.();
          }}
          aria-label="Expand bubble"
          title="Expand bubble"
        >
          {desktopBubbleBadgeCount > 0 ? desktopBubbleBadgeCount : 1}
        </button>
      ) : null}
      {!desktop && (bubbleTitle || bubbleText) ? (
        <div className="pet-bubble">
          {bubbleTitle && !desktop ? <strong>{bubbleTitle}</strong> : null}
          {bubbleText ? <p>{bubbleText}</p> : null}
        </div>
      ) : null}
      {statusText && !desktop ? (
        <div className="pet-status-row">
          <span className="status-pill active">{name}</span>
          <span className="status-pill">{statusText}</span>
        </div>
      ) : null}
    </div>
  );
}

export type { PetStageState };
