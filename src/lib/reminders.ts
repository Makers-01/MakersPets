import { prisma } from "@/lib/db";
import { reminderConversation, runSkillChat } from "@/lib/chat";
import type { UiLang } from "@/lib/i18n";

export type ReminderRuntimeConfig = {
  enabled: boolean;
  timezone: string;
  defaultLocation: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  checkIntervalMinutes: number;
  reminderWindowStart: string;
  reminderWindowEnd: string;
};

export type ReminderRuntimeState = {
  localTime: string;
  inQuietHours: boolean;
  inReminderWindow: boolean;
  shouldCheckNow: boolean;
};

export type ReminderRunSnapshot = {
  id: string;
  status: "TRIGGERED" | "SKIPPED" | "FAILED";
  reason: string | null;
  prompt: string | null;
  reply: string | null;
  conversationId: string | null;
  skillSlug: string | null;
  skillName: string | null;
  modelName: string | null;
  providerName: string | null;
  createdAt: string;
};

function buildTransientReminderRun(data: {
  status: "TRIGGERED" | "SKIPPED" | "FAILED";
  reason?: string | null;
  prompt?: string | null;
  reply?: string | null;
  conversationId?: string | null;
  skillSlug?: string | null;
  skillName?: string | null;
  modelName?: string | null;
  providerName?: string | null;
}): ReminderRunSnapshot {
  return {
    id: `transient-${Date.now()}`,
    status: data.status,
    reason: data.reason ?? null,
    prompt: data.prompt ?? null,
    reply: data.reply ?? null,
    conversationId: data.conversationId ?? null,
    skillSlug: data.skillSlug ?? null,
    skillName: data.skillName ?? null,
    modelName: data.modelName ?? null,
    providerName: data.providerName ?? null,
    createdAt: new Date().toISOString()
  };
}

const defaults: ReminderRuntimeConfig = {
  enabled: true,
  timezone: "Asia/Shanghai",
  defaultLocation: "Shanghai",
  quietHoursStart: "23:00",
  quietHoursEnd: "08:00",
  checkIntervalMinutes: 30,
  reminderWindowStart: "09:00",
  reminderWindowEnd: "21:00"
};

const settingKeys = {
  enabled: "reminders.enabled",
  timezone: "reminders.timezone",
  defaultLocation: "profile.default-location",
  quietHoursStart: "reminders.quiet-hours.start",
  quietHoursEnd: "reminders.quiet-hours.end",
  checkIntervalMinutes: "reminders.check.interval-minutes",
  reminderWindowStart: "reminders.window.start",
  reminderWindowEnd: "reminders.window.end"
} as const;

function toBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function toString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function toNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseMinutes(hhmm: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function currentMinutesInTimezone(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return hour * 60 + minute;
}

function isWithinRange(current: number, start: number, end: number) {
  if (start === end) return true;
  if (start < end) {
    return current >= start && current < end;
  }

  return current >= start || current < end;
}

function serializeReminderRun(run: {
  id: string;
  status: "TRIGGERED" | "SKIPPED" | "FAILED";
  reason: string | null;
  prompt: string | null;
  reply: string | null;
  conversationId: string | null;
  skillSlug: string | null;
  skillName: string | null;
  modelName: string | null;
  providerName: string | null;
  createdAt: Date;
}): ReminderRunSnapshot {
  return {
    ...run,
    createdAt: run.createdAt.toISOString()
  };
}

function buildReminderPrompt(input: {
  petName: string;
  mascotName: string;
  reminderTone: string;
  reminderCadence: string;
  companionStyle: string;
  lang: UiLang;
  force: boolean;
  taskTitle?: string | null;
  taskNotes?: string | null;
  taskCategory?: string | null;
  taskPriority?: string | null;
  taskDueAt?: string | null;
}) {
  const taskContext =
    input.taskTitle && input.taskTitle.trim()
      ? input.lang === "en"
        ? `Focus this reminder on the task "${input.taskTitle}". ${
            input.taskNotes ? `Task notes: ${input.taskNotes}. ` : ""
          }${input.taskCategory ? `Category: ${input.taskCategory}. ` : ""}${
            input.taskPriority ? `Priority: ${input.taskPriority}. ` : ""
          }${input.taskDueAt ? `Due time: ${input.taskDueAt}.` : ""}`
        : `这次提醒请优先围绕“${input.taskTitle}”展开。${
            input.taskNotes ? `任务备注：${input.taskNotes}。` : ""
          }${input.taskCategory ? `任务分类：${input.taskCategory}。` : ""}${
            input.taskPriority ? `优先级：${input.taskPriority}。` : ""
          }${input.taskDueAt ? `任务时间：${input.taskDueAt}。` : ""}`
      : input.lang === "en"
        ? "If there is no specific task, give a gentle general-purpose check-in."
        : "如果当前没有具体任务，就给一条泛化但轻柔的陪伴提醒。";

  if (input.lang === "en") {
    return [
      `You are ${input.petName}, a desktop companion pet named ${input.mascotName}.`,
      `Write one short proactive reminder in a ${input.reminderTone} tone with a ${input.companionStyle} companion style.`,
      `Cadence preference: ${input.reminderCadence}.`,
      "Make it feel like a caring nudge about focus, rest, hydration, posture, or checking progress.",
      taskContext,
      "Do not claim to know facts you were not given.",
      "Keep it under 40 words and return only the reminder text.",
      input.force ? "This was manually triggered from the admin console." : "This was triggered by the reminder runtime."
    ].join(" ");
  }

  return [
    `你是 ${input.petName}，也是一只叫 ${input.mascotName} 的陪伴型桌面宠物。`,
    `请用${input.reminderTone}、${input.companionStyle}的风格，生成一条主动提醒。`,
    `提醒节奏偏好：${input.reminderCadence}。`,
    taskContext,
    "内容可以轻轻提醒专注、休息、喝水、坐姿或检查进度。",
    "不要假装知道用户没有告诉你的事实。",
    "控制在 80 个汉字以内，只返回提醒正文。",
    input.force ? "这次提醒来自后台手动触发。" : "这次提醒来自系统自动检查。"
  ].join("");
}

function formatTaskDueAt(date: Date | null, lang: UiLang) {
  if (!date) return null;
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(date);
}

async function getReminderFocusTask() {
  const now = new Date();

  const candidates = await prisma.reminderTask.findMany({
    where: {
      active: true,
      completed: false,
      OR: [{ dueAt: null }, { dueAt: { lte: now } }]
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    take: 24
  });

  const priorityScore = (priority: string) => {
    if (priority === "high") return 2;
    if (priority === "low") return 0;
    return 1;
  };

  candidates.sort((a, b) => {
    const aDue = a.dueAt ? a.dueAt.getTime() : Number.MAX_SAFE_INTEGER;
    const bDue = b.dueAt ? b.dueAt.getTime() : Number.MAX_SAFE_INTEGER;
    const aOverdue = a.dueAt ? aDue <= now.getTime() : false;
    const bOverdue = b.dueAt ? bDue <= now.getTime() : false;

    if (aOverdue !== bOverdue) {
      return aOverdue ? -1 : 1;
    }

    const priorityDelta = priorityScore(b.priority) - priorityScore(a.priority);
    if (priorityDelta !== 0) return priorityDelta;

    if (aDue !== bDue) return aDue - bDue;

    const aReminded = a.lastRemindedAt?.getTime() ?? 0;
    const bReminded = b.lastRemindedAt?.getTime() ?? 0;
    if (aReminded !== bReminded) return aReminded - bReminded;

    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return candidates[0] ?? null;
}

async function getLatestReminderRun() {
  const latest = await prisma.reminderRun.findFirst({
    orderBy: { createdAt: "desc" }
  });

  return latest ? serializeReminderRun(latest) : null;
}

export async function getLatestReminderRunSnapshot() {
  return getLatestReminderRun();
}

export async function getReminderRunHistory(limit = 12) {
  const runs = await prisma.reminderRun.findMany({
    orderBy: { createdAt: "desc" },
    take: limit
  });

  return runs.map(serializeReminderRun);
}

async function createReminderRun(data: {
  status: "TRIGGERED" | "SKIPPED" | "FAILED";
  reason?: string | null;
  prompt?: string | null;
  reply?: string | null;
  conversationId?: string | null;
  skillSlug?: string | null;
  skillName?: string | null;
  modelName?: string | null;
  providerName?: string | null;
}) {
  const created = await prisma.reminderRun.create({
    data: {
      status: data.status,
      reason: data.reason ?? null,
      prompt: data.prompt ?? null,
      reply: data.reply ?? null,
      conversationId: data.conversationId ?? null,
      skillSlug: data.skillSlug ?? null,
      skillName: data.skillName ?? null,
      modelName: data.modelName ?? null,
      providerName: data.providerName ?? null
    }
  });

  return serializeReminderRun(created);
}

export async function getReminderRuntimeConfig(): Promise<ReminderRuntimeConfig> {
  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: Object.values(settingKeys)
      }
    }
  });

  const map = new Map(settings.map((setting) => [setting.key, setting.value]));

  return {
    enabled: toBoolean(map.get(settingKeys.enabled), defaults.enabled),
    timezone: toString(map.get(settingKeys.timezone), defaults.timezone),
    defaultLocation: toString(map.get(settingKeys.defaultLocation), defaults.defaultLocation),
    quietHoursStart: toString(map.get(settingKeys.quietHoursStart), defaults.quietHoursStart),
    quietHoursEnd: toString(map.get(settingKeys.quietHoursEnd), defaults.quietHoursEnd),
    checkIntervalMinutes: toNumber(
      map.get(settingKeys.checkIntervalMinutes),
      defaults.checkIntervalMinutes
    ),
    reminderWindowStart: toString(
      map.get(settingKeys.reminderWindowStart),
      defaults.reminderWindowStart
    ),
    reminderWindowEnd: toString(map.get(settingKeys.reminderWindowEnd), defaults.reminderWindowEnd)
  };
}

