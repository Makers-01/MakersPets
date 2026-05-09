"use client";

import { useEffect, useMemo, useState } from "react";
import { MakersPetStage, type PetStageState } from "@/components/pet/makers-pet-stage";

type TranscriptMessage = {
  role: "user" | "assistant";
  content: string;
};

type RemotePetSignal = {
  state: "idle" | "thinking" | "nudging";
  bubble: string | null;
};

type ReplySignal = {
  id: number;
  bubble: string;
};

type ChatPetPanelProps = {
  lang: "zh" | "en";
  petName: string;
  title: string;
  hint: string;
  bubbleTitle: string;
  thinkingText: string;
  emptyState: string;
  draft: string;
  pending: boolean;
  messages: TranscriptMessage[];
  replySignal: ReplySignal | null;
  statuses: Record<PetStageState, string>;
};

export function ChatPetPanel({
  lang,
  petName,
  title,
  hint,
  bubbleTitle,
  thinkingText,
  emptyState,
  draft,
  pending,
  messages,
  replySignal,
  statuses
}: ChatPetPanelProps) {
  const [remoteSignal, setRemoteSignal] = useState<RemotePetSignal>({
    state: "idle",
    bubble: null
  });
  const [celebrationBubble, setCelebrationBubble] = useState<string | null>(null);
  const [celebrateUntil, setCelebrateUntil] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    async function loadRemoteSignal() {
      try {
        const response = await fetch(`/api/pet-state?lang=${lang}`, {
          cache: "no-store"
        });
        const payload = await response.json();

        if (!active || !payload?.ok) return;

        setRemoteSignal({
          state:
            payload.state === "nudging" || payload.state === "thinking"
              ? payload.state
              : "idle",
          bubble: typeof payload.bubble === "string" ? payload.bubble : null
        });
      } catch {
        if (active) {
          setRemoteSignal({
            state: "idle",
            bubble: null
          });
        }
      }
    }

    void loadRemoteSignal();
    const timer = window.setInterval(() => {
      void loadRemoteSignal();
    }, 20000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [lang]);

  useEffect(() => {
    if (!replySignal?.bubble) return;

    setCelebrationBubble(replySignal.bubble);
    setCelebrateUntil(Date.now() + 15000);
  }, [replySignal]);

  useEffect(() => {
    if (!celebrateUntil) return;

    const remaining = celebrateUntil - Date.now();
    if (remaining <= 0) {
      setCelebrateUntil(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      setCelebrateUntil(null);
    }, remaining);

    return () => window.clearTimeout(timeout);
  }, [celebrateUntil]);

  const petPresence = useMemo(() => {
    if (pending) {
      return {
        state: "thinking" as PetStageState,
        bubble: thinkingText
      };
    }

    if (draft.trim()) {
      return {
        state: "listening" as PetStageState,
        bubble: draft.trim()
      };
    }

    if (celebrateUntil && celebrationBubble) {
      return {
        state: "celebrating" as PetStageState,
        bubble: celebrationBubble
      };
    }

    if (remoteSignal.state === "nudging" && remoteSignal.bubble) {
      return {
        state: "nudging" as PetStageState,
        bubble: remoteSignal.bubble
      };
    }

    if (remoteSignal.state === "thinking") {
      return {
        state: "thinking" as PetStageState,
        bubble: remoteSignal.bubble ?? thinkingText
      };
    }

    const latestAssistant = [...messages].reverse().find((item) => item.role === "assistant");

    return {
      state: "idle" as PetStageState,
      bubble: latestAssistant?.content ?? emptyState
    };
  }, [celebrateUntil, celebrationBubble, draft, emptyState, messages, pending, remoteSignal, thinkingText]);

  return (
    <article className="panel pet-stage-panel">
      {title || hint ? (
        <div className="section-head">
          {title ? <h2>{title}</h2> : null}
          {hint ? <p>{hint}</p> : null}
        </div>
      ) : null}
      <MakersPetStage
        name={petName}
        state={petPresence.state}
        bubbleTitle={bubbleTitle}
        bubbleText={petPresence.bubble}
        statusText={statuses[petPresence.state]}
      />
    </article>
  );
}
