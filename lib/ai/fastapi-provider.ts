import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";

class FastAPILanguageModel implements LanguageModelV2 {
  specificationVersion = "v2" as const;
  provider = "fastapi";
  modelId: string;

  constructor(
    modelId: string,
    private baseUrl = "http://localhost:8000"
  ) {
    this.modelId = modelId;
  }

  private toBackendMessages(prompt: any[]) {
    return prompt.map((msg, i) => ({
      id: msg.id ?? String(i),
      role: msg.role,
      parts: Array.isArray(msg.content)
        ? msg.content.map((p: any) => ({
            type: p.type ?? "text",
            text: typeof p.text === "string" ? p.text : "",
          }))
        : [{ type: "text", text: msg.content }],
    }));
  }

  private parseSSEStream(body: ReadableStream<Uint8Array>) {
    return new ReadableStream<LanguageModelV2StreamPart>({
      async start(controller) {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";

          for (const line of chunks) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") {
              controller.close();
              return;
            }

            try {
              const obj = JSON.parse(raw);

              switch (obj.type) {
                case "stream-start":
                  controller.enqueue({ type: "stream-start", warnings: [] });
                  break;
                case "text-start":
                  controller.enqueue({ type: "text-start", id: obj.id });
                  break;
                case "text-delta":
                  controller.enqueue({
                    type: "text-delta",
                    id: obj.id,
                    delta: obj.delta,
                  });
                  break;
                case "text-end":
                  controller.enqueue({ type: "text-end", id: obj.id });
                  break;
                // 🆕 No more approval-required case — backend handles it as text
              }
            } catch {}
          }
        }
        controller.close();
      },
    });
  }

  async doStream(options: LanguageModelV2CallOptions) {
    const threadId =
      options.headers?.["x-thread-id"] ?? crypto.randomUUID();

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: this.toBackendMessages(options.prompt),
        thread_id: threadId,
      }),
      signal: options.abortSignal,
    });

    if (!res.body) throw new Error("FastAPI returned no body");
    return { stream: this.parseSSEStream(res.body) };
  }

  async doGenerate(options: LanguageModelV2CallOptions) {
    const payload = {
      messages: this.toBackendMessages(options.prompt),
      stream: false,
    };

    const res = await fetch(`${this.baseUrl}/api/chat-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: options.abortSignal,
      body: JSON.stringify(payload),
    });

    const json = await res.json();

    return {
      content: [{ type: "text" as const, text: json.text }],
      finishReason: "stop" as const,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      warnings: [],
    };
  }
}

export const fastapiGateway = {
  languageModel(modelId: string) {
    return new FastAPILanguageModel(modelId);
  },
};