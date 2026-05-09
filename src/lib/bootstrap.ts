export const bootstrapSummary = {
  project: {
    name: "MakersPet",
    mode: "single-account",
    mission:
      "Build an independent AI pet platform with a shared backend, multi-provider model routing, configurable skills, and future desktop plus web shells."
  },
  defaultProviderTargets: [
    {
      slug: "deepseek",
      name: "DeepSeek",
      initialModels: ["deepseek-chat", "deepseek-reasoner", "deepseek-v4-pro"]
    }
  ],
  initialSkills: [
    "chat",
    "coding",
    "planner",
    "search",
    "translate",
    "daily-assistant"
  ],
  initialPet: {
    slug: "makers",
    name: "Makers",
    description:
      "A playful, configurable AI pet that can later share the same identity across desktop and web."
  }
};
