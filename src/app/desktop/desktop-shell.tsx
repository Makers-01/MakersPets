"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MakersPetStage, type PetStageState } from "@/components/pet/makers-pet-stage";

type DesktopCopy = {
  emptyBubble: string;
  timeoutBubble: string;
  overflowHint: string;
  openChat: string;
  openAdmin: string;
  inputPlaceholder: string;
  send: string;
  thinking: string;
  preparing: string;
  pin: string;
  unpin: string;
  minimize: string;
  quit: string;
  detached: string;
  connected: string;
  statuses: Record<PetStageState, string>;
};

type DesktopShellProps = {
  lang: "zh" | "en";
  text: DesktopCopy;
  conversationId: string;
  defaultSkillSlug: string;
  desktopChatInputEnabled: boolean;
};

type RemotePetSignal = {
  state: "idle" | "thinking" | "nudging";
  bubble: string | null;
};

type DesktopBridgeState = {
  connected: boolean;
  pinned: boolean;
};

export function DesktopShell({
  lang,
  text,
  conversationId,
  defaultSkillSlug,
  desktopChatInputEnabled
}: DesktopShellProps) {
  const shellRef = useRef<HTMLElement | null>(null);
  const draggingRef = useRef(false);
  const dragReadyRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerLastRef = useRef<{ x: number; y: number } | null>(null);
  const [remoteSignal, setRemoteSignal] = useState<RemotePetSignal>({
    state: "idle",
    bubble: null
  });
  const [hovered, setHovered] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [chatBubble, setChatBubble] = useState<string | null>(null);
  const [streamTarget, setStreamTarget] = useState<string | null>(null);
  const [bridgeState, setBridgeState] = useState<DesktopBridgeState>({
    connected: false,
    pinned: true
  });
  const [dragging, setDragging] = useState(false);
  const [dragState, setDragState] = useState<PetStageState | null>(null);
  const [bubbleCollapsed, setBubbleCollapsed] = useState(false);

  useEffect(() => {
    if (!streamTarget || chatBubble === null || chatBubble === streamTarget) return;

    const timer = window.setInterval(() => {
      setChatBubble((current) => {
        const base = typeof current === "string" ? current : "";

        if (!streamTarget.startsWith(base)) {
          return streamTarget.slice(0, 2);
        }

        if (base.length >= streamTarget.length) {
          window.clearInterval(timer);
          return base;
        }

        return streamTarget.slice(0, Math.min(streamTarget.length, base.length + 1));
      });
    }, 52);

    return () => {
      window.clearInterval(timer);
    };
  }, [chatBubble, streamTarget]);

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
    let active = true;

    async function loadBridgeState() {
      if (!window.makersPetDesktop?.getState) return;

      try {
        const payload = await window.makersPetDesktop.getState();

        if (!active || !payload?.ok) return;

        setBridgeState({
          connected: true,
          pinned: Boolean(payload.pinned)
        });
      } catch {
        if (active) {
          setBridgeState({
            connected: false,
            pinned: true
          });
        }
      }
    }

    void loadBridgeState();

    return () => {
      active = false;
    };
  }, []);

  const petPresence = useMemo(() => {
    if (dragging && dragState) {
      return {
        state: dragState,
        bubble: chatBubble ?? remoteSignal.bubble ?? text.emptyBubble
      };
    }

    if (pending) {
      return {
        state: "thinking" as PetStageState,
        bubble: text.preparing
      };
    }

    if (draft.trim()) {
      return {
        state: "listening" as PetStageState,
        bubble: text.preparing
      };
    }

    if (chatBubble) {
      return {
        state: "celebrating" as PetStageState,
        bubble: chatBubble
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
        bubble: remoteSignal.bubble ?? text.emptyBubble
      };
    }

    return {
      state: "idle" as PetStageState,
      bubble: remoteSignal.bubble ?? text.emptyBubble
    };
  }, [chatBubble, dragState, dragging, draft, pending, remoteSignal, text.emptyBubble, text.thinking]);

  const shouldShowBubble =
    !bridgeState.connected ||
    (!bubbleCollapsed && (hovered || petPresence.state !== "idle" || Boolean(draft.trim())));

  useEffect(() => {
    if (pending || Boolean(draft.trim())) {
      setBubbleCollapsed(false);
    }
  }, [draft, pending]);

  useEffect(() => {
    if (!bridgeState.connected || !window.makersPetDesktop?.fitWindow || !shellRef.current) return;

    const element = shellRef.current;

    function requestFit() {
      const rect = element.getBoundingClientRect();
      const width = Math.ceil(rect.width + 8);
      const height = Math.ceil(rect.height + 8);

      void window.makersPetDesktop?.fitWindow({
        width,
        height
      });
    }

    requestFit();

    const observer = new ResizeObserver(() => {
      requestFit();
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [bridgeState.connected, shouldShowBubble]);

  async function handleOpenRoute(routePath: string) {
    if (window.makersPetDesktop?.openRoute) {
      await window.makersPetDesktop.openRoute(routePath);
      return;
    }

    window.location.href = routePath;
  }

  async function handleTogglePinned() {
    if (!window.makersPetDesktop?.togglePinned) return;

    const payload = await window.makersPetDesktop.togglePinned();

    if (!payload?.ok) return;

    setBridgeState((current) => ({
      ...current,
      pinned: Boolean(payload.pinned)
    }));
  }

  async function handleMinimize() {
    if (!window.makersPetDesktop?.minimize) return;

    await window.makersPetDesktop.minimize();
  }

  async function handleContextMenu(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();

    if (window.makersPetDesktop?.showContextMenu) {
      await window.makersPetDesktop.showContextMenu({
        openChat: text.openChat,
        openAdmin: text.openAdmin,
        pin: text.pin,
        unpin: text.unpin,
        minimize: text.minimize,
        quit: text.quit
      });
      return;
    }
  }

  async function handleDesktopChatSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = draft.trim();

    if (!message || pending) return;

    setPending(true);
    setChatBubble(text.preparing);
    setStreamTarget(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          conversationId,
          lang,
          skillSlug: defaultSkillSlug,
          message,
          surface: "desktop",
          stream: true
        })
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Desktop chat request failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalReply = "";
      let startedStreaming = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const lines = chunk.split("\n").map((line) => line.trim());
          const eventLine = lines.find((line) => line.startsWith("event:"));
          const dataLine = lines.find((line) => line.startsWith("data:"));

          if (!eventLine || !dataLine) continue;

          const eventName = eventLine.slice(6).trim();
          const payload = JSON.parse(dataLine.slice(5).trim()) as {
            reply?: string;
            error?: string;
          };

          if (eventName === "chunk" && typeof payload.reply === "string") {
            finalReply = payload.reply;
            if (!startedStreaming) {
              startedStreaming = true;
              setChatBubble("");
            }
            setStreamTarget(payload.reply);
          }

          if (eventName === "done" && typeof payload.reply === "string") {
            finalReply = payload.reply;
            if (!startedStreaming) {
              startedStreaming = true;
              setChatBubble("");
            }
            setStreamTarget(payload.reply);
          }

          if (eventName === "error") {
            throw new Error(payload.error || "Desktop chat request failed.");
          }
        }
      }

      if (!finalReply.trim()) {
        setChatBubble(text.emptyBubble);
        setStreamTarget(null);
      }
      setDraft("");
    } catch {
      setChatBubble(text.timeoutBubble);
      setStreamTarget(null);
    } finally {
      setPending(false);
    }
  }

  async function handlePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0 || !window.makersPetDesktop?.sendDragWindow) return;

    dragReadyRef.current = true;
    draggingRef.current = false;
    pointerStartRef.current = {
      x: event.screenX,
      y: event.screenY
    };
    pointerLastRef.current = {
      x: event.screenX,
      y: event.screenY
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    if (!dragReadyRef.current || !window.makersPetDesktop?.sendDragWindow) return;

    if (!draggingRef.current && pointerStartRef.current) {
      const deltaX = event.screenX - pointerStartRef.current.x;
      const deltaY = event.screenY - pointerStartRef.current.y;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance < 8) {
        return;
      }

      draggingRef.current = true;
      setDragging(true);
      setDragState(deltaX < 0 ? "running-left" : "running-right");
      window.makersPetDesktop.sendDragWindow({
        phase: "start",
        pointerX: pointerStartRef.current.x,
        pointerY: pointerStartRef.current.y
      });
    }

    if (!draggingRef.current) return;

    const lastPointer = pointerLastRef.current;
    if (lastPointer) {
      const deltaX = event.screenX - lastPointer.x;

      if (Math.abs(deltaX) >= 2) {
        setDragState(deltaX < 0 ? "running-left" : "running-right");
      }
    }

    pointerLastRef.current = {
      x: event.screenX,
      y: event.screenY
    };

    window.makersPetDesktop.sendDragWindow({
      phase: "move",
      pointerX: event.screenX,
      pointerY: event.screenY
    });
  }

  async function handlePointerEnd(event: React.PointerEvent<HTMLElement>) {
    if (!dragReadyRef.current || !window.makersPetDesktop?.sendDragWindow) return;

    dragReadyRef.current = false;
    pointerStartRef.current = null;
    pointerLastRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!draggingRef.current) {
      return;
    }

    draggingRef.current = false;
    setDragging(false);
    setDragState(null);

    window.makersPetDesktop.sendDragWindow({
      phase: "end",
      pointerX: event.screenX,
      pointerY: event.screenY
    });
  }

  return (
    <main className="desktop-pet-shell" onContextMenu={handleContextMenu} ref={shellRef}>
      <section
        className={`desktop-pet-stage ${dragging ? "dragging" : ""}`}
        onDoubleClick={() => {
          void handleOpenRoute(`/chat?lang=${lang}`);
        }}
        onMouseEnter={() => {
          setHovered(true);
        }}
        onMouseLeave={() => {
          setHovered(false);
        }}
        onPointerDown={(event) => {
          void handlePointerDown(event);
        }}
        onPointerMove={(event) => {
          handlePointerMove(event);
        }}
        onPointerUp={(event) => {
          void handlePointerEnd(event);
        }}
        onPointerCancel={(event) => {
          void handlePointerEnd(event);
        }}
      >
        <MakersPetStage
          name="Makers"
          compact={bridgeState.connected}
          desktop={bridgeState.connected}
          state={petPresence.state}
          bubbleText={shouldShowBubble ? petPresence.bubble : null}
          bubbleOverflowHint={text.overflowHint}
          desktopBubbleCollapsed={bridgeState.connected && bubbleCollapsed}
          desktopBubbleBadgeCount={bridgeState.connected && bubbleCollapsed && petPresence.bubble ? 1 : 0}
          onCollapseDesktopBubble={() => {
            setBubbleCollapsed(true);
          }}
          onExpandDesktopBubble={() => {
            setBubbleCollapsed(false);
          }}
          statusText={
            bridgeState.connected
              ? shouldShowBubble
                ? text.statuses[petPresence.state]
                : null
              : text.detached
          }
        />
      </section>
      {bridgeState.connected && desktopChatInputEnabled ? (
        <form className="desktop-chat-input" onSubmit={handleDesktopChatSubmit}>
          <input
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            placeholder={text.inputPlaceholder}
          />
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            aria-label={pending ? text.thinking : text.send}
            title={pending ? text.thinking : text.send}
          >
            {pending ? (
              <span className="desktop-chat-spinner" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true" className="desktop-chat-send-icon">
                <path
                  d="M3 11.5 20.5 4l-4.8 16-4.6-5.7-5.3-1.3Z"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.7"
                />
              </svg>
            )}
          </button>
        </form>
      ) : null}
      {!bridgeState.connected ? (
        <section className="desktop-preview-actions">
          <button
            type="button"
            className="mini-button"
            onClick={() => {
              void handleOpenRoute(`/chat?lang=${lang}`);
            }}
          >
            {text.openChat}
          </button>
          <button
            type="button"
            className="mini-button"
            onClick={() => {
              void handleOpenRoute(`/admin?lang=${lang}`);
            }}
          >
            {text.openAdmin}
          </button>
        </section>
      ) : null}
    </main>
  );
}
