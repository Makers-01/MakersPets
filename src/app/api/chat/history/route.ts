import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { clearChatHistory } from "@/lib/chat";

export async function DELETE() {
  try {
    const result = await clearChatHistory();

    revalidatePath("/chat");
    revalidatePath("/desktop");
    revalidatePath("/");

    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to clear chat history."
      },
      {
        status: 500
      }
    );
  }
}
