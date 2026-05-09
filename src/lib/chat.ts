import { prisma } from "@/lib/db";
import { copy, UiLang } from "@/lib/i18n";
import { buildLiveContextPrompt } from "@/lib/live-context";

type HistoryMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
};

type RuntimeSelection = {
  petName: string;
  skillSlug: string;
  skillName: string;
  modelId: string;
  modelName: string;
  apiModel: string;
  providerName: string;
  providerSlug: string;
  apiBaseUrl: string;
  apiKey: string;
  systemPrompt: string;
};

type ChatSurface = "chat" | "desktop";

type HistoryBudget = {
  limit: number;
  perMessageChars: number;
  totalChars: number;
};

type DistilledMemory = {
  summary: string;
  profile: string[];
  preferences: string[];
  projects: string[];
  sourceMessageCount: number;
  updatedAt: string;
};

export type ChatMemorySummary = {
  conversationId: string;
  conversationSlug: string;
  conversationTitle: string;
  messageCount: number;
  recentMessages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
  }>;
  memory: DistilledMemory | null;
};

const defaultConversation = {
  slug: "main",
  title: "Makers Main Chat"
} as const;

export const desktopConversation = {
  slug: "desktop",
  title: "Makers Desktop Chat"
} as const;

export const reminderConversation = {
  slug: "reminders",
  title: "Makers Reminder Feed"
} as const;

const memorySettingKeyPrefix = "memory.summary.";

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function buildSystemPrompt(personaPrompt: string | null, skillPrompt: string) {
  return [personaPrompt, skillPrompt].filter(Boolean).join("\n\n");
}

function buildSurfacePrompt(surface: ChatSurface) {
  if (surface !== "desktop") return "";

  return [
    "You are replying inside a tiny desktop pet bubble.",
    "Reply briefly and clearly.",
    "Use at most two short sentences.",
    "Avoid lists, preambles, and long explanations."
  ].join(" ");
}

function getHistoryBudget(surface: ChatSurface): HistoryBudget {
  if (surface === "desktop") {
    return {
      limit: 4,
      perMessageChars: 220,
      totalChars: 720
    };
  }

  return {
    limit: 8,
    perMessageChars: 420,
    totalChars: 2200
  };
}

function getMemorySettingKey(conversationSlug: string) {
  return `${memorySettingKeyPrefix}${conversationSlug}`;
}

type ConversationLookup = {
  conversationId?: string;
  conversationSlug?: string;
  conversationTitle?: string;
};

type PreparedSkillChat = {
  conversation: {
    id: string;
    slug: string;
    title: string;
  };
  runtime: RuntimeSelection;
  history: HistoryMessage[];
  memory: DistilledMemory | null;
  requestBody: {
    model: string;
    messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }>;
    max_tokens: number;
    thinking?: {
      type: "disabled";
    };
  };
};

export async function getOrCreateConversation(lookup: ConversationLookup = {}) {
  if (lookup.conversationId) {
    const existing = await prisma.conversation.findUnique({
      where: { id: lookup.conversationId }
    });

    if (existing) {
      return existing;
    }
  }

  const slug = lookup.conversationSlug ?? defaultConversation.slug;
  const title = lookup.conversationTitle ?? defaultConversation.title;

  return prisma.conversation.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      title
    }
  });
}

async function getConversationHistory(conversationId: string, limit = 12): Promise<HistoryMessage[]> {
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit
  });

  return messages
    .reverse()
    .map((message) => ({
      id: message.id,
      role: message.role === "ASSISTANT" ? "assistant" : "user",
      content: message.content
    }));
}

