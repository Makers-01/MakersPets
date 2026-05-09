import { z } from "zod";
import { prisma } from "@/lib/db";
import { getReminderRuntimeConfig, reminderSettingKeys } from "@/lib/reminders";

const providerSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  apiBaseUrl: z.string().nullable().optional(),
  status: z.string().optional()
});

const modelSchema = z.object({
  providerSlug: z.string().min(1),
  slug: z.string().min(1),
  displayName: z.string().min(1),
  apiModel: z.string().min(1),
  enabled: z.boolean().default(true),
  maxTokens: z.number().int().positive().nullable().optional(),
  contextWindow: z.number().int().positive().nullable().optional()
});

const skillSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  systemPrompt: z.string().min(1),
  enabled: z.boolean().default(true),
  toolPolicy: z.unknown().optional(),
  memoryPolicy: z.unknown().optional(),
  uiConfig: z.unknown().optional(),
  defaultModelSlug: z.string().nullable().optional()
});

const petSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  personaPrompt: z.string().nullable().optional(),
  mascotName: z.string().min(1),
  reminderCadence: z.string().min(1),
  reminderTone: z.string().min(1),
  companionStyle: z.string().min(1),
  desktopChatInputEnabled: z.boolean().default(true),
  defaultSkillSlug: z.string().nullable().optional()
});

const taskSchema = z.object({
  title: z.string().min(1),
  notes: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  priority: z.string().default("normal"),
  dueAt: z.string().datetime().nullable().optional(),
  active: z.boolean().default(true),
  completed: z.boolean().default(false)
});

const reminderSchema = z.object({
  enabled: z.boolean(),
  timezone: z.string().min(1),
  defaultLocation: z.string().min(1),
  quietHoursStart: z.string().min(1),
  quietHoursEnd: z.string().min(1),
  checkIntervalMinutes: z.number().int().positive(),
  reminderWindowStart: z.string().min(1),
  reminderWindowEnd: z.string().min(1)
});

const configTransferSchema = z.object({
  app: z.literal("MakersPet"),
  version: z.number().int().positive(),
  exportedAt: z.string(),
  note: z.string().optional(),
  reminders: reminderSchema,
  providers: z.array(providerSchema),
  models: z.array(modelSchema),
  skills: z.array(skillSchema),
  pet: petSchema,
  tasks: z.array(taskSchema)
});

export type ConfigTransferBundle = z.infer<typeof configTransferSchema>;

