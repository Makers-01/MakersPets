import { NextResponse } from "next/server";
import { z } from "zod";
import { prepareSkillChat, runSkillChat, saveSkillChatResult } from "@/lib/chat";
import { copy, getLang } from "@/lib/i18n";

const requestSchema = z.object({
  conversationId: z.string().trim().optional(),
  skillSlug: z.string().trim().optional(),
  message: z.string().trim().min(1).max(4000),
  lang: z.string().trim().optional(),
  surface: z.enum(["chat", "desktop"]).optional(),
  stream: z.boolean().optional()
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid chat request."
      },
      { status: 400 }
    );
  }

  try {
    if (parsed.data.stream) {
      const lang = getLang(parsed.data.lang);
      const prepared = await prepareSkillChat({
        conversationId: parsed.data.conversationId,
        skillSlug: parsed.data.skillSlug,
        message: parsed.data.message,
        surface: parsed.data.surface,
        lang
      });

      const upstream = await fetch(`${prepared.runtime.apiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${prepared.runtime.apiKey}`
        },
        body: JSON.stringify({
          ...prepared.requestBody,
          stream: true
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(parsed.data.surface === "desktop" ? 25000 : 45000)
      });

      if (!upstream.ok || !upstream.body) {
        const payload = await upstream.json().catch(() => null);
        return NextResponse.json(
          {
            ok: false,
            error: `Chat request failed with ${upstream.status}: ${JSON.stringify(payload).slice(0, 400)}`
          },
          { status: 500 }
        );
      }

      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const reader = upstream.body.getReader();
      let buffer = "";
      let reply = "";
      let usage: unknown = null;

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const sendEvent = (event: string, data: Record<string, unknown>) => {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          };

          sendEvent("meta", {
            conversationId: prepared.conversation.id,
            runtime: {
              petName: prepared.runtime.petName,
              skillSlug: prepared.runtime.skillSlug,
              skillName: prepared.runtime.skillName,
              modelName: prepared.runtime.modelName,
              providerName: prepared.runtime.providerName
            }
          });

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const chunks = buffer.split("\n\n");
              buffer = chunks.pop() ?? "";

              for (const chunk of chunks) {
                const line = chunk
                  .split("\n")
                  .map((item) => item.trim())
                  .find((item) => item.startsWith("data:"));

                if (!line) continue;

                const payloadText = line.slice(5).trim();
                if (!payloadText || payloadText === "[DONE]") {
                  continue;
                }

                const eventPayload = JSON.parse(payloadText) as {
                  choices?: Array<{
                    delta?: {
                      content?: string;
                    };
                  }>;
                  usage?: unknown;
                };

                const delta = eventPayload.choices?.[0]?.delta?.content ?? "";
                if (delta) {
                  reply += delta;
                  sendEvent("chunk", {
                    delta,
                    reply
                  });
                }

                if (eventPayload.usage) {
                  usage = eventPayload.usage;
                }
              }
            }

            const finalReply = reply.trim() || copy[lang].chat.noReply;
            await saveSkillChatResult({
              conversationId: prepared.conversation.id,
              conversationSlug: prepared.conversation.slug,
              userMessage: parsed.data.message,
              reply: finalReply,
              runtime: prepared.runtime
            });

            sendEvent("done", {
              reply: finalReply,
              usage,
              runtime: {
                petName: prepared.runtime.petName,
                skillSlug: prepared.runtime.skillSlug,
                skillName: prepared.runtime.skillName,
                modelName: prepared.runtime.modelName,
                providerName: prepared.runtime.providerName
              }
            });
            controller.close();
          } catch (error) {
            sendEvent("error", {
              error: error instanceof Error ? error.message : "Chat request failed."
            });
            controller.close();
          } finally {
            reader.releaseLock();
          }
        }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive"
        }
      });
    }

    const result = await runSkillChat({
      conversationId: parsed.data.conversationId,
      skillSlug: parsed.data.skillSlug,
      message: parsed.data.message,
      lang: getLang(parsed.data.lang),
      surface: parsed.data.surface
    });

    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Chat request failed."
      },
      { status: 500 }
    );
  }
}