function truncateContent(content: string, maxChars: number) {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, Math.max(0, maxChars - 1))}…`;
}

function compactHistory(messages: HistoryMessage[], budget: HistoryBudget) {
  const recent = messages.slice(-budget.limit);
  const collected: HistoryMessage[] = [];
  let totalChars = 0;

  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const item = recent[index];
    const remaining = budget.totalChars - totalChars;

    if (remaining < 80) {
      break;
    }

    const content = truncateContent(item.content, Math.min(budget.perMessageChars, remaining));
    totalChars += content.length;
    collected.push({
      ...item,
      content
    });
  }

  return collected.reverse();
}

function normalizeMemoryLine(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

function splitMemoryCandidates(content: string) {
  return content
    .split(/[\n。！？!?]/)
    .map((item) => normalizeMemoryLine(item))
    .filter((item) => item.length >= 6);
}

function pickUniqueLines(candidates: string[], maxItems: number) {
  const seen = new Set<string>();
  const picked: string[] = [];

  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    picked.push(truncateContent(candidate, 140));
    if (picked.length >= maxItems) break;
  }

  return picked;
}

function distillConversationMemory(messages: HistoryMessage[]): DistilledMemory | null {
  const userLines = messages
    .filter((message) => message.role === "user")
    .flatMap((message) => splitMemoryCandidates(message.content));

  if (userLines.length === 0) {
    return null;
  }

  const profile = pickUniqueLines(
    userLines.filter((line) => /(我叫|我是|请叫我|我的名字|我在做|我是做)/.test(line)),
    4
  );
  const preferences = pickUniqueLines(
    userLines.filter((line) => /(记住|以后|默认|希望|请用|不要|别|优先|简洁|风格|语气)/.test(line)),
    6
  );
  const projects = pickUniqueLines(
    userLines.filter((line) => /(项目|正在做|想做|目标|桌宠|后台|模型|提醒|技能|聊天)/.test(line)),
    6
  );

  const summaryParts = [
    profile.length ? `用户身份/自我描述：${profile.join("；")}` : "",
    preferences.length ? `稳定偏好：${preferences.join("；")}` : "",
    projects.length ? `当前重点：${projects.join("；")}` : ""
  ].filter(Boolean);

  if (summaryParts.length === 0) {
    return null;
  }

  return {
    summary: summaryParts.join("\n"),
    profile,
    preferences,
    projects,
    sourceMessageCount: messages.length,
    updatedAt: new Date().toISOString()
  };
}

function buildMemoryPrompt(memory: DistilledMemory | null) {
  if (!memory) return "";

  return [
    "Distilled memory from earlier conversation. Prefer this over raw old turns when useful:",
    memory.summary
  ].join("\n");
}

async function getConversationMemory(conversationSlug: string) {
  const setting = await prisma.setting.findUnique({
    where: {
      key: getMemorySettingKey(conversationSlug)
    }
  });

  if (!setting || !setting.value || typeof setting.value !== "object" || Array.isArray(setting.value)) {
    return null;
  }

  const value = setting.value as Record<string, unknown>;

  return {
    summary: typeof value.summary === "string" ? value.summary : "",
    profile: Array.isArray(value.profile) ? value.profile.filter((item): item is string => typeof item === "string") : [],
    preferences: Array.isArray(value.preferences)
      ? value.preferences.filter((item): item is string => typeof item === "string")
      : [],
    projects: Array.isArray(value.projects)
      ? value.projects.filter((item): item is string => typeof item === "string")
      : [],
    sourceMessageCount: typeof value.sourceMessageCount === "number" ? value.sourceMessageCount : 0,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString()
  } satisfies DistilledMemory;
}

async function refreshConversationMemory(conversationId: string, conversationSlug: string) {
  const fullHistory = await getConversationHistory(conversationId, 48);
  const distilled = distillConversationMemory(fullHistory);

  if (!distilled) {
    await prisma.setting.deleteMany({
      where: {
        key: getMemorySettingKey(conversationSlug)
      }
    });
    return null;
  }

  await prisma.setting.upsert({
    where: {
      key: getMemorySettingKey(conversationSlug)
    },
    update: {
      value: distilled
    },
    create: {
      key: getMemorySettingKey(conversationSlug),
      value: distilled
    }
  });

  return distilled;
}

export async function getChatPageData() {
  const [pet, skills, conversation] = await Promise.all([
    prisma.petProfile.findFirst({
      where: { slug: "makers" },
      include: { defaultSkill: true }
    }),
    prisma.skill.findMany({
      where: { enabled: true },
      include: { defaultModel: true },
      orderBy: { name: "asc" }
    }),
    getOrCreateConversation()
  ]);
  const messages = await getConversationHistory(conversation.id, 24);

  const defaultSkillSlug =
    skills.find((skill) => skill.id === pet?.defaultSkillId)?.slug ?? skills[0]?.slug ?? "chat";

  return {
    conversationId: conversation.id,
    conversationSlug: conversation.slug,
    petName: pet?.name ?? "Makers",
    defaultSkillSlug,
    initialMessages: messages,
    skills: skills.map((skill) => ({
      slug: skill.slug,
      name: skill.name,
      defaultModelName: skill.defaultModel?.displayName ?? null
    }))
  };
}

export async function getDesktopPageData() {
  const [pet, skills, conversation] = await Promise.all([
    prisma.petProfile.findFirst({
      where: { slug: "makers" }
    }),
    prisma.skill.findMany({
      where: { enabled: true },
      include: { defaultModel: true },
      orderBy: { name: "asc" }
    }),
    getOrCreateConversation({
      conversationSlug: desktopConversation.slug,
      conversationTitle: desktopConversation.title
    })
  ]);
  const messages = await getConversationHistory(conversation.id, 16);

  const visualConfig =
    pet?.visualConfig && typeof pet.visualConfig === "object" && !Array.isArray(pet.visualConfig)
      ? (pet.visualConfig as Record<string, unknown>)
      : {};
  const defaultSkillSlug =
    skills.find((skill) => skill.id === pet?.defaultSkillId)?.slug ?? skills[0]?.slug ?? "chat";

  return {
    conversationId: conversation.id,
    conversationSlug: conversation.slug,
    petName: pet?.name ?? "Makers",
    defaultSkillSlug,
    initialMessages: messages,
    skills: skills.map((skill) => ({
      slug: skill.slug,
      name: skill.name,
      defaultModelName: skill.defaultModel?.displayName ?? null
    })),
    desktopChatInputEnabled:
      typeof visualConfig.desktopChatInputEnabled === "boolean"
        ? (visualConfig.desktopChatInputEnabled as boolean)
        : true
  };
}

export async function getChatMemorySnapshot() {
  const [messageCount, conversations, settings] = await Promise.all([
    prisma.chatMessage.count(),
    prisma.conversation.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 8
        },
        _count: {
          select: {
            messages: true
          }
        }
      }
    }),
    prisma.setting.findMany({
      where: {
        key: {
          startsWith: memorySettingKeyPrefix
        }
      },
      orderBy: { updatedAt: "desc" }
    })
  ]);

  const memoryBySlug = new Map<string, DistilledMemory>();

  for (const setting of settings) {
    const slug = setting.key.replace(memorySettingKeyPrefix, "");
    if (!slug || !setting.value || typeof setting.value !== "object" || Array.isArray(setting.value)) {
      continue;
    }

    const value = setting.value as Record<string, unknown>;

    memoryBySlug.set(slug, {
      summary: typeof value.summary === "string" ? value.summary : "",
      profile: Array.isArray(value.profile)
        ? value.profile.filter((item): item is string => typeof item === "string")
        : [],
      preferences: Array.isArray(value.preferences)
        ? value.preferences.filter((item): item is string => typeof item === "string")
        : [],
      projects: Array.isArray(value.projects)
        ? value.projects.filter((item): item is string => typeof item === "string")
        : [],
      sourceMessageCount: typeof value.sourceMessageCount === "number" ? value.sourceMessageCount : 0,
      updatedAt:
        typeof value.updatedAt === "string" ? value.updatedAt : setting.updatedAt.toISOString()
    });
  }

  const summaries: ChatMemorySummary[] = conversations.map((conversation) => ({
    conversationId: conversation.id,
    conversationSlug: conversation.slug,
    conversationTitle: conversation.title,
    messageCount: conversation._count.messages,
    recentMessages: conversation.messages
      .slice()
      .reverse()
      .map((message) => ({
        id: message.id,
        role: message.role === "ASSISTANT" ? "assistant" : "user",
        content: message.content,
        createdAt: message.createdAt.toISOString()
      })),
    memory: memoryBySlug.get(conversation.slug) ?? null
  }));

  return {
    messageCount,
    memoryCount: settings.length,
    summaries
  };
}

async function resolveChatRuntime(skillSlug?: string): Promise<RuntimeSelection> {
  const [pet, settings, skills, models] = await Promise.all([
    prisma.petProfile.findFirst({
      where: { slug: "makers" },
      include: { defaultSkill: true }
    }),
    prisma.setting.findMany({
      where: {
        key: {
          in: ["models.default.primary", "skills.default.slug"]
        }
      }
    }),
    prisma.skill.findMany({
      where: { enabled: true },
      include: { defaultModel: true },
      orderBy: { name: "asc" }
    }),
    prisma.modelProfile.findMany({
      where: { enabled: true, provider: { status: "ACTIVE" } },
      include: {
        provider: {
          include: {
            apiKeys: {
              where: { status: "ACTIVE" },
              orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }]
            }
          }
        }
      },
      orderBy: [{ provider: { name: "asc" } }, { displayName: "asc" }]
    })
  ]);

  if (skills.length === 0) {
    throw new Error("No enabled skills are available.");
  }

  if (models.length === 0) {
    throw new Error("No enabled models are available.");
  }

  const settingsMap = new Map(settings.map((setting) => [setting.key, setting.value]));
  const preferredSkillSlug = asString(settingsMap.get("skills.default.slug"));
  const preferredModelSlug = asString(settingsMap.get("models.default.primary"));

  const selectedSkill =
    skills.find((skill) => skill.slug === skillSlug) ??
    skills.find((skill) => skill.id === pet?.defaultSkillId) ??
    skills.find((skill) => skill.slug === preferredSkillSlug) ??
    skills[0];

  const selectedModel =
    models.find((model) => model.id === selectedSkill.defaultModelId) ??
    models.find((model) => model.slug === preferredModelSlug) ??
    models[0];

  const apiKey = selectedModel.provider.apiKeys[0];

  if (!apiKey) {
    throw new Error(`Provider ${selectedModel.provider.name} does not have an active API key.`);
  }

  return {
    petName: pet?.name ?? "Makers",
    skillSlug: selectedSkill.slug,
    skillName: selectedSkill.name,
    modelId: selectedModel.id,
    modelName: selectedModel.displayName,
    apiModel: selectedModel.apiModel,
    providerName: selectedModel.provider.name,
    providerSlug: selectedModel.provider.slug,
    apiBaseUrl: selectedModel.provider.apiBaseUrl ?? "https://api.deepseek.com",
    apiKey: apiKey.secretValue,
    systemPrompt: buildSystemPrompt(pet?.personaPrompt ?? null, selectedSkill.systemPrompt)
  };
}

export async function prepareSkillChat(params: {
  conversationId?: string;
  conversationSlug?: string;
  conversationTitle?: string;
  skillSlug?: string;
  message: string;
  surface?: ChatSurface;
  lang?: UiLang;
}) : Promise<PreparedSkillChat> {
  const surface = params.surface ?? "chat";
  const conversation = await getOrCreateConversation({
    conversationId: params.conversationId,
    conversationSlug: params.conversationSlug,
    conversationTitle: params.conversationTitle
  });
  const runtime = await resolveChatRuntime(params.skillSlug);
  const [memory, rawHistory, liveContext] = await Promise.all([
    getConversationMemory(conversation.slug),
    getConversationHistory(conversation.id, surface === "desktop" ? 6 : 12),
    buildLiveContextPrompt(params.message, params.lang ?? "zh")
  ]);
  const history = compactHistory(rawHistory, getHistoryBudget(surface));

  return {
    conversation,
    runtime,
    history,
    memory,
    requestBody: {
      model: runtime.apiModel,
      messages: [
        {
          role: "system",
          content: [
            runtime.systemPrompt,
            buildMemoryPrompt(memory),
            buildSurfacePrompt(surface),
            liveContext.prompt
          ]
            .filter(Boolean)
            .join("\n\n")
        },
        ...history.map((item) => ({
          role: item.role,
          content: item.content
        })),
        { role: "user", content: params.message }
      ],
      max_tokens: surface === "desktop" ? 120 : 240,
      ...(runtime.providerSlug === "deepseek" ? { thinking: { type: "disabled" as const } } : {})
    }
  };
}

export async function saveSkillChatResult(params: {
  conversationId: string;
  conversationSlug: string;
  userMessage: string;
  reply: string;
  runtime: RuntimeSelection;
}) {
  const savedMessages = await prisma.$transaction(async (tx) => {
    const userMessage = await tx.chatMessage.create({
      data: {
        conversationId: params.conversationId,
        role: "USER",
        content: params.userMessage,
        skillSlug: params.runtime.skillSlug,
        skillName: params.runtime.skillName,
        modelName: params.runtime.modelName,
        providerName: params.runtime.providerName
      }
    });

    const assistantMessage = await tx.chatMessage.create({
      data: {
        conversationId: params.conversationId,
        role: "ASSISTANT",
        content: params.reply,
        skillSlug: params.runtime.skillSlug,
        skillName: params.runtime.skillName,
        modelName: params.runtime.modelName,
        providerName: params.runtime.providerName
      }
    });

    return { userMessage, assistantMessage };
  });

  await refreshConversationMemory(params.conversationId, params.conversationSlug);

  return savedMessages;
}

export async function runSkillChat(params: {
  conversationId?: string;
  conversationSlug?: string;
  conversationTitle?: string;
  skillSlug?: string;
  message: string;
  lang?: UiLang;
  surface?: ChatSurface;
}) {
  const surface = params.surface ?? "chat";
  const prepared = await prepareSkillChat(params);
  const { conversation, runtime } = prepared;
  const response = await fetch(`${runtime.apiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${runtime.apiKey}`
    },
    body: JSON.stringify({
      ...prepared.requestBody,
      stream: false
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(surface === "desktop" ? 20000 : 45000)
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Chat request failed with ${response.status}: ${JSON.stringify(payload).slice(0, 400)}`
    );
  }

  const reply =
    typeof payload?.choices?.[0]?.message?.content === "string"
      ? payload.choices[0].message.content
      : copy[params.lang ?? "zh"].chat.noReply;

  const savedMessages = await saveSkillChatResult({
    conversationId: conversation.id,
    conversationSlug: conversation.slug,
    userMessage: params.message,
    reply,
    runtime
  });

  return {
    conversationId: conversation.id,
    reply,
    messages: [
      {
        id: savedMessages.userMessage.id,
        role: "user" as const,
        content: savedMessages.userMessage.content
      },
      {
        id: savedMessages.assistantMessage.id,
        role: "assistant" as const,
        content: savedMessages.assistantMessage.content
      }
    ],
    usage: payload?.usage ?? null,
    runtime: {
      petName: runtime.petName,
      skillSlug: runtime.skillSlug,
      skillName: runtime.skillName,
      modelName: runtime.modelName,
      providerName: runtime.providerName
    }
  };
}

export async function clearChatHistory() {
  const [deletedMessages, deletedMemories] = await prisma.$transaction([
    prisma.chatMessage.deleteMany({}),
    prisma.setting.deleteMany({
      where: {
        key: {
          startsWith: memorySettingKeyPrefix
        }
      }
    })
  ]);

  return {
    deletedMessages: deletedMessages.count,
    deletedMemories: deletedMemories.count
  };
}

export async function clearConversationMemory(conversationSlug: string) {
  const deleted = await prisma.setting.deleteMany({
    where: {
      key: getMemorySettingKey(conversationSlug)
    }
  });

  return {
    deletedMemories: deleted.count
  };
}

export async function clearConversationHistory(params: {
  conversationId: string;
  conversationSlug: string;
}) {
  const [deletedMessages, deletedMemories] = await prisma.$transaction([
    prisma.chatMessage.deleteMany({
      where: {
        conversationId: params.conversationId
      }
    }),
    prisma.setting.deleteMany({
      where: {
        key: getMemorySettingKey(params.conversationSlug)
      }
    })
  ]);

  return {
    deletedMessages: deletedMessages.count,
    deletedMemories: deletedMemories.count
  };
}