export async function exportConfigBundle(): Promise<ConfigTransferBundle> {
  const [providers, models, skills, pet, tasks, reminders] = await Promise.all([
    prisma.provider.findMany({
      orderBy: { name: "asc" }
    }),
    prisma.modelProfile.findMany({
      include: { provider: true },
      orderBy: [{ provider: { name: "asc" } }, { displayName: "asc" }]
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
      orderBy: [{ completed: "asc" }, { dueAt: "asc" }, { createdAt: "asc" }]
    }),
    getReminderRuntimeConfig()
  ]);

  const visualConfig =
    pet?.visualConfig && typeof pet.visualConfig === "object" && !Array.isArray(pet.visualConfig)
      ? (pet.visualConfig as Record<string, unknown>)
      : {};
  const animationSpec =
    pet?.animationSpec &&
    typeof pet.animationSpec === "object" &&
    !Array.isArray(pet.animationSpec)
      ? (pet.animationSpec as Record<string, unknown>)
      : {};

  return {
    app: "MakersPet",
    version: 1,
    exportedAt: new Date().toISOString(),
    note: "API key secrets are intentionally excluded. Re-enter provider keys after import.",
    reminders,
    providers: providers.map((provider) => ({
      slug: provider.slug,
      name: provider.name,
      description: provider.description,
      apiBaseUrl: provider.apiBaseUrl,
      status: provider.status
    })),
    models: models.map((model) => ({
      providerSlug: model.provider.slug,
      slug: model.slug,
      displayName: model.displayName,
      apiModel: model.apiModel,
      enabled: model.enabled,
      maxTokens: model.maxTokens,
      contextWindow: model.contextWindow
    })),
    skills: skills.map((skill) => ({
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      systemPrompt: skill.systemPrompt,
      enabled: skill.enabled,
      toolPolicy: skill.toolPolicy,
      memoryPolicy: skill.memoryPolicy,
      uiConfig: skill.uiConfig,
      defaultModelSlug: skill.defaultModel?.slug ?? null
    })),
    pet: {
      slug: pet?.slug ?? "makers",
      name: pet?.name ?? "Makers",
      description: pet?.description ?? "A companion-first desktop pet.",
      personaPrompt: pet?.personaPrompt ?? null,
      mascotName:
        typeof visualConfig.mascotName === "string" ? visualConfig.mascotName : pet?.name ?? "Makers",
      reminderCadence:
        typeof animationSpec.reminderCadence === "string"
          ? animationSpec.reminderCadence
          : "gentle-daily",
      reminderTone:
        typeof animationSpec.reminderTone === "string" ? animationSpec.reminderTone : "warm",
      companionStyle:
        typeof visualConfig.companionStyle === "string" ? visualConfig.companionStyle : "gentle",
      desktopChatInputEnabled:
        typeof visualConfig.desktopChatInputEnabled === "boolean"
          ? visualConfig.desktopChatInputEnabled
          : true,
      defaultSkillSlug: pet?.defaultSkill?.slug ?? null
    },
    tasks: tasks.map((task) => ({
      title: task.title,
      notes: task.notes,
      category: task.category,
      priority: task.priority,
      dueAt: task.dueAt ? task.dueAt.toISOString() : null,
      active: task.active,
      completed: task.completed
    }))
  };
}

