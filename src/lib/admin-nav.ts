export const adminTabs = [
  "overview",
  "providers",
  "models",
  "tasks",
  "pet",
  "skills",
  "system"
] as const;

export type AdminTab = (typeof adminTabs)[number];

export function getAdminTab(value: string | string[] | undefined): AdminTab {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "keys") return "providers";
  return adminTabs.includes(raw as AdminTab) ? (raw as AdminTab) : "overview";
}
