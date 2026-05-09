import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ensureReminderScheduler, getReminderSchedulerStatus } from "@/lib/reminder-scheduler";

export type SystemHealth = {
  appName: string;
  adminLabel: string;
  databaseConfigured: boolean;
  databaseReachable: boolean;
  checkedAt: string;
  reminderScheduler: {
    active: boolean;
    startedAt: string | null;
    intervalMs: number;
    lastTickAt: string | null;
    lastOutcome: string | null;
    running: boolean;
  };
};

export async function getSystemHealth(): Promise<SystemHealth> {
  ensureReminderScheduler();
  const databaseConfigured = Boolean(env.DATABASE_URL);
  let databaseReachable = false;

  if (databaseConfigured) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      databaseReachable = true;
    } catch {
      databaseReachable = false;
    }
  }

  return {
    appName: env.NEXT_PUBLIC_APP_NAME,
    adminLabel: env.MAKERPET_ADMIN_LABEL,
    databaseConfigured,
    databaseReachable,
    checkedAt: new Date().toISOString(),
    reminderScheduler: getReminderSchedulerStatus()
  };
}
