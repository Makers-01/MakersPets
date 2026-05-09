"use client";

import { useMemo, useState } from "react";
import { ChatPetPanel } from "@/components/pet/chat-pet-panel";
import type { PetStageState } from "@/components/pet/makers-pet-stage";

type SkillOption = {
  slug: string;
  name: string;
  defaultModelName: string | null;
};

type ChatCopy = {
  title: string;
  subtitle: string;
  currentPet: string;
  currentSkill: string;
  defaultModel: string;
  chooseSkill: string;
  message: string;
  messageHint: string;
  send: string;
  thinking: string;
  emptyState: string;
  assistant: string;
  you: string;
  runtime: string;
  runtimeHint: string;
  provider: string;
  petPanel: string;
  petPanelHint: string;
  petStatus: string;
  petBubble: string;
  statuses: Record<PetStageState, string>;
};

type ChatConsoleProps = {
  lang: "zh" | "en";
  petName: string;
  conversationId: string;
  defaultSkillSlug: string;
  initialMessages: TranscriptMessage[];
  skills: SkillOption[];
  text: ChatCopy;
};

type TranscriptMessage = {
  role: "user" | "assistant";
  content: string;
};

type RuntimeMeta = {
  skillName: string;
  modelName: string;
  providerName: string;
};

type ReplySignal = {
  id: number;
  bubble: string;
};

export function ChatConsole({
  lang,
  petName,
  conversationId,
  defaultSkillSlug,
  initialMessages,
  skills,
  text
}: ChatConsoleProps) {
  const [selectedSkill, setSelectedSkill] = useState(defaultSkillSlug);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<TranscriptMessage[]>(initialMessages);
  const [runtimeMeta, setRuntimeMeta] = useState<RuntimeMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [replySignal, setReplySignal] = useState<ReplySignal | null>(null);

  const activeSkill = useMemo(
    () => skills.find((skill) => skill.slug === selectedSkill) ?? skills[0],
    [selectedSkill, skills]
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();

    if (!message || pending) return;

    const nextHistory = [...messages, { role: "user" as const, content: message }];
    setMessages(nextHistory);
    setDraft("");
    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          conversationId,
          lang,
          skillSlug: selectedSkill,
          message
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Chat request failed.");
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: (payload.reply as string) ?? ""
        }
      ]);
      setRuntimeMeta(payload.runtime as RuntimeMeta);
      setReplySignal({
        id: Date.now(),
        bubble: (payload.reply as string) ?? text.emptyState
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Chat request failed.");
      setMessages(messages);
      setDraft(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="page-shell chat-shell">
      <section className="chat-toolbar panel">
        <strong>{petName}</strong>
        <span className="status-pill active">{runtimeMeta?.skillName ?? activeSkill?.name ?? "—"}</span>
        <span className="status-pill">{runtimeMeta?.modelName ?? activeSkill?.defaultModelName ?? "—"}</span>
        <span className="status-pill">{runtimeMeta?.providerName ?? "—"}</span>
      </section>

      <section className="chat-workspace">
        <aside className="chat-side">
          <ChatPetPanel
            lang={lang}
            petName={petName}
            title=""
            hint=""
            bubbleTitle={text.petBubble}
            thinkingText={text.thinking}
            emptyState={text.emptyState}
            draft={draft}
            pending={pending}
            messages={messages}
            replySignal={replySignal}
            statuses={text.statuses}
          />
          <article className="panel chat-side-controls">
            <form onSubmit={handleSubmit} className="admin-form compact-form">
              <label>
                <span>{text.chooseSkill}</span>
                <select
                  name="skill"
                  value={selectedSkill}
                  onChange={(event) => setSelectedSkill(event.target.value)}
                >
                  {skills.map((skill) => (
                    <option key={skill.slug} value={skill.slug}>
                      {skill.name}
                    </option>
                  ))}
                </select>
              </label>
            </form>
          </article>
        </aside>

        <article className="panel chat-main">
          <div className="chat-log">
            {messages.length === 0 ? (
              <div className="message-bubble assistant">
                <strong>{text.assistant}</strong>
                <p>{text.emptyState}</p>
              </div>
            ) : (
              messages.map((item, index) => (
                <div
                  className={`message-bubble ${item.role === "assistant" ? "assistant" : "user"}`}
                  key={`${item.role}-${index}`}
                >
                  <strong>{item.role === "assistant" ? text.assistant : text.you}</strong>
                  <p>{item.content}</p>
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleSubmit} className="chat-compose">
            <textarea
              name="message"
              rows={3}
              placeholder={text.messageHint}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
              }}
            />
            <button type="submit" className="primary-button" disabled={pending}>
              {pending ? text.thinking : text.send}
            </button>
          </form>
          {error ? <p className="flash error">{error}</p> : null}
        </article>
      </section>
    </main>
  );
}
