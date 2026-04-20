// app/(chat)/api/chat/resume/route.ts 
import { auth } from "@/app/(auth)/auth";
import {
  getChatById,
  saveMessages,
  updateMessage,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const { chatId, threadId, decision, reason, existingMessages } =
    await request.json();

  if (chatId) {
    const chat = await getChatById({ id: chatId });
    if (chat && chat.userId !== session.user.id) {
      return new ChatSDKError("forbidden:chat").toResponse();
    }
  }

  const fastApiRes = await fetch("http://localhost:8000/api/chat/resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread_id: threadId,
      decisions: [{ type: decision, reason: reason ?? null }],
    }),
  });

  if (!fastApiRes.body) {
    throw new Error("No response body from FastAPI resume");
  }

  // ✅ tee() — one copy for client, one copy for DB persistence
  const [streamForClient, streamForDB] = fastApiRes.body.tee();

  // ✅ Fire-and-forget: read the DB copy in background, save when done
  persistResumeResult({
    stream: streamForDB,
    chatId,
    decision,
    existingMessages,
  });

  // ✅ Return the client copy directly — same as your old working proxy
  return new Response(streamForClient, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ─── Background DB persistence ───
async function persistResumeResult({
  stream,
  chatId,
  decision,
  existingMessages,
}: {
  stream: ReadableStream<Uint8Array>;
  chatId?: string;
  decision: string;
  existingMessages?: any[];
}) {
  if (!chatId) return;

  try {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        if (!chunk.startsWith("data: ")) continue;
        const raw = chunk.slice(6).trim();
        try {
          const obj = JSON.parse(raw);
          if (obj.type === "text-delta" && obj.delta) {
            fullText += obj.delta;
          }
        } catch {}
      }
    }

    console.log("📝 Resume full text collected:", fullText.substring(0, 100) + "...");

    if (!fullText) {
      console.warn("⚠️ No text collected from resume stream");
      return;
    }

    // Update the approval marker message
    if (existingMessages?.length) {
      for (const msg of existingMessages) {
        if (msg.role === "assistant" && msg.parts) {
          const hasApproval = msg.parts.some(
            (p: any) =>
              p.type === "text" &&
              p.text?.includes("<APPROVAL_REQUIRED>")
          );
          if (hasApproval) {
            const updatedParts = msg.parts.map((p: any) => {
              if (
                p.type === "text" &&
                p.text?.includes("<APPROVAL_REQUIRED>")
              ) {
                return {
                  ...p,
                  text:
                    decision === "approve"
                      ? "✅ Action approved."
                      : "❌ Action rejected.",
                };
              }
              return p;
            });
            await updateMessage({ id: msg.id, parts: updatedParts });
            console.log("✅ Updated approval message:", msg.id);
          }
        }
      }
    }

    // Save the resume response as new message
    const newMsgId = generateUUID();
    await saveMessages({
      messages: [
        {
          id: newMsgId,
          role: "assistant",
          parts: [{ type: "text", text: fullText }],
          createdAt: new Date(),
          attachments: [],
          chatId,
        },
      ],
    });

    console.log("✅ Resume response saved to DB:", newMsgId);
  } catch (err) {
    console.error("❌ Failed to persist resume result:", err);
  }
}