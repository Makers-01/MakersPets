import { runReminderCheck } from "@/lib/reminders";

const schedulerIntervalMs = 60_000;

type SchedulerState = {
  startedAt: string | null;
  lastTickAt: string | null;
  lastOutcome: string | null;
  running: boolean;
  timer: NodeJS.Timeout | null;
};

declare global {
  var makersPetReminderScheduler: SchedulerState | undefined;
}

function getState() {
  if (!global.makersPetReminderScheduler) {
    global.makersPetReminderScheduler = {
      startedAt: null,
      lastTickAt: null,
      lastOutcome: null,
      running: false,
      timer: null
    };
  }

  return global.makersPetReminderScheduler;
}

async function tickReminderScheduler() {
  const state = getState();

  if (state.running) {
    state.lastOutcome = "busy";
    return;
  }

  state.running = true;
  state.lastTickAt = new Date().toISOString();

  try {
    const result = await runReminderCheck({
      lang: "zh",
      force: false,
      persistSkips: false
    });
    state.lastOutcome = `${result.run.status}:${result.run.reason ?? "none"}`;
  } catch (error) {
    state.lastOutcome = `FAILED:${error instanceof Error ? error.message : "unknown"}`;
  } finally {
    state.running = false;
  }
}

export function ensureReminderScheduler() {
  const state = getState();

  if (!state.timer) {
    state.startedAt = state.startedAt ?? new Date().toISOString();
    state.timer = setInterval(() => {
      void tickReminderScheduler();
    }, schedulerIntervalMs);
  }

  return {
    startedAt: state.startedAt,
    intervalMs: schedulerIntervalMs,
    running: state.running,
    lastTickAt: state.lastTickAt,
    lastOutcome: state.lastOutcome
  };
}

export function getReminderSchedulerStatus() {
  const state = getState();

  return {
    startedAt: state.startedAt,
    intervalMs: schedulerIntervalMs,
    running: state.running,
    lastTickAt: state.lastTickAt,
    lastOutcome: state.lastOutcome,
    active: Boolean(state.timer)
  };
}
