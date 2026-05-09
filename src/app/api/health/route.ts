import { NextResponse } from "next/server";
import { getSystemHealth } from "@/lib/system";

export async function GET() {
  const health = await getSystemHealth();
  return NextResponse.json(health);
}
