"use server";

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ApiKeyStatus, ProviderStatus, prisma } from "@/lib/db";
import { AdminTab, getAdminTab } from "@/lib/admin-nav";
import { clearChatHistory, clearConversationHistory, clearConversationMemory } from "@/lib/chat";
import { importConfigBundle } from "@/lib/config-transfer";
import { copy, getLang } from "@/lib/i18n";
import { reminderSettingKeys, runReminderCheck } from "@/lib/reminders";

const providerSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2),
  description: z.string().trim().max(400).optional().or(z.literal("")),
  apiBaseUrl: z.string().trim().url().optional().or(z.literal(""))
});

const providerStatusSchema = z.object({
  providerId: z.string().trim().min(1),
  nextStatus: z.nativeEnum(ProviderStatus)
});

const apiKeySchema = z.object({
  providerId: z.string().trim().min(1),
  label: z.string().trim().min(2).max(80),
  secretValue: z.string().trim().min(12),
  setAsDefault: z.boolean().optional().default(false)
});

const apiKeyStatusSchema = z.object({
  apiKeyId: z.string().trim().min(1),
  nextStatus: z.nativeEnum(ApiKeyStatus)
});

const defaultApiKeySchema = z.object({
  providerId: z.string().trim().min(1),
  apiKeyId: z.string().trim().min(1)
});

const providerTestSchema = z.object({
  providerId: z.string().trim().min(1),
  prompt: z.string().trim().min(4).max(400)
});

const modelSchema = z.object({
  providerId: z.string().trim().min(1),
  slug: z
    .string()
    .trim()
    .min(2)
    .regex(/^[a-z0-9-]+$/),
  displayName: z.string().trim().min(2).max(80),
  apiModel: z.string().trim().min(2).max(120),
  maxTokens: z.coerce.number().int().positive().optional(),
  contextWindow: z.coerce.number().int().positive().optional()
});

const modelStatusSchema = z.object({
  modelId: z.string().trim().min(1),
  nextEnabled: z.enum(["true", "false"])
});

const skillSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(6).max(240),
  systemPrompt: z.string().trim().min(12).max(2400)
});

const skillStatusSchema = z.object({
  skillId: z.string().trim().min(1),
  nextEnabled: z.enum(["true", "false"])
});

const skillBindingSchema = z.object({
  skillId: z.string().trim().min(1),
  defaultModelId: z.string().trim().optional().or(z.literal(""))
});

const petProfileSchema = z.object({
  petId: z.string().trim().min(1),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(8).max(400),
  personaPrompt: z.string().trim().min(12).max(2400).optional().or(z.literal("")),
  defaultSkillId: z.string().trim().optional().or(z.literal("")),
  mascotName: z.string().trim().min(2).max(80),
  reminderCadence: z.string().trim().min(2).max(80),
  reminderTone: z.string().trim().min(2).max(80),
  companionStyle: z.string().trim().min(2).max(80),
  desktopChatInputEnabled: z.boolean().optional().default(false)
});

const reminderRuntimeSchema = z.object({
  enabled: z.boolean().optional().default(false),
  timezone: z.string().trim().min(2).max(80),
  defaultLocation: z.string().trim().min(2).max(120),
  quietHoursStart: z.string().trim().regex(/^\d{2}:\d{2}$/),
  quietHoursEnd: z.string().trim().regex(/^\d{2}:\d{2}$/),
  checkIntervalMinutes: z.coerce.number().int().min(5).max(1440),
  reminderWindowStart: z.string().trim().regex(/^\d{2}:\d{2}$/),
  reminderWindowEnd: z.string().trim().regex(/^\d{2}:\d{2}$/)
});

const reminderRunSchema = z.object({
  force: z.enum(["true", "false"]).optional().default("true")
});

const reminderTaskSchema = z.object({
  title: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(1200).optional().or(z.literal("")),
  category: z.string().trim().max(40).optional().or(z.literal("")),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  dueAt: z.string().trim().optional().or(z.literal(""))
});

const reminderTaskStateSchema = z.object({
  taskId: z.string().trim().min(1),
  nextActive: z.enum(["true", "false"]).optional(),
  nextCompleted: z.enum(["true", "false"]).optional()
});