export function evaluateReminderRuntime(
  config: ReminderRuntimeConfig,
  now = new Date()
): ReminderRuntimeState {
  const localMinutes = currentMinutesInTimezone(now, config.timezone);
  const quietStart = parseMinutes(config.quietHoursStart) ?? parseMinutes(defaults.quietHoursStart)!;
  const quietEnd = parseMinutes(config.quietHoursEnd) ?? parseMinutes(defaults.quietHoursEnd)!;
  const windowStart =
    parseMinutes(config.reminderWindowStart) ?? parseMinutes(defaults.reminderWindowStart)!;
  const windowEnd =
    parseMinutes(config.reminderWindowEnd) ?? parseMinutes(defaults.reminderWindowEnd)!;

  const inQuietHours = isWithinRange(localMinutes, quietStart, quietEnd);
  const inReminderWindow = isWithinRange(localMinutes, windowStart, windowEnd);
  const shouldCheckNow = config.enabled && !inQuietHours && inReminderWindow;

  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: config.timezone
  });

  return {
    localTime: formatter.format(now),
    inQuietHours,
    inReminderWindow,
    shouldCheckNow
  };
}

export async function runReminderCheck({
  lang = "zh",
  force = false,
  persistSkips = true
}: {
  lang?: UiLang;
  force?: boolean;
  persistSkips?: boolean;
} = {}) {
  const [config, pet, latestRun, focusTask] = await Promise.all([
    getReminderRuntimeConfig(),
    prisma.petProfile.findFirst({
      where: { slug: "makers" },
      include: { defaultSkill: true }
    }),
    getLatestReminderRun(),
    getReminderFocusTask()
  ]);

  const state = evaluateReminderRuntime(config);
  const visualConfig = asRecord(pet?.visualConfig);
  const animationSpec = asRecord(pet?.animationSpec);
  const petName = pet?.name ?? "Makers";
  const mascotName =
    typeof visualConfig.mascotName === "string" ? (visualConfig.mascotName as string) : petName;
  const reminderTone =
    typeof animationSpec.reminderTone === "string"
      ? (animationSpec.reminderTone as string)
      : "warm";
  const reminderCadence =
    typeof animationSpec.reminderCadence === "string"
      ? (animationSpec.reminderCadence as string)
      : "gentle-daily";
  const companionStyle =
    typeof visualConfig.companionStyle === "string"
      ? (visualConfig.companionStyle as string)
      : "gentle";

  if (!force) {
    if (!config.enabled) {
      const run = persistSkips
        ? await createReminderRun({
            status: "SKIPPED",
            reason: "disabled"
          })
        : buildTransientReminderRun({
            status: "SKIPPED",
            reason: "disabled"
          });
      return {
        runtimeState: state,
        latestRun,
        run
      };
    }

    if (state.inQuietHours) {
      const run = persistSkips
        ? await createReminderRun({
            status: "SKIPPED",
            reason: "quiet_hours"
          })
        : buildTransientReminderRun({
            status: "SKIPPED",
            reason: "quiet_hours"
          });
      return {
        runtimeState: state,
        latestRun,
        run
      };
    }

    if (!state.inReminderWindow) {
      const run = persistSkips
        ? await createReminderRun({
            status: "SKIPPED",
            reason: "outside_window"
          })
        : buildTransientReminderRun({
            status: "SKIPPED",
            reason: "outside_window"
          });
      return {
        runtimeState: state,
        latestRun,
        run
      };
    }

    if (latestRun) {
      const elapsedMs = Date.now() - new Date(latestRun.createdAt).getTime();
      const thresholdMs = config.checkIntervalMinutes * 60 * 1000;

      if (elapsedMs < thresholdMs) {
        const run = persistSkips
          ? await createReminderRun({
              status: "SKIPPED",
              reason: "interval_not_elapsed"
            })
          : buildTransientReminderRun({
              status: "SKIPPED",
              reason: "interval_not_elapsed"
            });
        return {
          runtimeState: state,
          latestRun,
          run
        };
      }
    }
  }

  const prompt = buildReminderPrompt({
    petName,
    mascotName,
    reminderTone,
    reminderCadence,
    companionStyle,
    lang,
    force,
    taskTitle: focusTask?.title ?? null,
    taskNotes: focusTask?.notes ?? null,
    taskCategory: focusTask?.category ?? null,
    taskPriority: focusTask?.priority ?? "normal",
    taskDueAt: formatTaskDueAt(focusTask?.dueAt ?? null, lang)
  });

  try {
    const result = await runSkillChat({
      conversationSlug: reminderConversation.slug,
      conversationTitle: reminderConversation.title,
      skillSlug: pet?.defaultSkill?.slug ?? "daily-assistant",
      message: prompt,
      lang
    });

    if (focusTask) {
      await prisma.reminderTask.update({
        where: { id: focusTask.id },
        data: { lastRemindedAt: new Date() }
      });
    }

    return {
      runtimeState: state,
      latestRun,
      run: await createReminderRun({
        status: "TRIGGERED",
        reason: force ? "manual" : "scheduled",
        prompt,
        reply: result.reply,
        conversationId: result.conversationId,
        skillSlug: result.runtime.skillSlug,
        skillName: result.runtime.skillName,
        modelName: result.runtime.modelName,
        providerName: result.runtime.providerName
      })
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";

    return {
      runtimeState: state,
      latestRun,
      run: await createReminderRun({
        status: "FAILED",
        reason: "request_failed",
        prompt,
        reply: message.slice(0, 1200)
      })
    };
  }
}

export async function getReminderAdminData() {
  const [latestRun, recentRuns] = await Promise.all([
    getLatestReminderRun(),
    getReminderRunHistory()
  ]);
  return {
    latestRun,
    recentRuns
  };
}

export { defaults as reminderDefaults, settingKeys as reminderSettingKeys };
