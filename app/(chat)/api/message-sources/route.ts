import { auth } from "@/app/(auth)/auth";
import {
  getChatById,
  getMessageById,
  getMessageSourcesByMessageId,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");
  const messageId = searchParams.get("messageId");

  if (!chatId || !messageId) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id: chatId });

  if (!chat || chat.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const [message] = await getMessageById({ id: messageId });

  if (!message || message.chatId !== chatId) {
    return new ChatSDKError("not_found:database").toResponse();
  }

  const sources = await getMessageSourcesByMessageId({ messageId });

  return Response.json({
    sources: sources.map((source) => source.payload),
  });
}