const conversationMemorySchema = z.object({
  conversationSlug: z.string().trim().min(1)
});

const conversationHistorySchema = z.object({
  conversationId: z.string().trim().min(1),
  conversationSlug: z.string().trim().min(1)
});

const configImportSchema = z.object({
  configJson: z.string().trim().min(20)
});

function maskSecret(secretValue: string) {
  const compact = secretValue.replace(/\s+/g, "");
  if (compact.length <= 10) {
    return `${compact.slice(0, 2)}...${compact.slice(-2)}`;
  }

  return `${compact.slice(0, 6)}...${compact.slice(-4)}`;
}

function redirectWithMessage(
  lang: "zh" | "en",
  tab: AdminTab,
  kind: "success" | "error",
  message: string
): never {
  redirect(`/admin?${new URLSearchParams({ lang, tab, [kind]: message }).toString()}`);
}

function redirectWithParams(
  lang: "zh" | "en",
  tab: AdminTab,
  params: Record<string, string>
): never {
  redirect(`/admin?${new URLSearchParams({ lang, tab, ...params }).toString()}`);
}

function getDesktopPetPidPath() {
  return path.join(process.cwd(), ".makerspet-desktop.pid");
}

function readDesktopPetPid() {
  try {
    if (!existsSync(getDesktopPetPidPath())) {
      return null;
    }

    const raw = readFileSync(getDesktopPetPidPath(), "utf8").trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function clearDesktopPetPid() {
  try {
    if (existsSync(getDesktopPetPidPath())) {
      unlinkSync(getDesktopPetPidPath());
    }
  } catch {}
}

function stopTrackedDesktopPet() {
  const pid = readDesktopPetPid();

  if (!pid) {
    clearDesktopPetPid();
    return false;
  }

  try {
    process.kill(pid, "SIGTERM");
    clearDesktopPetPid();
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") {
      clearDesktopPetPid();
      return false;
    }

    throw error;
  }
}

function spawnDesktopPet(electronBinary: string) {
  const child = spawn(electronBinary, ["./desktop/main.cjs"], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore"
  });

  if (child.pid) {
    writeFileSync(getDesktopPetPidPath(), `${child.pid}\n`, "utf8");
  }

  child.unref();
}

export async function createProviderAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const parsed = providerSchema.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    description: formData.get("description"),
    apiBaseUrl: formData.get("apiBaseUrl")
  });

  if (!parsed.success) {
    redirectWithMessage(lang, tab, "error", text.errorProviderInvalid);
  }

  const { slug, name, description, apiBaseUrl } = parsed.data;

  try {
    await prisma.provider.create({
      data: {
        slug,
        name,
        description: description || null,
        apiBaseUrl: apiBaseUrl || null,
        status: ProviderStatus.ACTIVE
      }
    });
  } catch {
    redirectWithMessage(lang, tab, "error", text.errorProviderCreateFailed);
  }

  revalidatePath("/admin");
  redirectWithMessage(lang, tab, "success", `${text.successProviderCreated} ${name}`);
}

export async function toggleProviderStatusAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const parsed = providerStatusSchema.safeParse({
    providerId: formData.get("providerId"),
    nextStatus: formData.get("nextStatus")
  });

  if (!parsed.success) {
    redirectWithMessage(lang, tab, "error", text.errorProviderUpdateFailed);
  }

  await prisma.provider.update({
    where: { id: parsed.data.providerId },
    data: { status: parsed.data.nextStatus }
  });

  revalidatePath("/admin");
  redirectWithMessage(lang, tab, "success", text.successProviderUpdated);
}

export async function createApiKeyAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const parsed = apiKeySchema.safeParse({
    providerId: formData.get("providerId"),
    label: formData.get("label"),
    secretValue: formData.get("secretValue"),
    setAsDefault: formData.get("setAsDefault") === "on"
  });

  if (!parsed.success) {
    redirectWithMessage(lang, tab, "error", text.errorApiKeyInvalid);
  }

  const { providerId, label, secretValue, setAsDefault } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const existingDefault = await tx.apiKey.findFirst({
        where: { providerId, isDefault: true }
      });

      const shouldBeDefault = setAsDefault || !existingDefault;

      if (shouldBeDefault) {
        await tx.apiKey.updateMany({
          where: { providerId },
          data: { isDefault: false }
        });
      }

      await tx.apiKey.create({
        data: {
          providerId,
          label,
          secretValue,
          keyPreview: maskSecret(secretValue),
          isDefault: shouldBeDefault,
          status: ApiKeyStatus.ACTIVE
        }
      });
    });
  } catch {
    redirectWithMessage(lang, tab, "error", text.errorApiKeyCreateFailed);
  }

  revalidatePath("/admin");
  redirectWithMessage(lang, tab, "success", `${text.successApiKeySaved} ${label}`);
}

