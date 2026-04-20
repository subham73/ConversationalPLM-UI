// approval-card.tsx — updated

"use client";

import { useState } from "react";

interface ApprovalCardProps {
  chatId: string;
  threadId: string;
  question: string;
  actions: Array<{ tool: string; args: Record<string, unknown> }>;
  messages: any[];
  setMessages: (fn: (msgs: any[]) => any[]) => void;
}

export function ApprovalCard({
  chatId,
  threadId,
  question,
  actions,
  messages,
  setMessages,
}: ApprovalCardProps) {
  const [status, setStatus] = useState<
    "pending" | "loading" | "approved" | "rejected"
  >("pending");
  const [responseText, setResponseText] = useState<string>("");

  const handleDecision = async (decision: "approve" | "reject") => {
    setStatus("loading");
    try {
    const res = await fetch("/api/chat/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId,
        threadId,
        decision,
        reason:
          decision === "reject"
            ? "User rejected this action"
            : undefined,
        existingMessages: messages,
      }),
    });

    console.log("📡 Resume response status:", res.status);  // 🆕

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const decoded = decoder.decode(value, { stream: true });
      console.log("📦 Raw chunk:", decoded);  // 🆕

      buffer += decoded;
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const line of chunks) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") break;

        try {
          const obj = JSON.parse(raw);
          console.log("📨 Parsed SSE event:", obj);  // 🆕

          if (obj.type === "text-delta") {
            const delta = obj.delta ?? obj.textDelta ?? "";
            fullText += delta;
            setResponseText(fullText);
          }
        } catch {}
      }
    }

      setStatus(decision === "approve" ? "approved" : "rejected");

      // 🆕 Append response AND remove the approval marker message
      if (fullText) {
        setMessages((prev: any[]) => {
          // Find and update the message containing the approval marker
          const updated = prev.map((msg: any) => {
            if (msg.role === "assistant" && msg.parts) {
              const hasApproval = msg.parts.some(
                (p: any) =>
                  p.type === "text" &&
                  p.text?.includes("<APPROVAL_REQUIRED>")
              );
              if (hasApproval) {
                // Replace the approval marker with status text
                return {
                  ...msg,
                  parts: msg.parts.map((p: any) => {
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
                  }),
                };
              }
            }
            return msg;
          });

          // Append resume response
          return [
            ...updated,
            {
              id: crypto.randomUUID(),
              role: "assistant" as const,
              parts: [{ type: "text" as const, text: fullText }],
            },
          ];
        });
      }
    } catch (err) {
      console.error("Resume failed:", err);
      setStatus("pending");
    }
  };

  if (status === "approved") {
    return (
      <div className="w-[min(100%,500px)] rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
        <p className="text-sm text-green-700 dark:text-green-400">
          ✅ Approved — executed successfully
        </p>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="w-[min(100%,500px)] rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
        <p className="text-sm text-red-700 dark:text-red-400">
          ❌ Rejected
        </p>
        {responseText && (
          <p className="mt-2 text-sm text-muted-foreground">{responseText}</p>
        )}
      </div>
    );
  }

  return (
    <div className="w-[min(100%,500px)] rounded-lg border border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
      <div className="flex items-center justify-between border-b border-yellow-200 px-4 py-3 dark:border-yellow-800">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span>🔒</span>
          <span>Action Approval</span>
        </div>
        <span className="rounded-full bg-yellow-200 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
          {status === "loading" ? "Processing..." : "Pending"}
        </span>
      </div>

      <div className="px-4 py-3">
        <p className="mb-3 text-sm font-medium text-yellow-800 dark:text-yellow-200">
          ⚠️ {question}
        </p>

        {actions.map((action, i) => (
          <div
            key={i}
            className="mb-2 rounded-md border border-yellow-200 bg-white p-3 dark:border-yellow-800 dark:bg-yellow-950/50"
          >
            <code className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs dark:bg-yellow-900">
              {action.tool}
            </code>
            <pre className="mt-2 overflow-auto rounded bg-background p-2 text-xs">
              {JSON.stringify(action.args, null, 2)}
            </pre>
          </div>
        ))}
      </div>

      {status === "loading" && responseText && (
        <div className="border-t border-yellow-200 px-4 py-3 dark:border-yellow-800">
          <p className="text-sm text-muted-foreground">{responseText}</p>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-yellow-200 px-4 py-3 dark:border-yellow-800">
        <button
          disabled={status === "loading"}
          className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          onClick={() => handleDecision("reject")}
          type="button"
        >
          ❌ Reject
        </button>
        <button
          disabled={status === "loading"}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          onClick={() => handleDecision("approve")}
          type="button"
        >
          ✅ Approve
        </button>
      </div>
    </div>
  );
}