export async function importConfigBundle(input: string) {
  const raw = JSON.parse(input);
  const bundle = configTransferSchema.parse(raw);

  await prisma.$transaction(async (tx) => {
    for (const provider of bundle.providers) {
      await tx.provider.upsert({
        where: { slug: provider.slug },
        update: {
          name: provider.name,
          description: provider.description ?? null,
          apiBaseUrl: provider.apiBaseUrl ?? null,
          status: provider.status === "DISABLED" ? "DISABLED" : "ACTIVE"
        },
        create: {
          slug: provider.slug,
          name: provider.name,
          description: provider.description ?? null,
          apiBaseUrl: provider.apiBaseUrl ?? null,
          status: provider.status === "DISABLED" ? "DISABLED" : "ACTIVE"
        }
      });
    }

    const providerRecords = await tx.provider.findMany();
    const providerIdBySlug = new Map(providerRecords.map((provider) => [provider.slug, provider.id]));

    for (const model of bundle.models) {
      const providerId = providerIdBySlug.get(model.providerSlug);
      if (!providerId) continue;

      await tx.modelProfile.upsert({
        where: { slug: model.slug },
        update: {
          providerId,
          displayName: model.displayName,
          apiModel: model.apiModel,
          enabled: model.enabled,
          maxTokens: model.maxTokens ?? null,
          contextWindow: model.contextWindow ?? null
        },
        create: {
          providerId,
          slug: model.slug,
          displayName: model.displayName,
          apiModel: model.apiModel,
          enabled: model.enabled,
          maxTokens: model.maxTokens ?? null,
          contextWindow: model.contextWindow ?? null
        }
      });
    }

    const modelRecords = await tx.modelProfile.findMany();
    const modelIdBySlug = new Map(modelRecords.map((model) => [model.slug, model.id]));

    for (const skill of bundle.skills) {
      await tx.skill.upsert({
        where: { slug: skill.slug },
        update: {
          name: skill.name,
          description: skill.description,
          systemPrompt: skill.systemPrompt,
          enabled: skill.enabled,
          toolPolicy: skill.toolPolicy ?? undefined,
          memoryPolicy: skill.memoryPolicy ?? undefined,
          uiConfig: skill.uiConfig ?? undefined,
          defaultModelId: skill.defaultModelSlug ? modelIdBySlug.get(skill.defaultModelSlug) ?? null : null
        },
        create: {
          slug: skill.slug,
          name: skill.name,
          description: skill.description,
          systemPrompt: skill.systemPrompt,
          enabled: skill.enabled,
          toolPolicy: skill.toolPolicy ?? undefined,
          memoryPolicy: skill.memoryPolicy ?? undefined,
          uiConfig: skill.uiConfig ?? undefined,
          defaultModelId: skill.defaultModelSlug ? modelIdBySlug.get(skill.defaultModelSlug) ?? null : null
        }
      });
    }

    const skillRecords = await tx.skill.findMany();
    const skillIdBySlug = new Map(skillRecords.map((skill) => [skill.slug, skill.id]));

    await tx.petProfile.upsert({
      where: { slug: bundle.pet.slug },
      update: {
        name: bundle.pet.name,
        description: bundle.pet.description,
        personaPrompt: bundle.pet.personaPrompt ?? null,
        visualConfig: {
          mascotName: bundle.pet.mascotName,
          companionStyle: bundle.pet.companionStyle,
          desktopChatInputEnabled: bundle.pet.desktopChatInputEnabled,
          shellTargets: ["desktop", "web"]
        },
        animationSpec: {
          reminderCadence: bundle.pet.reminderCadence,
          reminderTone: bundle.pet.reminderTone
        },
        defaultSkillId: bundle.pet.defaultSkillSlug
          ? skillIdBySlug.get(bundle.pet.defaultSkillSlug) ?? null
          : null
      },
      create: {
        slug: bundle.pet.slug,
        name: bundle.pet.name,
        description: bundle.pet.description,
        personaPrompt: bundle.pet.personaPrompt ?? null,
        visualConfig: {
          mascotName: bundle.pet.mascotName,
          companionStyle: bundle.pet.companionStyle,
          desktopChatInputEnabled: bundle.pet.desktopChatInputEnabled,
          shellTargets: ["desktop", "web"]
        },
        animationSpec: {
          reminderCadence: bundle.pet.reminderCadence,
          reminderTone: bundle.pet.reminderTone
        },
        defaultSkillId: bundle.pet.defaultSkillSlug
          ? skillIdBySlug.get(bundle.pet.defaultSkillSlug) ?? null
          : null
      }
    });

    const settingEntries = [
      { key: reminderSettingKeys.enabled, value: bundle.reminders.enabled },
      { key: reminderSettingKeys.timezone, value: bundle.reminders.timezone },
      { key: reminderSettingKeys.defaultLocation, value: bundle.reminders.defaultLocation },
      { key: reminderSettingKeys.quietHoursStart, value: bundle.reminders.quietHoursStart },
      { key: reminderSettingKeys.quietHoursEnd, value: bundle.reminders.quietHoursEnd },
      {
        key: reminderSettingKeys.checkIntervalMinutes,
        value: bundle.reminders.checkIntervalMinutes
      },
      {
        key: reminderSettingKeys.reminderWindowStart,
        value: bundle.reminders.reminderWindowStart
      },
      { key: reminderSettingKeys.reminderWindowEnd, value: bundle.reminders.reminderWindowEnd }
    ];

    for (const entry of settingEntries) {
      await tx.setting.upsert({
        where: { key: entry.key },
        update: { value: entry.value },
        create: entry
      });
    }

    await tx.reminderTask.deleteMany();
    if (bundle.tasks.length) {
      await tx.reminderTask.createMany({
        data: bundle.tasks.map((task) => ({
          title: task.title,
          notes: task.notes ?? null,
          category: task.category ?? null,
          priority: task.priority,
          dueAt: task.dueAt ? new Date(task.dueAt) : null,
          active: task.active,
          completed: task.completed
        }))
      });
    }
  });

  return bundle;
}