export async function toggleApiKeyStatusAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const parsed = apiKeyStatusSchema.safeParse({
    apiKeyId: formData.get("apiKeyId"),
    nextStatus: formData.get("nextStatus")
  });

  if (!parsed.success) {
    redirectWithMessage(lang, tab, "error", text.errorApiKeyUpdateFailed);
  }

  await prisma.apiKey.update({
    where: { id: parsed.data.apiKeyId },
    data: { status: parsed.data.nextStatus }
  });

  revalidatePath("/admin");
  redirectWithMessage(lang, tab, "success", text.successApiKeyUpdated);
}

export async function setDefaultApiKeyAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const parsed = defaultApiKeySchema.safeParse({
    providerId: formData.get("providerId"),
    apiKeyId: formData.get("apiKeyId")
  });

  if (!parsed.success) {
    redirectWithMessage(lang, tab, "error", text.errorDefaultApiKeyFailed);
  }

  await prisma.$transaction([
    prisma.apiKey.updateMany({
      where: { providerId: parsed.data.providerId },
      data: { isDefault: false }
    }),
    prisma.apiKey.update({
      where: { id: parsed.data.apiKeyId },
      data: { isDefault: true, status: ApiKeyStatus.ACTIVE }
    })
  ]);

  revalidatePath("/admin");
  redirectWithMessage(lang, tab, "success", text.successDefaultApiKeyUpdated);
}

