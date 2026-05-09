import {
  clearChatHistoryAction,
  clearConversationHistoryAction,
  clearConversationMemoryAction,
  clearReminderHistoryAction,
  createApiKeyAction,
  createModelAction,
  createProviderAction,
  createReminderTaskAction,
  createSkillAction,
  launchDesktopPetAction,
  restartDesktopPetAction,
  runReminderAction,
  runProviderTestAction,
  setDefaultApiKeyAction,
  stopDesktopPetAction,
  toggleApiKeyStatusAction,
  toggleModelStatusAction,
  updateReminderTaskStateAction,
  updateDesktopPreferencesAction,
  updateSkillBindingAction,
  toggleSkillStatusAction,
  toggleProviderStatusAction,
  updateReminderRuntimeAction,
  updatePetProfileAction
} from "@/app/admin/actions";
import { getAdminSnapshot } from "@/lib/admin";
import { AdminTab, getAdminTab } from "@/lib/admin-nav";
import { formatDateTime } from "@/lib/format";
import { copy, getLang, localeForLang } from "@/lib/i18n";
import { getSystemHealth } from "@/lib/system";

type AdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type AdminSection =
  | "list"
  | "create"
  | "pet"
  | "skills"
  | "runtime"
  | "test"
  | "reminders"
  | "desktop";

type ReminderHistoryFilter = "all" | "triggered" | "skipped" | "failed";
type TaskStatusFilter = "all" | "open" | "completed" | "paused";
type TaskPriorityFilter = "all" | "high" | "normal" | "low";

function readValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildAdminHref(
  lang: "zh" | "en",
  tab: AdminTab,
  section?: AdminSection,
  extras?: Record<string, string>
) {
  const params = new URLSearchParams({ lang, tab });
  if (section) {
    params.set("section", section);
  }
  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      params.set(key, value);
    }
  }
  return `/admin?${params.toString()}`;
}

function getReminderHistoryFilter(value: string | string[] | undefined): ReminderHistoryFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "triggered" || raw === "skipped" || raw === "failed") {
    return raw;
  }
  return "all";
}

function getTaskStatusFilter(value: string | string[] | undefined): TaskStatusFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "open" || raw === "completed" || raw === "paused") {
    return raw;
  }
  return "all";
}

function getTaskPriorityFilter(value: string | string[] | undefined): TaskPriorityFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "high" || raw === "normal" || raw === "low") {
    return raw;
  }
  return "all";
}

function getAdminSection(tab: AdminTab, value: string | string[] | undefined): AdminSection | null {
  const raw = Array.isArray(value) ? value[0] : value;

  if (tab === "models") {
    return raw === "create" ? "create" : "list";
  }

  if (tab === "tasks") {
    return raw === "create" ? "create" : "list";
  }

  if (tab === "providers") {
    if (raw === "skills" || raw === "keys") {
      return "skills";
    }
    if (raw === "pet" || raw === "create-key") {
      return "pet";
    }
    return raw === "create" ? "create" : "list";
  }

  if (tab === "pet") {
    return "pet";
  }

  if (tab === "skills") {
    return raw === "create" ? "create" : "list";
  }

  if (tab === "system") {
    if (raw === "test" || raw === "reminders" || raw === "desktop") {
      return raw;
    }
    return "runtime";
  }

  return null;
}

function formatReminderReason(
  reason: string | null | undefined,
  text: (typeof copy)[keyof typeof copy]
) {
  switch (reason) {
    case "manual":
      return text.admin.reminderReasonManual;
    case "scheduled":
      return text.admin.reminderReasonScheduled;
    case "disabled":
      return text.admin.reminderReasonDisabled;
    case "quiet_hours":
      return text.admin.reminderReasonQuietHours;
    case "outside_window":
      return text.admin.reminderReasonOutsideWindow;
    case "interval_not_elapsed":
      return text.admin.reminderReasonIntervalNotElapsed;
    case "request_failed":
      return text.admin.reminderReasonRequestFailed;
    default:
      return reason ?? text.admin.reminderReasonUnknown;
  }
}

function formatTaskPriority(
  priority: string,
  text: (typeof copy)[keyof typeof copy]
) {
  switch (priority) {
    case "high":
      return text.admin.taskPriorityHigh;
    case "low":
      return text.admin.taskPriorityLow;
    default:
      return text.admin.taskPriorityNormal;
  }
}

