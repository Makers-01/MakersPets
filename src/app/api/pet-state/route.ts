import { NextResponse } from "next/server";
import { getLatestReminderRunSnapshot } from "@/lib/reminders";
import { getReminderSchedulerStatus } from "@/lib/reminder-scheduler";
import { getLang } from "@/lib/i18n";

function isRecent(isoString: string | null | undefined, windowMs: number) {
  if (!isoString) return false;
  const timestamp = new Date(isoString).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= windowMs;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lang = getLang(searchParams.get("lang") ?? undefined);
  const latestRun = await getLatestReminderRunSnapshot();
  const scheduler = getReminderSchedulerStatus();

  if (
    latestRun?.status === "TRIGGERED" &&
    latestRun.reply &&
    isRecent(latestRun.createdAt, 20 * 60 * 1000)
  ) {
    return NextResponse.json({
      ok: true,
      state: "nudging",
      bubble: latestRun.reply,
      createdAt: latestRun.createdAt
    });
  }

  if (
    latestRun?.status === "FAILED" &&
    isRecent(latestRun.createdAt, 10 * 60 * 1000)
  ) {
    return NextResponse.json({
      ok: true,
      state: "thinking",
      bubble:
        lang === "en"
          ? "I am smoothing out the reminder flow."
          : "我在整理刚才那次提醒，再稳一下。"
    });
  }

  if (scheduler.running) {
    return NextResponse.json({
      ok: true,
      state: "thinking",
      bubble:
        lang === "en"
          ? "I am checking whether it is a good time to nudge you."
          : "我在看看现在是不是个适合提醒你的时机。"
    });
  }

  return NextResponse.json({
    ok: true,
    state: "idle",
    bubble: null
  });
}
