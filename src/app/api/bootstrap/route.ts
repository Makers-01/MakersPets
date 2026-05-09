import { NextResponse } from "next/server";
import { getAdminSnapshot } from "@/lib/admin";
import { bootstrapSummary } from "@/lib/bootstrap";
import { getSystemHealth } from "@/lib/system";

export async function GET() {
  const [health, snapshot] = await Promise.all([
    getSystemHealth(),
    getAdminSnapshot()
  ]);

  return NextResponse.json({
    ...bootstrapSummary,
    health,
    snapshot
  });
}
