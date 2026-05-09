import { NextResponse } from "next/server";
import { z } from "zod";
import { runReminderCheck } from "@/lib/reminders";
import { getLang } from "@/lib/i18n";

const requestSchema = z.object({
  force: z.boolean().optional().default(false),
  lang: z.union([z.literal("zh"), z.literal("en")]).optional().default("zh")
});

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const parsed = requestSchema.safeParse({
      force: payload?.force,
      lang: getLang(payload?.lang)
    });

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid reminder run payload." },
        { status: 400 }
      );
    }

    const result = await runReminderCheck(parsed.data);

    return NextResponse.json({
      ok: result.run.status !== "FAILED",
      run: result.run,
      runtimeState: result.runtimeState
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Reminder run failed."
      },
      { status: 500 }
    );
  }
}
