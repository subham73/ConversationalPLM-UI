import { geolocation } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
} from "ai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { auth, type UserType } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocument } from "@/lib/ai/tools/create-document";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { isProductionEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessageSources,
  saveMessages,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import type { ChatMessage, MessageSourceData } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

export { getStreamContext };

function getTextFromMessage(message: ChatMessage | undefined) {
  return (
    message?.parts
      ?.filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim() ?? ""
  );
}

async function createLangGraphBrainResponse({
  chatId,
  message,
  approval,
  langGraphThreadId,
}: {
  chatId: string;
  message?: ChatMessage;
  approval?: {
    approval_id: string;
    approved: boolean;
    comment?: string;
  };
  langGraphThreadId?: string;
}) {
  const brainUrl = process.env.LANGGRAPH_BRAIN_URL ?? "http://localhost:8000";
  const graphThreadId =
    langGraphThreadId ?? `${chatId}:${message?.id ?? generateUUID()}`;

  if (approval) {
    const dbMessages = await getMessagesByChatId({ id: chatId });
    const approvalMessage = [...dbMessages].reverse().find((dbMessage) =>
      (dbMessage.parts as Array<{ type?: string; data?: { approvalId?: string } }>).some(
        (part) =>
          part.type === "data-approval-required" &&
          part.data?.approvalId === approval.approval_id
      )
    );

    if (approvalMessage) {
      await updateMessage({
        id: approvalMessage.id,
        parts: (
          approvalMessage.parts as Array<{
            type?: string;
            data?: Record<string, unknown>;
          }>
        ).map((part) =>
          part.type === "data-approval-required"
            ? {
                ...part,
                data: {
                  ...part.data,
                  status: approval.approved ? "approved" : "rejected",
                },
              }
            : part
        ),
      });
    }
  }

  const upstream = await fetch(`${brainUrl.replace(/\/$/, "")}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread_id: graphThreadId,
      message: approval ? undefined : getTextFromMessage(message),
      approval,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    return new ChatSDKError("offline:chat").toResponse();
  }

  const upstreamBody = upstream.body;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  let assistantMessageId = generateUUID();
  let assistantText = "";
  let assistantSources: MessageSourceData[] = [];
  let approvalMessageId = generateUUID();
  let approvalPart:
    | {
        type: "data-approval-required";
        data: unknown;
      }
    | null = null;

  const handlePart = (part: Record<string, any>) => {
    if (part.type === "start") {
      return { ...part, messageId: assistantMessageId };
    }
    if (part.type === "text-delta" && typeof part.delta === "string") {
      assistantText += part.delta;
    }
    if (part.type === "data-approval-required") {
      approvalPart = {
        type: "data-approval-required",
        data: {
          ...part.data,
          threadId: graphThreadId,
          status: "pending",
        },
      };
      return approvalPart;
    }
    if (part.type === "data-sources") {
      assistantSources = Array.isArray(part.data?.sources)
        ? part.data.sources
        : [];
    }
    return part;
  };

  const transformSseChunk = (chunk: string) => {
    pending += chunk;
    const events = pending.split("\n\n");
    pending = events.pop() ?? "";
    const output: string[] = [];

    for (const event of events) {
      const lines = event.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) {
          continue;
        }
        const payload = line.slice(6);
        if (payload === "[DONE]") {
          output.push("data: [DONE]\n\n");
          continue;
        }
        try {
          const part = JSON.parse(payload);
          output.push(`data: ${JSON.stringify(handlePart(part))}\n\n`);
        } catch (_) {
          output.push(`${line}\n\n`);
        }
      }
    }

    return output.join("");
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstreamBody.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          const transformed = transformSseChunk(
            decoder.decode(value, { stream: true })
          );
          if (transformed) {
            controller.enqueue(encoder.encode(transformed));
          }
        }

        const tail = decoder.decode();
        if (tail) {
          const transformed = transformSseChunk(tail);
          if (transformed) {
            controller.enqueue(encoder.encode(transformed));
          }
        }

        if (assistantText.trim()) {
          await saveMessages({
            messages: [
              {
                id: assistantMessageId,
                role: "assistant",
                parts: [{ type: "text", text: assistantText }],
                createdAt: new Date(),
                attachments: [],
                chatId,
              },
            ],
          });
          await saveMessageSources({
            sources: assistantSources.map((source) => ({
              chatId,
              messageId: assistantMessageId,
              sourceType: source.type,
              title: source.title,
              payload: source,
              createdAt: new Date(),
            })),
          });
        }

        if (approvalPart) {
          await saveMessages({
            messages: [
              {
                id: approvalMessageId,
                role: "assistant",
                parts: [approvalPart],
                createdAt: new Date(),
                attachments: [],
                chatId,
              },
            ],
          });
          approvalMessageId = generateUUID();
          approvalPart = null;
        }
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Vercel-AI-UI-Message-Stream": "v1",
    },
  });
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  try {
    const { id, message, messages, selectedChatModel, selectedVisibilityType } =
      requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError("rate_limit:chat").toResponse();
    }

    const isToolApprovalFlow = Boolean(messages);

    const chat = await getChatById({ id });
    let messagesFromDb: DBMessage[] = [];
    let titlePromise: Promise<string> | null = null;

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError("forbidden:chat").toResponse();
      }
      if (!isToolApprovalFlow) {
        messagesFromDb = await getMessagesByChatId({ id });
      }
    } else if (message?.role === "user") {
      await saveChat({
        id,
        userId: session.user.id,
        title: "New chat",
        visibility: selectedVisibilityType,
      });
      titlePromise = generateTitleFromUserMessage({ message });
    }

    const uiMessages = isToolApprovalFlow
      ? (messages as ChatMessage[])
      : [...convertToUIMessages(messagesFromDb), message as ChatMessage];

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    if (message?.role === "user") {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: "user",
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    }

    if (selectedChatModel === "langgraph-brain") {
      if (titlePromise) {
        void titlePromise.then((title) =>
          updateChatTitleById({ chatId: id, title })
        ).catch(() => {
          // Title updates are non-critical for the LangGraph proxy path.
        });
      }
      return createLangGraphBrainResponse({
        chatId: id,
        message: message as ChatMessage | undefined,
        approval: requestBody.langGraphApproval,
        langGraphThreadId: requestBody.langGraphThreadId,
      });
    }

    const isReasoningModel =
      selectedChatModel.includes("reasoning") ||
      selectedChatModel.includes("thinking");

    const modelMessages = await convertToModelMessages(uiMessages);

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        const result = streamText({
          model: getLanguageModel(selectedChatModel),
          system: systemPrompt({ selectedChatModel, requestHints }),
          messages: modelMessages,
          stopWhen: stepCountIs(5),
          experimental_activeTools: isReasoningModel
            ? []
            : [
                "getWeather",
                "createDocument",
                "updateDocument",
                "requestSuggestions",
              ],
          providerOptions: isReasoningModel
            ? {
                anthropic: {
                  thinking: { type: "enabled", budgetTokens: 10_000 },
                },
              }
            : undefined,
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({ session, dataStream }),
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
        });

        dataStream.merge(result.toUIMessageStream({ sendReasoning: true }));

        if (titlePromise) {
          const title = await titlePromise;
          dataStream.write({ type: "data-chat-title", data: title });
          updateChatTitleById({ chatId: id, title });
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        if (isToolApprovalFlow) {
          for (const finishedMsg of finishedMessages) {
            const existingMsg = uiMessages.find((m) => m.id === finishedMsg.id);
            if (existingMsg) {
              await updateMessage({
                id: finishedMsg.id,
                parts: finishedMsg.parts,
              });
            } else {
              await saveMessages({
                messages: [
                  {
                    id: finishedMsg.id,
                    role: finishedMsg.role,
                    parts: finishedMsg.parts,
                    createdAt: new Date(),
                    attachments: [],
                    chatId: id,
                  },
                ],
              });
            }
          }
        } else if (finishedMessages.length > 0) {
          await saveMessages({
            messages: finishedMessages.map((currentMessage) => ({
              id: currentMessage.id,
              role: currentMessage.role,
              parts: currentMessage.parts,
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            })),
          });
        }
      },
      onError: () => "Oops, an error occurred!",
    });

    return createUIMessageStreamResponse({
      stream,
      async consumeSseStream({ stream: sseStream }) {
        if (!process.env.REDIS_URL) {
          return;
        }
        try {
          const streamContext = getStreamContext();
          if (streamContext) {
            const streamId = generateId();
            await createStreamId({ streamId, chatId: id });
            await streamContext.createNewResumableStream(
              streamId,
              () => sseStream
            );
          }
        } catch (_) {
          // ignore redis errors
        }
      },
    });
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatSDKError("bad_request:activate_gateway").toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatSDKError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
