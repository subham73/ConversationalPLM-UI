// app/(chat)/api/chat/resume/route.ts
export async function POST(request: Request) {
  const { threadId, decision, reason } = await request.json();

  const res = await fetch("http://localhost:8000/api/chat/resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread_id: threadId,
      decisions: [
        {
          type: decision,       // "approve" or "reject"
          reason: reason ?? null,
        },
      ],
    }),
  });

  // Forward the SSE stream
  return new Response(res.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}