function formatTaskStatus(task: {
  active: boolean;
  completed: boolean;
}, text: (typeof copy)[keyof typeof copy]) {
  if (task.completed) return text.admin.taskCompleted;
  if (!task.active) return text.admin.taskPaused;
  return text.admin.taskOpen;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const lang = getLang(resolvedSearchParams.lang);
  const requestedSection = readValue(resolvedSearchParams.section);
  const requestedTab = getAdminTab(resolvedSearchParams.tab);
  const tab =
    requestedTab === "pet" && requestedSection === "skills" ? "skills" : requestedTab;
  const section = getAdminSection(tab, requestedSection);
  const reminderHistoryFilter = getReminderHistoryFilter(resolvedSearchParams.runStatus);
  const taskStatusFilter = getTaskStatusFilter(resolvedSearchParams.taskStatus);
  const taskPriorityFilter = getTaskPriorityFilter(resolvedSearchParams.taskPriority);
  const taskCategoryFilter = readValue(resolvedSearchParams.taskCategory) ?? "all";
  const text = copy[lang];
  const locale = localeForLang(lang);
  const [health, snapshot] = await Promise.all([getSystemHealth(), getAdminSnapshot()]);
  const successMessage = readValue(resolvedSearchParams.success);
  const errorMessage = readValue(resolvedSearchParams.error);
  const testStatus = readValue(resolvedSearchParams.testStatus);
  const testProvider = readValue(resolvedSearchParams.testProvider);
  const testModel = readValue(resolvedSearchParams.testModel);
  const testReply = readValue(resolvedSearchParams.testReply);
  const testUsage = readValue(resolvedSearchParams.testUsage);
  const testError = readValue(resolvedSearchParams.testError);
  const tabs: Array<{ key: AdminTab; label: string }> = [
    { key: "overview", label: text.common.overview },
    { key: "providers", label: text.common.connections },
    { key: "models", label: text.common.modelConfigs },
    { key: "tasks", label: text.admin.reminderTasks },
    { key: "pet", label: text.admin.pet },
    { key: "skills", label: text.common.skills },
    { key: "system", label: text.admin.system }
  ];
  const filteredReminderRuns = snapshot.reminders.recentRuns.filter((run) => {
    if (reminderHistoryFilter === "all") return true;
    return run.status.toLowerCase() === reminderHistoryFilter;
  });
  const taskCategories = Array.from(
    new Set(snapshot.tasks.map((task) => task.category).filter((value): value is string => Boolean(value)))
  ).sort((a, b) => a.localeCompare(b));
  const filteredTasks = snapshot.tasks.filter((task) => {
    if (taskStatusFilter === "open" && (task.completed || !task.active)) return false;
    if (taskStatusFilter === "completed" && !task.completed) return false;
    if (taskStatusFilter === "paused" && (task.completed || task.active)) return false;
    if (taskPriorityFilter !== "all" && task.priority !== taskPriorityFilter) return false;
    if (taskCategoryFilter !== "all" && task.category !== taskCategoryFilter) return false;
    return true;
  });

  return (
    <main className="page-shell admin-shell">
      <section className="hero admin-hero">
        <div>
          <h1>{text.admin.title}</h1>
        </div>
        <div className="hero-side">
          <div className="lang-switch" aria-label="language switch">
            <a
              className={`lang-chip ${lang === "zh" ? "active" : ""}`}
              href={buildAdminHref("zh", tab, section ?? undefined)}
            >
              中
            </a>
            <a
              className={`lang-chip ${lang === "en" ? "active" : ""}`}
              href={buildAdminHref("en", tab, section ?? undefined)}
            >
              EN
            </a>
          </div>
        </div>
      </section>

      {successMessage ? <p className="flash success">{successMessage}</p> : null}
      {errorMessage ? <p className="flash error">{errorMessage}</p> : null}

      <section className="panel nav-panel">
        <nav className="tab-strip" aria-label={text.admin.sections}>
          {tabs.map((item) => (
            <a
              key={item.key}
              className={`tab-chip ${tab === item.key ? "active" : ""}`}
              href={buildAdminHref(lang, item.key)}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </section>

      {tab === "models" ? (
        <section className="panel nav-panel subnav-panel">
          <nav className="tab-strip" aria-label={text.common.models}>
            <a
              className={`tab-chip ${section === "list" ? "active" : ""}`}
              href={buildAdminHref(lang, "models", "list")}
            >
              {text.common.models}
            </a>
            <a
              className={`tab-chip ${section === "create" ? "active" : ""}`}
              href={buildAdminHref(lang, "models", "create")}
            >
              {text.admin.addModel}
            </a>
          </nav>
        </section>
      ) : null}

      {tab === "tasks" ? (
        <section className="panel nav-panel subnav-panel">
          <nav className="tab-strip" aria-label={text.admin.reminderTasks}>
            <a
              className={`tab-chip ${section === "list" ? "active" : ""}`}
              href={buildAdminHref(lang, "tasks", "list")}
            >
              {text.admin.reminderTasks}
            </a>
            <a
              className={`tab-chip ${section === "create" ? "active" : ""}`}
              href={buildAdminHref(lang, "tasks", "create")}
            >
              {text.admin.addReminderTask}
            </a>
          </nav>
        </section>
      ) : null}

      {tab === "providers" ? (
        <section className="panel nav-panel subnav-panel">
          <nav className="tab-strip" aria-label={`${text.common.providers} / ${text.common.apiKeys}`}>
            <a
              className={`tab-chip ${section === "list" ? "active" : ""}`}
              href={buildAdminHref(lang, "providers", "list")}
            >
              {text.common.providers}
            </a>
            <a
              className={`tab-chip ${section === "skills" ? "active" : ""}`}
              href={buildAdminHref(lang, "providers", "skills")}
            >
              {text.common.apiKeys}
            </a>
            <a
              className={`tab-chip ${section === "create" ? "active" : ""}`}
              href={buildAdminHref(lang, "providers", "create")}
            >
              {text.admin.addProvider}
            </a>
            <a
              className={`tab-chip ${section === "pet" ? "active" : ""}`}
              href={buildAdminHref(lang, "providers", "pet")}
            >
              {text.admin.addApiKey}
            </a>
          </nav>
        </section>
      ) : null}

      {tab === "skills" ? (
        <section className="panel nav-panel subnav-panel">
          <nav className="tab-strip" aria-label={text.common.skills}>
            <a
              className={`tab-chip ${section === "list" ? "active" : ""}`}
              href={buildAdminHref(lang, "skills", "list")}
            >
              {text.common.skills}
            </a>
            <a
              className={`tab-chip ${section === "create" ? "active" : ""}`}
              href={buildAdminHref(lang, "skills", "create")}
            >
              {text.admin.createSkill}
            </a>
          </nav>
        </section>
      ) : null}

      {tab === "system" ? (
        <section className="panel nav-panel subnav-panel">
          <nav className="tab-strip" aria-label={text.admin.system}>
            <a
              className={`tab-chip ${section === "runtime" ? "active" : ""}`}
              href={buildAdminHref(lang, "system", "runtime")}
            >
              {text.admin.runtimeState}
            </a>
            <a
              className={`tab-chip ${section === "test" ? "active" : ""}`}
              href={buildAdminHref(lang, "system", "test")}
            >
              {text.admin.liveTest}
            </a>
            <a
              className={`tab-chip ${section === "reminders" ? "active" : ""}`}
              href={buildAdminHref(lang, "system", "reminders")}
            >
              {text.admin.reminderRunner}
            </a>
            <a
              className={`tab-chip ${section === "desktop" ? "active" : ""}`}
              href={buildAdminHref(lang, "system", "desktop")}
            >
              {text.admin.desktopPet}
            </a>
          </nav>
        </section>
      ) : null}

      {tab === "overview" ? (
        <>
          <section className="stat-strip four-up">
            <article className="stat-card">
              <span className="stat-label">{text.common.providers}</span>
              <strong>{snapshot.counts.providers}</strong>
            </article>
            <article className="stat-card">
              <span className="stat-label">{text.common.models}</span>
              <strong>{snapshot.counts.models}</strong>
            </article>
            <article className="stat-card">
              <span className="stat-label">{text.common.skills}</span>
              <strong>{snapshot.counts.skills}</strong>
            </article>
            <article className="stat-card">
              <span className="stat-label">{text.common.pets}</span>
              <strong>{snapshot.counts.pets}</strong>
            </article>
            <article className="stat-card">
              <span className="stat-label">{text.admin.reminderTasks}</span>
              <strong>{snapshot.counts.tasks}</strong>
            </article>
          </section>

          <section className="grid two-up">
            <article className="panel">
              <div className="section-head">
                <h2>{text.common.overview}</h2>
                <p>{text.admin.immediateNextHint}</p>
              </div>
              <ol className="clean-list ordered compact-list">
                {text.admin.nextActions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </article>

            <article className="panel">
              <div className="section-head">
                <h2>{text.admin.pet}</h2>
                <p>{text.admin.petHint}</p>
              </div>
              <div className="stack-block info-card">
                <strong>{snapshot.pet.name}</strong>
                <p>{snapshot.pet.slug}</p>
                <p>{snapshot.pet.description}</p>
                <p>
                  {text.admin.defaultSkill}: {snapshot.pet.defaultSkill ?? "—"}
                </p>
              </div>
            </article>
          </section>
        </>
      ) : null}

      {tab === "providers" ? (
        <section className="grid two-up">
          {section === "list" ? <article className="panel">
            <div className="section-head">
              <h2>{text.common.providers}</h2>
            </div>
            <div className="stack-rows scroll-panel">
              {snapshot.providers.map((provider) => (
                <div className="stack-block provider-card" key={provider.id}>
                  <div className="row-between">
                    <strong>{provider.name}</strong>
                    <span className={`status-pill ${provider.status.toLowerCase()}`}>
                      {provider.status === "ACTIVE" ? text.common.active : text.common.inactive}
                    </span>
                  </div>
                  <p>{provider.slug}</p>
                  <p>{provider.apiBaseUrl ?? text.admin.noApiBaseUrl}</p>
                  <p>
                    {text.admin.apiKeyCount}: {provider.apiKeys.length}
                  </p>
                  <form action={toggleProviderStatusAction} className="inline-form">
                    <input type="hidden" name="providerId" value={provider.id} />
                    <input type="hidden" name="lang" value={lang} />
                    <input type="hidden" name="tab" value={tab} />
                    <input
                      type="hidden"
                      name="nextStatus"
                      value={provider.status === "ACTIVE" ? "DISABLED" : "ACTIVE"}
                    />
                    <button type="submit" className="mini-button">
                      {provider.status === "ACTIVE" ? text.common.disable : text.common.enable}
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </article> : null}

          {section === "skills" ? <article className="panel">
            <div className="section-head">
              <h2>{text.common.apiKeys}</h2>
            </div>
            <div className="stack-rows scroll-panel">
              {snapshot.providers.length === 0 ? (
                <div className="stack-block info-card">
                  <p>{text.admin.noApiKeys}</p>
                </div>
              ) : (
                snapshot.providers.map((provider) => (
                  <div className="stack-block provider-card" key={provider.id}>
                    <div className="row-between">
                      <strong>{provider.name}</strong>
                      <span className="status-pill muted">
                        {text.admin.apiKeyCount}: {provider.apiKeys.length}
                      </span>
                    </div>
                    <div className="provider-keys compact-provider-keys">
                      {provider.apiKeys.length === 0 ? (
                        <p className="muted-line">{text.admin.noApiKeys}</p>
                      ) : (
                        provider.apiKeys.map((apiKey) => (
                          <div className="key-row" key={apiKey.id}>
                            <div className="key-main">
                              <strong>{apiKey.label}</strong>
                              <p>
                                {apiKey.keyPreview ?? "—"} ·{" "}
                                {apiKey.status === "ACTIVE" ? text.common.active : text.common.inactive}
                              </p>
                            </div>
                            <div className="key-actions">
                              <span className={`status-pill ${apiKey.isDefault ? "default" : "muted"}`}>
                                {apiKey.isDefault ? text.common.default : text.common.optional}
                              </span>
                              {!apiKey.isDefault ? (
                                <form action={setDefaultApiKeyAction} className="inline-form">
                                  <input type="hidden" name="providerId" value={provider.id} />
                                  <input type="hidden" name="apiKeyId" value={apiKey.id} />
                                  <input type="hidden" name="lang" value={lang} />
                                  <input type="hidden" name="tab" value="providers" />
                                  <button type="submit" className="mini-button">
                                    {text.common.setDefault}
                                  </button>
                                </form>
                              ) : null}
                              <form action={toggleApiKeyStatusAction} className="inline-form">
                                <input type="hidden" name="apiKeyId" value={apiKey.id} />
                                <input type="hidden" name="lang" value={lang} />
                                <input type="hidden" name="tab" value="providers" />
                                <input
                                  type="hidden"
                                  name="nextStatus"
                                  value={apiKey.status === "ACTIVE" ? "DISABLED" : "ACTIVE"}
                                />
                                <button type="submit" className="mini-button">
                                  {apiKey.status === "ACTIVE" ? text.common.disable : text.common.enable}
                                </button>
                              </form>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </article> : null}

          {section === "create" ? <article className="panel">
            <div className="section-head">
              <h2>{text.admin.addProvider}</h2>
            </div>
            <form action={createProviderAction} className="admin-form compact-form">
                <input type="hidden" name="lang" value={lang} />
                <input type="hidden" name="tab" value="providers" />
                <label>
                  <span>{text.admin.slug}</span>
                  <input name="slug" placeholder={text.admin.providerSlugHint} required />
                </label>
                <label>
                  <span>{text.admin.name}</span>
                  <input name="name" placeholder={text.admin.providerNameHint} required />
                </label>
                <label>
                  <span>{text.admin.apiBaseUrl}</span>
                  <input name="apiBaseUrl" placeholder="https://api.example.com" type="url" />
                </label>
                <label>
                  <span>{text.admin.description}</span>
                  <textarea name="description" rows={3} />
                </label>
                <button type="submit" className="primary-button">
                  {text.admin.saveProvider}
                </button>
              </form>
          </article> : null}

          {section === "pet" ? <article className="panel">
            <div className="section-head">
              <h2>{text.admin.addApiKey}</h2>
            </div>
            <form action={createApiKeyAction} className="admin-form compact-form">
                <input type="hidden" name="lang" value={lang} />
                <input type="hidden" name="tab" value="providers" />
                <label>
                  <span>{text.admin.provider}</span>
                  <select name="providerId" required defaultValue="">
                    <option value="" disabled>
                      {text.admin.selectProvider}
                    </option>
                    {snapshot.providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{text.admin.label}</span>
                  <input name="label" placeholder={text.admin.apiKeyLabelHint} required />
                </label>
                <label>
                  <span>{text.admin.secretValue}</span>
                  <textarea name="secretValue" rows={3} required />
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" name="setAsDefault" />
                  <span>{text.admin.setAsDefault}</span>
                </label>
                <button type="submit" className="primary-button">
                  {text.admin.saveApiKey}
                </button>
              </form>
          </article> : null}
        </section>
      ) : null}

      {tab === "models" ? (
        <section className="grid two-up">
          {section === "list" ? <article className="panel">
            <div className="section-head">
              <h2>{text.common.modelConfigs}</h2>
              <p>{text.admin.modelsHint}</p>
            </div>
            <div className="stack-rows scroll-panel">
              {snapshot.models.length === 0 ? (
                <div className="stack-block info-card">
                  <p>{text.admin.noConfiguredModels}</p>
                </div>
              ) : (
                snapshot.models.map((model) => (
                  <div className="stack-block provider-card" key={model.id}>
                    <div className="row-between">
                      <strong>{model.displayName}</strong>
                      <span className={`status-pill ${model.enabled ? "active" : "muted"}`}>
                        {model.enabled ? text.common.active : text.common.inactive}
                      </span>
                    </div>
                    <p>{model.slug}</p>
                    <p>{model.apiModel}</p>
                    <p>{model.providerName}</p>
                    <p>
                      {text.admin.maxTokens}: {model.maxTokens ?? "—"} · {text.admin.contextWindow}:{" "}
                      {model.contextWindow ?? "—"}
                    </p>
                    <form action={toggleModelStatusAction} className="inline-form">
                      <input type="hidden" name="modelId" value={model.id} />
                      <input type="hidden" name="lang" value={lang} />
                      <input type="hidden" name="tab" value={tab} />
                      <input type="hidden" name="nextEnabled" value={model.enabled ? "false" : "true"} />
                      <button type="submit" className="mini-button">
                        {model.enabled ? text.common.disable : text.common.enable}
                      </button>
                    </form>
                  </div>
                ))
              )}
            </div>
          </article> : null}

          {section === "create" ? <article className="panel">
            <details className="detail-block compact-detail">
              <summary>{text.admin.addModel}</summary>
              <form action={createModelAction} className="admin-form compact-form">
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="tab" value={tab} />
              <label>
                <span>{text.admin.provider}</span>
                <select
                  name="providerId"
                  required
                  defaultValue={snapshot.providers[0]?.id ?? ""}
                  disabled={snapshot.providers.length === 0}
                >
                  {snapshot.providers.length === 0 ? (
                    <option value="">{text.admin.noProviderOptions}</option>
                  ) : null}
                  {snapshot.providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{text.admin.slug}</span>
                <input name="slug" placeholder={text.admin.modelSlugHint} required />
              </label>
              <label>
                <span>{text.admin.displayName}</span>
                <input name="displayName" placeholder={text.admin.modelNameHint} required />
              </label>
              <label>
                <span>{text.admin.apiModel}</span>
                <input name="apiModel" placeholder={text.admin.apiModelHint} required />
              </label>
                <div className="grid two-up form-grid-tight">
                  <label>
                    <span>{text.admin.maxTokens}</span>
                    <input name="maxTokens" type="number" min="1" placeholder="8192" />
                  </label>
                  <label>
                    <span>{text.admin.contextWindow}</span>
                    <input name="contextWindow" type="number" min="1" placeholder="65536" />
                  </label>
                </div>
              <button
                type="submit"
                className="primary-button"
                disabled={snapshot.providers.length === 0}
              >
                {text.admin.saveModel}
                </button>
              </form>
            </details>
          </article> : null}
        </section>
      ) : null}

      {tab === "tasks" ? (
        <section className="grid two-up">
          {section === "list" ? <article className="panel">
            <div className="toolbar-row">
              <div className="section-head">
                <h2>{text.admin.reminderTasks}</h2>
              </div>
              <div className="toolbar-actions">
                <nav className="tab-strip compact-tab-strip" aria-label={text.admin.taskFilterStatus}>
                  <a
                    className={`tab-chip ${taskStatusFilter === "all" ? "active" : ""}`}
                    href={buildAdminHref(lang, "tasks", "list", {
                      taskStatus: "all",
                      taskPriority: taskPriorityFilter,
                      taskCategory: taskCategoryFilter
                    })}
                  >
                    {text.common.all}
                  </a>
                  <a
                    className={`tab-chip ${taskStatusFilter === "open" ? "active" : ""}`}
                    href={buildAdminHref(lang, "tasks", "list", {
                      taskStatus: "open",
                      taskPriority: taskPriorityFilter,
                      taskCategory: taskCategoryFilter
                    })}
                  >
                    {text.admin.taskOpen}
                  </a>
                  <a
                    className={`tab-chip ${taskStatusFilter === "completed" ? "active" : ""}`}
                    href={buildAdminHref(lang, "tasks", "list", {
                      taskStatus: "completed",
                      taskPriority: taskPriorityFilter,
                      taskCategory: taskCategoryFilter
                    })}
                  >
                    {text.admin.taskCompleted}
                  </a>
                  <a
                    className={`tab-chip ${taskStatusFilter === "paused" ? "active" : ""}`}
                    href={buildAdminHref(lang, "tasks", "list", {
                      taskStatus: "paused",
                      taskPriority: taskPriorityFilter,
                      taskCategory: taskCategoryFilter
                    })}
                  >
                    {text.admin.taskPaused}
                  </a>
                </nav>
                <nav className="tab-strip compact-tab-strip" aria-label={text.admin.taskFilterPriority}>
                  <a
                    className={`tab-chip ${taskPriorityFilter === "all" ? "active" : ""}`}
                    href={buildAdminHref(lang, "tasks", "list", {
                      taskStatus: taskStatusFilter,
                      taskPriority: "all",
                      taskCategory: taskCategoryFilter
                    })}
                  >
                    {text.common.all}
                  </a>
                  <a
                    className={`tab-chip ${taskPriorityFilter === "high" ? "active" : ""}`}
                    href={buildAdminHref(lang, "tasks", "list", {
                      taskStatus: taskStatusFilter,
                      taskPriority: "high",
                      taskCategory: taskCategoryFilter
                    })}
                  >
                    {text.admin.taskPriorityHigh}
                  </a>
                  <a
                    className={`tab-chip ${taskPriorityFilter === "normal" ? "active" : ""}`}
                    href={buildAdminHref(lang, "tasks", "list", {
                      taskStatus: taskStatusFilter,
                      taskPriority: "normal",
                      taskCategory: taskCategoryFilter
                    })}
                  >
                    {text.admin.taskPriorityNormal}
                  </a>
                  <a
                    className={`tab-chip ${taskPriorityFilter === "low" ? "active" : ""}`}
                    href={buildAdminHref(lang, "tasks", "list", {
                      taskStatus: taskStatusFilter,
                      taskPriority: "low",
                      taskCategory: taskCategoryFilter
                    })}
                  >
                    {text.admin.taskPriorityLow}
                  </a>
                </nav>
                {taskCategories.length ? (
                  <nav className="tab-strip compact-tab-strip" aria-label={text.admin.taskCategory}>
                    <a
                      className={`tab-chip ${taskCategoryFilter === "all" ? "active" : ""}`}
                      href={buildAdminHref(lang, "tasks", "list", {
                        taskStatus: taskStatusFilter,
                        taskPriority: taskPriorityFilter,
                        taskCategory: "all"
                      })}
                    >
                      {text.admin.taskAllCategories}
                    </a>
                    {taskCategories.map((category) => (
                      <a
                        key={category}
                        className={`tab-chip ${taskCategoryFilter === category ? "active" : ""}`}
                        href={buildAdminHref(lang, "tasks", "list", {
                          taskStatus: taskStatusFilter,
                          taskPriority: taskPriorityFilter,
                          taskCategory: category
                        })}
                      >
                        {category}
                      </a>
                    ))}
                  </nav>
                ) : null}
              </div>
            </div>
            <div className="stack-rows scroll-panel">
              {filteredTasks.length ? (
                filteredTasks.map((task) => (
                  <div className="stack-block provider-card" key={task.id}>
                    <div className="row-between">
                      <strong>{task.title}</strong>
                      <span className={`status-pill ${task.completed ? "active" : task.active ? "active" : "inactive"}`}>
                        {formatTaskStatus(task, text)}
                      </span>
                    </div>
                    <p>
                      {text.admin.taskPriority}: {formatTaskPriority(task.priority, text)}
                      {task.category ? ` · ${text.admin.taskCategory}: ${task.category}` : ""}
                    </p>
                    <p>{task.notes ?? "—"}</p>
                    <p>
                      {text.admin.taskDueAt}:{" "}
                      {task.dueAt ? formatDateTime(task.dueAt, locale) : text.admin.noTaskDueAt}
                    </p>
                    <p>
                      {text.admin.taskLastReminder}:{" "}
                      {task.lastRemindedAt
                        ? formatDateTime(task.lastRemindedAt, locale)
                        : text.admin.noTaskReminderYet}
                    </p>
                    <div className="inline-actions">
                      <form action={updateReminderTaskStateAction} className="inline-form">
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="lang" value={lang} />
                        <input type="hidden" name="tab" value={tab} />
                        <input
                          type="hidden"
                          name="nextCompleted"
                          value={task.completed ? "false" : "true"}
                        />
                        <button type="submit" className="mini-button">
                          {task.completed ? text.admin.markTaskOpen : text.admin.markTaskDone}
                        </button>
                      </form>
                      <form action={updateReminderTaskStateAction} className="inline-form">
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="lang" value={lang} />
                        <input type="hidden" name="tab" value={tab} />
                        <input type="hidden" name="nextActive" value={task.active ? "false" : "true"} />
                        <button type="submit" className="mini-button">
                          {task.active ? text.common.disable : text.common.enable}
                        </button>
                      </form>
                    </div>
                  </div>
                ))
              ) : (
                <div className="stack-block info-card">
                  <p>{text.admin.noReminderTasks}</p>
                </div>
              )}
            </div>
          </article> : null}

          {section === "create" ? <article className="panel">
            <div className="section-head">
              <h2>{text.admin.addReminderTask}</h2>
            </div>
            <form action={createReminderTaskAction} className="admin-form compact-form">
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="tab" value="tasks" />
              <label>
                <span>{text.admin.name}</span>
                <input name="title" placeholder={text.admin.reminderTaskTitleHint} required />
              </label>
              <label>
                <span>{text.admin.description}</span>
                <textarea name="notes" rows={3} />
              </label>
              <div className="grid two-up form-grid-tight">
                <label>
                  <span>{text.admin.taskCategory}</span>
                  <input name="category" placeholder={text.admin.taskCategoryHint} />
                </label>
                <label>
                  <span>{text.admin.taskPriority}</span>
                  <select name="priority" defaultValue="normal">
                    <option value="low">{text.admin.taskPriorityLow}</option>
                    <option value="normal">{text.admin.taskPriorityNormal}</option>
                    <option value="high">{text.admin.taskPriorityHigh}</option>
                  </select>
                </label>
              </div>
              <label>
                <span>{text.admin.taskDueAt}</span>
                <input name="dueAt" type="datetime-local" />
              </label>
              <button type="submit" className="primary-button">
                {text.admin.saveReminderTask}
              </button>
            </form>
          </article> : null}
        </section>
      ) : null}

      {tab === "pet" ? (
        <section className="grid two-up">
          <article className="panel">
            <div className="section-head">
              <h2>{text.admin.petSettings}</h2>
            </div>
            <form action={updatePetProfileAction} className="admin-form compact-form">
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="tab" value={tab} />
              <input type="hidden" name="petId" value={snapshot.pet.id} />
              <div className="grid two-up form-grid-tight">
                <label>
                  <span>{text.admin.name}</span>
                  <input name="name" defaultValue={snapshot.pet.name} required />
                </label>
                <label>
                  <span>{text.admin.mascotName}</span>
                  <input
                    name="mascotName"
                    defaultValue={snapshot.pet.mascotName}
                    placeholder={text.admin.mascotNameHint}
                    required
                  />
                </label>
              </div>
              <label>
                <span>{text.admin.defaultSkill}</span>
                <select name="defaultSkillId" defaultValue={snapshot.pet.defaultSkillId ?? ""}>
                  <option value="">{text.admin.noDefaultSkill}</option>
                  {snapshot.skills.map((skill) => (
                    <option key={skill.id} value={skill.id}>
                      {skill.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid two-up form-grid-tight">
                <label>
                  <span>{text.admin.reminderTone}</span>
                  <input
                    name="reminderTone"
                    defaultValue={snapshot.pet.reminderTone}
                    placeholder={text.admin.reminderToneHint}
                    required
                  />
                </label>
                <label>
                  <span>{text.admin.companionStyle}</span>
                  <input
                    name="companionStyle"
                    defaultValue={snapshot.pet.companionStyle}
                    placeholder={text.admin.companionStyleHint}
                    required
                  />
                </label>
              </div>
              <label>
                <span>{text.admin.reminderCadence}</span>
                <input
                  name="reminderCadence"
                  defaultValue={snapshot.pet.reminderCadence}
                  placeholder={text.admin.reminderCadenceHint}
                  required
                />
              </label>
              <details className="detail-block compact-detail">
                <summary>{text.admin.description} / {text.admin.personaPrompt}</summary>
                <div className="admin-form compact-form">
                  <label>
                    <span>{text.admin.description}</span>
                    <textarea name="description" defaultValue={snapshot.pet.description} rows={3} required />
                  </label>
                  <label>
                    <span>{text.admin.personaPrompt}</span>
                    <textarea
                      name="personaPrompt"
                      defaultValue={snapshot.pet.personaPrompt ?? ""}
                      placeholder={text.admin.petPromptHint}
                      rows={5}
                    />
                  </label>
                </div>
              </details>
              <button type="submit" className="primary-button">
                {text.admin.savePet}
              </button>
            </form>
          </article>
        </section>
      ) : null}

      {tab === "skills" ? (
        <section className="grid two-up">
          {section === "list" ? <article className="panel">
            <div className="section-head">
              <h2>{text.common.skills}</h2>
            </div>
            <div className="stack-rows scroll-panel">
              {snapshot.skills.map((skill) => (
                <div className="stack-block provider-card" key={skill.id}>
                  <div className="row-between">
                    <strong>{skill.name}</strong>
                    <span className={`status-pill ${skill.enabled ? "active" : "muted"}`}>
                      {skill.enabled ? text.common.active : text.common.inactive}
                    </span>
                  </div>
                  <p>{skill.description}</p>
                  <p>
                    {text.admin.skillDefaultModel}: {skill.defaultModelName ?? text.admin.noDefaultModel}
                  </p>
                  <p>{skill.systemPrompt}</p>
                  <form action={updateSkillBindingAction} className="admin-form inline-card-form">
                    <input type="hidden" name="skillId" value={skill.id} />
                    <input type="hidden" name="lang" value={lang} />
                    <input type="hidden" name="tab" value="skills" />
                    <label>
                      <span>{text.admin.skillDefaultModel}</span>
                      <select name="defaultModelId" defaultValue={skill.defaultModelId ?? ""}>
                        <option value="">{text.admin.noDefaultModel}</option>
                        {snapshot.models
                          .filter((model) => model.enabled)
                          .map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.displayName}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button type="submit" className="mini-button">
                      {text.admin.saveSkillBinding}
                    </button>
                  </form>
                  <form action={toggleSkillStatusAction} className="inline-form">
                    <input type="hidden" name="skillId" value={skill.id} />
                    <input type="hidden" name="lang" value={lang} />
                    <input type="hidden" name="tab" value="skills" />
                    <input type="hidden" name="nextEnabled" value={skill.enabled ? "false" : "true"} />
                    <button type="submit" className="mini-button">
                      {skill.enabled ? text.common.disable : text.common.enable}
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </article> : null}

          {section === "create" ? <article className="panel">
            <div className="section-head">
              <h2>{text.admin.createSkill}</h2>
            </div>
            <form action={createSkillAction} className="admin-form compact-form">
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="tab" value="skills" />
              <label>
                <span>{text.admin.slug}</span>
                <input name="slug" placeholder={text.admin.skillSlugHint} required />
              </label>
              <label>
                <span>{text.admin.name}</span>
                <input name="name" placeholder={text.admin.skillNameHint} required />
              </label>
                <label>
                  <span>{text.admin.description}</span>
                  <textarea name="description" rows={3} required />
                </label>
              <label>
                <span>{text.admin.skillPrompt}</span>
                <textarea name="systemPrompt" rows={5} required />
              </label>
              <button type="submit" className="primary-button">
                {text.admin.saveSkill}
              </button>
            </form>
          </article> : null}
        </section>
      ) : null}

      {tab === "system" ? (
        <section className="grid two-up">
          {section === "runtime" ? <article className="panel">
            <div className="section-head">
              <h2>{text.admin.runtimeState}</h2>
            </div>
            <dl className="stats-list">
              <div>
                <dt>{text.admin.localTime}</dt>
                <dd>
                  {snapshot.reminders.localTime} · {snapshot.reminders.timezone}
                </dd>
              </div>
              <div>
                <dt>{text.admin.defaultLocation}</dt>
                <dd>{snapshot.reminders.defaultLocation}</dd>
              </div>
              <div>
                <dt>{text.admin.inQuietHours}</dt>
                <dd>{snapshot.reminders.inQuietHours ? text.common.yes : text.common.no}</dd>
              </div>
              <div>
                <dt>{text.admin.inReminderWindow}</dt>
                <dd>{snapshot.reminders.inReminderWindow ? text.common.yes : text.common.no}</dd>
              </div>
              <div>
                <dt>{text.admin.shouldCheckNow}</dt>
                <dd>{snapshot.reminders.shouldCheckNow ? text.admin.yesNow : text.admin.noNow}</dd>
              </div>
            </dl>
            <div className="section-divider" />
            <details className="detail-block compact-detail">
              <summary>{text.admin.reminderRuntime}</summary>
              <form action={updateReminderRuntimeAction} className="admin-form compact-form">
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="tab" value={tab} />
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={snapshot.reminders.enabled}
                />
                <span>{text.admin.reminderEnabled}</span>
              </label>
              <label>
                <span>{text.admin.timezone}</span>
                <input
                  name="timezone"
                  defaultValue={snapshot.reminders.timezone}
                  placeholder={text.admin.timezoneHint}
                  required
                />
              </label>
              <label>
                <span>{text.admin.defaultLocation}</span>
                <input
                  name="defaultLocation"
                  defaultValue={snapshot.reminders.defaultLocation}
                  placeholder={text.admin.defaultLocationHint}
                  required
                />
              </label>
              <div className="grid two-up form-grid-tight">
                <label>
                  <span>{text.admin.quietHours}</span>
                  <input
                    name="quietHoursStart"
                    defaultValue={snapshot.reminders.quietHoursStart}
                    placeholder="23:00"
                    required
                  />
                </label>
                <label>
                  <span>{text.admin.quietHours}</span>
                  <input
                    name="quietHoursEnd"
                    defaultValue={snapshot.reminders.quietHoursEnd}
                    placeholder="08:00"
                    required
                  />
                </label>
              </div>
              <div className="grid two-up form-grid-tight">
                <label>
                  <span>{text.admin.reminderWindow}</span>
                  <input
                    name="reminderWindowStart"
                    defaultValue={snapshot.reminders.reminderWindowStart}
                    placeholder="09:00"
                    required
                  />
                </label>
                <label>
                  <span>{text.admin.reminderWindow}</span>
                  <input
                    name="reminderWindowEnd"
                    defaultValue={snapshot.reminders.reminderWindowEnd}
                    placeholder="21:00"
                    required
                  />
                </label>
              </div>
              <label>
                <span>{text.admin.checkInterval}</span>
                <input
                  name="checkIntervalMinutes"
                  type="number"
                  min="5"
                  max="1440"
                  defaultValue={snapshot.reminders.checkIntervalMinutes}
                  placeholder="30"
                  required
                />
              </label>
              <button type="submit" className="primary-button">
                {text.admin.saveReminderRuntime}
              </button>
              </form>
            </details>
          </article> : null}

          {section === "test" ? <article className="panel">
            <details className="detail-block compact-detail">
              <summary>{text.admin.liveTest}</summary>
              <form action={runProviderTestAction} className="admin-form compact-form">
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="tab" value={tab} />
              <label>
                <span>{text.admin.testProvider}</span>
                <select name="providerId" required defaultValue={snapshot.providers[0]?.id ?? ""}>
                  {snapshot.providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{text.admin.testPrompt}</span>
                <textarea
                  name="prompt"
                  placeholder={text.admin.testPromptHint}
                  rows={4}
                  defaultValue="Reply with exactly: MAKERSPET_OK"
                  required
                />
              </label>
              <button type="submit" className="primary-button">
                {text.admin.runTest}
              </button>
              </form>
            </details>
            {testStatus ? (
              <>
                <div className="section-divider" />
                <div className="section-head">
                  <h2>{text.admin.testResult}</h2>
                </div>
                <div className={`stack-block result-card ${testStatus === "ok" ? "success" : "error"}`}>
                  {testStatus === "ok" ? (
                    <>
                      <strong>{text.admin.response}</strong>
                      <p>{testReply || "—"}</p>
                      <strong>{text.admin.usage}</strong>
                      <p>{testUsage || text.admin.noUsage}</p>
                    </>
                  ) : (
                    <>
                      <strong>{text.admin.testFailed}</strong>
                      <p>{testError || errorMessage || "—"}</p>
                    </>
                  )}
                </div>
              </>
            ) : null}
          </article> : null}

          {section === "reminders" || section === "desktop" ? <article className="panel">
            {section === "reminders" ? (
              <>
            <div className="toolbar-row">
              <div className="section-head">
                <h2>{text.admin.reminderRunner}</h2>
              </div>
              <div className="toolbar-actions">
                <form action={runReminderAction} className="inline-form">
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="tab" value={tab} />
                  <input type="hidden" name="force" value="true" />
                  <button type="submit" className="primary-button">
                    {text.admin.runReminderNow}
                  </button>
                </form>
              </div>
            </div>
            <div className="section-divider" />
            <div className="section-head">
              <h2>{text.admin.reminderScheduler}</h2>
            </div>
            <dl className="stats-list">
              <div>
                <dt>{text.admin.schedulerActive}</dt>
                <dd>{snapshot.reminders.scheduler.active ? text.common.yes : text.common.no}</dd>
              </div>
              <div>
                <dt>{text.admin.schedulerInterval}</dt>
                <dd>{Math.round(snapshot.reminders.scheduler.intervalMs / 1000)}s</dd>
              </div>
              <div>
                <dt>{text.admin.schedulerStartedAt}</dt>
                <dd>
                  {snapshot.reminders.scheduler.startedAt
                    ? formatDateTime(snapshot.reminders.scheduler.startedAt, locale)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>{text.admin.schedulerLastTickAt}</dt>
                <dd>
                  {snapshot.reminders.scheduler.lastTickAt
                    ? formatDateTime(snapshot.reminders.scheduler.lastTickAt, locale)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>{text.admin.schedulerLastOutcome}</dt>
                <dd>{snapshot.reminders.scheduler.lastOutcome ?? "—"}</dd>
              </div>
            </dl>
            <div className="section-divider" />
            <div className="section-head">
              <h2>{text.admin.lastReminderRun}</h2>
            </div>
            {snapshot.reminders.latestRun ? (
              <>
                <dl className="stats-list">
                  <div>
                    <dt>{text.admin.lastReminderStatus}</dt>
                    <dd>{snapshot.reminders.latestRun.status}</dd>
                  </div>
                  <div>
                    <dt>{text.admin.lastReminderReason}</dt>
                    <dd>{formatReminderReason(snapshot.reminders.latestRun.reason, text)}</dd>
                  </div>
                  <div>
                    <dt>{text.admin.lastReminderAt}</dt>
                    <dd>{formatDateTime(snapshot.reminders.latestRun.createdAt, locale)}</dd>
                  </div>
                  <div>
                    <dt>{text.admin.lastReminderRuntime}</dt>
                    <dd>
                      {snapshot.reminders.latestRun.skillName ?? "—"} ·{" "}
                      {snapshot.reminders.latestRun.modelName ?? "—"} ·{" "}
                      {snapshot.reminders.latestRun.providerName ?? "—"}
                    </dd>
                  </div>
                </dl>
                <div className="stack-block result-card">
                  <strong>{text.admin.lastReminderReply}</strong>
                  <p>{snapshot.reminders.latestRun.reply ?? "—"}</p>
                </div>
                {snapshot.reminders.latestRun.prompt ? (
                  <details className="detail-block compact-detail">
                    <summary>{text.admin.viewDetails}</summary>
                    <div className="stack-block transcript-card">
                      <strong>{text.admin.reminderPrompt}</strong>
                      <p>{snapshot.reminders.latestRun.prompt}</p>
                    </div>
                  </details>
                ) : null}
                <div className="section-divider" />
              </>
            ) : null}
            <div className="toolbar-row">
              <div className="section-head">
                <h2>{text.admin.reminderHistory}</h2>
              </div>
              <div className="toolbar-actions">
                <nav className="tab-strip compact-tab-strip" aria-label={text.admin.reminderHistory}>
                  <a
                    className={`tab-chip ${reminderHistoryFilter === "all" ? "active" : ""}`}
                    href={buildAdminHref(lang, "system", "reminders", { runStatus: "all" })}
                  >
                    {text.common.all}
                  </a>
                  <a
                    className={`tab-chip ${reminderHistoryFilter === "triggered" ? "active" : ""}`}
                    href={buildAdminHref(lang, "system", "reminders", { runStatus: "triggered" })}
                  >
                    TRIGGERED
                  </a>
                  <a
                    className={`tab-chip ${reminderHistoryFilter === "skipped" ? "active" : ""}`}
                    href={buildAdminHref(lang, "system", "reminders", { runStatus: "skipped" })}
                  >
                    SKIPPED
                  </a>
                  <a
                    className={`tab-chip ${reminderHistoryFilter === "failed" ? "active" : ""}`}
                    href={buildAdminHref(lang, "system", "reminders", { runStatus: "failed" })}
                  >
                    FAILED
                  </a>
                </nav>
                <form action={clearReminderHistoryAction} className="inline-form">
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="tab" value={tab} />
                  <button type="submit" className="mini-button">
                    {text.admin.clearReminderHistory}
                  </button>
                </form>
              </div>
            </div>
            <div className="stack-rows scroll-panel">
              {filteredReminderRuns.length ? (
                filteredReminderRuns.map((run) => (
                  <div className="stack-block result-card" key={run.id}>
                    <div className="row-between">
                      <strong>{formatDateTime(run.createdAt, locale)}</strong>
                      <span className={`status-pill ${run.status === "TRIGGERED" ? "active" : run.status === "FAILED" ? "inactive" : "muted"}`}>
                        {run.status}
                      </span>
                    </div>
                    <p>{formatReminderReason(run.reason, text)}</p>
                    <p>
                      {run.skillName ?? "—"} · {run.modelName ?? "—"} · {run.providerName ?? "—"}
                    </p>
                    <p>{run.reply ?? "—"}</p>
                    {run.prompt ? (
                      <details className="detail-block compact-detail">
                        <summary>{text.admin.viewDetails}</summary>
                        <div className="stack-block transcript-card">
                          <strong>{text.admin.reminderPrompt}</strong>
                          <p>{run.prompt}</p>
                        </div>
                      </details>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="stack-block info-card">
                  <p>{text.admin.noReminderHistory}</p>
                </div>
              )}
            </div>
              </>
            ) : null}
            {section === "desktop" ? (
              <>
            <div className="toolbar-row">
              <div className="section-head">
                <h2>{text.admin.desktopPet}</h2>
              </div>
              <div className="toolbar-actions desktop-pet-controls">
                <form action={launchDesktopPetAction} className="inline-form">
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="tab" value={tab} />
                  <button type="submit" className="primary-button">
                    {text.admin.launchDesktopPet}
                  </button>
                </form>
                <form action={restartDesktopPetAction} className="inline-form">
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="tab" value={tab} />
                  <button type="submit" className="mini-button">
                    {text.admin.restartDesktopPet}
                  </button>
                </form>
                <form action={stopDesktopPetAction} className="inline-form">
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="tab" value={tab} />
                  <button type="submit" className="mini-button">
                    {text.admin.stopDesktopPet}
                  </button>
                </form>
              </div>
            </div>
            <form action={updateDesktopPreferencesAction} className="settings-inline-row">
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="tab" value={tab} />
              <input type="hidden" name="petId" value={snapshot.pet.id} />
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  name="desktopChatInputEnabled"
                  defaultChecked={snapshot.pet.desktopChatInputEnabled}
                />
                <span>{text.admin.desktopChatInputEnabled}</span>
              </label>
              <button type="submit" className="mini-button">
                {text.common.save}
              </button>
            </form>
              <div className="section-divider" />
            <div className="toolbar-row">
              <div className="section-head">
                <h2>{text.admin.chatMemory}</h2>
              </div>
              <div className="toolbar-actions">
                <form action={clearChatHistoryAction} className="inline-form">
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="tab" value={tab} />
                  <button type="submit" className="mini-button">
                    {text.admin.clearChatHistory}
                  </button>
                </form>
              </div>
            </div>
            <dl className="stats-list">
              <div>
                <dt>{text.admin.chatMessages}</dt>
                <dd>{snapshot.memory.messageCount}</dd>
              </div>
              <div>
                <dt>{text.admin.memoryEntries}</dt>
                <dd>{snapshot.memory.memoryCount}</dd>
              </div>
            </dl>
            <div className="stack-rows">
              {snapshot.memory.summaries.length ? (
                snapshot.memory.summaries.map((summary) => (
                  <div className="stack-block result-card" key={summary.conversationId}>
                    <div className="row-between">
                      <strong>{summary.conversationTitle}</strong>
                      <div className="inline-actions">
                        <form action={clearConversationMemoryAction} className="inline-form">
                          <input type="hidden" name="lang" value={lang} />
                          <input type="hidden" name="tab" value={tab} />
                          <input type="hidden" name="conversationSlug" value={summary.conversationSlug} />
                          <button type="submit" className="mini-button">
                            {text.admin.clearConversationMemory}
                          </button>
                        </form>
                        <form action={clearConversationHistoryAction} className="inline-form">
                          <input type="hidden" name="lang" value={lang} />
                          <input type="hidden" name="tab" value={tab} />
                          <input type="hidden" name="conversationId" value={summary.conversationId} />
                          <input type="hidden" name="conversationSlug" value={summary.conversationSlug} />
                          <button type="submit" className="mini-button">
                            {text.admin.clearConversationHistory}
                          </button>
                        </form>
                      </div>
                    </div>
                    <p>
                      {summary.conversationSlug} · {summary.messageCount} {text.admin.chatMessagesUnit}
                    </p>
                    <p>
                      {summary.memory?.summary ?? text.admin.noMemorySummary}
                    </p>
                    <details className="detail-block compact-detail">
                      <summary>{text.admin.viewRecentMessages}</summary>
                      <div className="stack-rows compact-transcript-list">
                        {summary.recentMessages.length ? (
                          summary.recentMessages.map((message) => (
                            <div className="stack-block info-card transcript-card" key={message.id}>
                              <strong>{message.role === "assistant" ? "Makers" : text.chat.you}</strong>
                              <p>{message.content}</p>
                            </div>
                          ))
                        ) : (
                          <div className="stack-block info-card">
                            <p>{text.admin.noRecentMessages}</p>
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                ))
              ) : (
                <div className="stack-block info-card">
                  <p>{text.admin.noMemorySummary}</p>
                </div>
              )}
            </div>
            <div className="section-divider" />
            <div className="section-head">
              <h2>{text.admin.system}</h2>
            </div>
            <dl className="stats-list">
              <div>
                <dt>{text.common.configured}</dt>
                <dd>{health.databaseConfigured ? text.common.yes : text.common.no}</dd>
              </div>
              <div>
                <dt>{text.common.reachable}</dt>
                <dd>{health.databaseReachable ? text.common.yes : text.common.no}</dd>
              </div>
              <div>
                <dt>{text.admin.registryCounts}</dt>
                <dd>
                  {snapshot.counts.providers} {text.common.providers}, {snapshot.counts.models}{" "}
                  {text.common.models}, {snapshot.counts.skills} {text.common.skills},{" "}
                  {snapshot.counts.pets} {text.common.pets}, {snapshot.counts.tasks}{" "}
                  {text.admin.reminderTasks}
                </dd>
              </div>
            </dl>
              </>
            ) : null}
          </article> : null}
        </section>
      ) : null}
    </main>
  );
}
