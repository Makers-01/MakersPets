import { prisma } from "@/lib/db";
import { bootstrapSummary } from "@/lib/bootstrap";
import { getChatMemorySnapshot } from "@/lib/chat";
import { getReminderSchedulerStatus } from "@/lib/reminder-scheduler";
import {
  evaluateReminderRuntime,
  getReminderAdminData,
  getReminderRuntimeConfig
} from "@/lib/reminders";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export type AdminSnapshot = {
  providers: Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    apiBaseUrl: string | null;
    status: string;
    models: string[];
    apiKeys: Array<{
      id: string;
      label: string;
      keyPreview: string | null;
      status: string;
      isDefault: boolean;
      createdAt: string;
    }>;
  }>;
  models: Array<{
    id: string;
    slug: string;
    displayName: string;
    apiModel: string;
    providerName: string;
    enabled: boolean;
    maxTokens: number | null;
    contextWindow: number | null;
  }>;
  skills: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    systemPrompt: string;
    enabled: boolean;
    toolSummary: string;
    memoryScope: string;
    mood: string;
    defaultModelId: string | null;
    defaultModelName: string | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    notes: string | null;
    category: string | null;
    priority: string;
    dueAt: string | null;
    active: boolean;
    completed: boolean;
    lastRemindedAt: string | null;
    createdAt: string;
  }>;
  pet: {
    id: string;
    slug: string;
    name: string;
    description: string;
    personaPrompt: string | null;
    defaultSkill: string | null;
    defaultSkillId: string | null;
    mascotName: string;
    reminderCadence: string;
    reminderTone: string;
    companionStyle: string;
    desktopChatInputEnabled: boolean;
  };
  counts: {
    providers: number;
    models: number;
    skills: number;
    pets: number;
    tasks: number;
  };
  reminders: {
    enabled: boolean;
    timezone: string;
    defaultLocation: string;
    quietHoursStart: string;
    quietHoursEnd: string;
    checkIntervalMinutes: number;
    reminderWindowStart: string;
    reminderWindowEnd: string;
    localTime: string;
    inQuietHours: boolean;
    inReminderWindow: boolean;
    shouldCheckNow: boolean;
    scheduler: {
      active: boolean;
      startedAt: string | null;
      intervalMs: number;
      lastTickAt: string | null;
      lastOutcome: string | null;
      running: boolean;
    };
    latestRun: {
      id: string;
      status: string;
      reason: string | null;
      prompt: string | null;
      reply: string | null;
      createdAt: string;
      skillName: string | null;
      modelName: string | null;
      providerName: string | null;
    } | null;
    recentRuns: Array<{
      id: string;
      status: string;
      reason: string | null;
      prompt: string | null;
      reply: string | null;
      createdAt: string;
      skillName: string | null;
      modelName: string | null;
      providerName: string | null;
    }>;
  };
  memory: {
    messageCount: number;
    memoryCount: number;
    summaries: Array<{
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
      memory: {
        summary: string;
        profile: string[];
        preferences: string[];
        projects: string[];
        sourceMessageCount: number;
        updatedAt: string;
      } | null;
    }>;
  };
};