export async function runProviderTestAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const parsed = providerTestSchema.safeParse({
    providerId: formData.get("providerId"),
    prompt: formData.get("prompt")
  });

  if (!parsed.success) {
    redirectWithMessage(lang, tab, "error", text.errorProviderTestInvalid);
  }

  const provider = await prisma.provider.findUnique({
    where: { id: parsed.data.providerId },
    include: {
      apiKeys: {
        where: { status: ApiKeyStatus.ACTIVE },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }]
      },
      models: {
        where: { enabled: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  const apiKey = provider?.apiKeys[0];
  const model = provider?.models[0];

  if (!provider || provider.status !== ProviderStatus.ACTIVE || !apiKey || !model) {
    redirectWithMessage(lang, tab, "error", text.errorProviderTestSetup);
  }

  const baseUrl = provider.apiBaseUrl ?? "https://api.deepseek.com";

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.secretValue}`
      },
      body: JSON.stringify({
        model: model.apiModel,
        messages: [{ role: "user", content: parsed.data.prompt }],
        stream: false,
        max_tokens: 120,
        thinking: { type: "disabled" }
      }),
      cache: "no-store"
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      redirectWithParams(lang, tab, {
        error: text.errorProviderTestFailed,
        testStatus: "error",
        testProvider: provider.name,
        testModel: model.apiModel,
        testError: JSON.stringify(payload).slice(0, 280)
      });
    }

    const reply =
      typeof payload?.choices?.[0]?.message?.content === "string"
        ? payload.choices[0].message.content
        : "";
    const usage =
      payload?.usage && typeof payload.usage === "object"
        ? JSON.stringify(payload.usage).slice(0, 240)
        : "";

    revalidatePath("/admin");
    redirectWithParams(lang, tab, {
      success: text.successProviderTested,
      testStatus: "ok",
      testProvider: provider.name,
      testModel: model.apiModel,
      testReply: reply.slice(0, 500),
      testUsage: usage
    });
  } catch {
    redirectWithMessage(lang, tab, "error", text.errorProviderTestFailed);
  }
}

export async function createModelAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const parsed = modelSchema.safeParse({
    providerId: formData.get("providerId"),
    slug: formData.get("slug"),
    displayName: formData.get("displayName"),
    apiModel: formData.get("apiModel"),
    maxTokens: formData.get("maxTokens") || undefined,
    contextWindow: formData.get("contextWindow") || undefined
  });

  if (!parsed.success) {
    redirectWithMessage(lang, tab, "error", text.errorModelInvalid);
  }

  try {
    await prisma.modelProfile.create({
      data: {
        providerId: parsed.data.providerId,
        slug: parsed.data.slug,
        displayName: parsed.data.displayName,
        apiModel: parsed.data.apiModel,
        maxTokens: parsed.data.maxTokens ?? null,
        contextWindow: parsed.data.contextWindow ?? null,
        enabled: true
      }
    });
  } catch {
    redirectWithMessage(lang, tab, "error", text.errorModelCreateFailed);
  }

  revalidatePath("/admin");
  redirectWithMessage(
    lang,
    tab,
    "success",
    `${text.successModelCreated} ${parsed.data.displayName}`
  );
}

export async function toggleModelStatusAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const parsed = modelStatusSchema.safeParse({
    modelId: formData.get("modelId"),
    nextEnabled: formData.get("nextEnabled")
  });

  if (!parsed.success) {
    redirectWithMessage(lang, tab, "error", text.errorModelUpdateFailed);
  }

  await prisma.modelProfile.update({
    where: { id: parsed.data.modelId },
    data: { enabled: parsed.data.nextEnabled === "true" }
  });

  revalidatePath("/admin");
  redirectWithMessage(lang, tab, "success", text.successModelUpdated);
}

export async function createSkillAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const parsed = skillSchema.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    description: formData.get("description"),
    systemPrompt: formData.get("systemPrompt")
  });

  if (!parsed.success) {
    redirectWithMessage(lang, tab, "error", text.errorSkillInvalid);
  }

  try {
    await prisma.skill.create({
      data: {
        slug: parsed.data.slug,
        name: parsed.data.name,
        description: parsed.data.description,
        systemPrompt: parsed.data.systemPrompt,
        toolPolicy: { tools: [] },
        memoryPolicy: { scope: "session" },
        uiConfig: { mood: "steady", emphasis: "general" },
        enabled: true
      }
    });
  } catch {
    redirectWithMessage(lang, tab, "error", text.errorSkillCreateFailed);
  }

  revalidatePath("/admin");
  redirectWithMessage(
    lang,
    tab,
    "success",
    `${text.successSkillCreated} ${parsed.data.name}`
  );
}

export async function toggleSkillStatusAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const parsed = skillStatusSchema.safeParse({
    skillId: formData.get("skillId"),
    nextEnabled: formData.get("nextEnabled")
  });

  if (!parsed.success) {
    redirectWithMessage(lang, tab, "error", text.errorSkillUpdateFailed);
  }

  await prisma.skill.update({
    where: { id: parsed.data.skillId },
    data: { enabled: parsed.data.nextEnabled === "true" }
  });

  revalidatePath("/admin");
  redirectWithMessage(lang, tab, "success", text.successSkillUpdated);
}

export async function updateSkillBindingAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const parsed = skillBindingSchema.safeParse({
    skillId: formData.get("skillId"),
    defaultModelId: formData.get("defaultModelId")
  });

  if (!parsed.success) {
    redirectWithMessage(lang, tab, "error", text.errorSkillBindingInvalid);
  }

  try {
    await prisma.skill.update({
      where: { id: parsed.data.skillId },
      data: {
        defaultModelId: parsed.data.defaultModelId || null
      }
    });
  } catch {
    redirectWithMessage(lang, tab, "error", text.errorSkillBindingUpdateFailed);
  }

  revalidatePath("/admin");
  redirectWithMessage(lang, tab, "success", text.successSkillBindingUpdated);
}

export async function updatePetProfileAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const parsed = petProfileSchema.safeParse({
    petId: formData.get("petId"),
    name: formData.get("name"),
    description: formData.get("description"),
    personaPrompt: formData.get("personaPrompt"),
    defaultSkillId: formData.get("defaultSkillId"),
    mascotName: formData.get("mascotName"),
    reminderCadence: formData.get("reminderCadence"),
    reminderTone: formData.get("reminderTone"),
    companionStyle: formData.get("companionStyle"),
    desktopChatInputEnabled: formData.get("desktopChatInputEnabled") === "on"
  });

  if (!parsed.success) {
    redirectWithMessage(lang, tab, "error", text.errorPetInvalid);
  }

  const current = await prisma.petProfile.findUnique({
    where: { id: parsed.data.petId }
  });

  if (!current) {
    redirectWithMessage(lang, tab, "error", text.errorPetUpdateFailed);
  }

  const visualConfig =
    current.visualConfig && typeof current.visualConfig === "object" && !Array.isArray(current.visualConfig)
      ? (current.visualConfig as Record<string, unknown>)
      : {};
  const animationSpec =
    current.animationSpec &&
    typeof current.animationSpec === "object" &&
    !Array.isArray(current.animationSpec)
      ? (current.animationSpec as Record<string, unknown>)
      : {};

  try {
    await prisma.petProfile.update({
      where: { id: parsed.data.petId },
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        personaPrompt: parsed.data.personaPrompt || null,
        defaultSkillId: parsed.data.defaultSkillId || null,
        visualConfig: {
          ...visualConfig,
          mascotName: parsed.data.mascotName,
          companionStyle: parsed.data.companionStyle,
          desktopChatInputEnabled: parsed.data.desktopChatInputEnabled
        },
        animationSpec: {
          ...animationSpec,
          reminderCadence: parsed.data.reminderCadence,
          reminderTone: parsed.data.reminderTone
        }
      }
    });
  } catch {
    redirectWithMessage(lang, tab, "error", text.errorPetUpdateFailed);
  }

  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/desktop");
  redirectWithMessage(lang, tab, "success", text.successPetUpdated);
}

export async function updateDesktopPreferencesAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const petId = formData.get("petId")?.toString()?.trim();

  if (!petId) {
    redirectWithMessage(lang, tab, "error", text.errorPetUpdateFailed);
  }

  try {
    const pet = await prisma.petProfile.findUnique({
      where: { id: petId }
    });

    if (!pet) {
      redirectWithMessage(lang, tab, "error", text.errorPetUpdateFailed);
    }

    const visualConfig =
      pet.visualConfig && typeof pet.visualConfig === "object" && !Array.isArray(pet.visualConfig)
        ? { ...(pet.visualConfig as Record<string, unknown>) }
        : {};

    visualConfig.desktopChatInputEnabled = formData.get("desktopChatInputEnabled") === "on";

    await prisma.petProfile.update({
      where: { id: petId },
      data: {
        visualConfig: visualConfig as never
      }
    });
  } catch {
    redirectWithMessage(lang, tab, "error", text.errorPetUpdateFailed);
  }

  revalidatePath("/admin");
  revalidatePath("/desktop");
  redirectWithParams(lang, tab, {
    section: "desktop",
    success: text.successPetUpdated
  });
}

export async function updateReminderRuntimeAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const parsed = reminderRuntimeSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    timezone: formData.get("timezone"),
    defaultLocation: formData.get("defaultLocation"),
    quietHoursStart: formData.get("quietHoursStart"),
    quietHoursEnd: formData.get("quietHoursEnd"),
    checkIntervalMinutes: formData.get("checkIntervalMinutes"),
    reminderWindowStart: formData.get("reminderWindowStart"),
    reminderWindowEnd: formData.get("reminderWindowEnd")
  });

  if (!parsed.success) {
    redirectWithMessage(lang, tab, "error", text.errorReminderRuntimeInvalid);
  }

  const entries = [
    { key: reminderSettingKeys.enabled, value: parsed.data.enabled },
    { key: reminderSettingKeys.timezone, value: parsed.data.timezone },
    { key: reminderSettingKeys.defaultLocation, value: parsed.data.defaultLocation },
    { key: reminderSettingKeys.quietHoursStart, value: parsed.data.quietHoursStart },
    { key: reminderSettingKeys.quietHoursEnd, value: parsed.data.quietHoursEnd },
    {
      key: reminderSettingKeys.checkIntervalMinutes,
      value: parsed.data.checkIntervalMinutes
    },
    {
      key: reminderSettingKeys.reminderWindowStart,
      value: parsed.data.reminderWindowStart
    },
    { key: reminderSettingKeys.reminderWindowEnd, value: parsed.data.reminderWindowEnd }
  ];

  try {
    await prisma.$transaction(
      entries.map((entry) =>
        prisma.setting.upsert({
          where: { key: entry.key },
          update: { value: entry.value },
          create: entry
        })
      )
    );
  } catch {
    redirectWithMessage(lang, tab, "error", text.errorReminderRuntimeUpdateFailed);
  }

  revalidatePath("/admin");
  redirectWithParams(lang, tab, {
    section: "runtime",
    success: text.successReminderRuntimeUpdated
  });
}

export async function runReminderAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const parsed = reminderRunSchema.safeParse({
    force: formData.get("force")
  });

  if (!parsed.success) {
    redirectWithMessage(lang, tab, "error", text.errorReminderRunFailed);
  }

  const result = await runReminderCheck({
    lang,
    force: parsed.data.force === "true"
  });

  revalidatePath("/admin");

  if (result.run.status === "FAILED") {
    redirectWithMessage(lang, tab, "error", text.errorReminderRunFailed);
  }

  if (result.run.status === "SKIPPED") {
    redirectWithMessage(lang, tab, "success", text.successReminderSkipped);
  }

  redirectWithMessage(lang, tab, "success", text.successReminderTriggered);
}

export async function createReminderTaskAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const parsed = reminderTaskSchema.safeParse({
    title: formData.get("title"),
    notes: formData.get("notes"),
    category: formData.get("category"),
    priority: formData.get("priority"),
    dueAt: formData.get("dueAt")
  });

  if (!parsed.success) {
    redirectWithMessage(lang, tab, "error", text.errorReminderTaskInvalid);
  }

  const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  const normalizedDueAt =
    dueAt && Number.isFinite(dueAt.getTime()) ? dueAt : parsed.data.dueAt ? "invalid" : null;

  if (normalizedDueAt === "invalid") {
    redirectWithMessage(lang, tab, "error", text.errorReminderTaskInvalid);
  }

  try {
    await prisma.reminderTask.create({
      data: {
        title: parsed.data.title,
        notes: parsed.data.notes || null,
        category: parsed.data.category || null,
        priority: parsed.data.priority,
        dueAt: normalizedDueAt
      }
    });
  } catch {
    redirectWithMessage(lang, tab, "error", text.errorReminderTaskCreateFailed);
  }

  revalidatePath("/admin");
  redirectWithMessage(lang, tab, "success", `${text.successReminderTaskCreated} ${parsed.data.title}`);
}

export async function updateReminderTaskStateAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const parsed = reminderTaskStateSchema.safeParse({
    taskId: formData.get("taskId"),
    nextActive: formData.get("nextActive"),
    nextCompleted: formData.get("nextCompleted")
  });

  if (!parsed.success) {
    redirectWithMessage(lang, tab, "error", text.errorReminderTaskUpdateFailed);
  }

  const data: { active?: boolean; completed?: boolean } = {};

  if (parsed.data.nextActive) {
    data.active = parsed.data.nextActive === "true";
  }

  if (parsed.data.nextCompleted) {
    data.completed = parsed.data.nextCompleted === "true";
  }

  if (Object.keys(data).length === 0) {
    redirectWithMessage(lang, tab, "error", text.errorReminderTaskUpdateFailed);
  }

  try {
    await prisma.reminderTask.update({
      where: { id: parsed.data.taskId },
      data
    });
  } catch {
    redirectWithMessage(lang, tab, "error", text.errorReminderTaskUpdateFailed);
  }

  revalidatePath("/admin");
  redirectWithMessage(lang, tab, "success", text.successReminderTaskUpdated);
}

export async function clearConversationMemoryAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const parsed = conversationMemorySchema.safeParse({
    conversationSlug: formData.get("conversationSlug")
  });

  if (!parsed.success) {
    redirectWithParams(lang, tab, {
      section: "desktop",
      error: text.errorConversationMemoryClearFailed
    });
  }

  try {
    await clearConversationMemory(parsed.data.conversationSlug);
  } catch {
    redirectWithParams(lang, tab, {
      section: "desktop",
      error: text.errorConversationMemoryClearFailed
    });
  }

  revalidatePath("/admin");
  redirectWithParams(lang, tab, {
    section: "desktop",
    success: text.successConversationMemoryCleared
  });
}

export async function clearConversationHistoryAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const parsed = conversationHistorySchema.safeParse({
    conversationId: formData.get("conversationId"),
    conversationSlug: formData.get("conversationSlug")
  });

  if (!parsed.success) {
    redirectWithParams(lang, tab, {
      section: "desktop",
      error: text.errorConversationHistoryClearFailed
    });
  }

  try {
    await clearConversationHistory(parsed.data);
  } catch {
    redirectWithParams(lang, tab, {
      section: "desktop",
      error: text.errorConversationHistoryClearFailed
    });
  }

  revalidatePath("/admin");
  redirectWithParams(lang, tab, {
    section: "desktop",
    success: text.successConversationHistoryCleared
  });
}

export async function importConfigBundleAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const parsed = configImportSchema.safeParse({
    configJson: formData.get("configJson")
  });

  if (!parsed.success) {
    redirectWithParams(lang, tab, {
      section: "transfer",
      error: text.errorConfigImportFailed
    });
  }

  try {
    await importConfigBundle(parsed.data.configJson);
  } catch {
    redirectWithParams(lang, tab, {
      section: "transfer",
      error: text.errorConfigImportFailed
    });
  }

  revalidatePath("/admin");
  revalidatePath("/desktop");
  redirectWithParams(lang, tab, {
    section: "transfer",
    success: text.successConfigImported
  });
}

export async function launchDesktopPetAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const electronBinary = path.join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "electron.cmd" : "electron"
  );

  if (!existsSync(electronBinary)) {
    redirectWithMessage(lang, tab, "error", text.errorDesktopLaunchFailed);
  }

  try {
    stopTrackedDesktopPet();
    spawnDesktopPet(electronBinary);
  } catch {
    redirectWithMessage(lang, tab, "error", text.errorDesktopLaunchFailed);
  }

  redirectWithParams(lang, tab, {
    section: "desktop",
    success: text.successDesktopLaunched
  });
}

export async function stopDesktopPetAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;

  try {
    const stopped = stopTrackedDesktopPet();
    redirectWithParams(lang, tab, {
      section: "desktop",
      success: stopped ? text.successDesktopStopped : text.successDesktopAlreadyClosed
    });
  } catch {
    redirectWithParams(lang, tab, {
      section: "desktop",
      error: text.errorDesktopStopFailed
    });
  }
}

export async function restartDesktopPetAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;
  const electronBinary = path.join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "electron.cmd" : "electron"
  );

  if (!existsSync(electronBinary)) {
    redirectWithParams(lang, tab, {
      section: "desktop",
      error: text.errorDesktopLaunchFailed
    });
  }

  try {
    stopTrackedDesktopPet();
    spawnDesktopPet(electronBinary);
  } catch {
    redirectWithParams(lang, tab, {
      section: "desktop",
      error: text.errorDesktopRestartFailed
    });
  }

  redirectWithParams(lang, tab, {
    section: "desktop",
    success: text.successDesktopRestarted
  });
}

export async function clearChatHistoryAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;

  try {
    await clearChatHistory();
  } catch {
    redirectWithParams(lang, tab, {
      section: "desktop",
      error: text.errorClearChatHistory
    });
  }

  revalidatePath("/admin");
  revalidatePath("/chat");
  revalidatePath("/desktop");
  revalidatePath("/");
  redirectWithParams(lang, tab, {
    section: "desktop",
    success: text.successClearChatHistory
  });
}

export async function clearReminderHistoryAction(formData: FormData) {
  const lang = getLang(formData.get("lang")?.toString());
  const tab = getAdminTab(formData.get("tab")?.toString());
  const text = copy[lang].admin;

  try {
    await prisma.reminderRun.deleteMany({});
  } catch {
    redirectWithParams(lang, tab, {
      section: "reminders",
      error: text.errorClearReminderHistory
    });
  }

  revalidatePath("/admin");
  redirectWithParams(lang, tab, {
    section: "reminders",
    success: text.successClearReminderHistory
  });
}
