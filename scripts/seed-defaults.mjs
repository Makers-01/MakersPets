import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const skillDefinitions = [
  {
    slug: "chat",
    name: "Chat",
    description: "Warm everyday conversation for companionship and quick help.",
    systemPrompt:
      "You are Makers, a warm companion pet that chats naturally, keeps conversations light when appropriate, and stays useful.",
    toolPolicy: { tools: [] },
    memoryPolicy: { scope: "global-companion" },
    uiConfig: { mood: "friendly", emphasis: "companionship" }
  },
  {
    slug: "daily-assistant",
    name: "Daily Assistant",
    description: "Handles reminders, lightweight planning, and personal follow-through.",
    systemPrompt:
      "You are Makers, a caring companion focused on reminders, check-ins, and helping the user keep gentle momentum.",
    toolPolicy: { tools: ["reminders", "notes"] },
    memoryPolicy: { scope: "daily-life" },
    uiConfig: { mood: "supportive", emphasis: "reminders" }
  },
  {
    slug: "planner",
    name: "Planner",
    description: "Breaks work into steps and keeps tasks organized.",
    systemPrompt:
      "You are Makers in planner mode. Turn loose goals into clear steps, timelines, and small next actions.",
    toolPolicy: { tools: ["tasks", "notes"] },
    memoryPolicy: { scope: "project" },
    uiConfig: { mood: "steady", emphasis: "planning" }
  },
  {
    slug: "coding",
    name: "Coding",
    description: "Helps with technical problem-solving and implementation planning.",
    systemPrompt:
      "You are Makers in coding mode. Help with engineering work carefully, explain tradeoffs, and stay precise.",
    toolPolicy: { tools: ["files", "terminal", "search"] },
    memoryPolicy: { scope: "project" },
    uiConfig: { mood: "focused", emphasis: "engineering" }
  },
  {
    slug: "search",
    name: "Search",
    description: "Finds information and summarizes it cleanly.",
    systemPrompt:
      "You are Makers in search mode. Gather information, compare sources, and return concise takeaways.",
    toolPolicy: { tools: ["web-search"] },
    memoryPolicy: { scope: "session" },
    uiConfig: { mood: "curious", emphasis: "research" }
  },
  {
    slug: "translate",
    name: "Translate",
    description: "Handles bilingual translation and wording refinement.",
    systemPrompt:
      "You are Makers in translation mode. Translate accurately, preserve tone, and smooth awkward phrasing.",
    toolPolicy: { tools: [] },
    memoryPolicy: { scope: "session" },
    uiConfig: { mood: "clear", emphasis: "language" }
  }
];

async function main() {
  const provider = await prisma.provider.upsert({
    where: { slug: "deepseek" },
    update: {
      name: "DeepSeek",
      description: "Default model provider for the first MakersPet build.",
      apiBaseUrl: "https://api.deepseek.com",
      status: "ACTIVE",
      config: {
        preferredUse: "companionship-and-reminders",
        ownerNotes: "Single-account default provider"
      }
    },
    create: {
      slug: "deepseek",
      name: "DeepSeek",
      description: "Default model provider for the first MakersPet build.",
      apiBaseUrl: "https://api.deepseek.com",
      status: "ACTIVE",
      config: {
        preferredUse: "companionship-and-reminders",
        ownerNotes: "Single-account default provider"
      }
    }
  });

  const primaryModel = await prisma.modelProfile.upsert({
    where: { slug: "deepseek-v4-pro" },
    update: {
      providerId: provider.id,
      displayName: "DeepSeek V4 Pro",
      apiModel: "deepseek-v4-pro",
      capabilityTags: ["chat", "planning", "companionship", "reminders"],
      enabled: true
    },
    create: {
      providerId: provider.id,
      slug: "deepseek-v4-pro",
      displayName: "DeepSeek V4 Pro",
      apiModel: "deepseek-v4-pro",
      capabilityTags: ["chat", "planning", "companionship", "reminders"],
      enabled: true
    }
  });

  const skillIds = new Map();

  for (const skill of skillDefinitions) {
    const record = await prisma.skill.upsert({
      where: { slug: skill.slug },
      update: {
        ...skill,
        defaultModelId: primaryModel.id
      },
      create: {
        ...skill,
        defaultModelId: primaryModel.id
      }
    });

    skillIds.set(record.slug, record.id);
  }

  await prisma.petProfile.upsert({
    where: { slug: "makers" },
    update: {
      name: "Makers",
      description:
        "A companion-first desktop pet focused on gentle presence, reminders, and supportive check-ins.",
      personaPrompt:
        "You are Makers, a warm, lightly playful companion who helps the user remember things, stay on track, and feel accompanied.",
      visualConfig: {
        rendering: "spritesheet",
        shellTargets: ["desktop", "web"],
        mascotName: "Makers"
      },
      animationSpec: {
        moods: ["idle", "waiting", "thinking", "celebrating", "sleeping"],
        emphasis: "companion-reminder"
      },
      defaultSkillId: skillIds.get("daily-assistant")
    },
    create: {
      slug: "makers",
      name: "Makers",
      description:
        "A companion-first desktop pet focused on gentle presence, reminders, and supportive check-ins.",
      personaPrompt:
        "You are Makers, a warm, lightly playful companion who helps the user remember things, stay on track, and feel accompanied.",
      visualConfig: {
        rendering: "spritesheet",
        shellTargets: ["desktop", "web"],
        mascotName: "Makers"
      },
      animationSpec: {
        moods: ["idle", "waiting", "thinking", "celebrating", "sleeping"],
        emphasis: "companion-reminder"
      },
      defaultSkillId: skillIds.get("daily-assistant")
    }
  });

  await prisma.conversation.upsert({
    where: { slug: "main" },
    update: {
      title: "Makers Main Chat"
    },
    create: {
      slug: "main",
      title: "Makers Main Chat"
    }
  });

  await prisma.reminderTask.upsert({
    where: { id: "makerspet-hydration-check" },
    update: {
      category: "health",
      priority: "normal"
    },
    create: {
      id: "makerspet-hydration-check",
      title: "午后喝水和起身活动一下",
      notes: "如果已经久坐，就轻轻提醒用户站起来活动一下。",
      category: "health",
      priority: "normal",
      active: true,
      completed: false
    }
  });

  const settings = [
    { key: "app.mode", value: "single-account" },
    { key: "models.default.primary", value: "deepseek-v4-pro" },
    { key: "pets.default.slug", value: "makers" },
    { key: "skills.default.slug", value: "daily-assistant" },
    { key: "profile.default-location", value: "Shanghai" },
    { key: "reminders.enabled", value: true },
    { key: "reminders.timezone", value: "Asia/Shanghai" },
    { key: "reminders.quiet-hours.start", value: "23:00" },
    { key: "reminders.quiet-hours.end", value: "08:00" },
    { key: "reminders.check.interval-minutes", value: 30 },
    { key: "reminders.window.start", value: "09:00" },
    { key: "reminders.window.end", value: "21:00" }
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting
    });
  }

  console.log("Seeded MakersPet defaults.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