export async function getAdminSnapshot(): Promise<AdminSnapshot> {
  try {
    const [
      providers,
      models,
      skills,
      pet,
      tasks,
      providerCount,
      modelCount,
      skillCount,
      petCount,
      taskCount,
      reminderConfig,
      reminderAdminData,
      memory
    ] =
      await Promise.all([
        prisma.provider.findMany({
          orderBy: { name: "asc" },
          include: {
            models: {
              where: { enabled: true },
              orderBy: { displayName: "asc" }
            },
            apiKeys: {
              orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }]
            }
          }
        }),
        prisma.modelProfile.findMany({
          orderBy: [{ provider: { name: "asc" } }, { displayName: "asc" }],
          include: { provider: true }
        }),
        prisma.skill.findMany({
          include: { defaultModel: true },
          orderBy: { name: "asc" }
        }),
        prisma.petProfile.findFirst({
          where: { slug: "makers" },
          include: { defaultSkill: true }
        }),
        prisma.reminderTask.findMany({
          orderBy: [{ completed: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }]
        }),
        prisma.provider.count(),
        prisma.modelProfile.count(),
        prisma.skill.count(),
        prisma.petProfile.count(),
        prisma.reminderTask.count(),
        getReminderRuntimeConfig(),
        getReminderAdminData(),
        getChatMemorySnapshot()
      ]);
    const reminderState = evaluateReminderRuntime(reminderConfig);
    const scheduler = getReminderSchedulerStatus();

    return {
      providers: providers.map((provider) => ({
        id: provider.id,
        slug: provider.slug,
        name: provider.name,
        description: provider.description,
        apiBaseUrl: provider.apiBaseUrl,
        status: provider.status,
        models: provider.models.map((model) => model.displayName),
        apiKeys: provider.apiKeys.map((apiKey) => ({
          id: apiKey.id,
          label: apiKey.label,
          keyPreview: apiKey.keyPreview,
          status: apiKey.status,
          isDefault: apiKey.isDefault,
          createdAt: apiKey.createdAt.toISOString()
        }))
      })),
      models: models.map((model) => ({
        id: model.id,
        slug: model.slug,
        displayName: model.displayName,
        apiModel: model.apiModel,
        providerName: model.provider.name,
        enabled: model.enabled,
        maxTokens: model.maxTokens,
        contextWindow: model.contextWindow
      })),
      skills: skills.map((skill) => ({
        id: skill.id,
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        systemPrompt: skill.systemPrompt,
        enabled: skill.enabled,
        toolSummary: Array.isArray(asRecord(skill.toolPolicy).tools)
          ? (asRecord(skill.toolPolicy).tools as unknown[]).join(", ") || "—"
          : "—",
        memoryScope:
          typeof asRecord(skill.memoryPolicy).scope === "string"
            ? (asRecord(skill.memoryPolicy).scope as string)
            : "session",
        mood:
          typeof asRecord(skill.uiConfig).mood === "string"
            ? (asRecord(skill.uiConfig).mood as string)
            : "steady",
        defaultModelId: skill.defaultModelId ?? null,
        defaultModelName: skill.defaultModel?.displayName ?? null
      })),
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        notes: task.notes,
        category: task.category,
        priority: task.priority,
        dueAt: task.dueAt ? task.dueAt.toISOString() : null,
        active: task.active,
        completed: task.completed,
        lastRemindedAt: task.lastRemindedAt ? task.lastRemindedAt.toISOString() : null,
        createdAt: task.createdAt.toISOString()
      })),
      pet: pet
        ? (() => {
            const visualConfig = asRecord(pet.visualConfig);
            const animationSpec = asRecord(pet.animationSpec);

            return {
              id: pet.id,
              slug: pet.slug,
              name: pet.name,
              description: pet.description,
              personaPrompt: pet.personaPrompt,
              defaultSkill: pet.defaultSkill?.name ?? null,
              defaultSkillId: pet.defaultSkillId ?? null,
              mascotName:
                typeof visualConfig.mascotName === "string"
                  ? (visualConfig.mascotName as string)
                  : pet.name,
              reminderCadence:
                typeof animationSpec.reminderCadence === "string"
                  ? (animationSpec.reminderCadence as string)
                  : "gentle-daily",
              reminderTone:
                typeof animationSpec.reminderTone === "string"
                  ? (animationSpec.reminderTone as string)
                  : "warm",
              companionStyle:
                typeof visualConfig.companionStyle === "string"
                  ? (visualConfig.companionStyle as string)
                  : "gentle",
              desktopChatInputEnabled:
                typeof visualConfig.desktopChatInputEnabled === "boolean"
                  ? (visualConfig.desktopChatInputEnabled as boolean)
                  : true
            };
          })()
        : {
            id: "makers",
            slug: bootstrapSummary.initialPet.slug,
            name: bootstrapSummary.initialPet.name,
            description: bootstrapSummary.initialPet.description,
            personaPrompt: null,
            defaultSkill: null,
            defaultSkillId: null,
            mascotName: bootstrapSummary.initialPet.name,
            reminderCadence: "gentle-daily",
            reminderTone: "warm",
            companionStyle: "gentle",
            desktopChatInputEnabled: true
          },
      counts: {
        providers: providerCount,
        models: modelCount,
        skills: skillCount,
        pets: petCount,
        tasks: taskCount
      },
      reminders: {
        ...reminderConfig,
        ...reminderState,
        scheduler,
        latestRun: reminderAdminData.latestRun
          ? {
              id: reminderAdminData.latestRun.id,
              status: reminderAdminData.latestRun.status,
              reason: reminderAdminData.latestRun.reason,
              prompt: reminderAdminData.latestRun.prompt,
              reply: reminderAdminData.latestRun.reply,
              createdAt: reminderAdminData.latestRun.createdAt,
              skillName: reminderAdminData.latestRun.skillName,
              modelName: reminderAdminData.latestRun.modelName,
              providerName: reminderAdminData.latestRun.providerName
            }
          : null,
        recentRuns: reminderAdminData.recentRuns.map((run) => ({
          id: run.id,
          status: run.status,
          reason: run.reason,
          prompt: run.prompt,
          reply: run.reply,
          createdAt: run.createdAt,
          skillName: run.skillName,
          modelName: run.modelName,
          providerName: run.providerName
        }))
      },
      memory
    };
  } catch {
    return {
      providers: bootstrapSummary.defaultProviderTargets.map((provider) => ({
        id: provider.slug,
        slug: provider.slug,
        name: provider.name,
        description: null,
        apiBaseUrl: null,
        status: "ACTIVE",
        models: provider.initialModels,
        apiKeys: []
      })),
      models: [],
      skills: bootstrapSummary.initialSkills.map((skill) => ({
        id: skill,
        slug: skill,
        name: skill,
        description: "Pending database bootstrap.",
        systemPrompt: "Pending database bootstrap.",
        enabled: true,
        toolSummary: "—",
        memoryScope: "session",
        mood: "steady",
        defaultModelId: null,
        defaultModelName: null
      })),
      tasks: [],
      pet: {
        id: bootstrapSummary.initialPet.slug,
        slug: bootstrapSummary.initialPet.slug,
        name: bootstrapSummary.initialPet.name,
        description: bootstrapSummary.initialPet.description,
        personaPrompt: null,
        defaultSkill: null,
        defaultSkillId: null,
        mascotName: bootstrapSummary.initialPet.name,
        reminderCadence: "gentle-daily",
        reminderTone: "warm",
        companionStyle: "gentle",
        desktopChatInputEnabled: false
      },
      counts: {
        providers: 0,
        models: 0,
        skills: 0,
        pets: 0,
        tasks: 0
      },
      reminders: {
        enabled: true,
        timezone: "Asia/Shanghai",
        defaultLocation: "Shanghai",
        quietHoursStart: "23:00",
        quietHoursEnd: "08:00",
        checkIntervalMinutes: 30,
        reminderWindowStart: "09:00",
        reminderWindowEnd: "21:00",
        localTime: "00:00",
        inQuietHours: false,
        inReminderWindow: false,
        shouldCheckNow: false,
        scheduler: {
          active: false,
          startedAt: null,
          intervalMs: 60000,
          lastTickAt: null,
          lastOutcome: null,
          running: false
        },
        latestRun: null,
        recentRuns: []
      },
      memory: {
        messageCount: 0,
        memoryCount: 0,
        summaries: []
      }
    };
  }
}
