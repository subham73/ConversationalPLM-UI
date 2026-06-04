import type { UseChatHelpers } from "@ai-sdk/react";
import { ArrowDownIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useMessages } from "@/hooks/use-messages";
import type { Vote } from "@/lib/db/schema";
import { getApprovalDisplayName } from "@/lib/tool-display";
import type { ChatMessage, CustomUIDataTypes } from "@/lib/types";
import { useDataStream } from "./data-stream-provider";
import { Tool, ToolContent, ToolHeader, ToolInput } from "./elements/tool";
import { Greeting } from "./greeting";
import { SparklesIcon } from "./icons";
import { PreviewMessage, ThinkingMessage } from "./message";
import { Button } from "./ui/button";

type PendingLangGraphApproval = CustomUIDataTypes["approval-required"];

type MessagesProps = {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  status: UseChatHelpers<ChatMessage>["status"];
  votes: Vote[] | undefined;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  isArtifactVisible: boolean;
  selectedModelId: string;
  pendingLangGraphApproval: PendingLangGraphApproval | null;
  respondToLangGraphApproval: (approved: boolean) => void;
};

function PureMessages({
  addToolApprovalResponse,
  chatId,
  status,
  votes,
  messages,
  setMessages,
  regenerate,
  isReadonly,
  selectedModelId: _selectedModelId,
  pendingLangGraphApproval,
  respondToLangGraphApproval,
}: MessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
    hasSentMessage,
  } = useMessages({
    status,
  });

  useDataStream();

  const hasVisibleAssistantOutput = (message: ChatMessage | undefined) =>
    message?.role === "assistant" &&
    message.parts?.some((part) => {
      if (part.type === "text") {
        return part.text.trim().length > 0;
      }
      if (part.type === "data-approval-required") {
        return true;
      }
      if (part.type.startsWith("tool-")) {
        return true;
      }
      return false;
    });

  const awaitingAssistant = status === "submitted" || status === "streaming";
  const latestUserMessageIndex = messages.findLastIndex(
    (message) => message.role === "user"
  );
  const hasAssistantOutputForLatestTurn =
    latestUserMessageIndex >= 0 &&
    messages
      .slice(latestUserMessageIndex + 1)
      .some((message) => hasVisibleAssistantOutput(message));
  const shouldShowThinking =
    awaitingAssistant &&
    !pendingLangGraphApproval &&
    !hasAssistantOutputForLatestTurn;
  const [showThinking, setShowThinking] = useState(false);

  useEffect(() => {
    if (!shouldShowThinking) {
      setShowThinking(false);
      return;
    }

    const timeout = window.setTimeout(() => setShowThinking(true), 350);
    return () => window.clearTimeout(timeout);
  }, [shouldShowThinking]);

  return (
    <div className="relative flex-1">
      <div
        className="absolute inset-0 touch-pan-y overflow-y-auto"
        ref={messagesContainerRef}
      >
        <div className="mx-auto flex min-w-0 max-w-4xl flex-col gap-4 px-2 py-4 md:gap-6 md:px-4">
          {messages.length === 0 && <Greeting />}

          {messages.map((message, index) => (
            <PreviewMessage
              addToolApprovalResponse={addToolApprovalResponse}
              chatId={chatId}
              isLoading={
                status === "streaming" && messages.length - 1 === index
              }
              isReadonly={isReadonly}
              key={message.id}
              message={message}
              regenerate={regenerate}
              requiresScrollPadding={
                hasSentMessage && index === messages.length - 1
              }
              setMessages={setMessages}
              vote={
                votes
                  ? votes.find((vote) => vote.messageId === message.id)
                  : undefined
              }
            />
          ))}

          {showThinking && <ThinkingMessage />}

          {pendingLangGraphApproval && (
            <LangGraphApprovalCard
              approval={pendingLangGraphApproval}
              disabled={status === "submitted" || status === "streaming"}
              isReadonly={isReadonly}
              onRespond={respondToLangGraphApproval}
            />
          )}

          <div
            className="min-h-[24px] min-w-[24px] shrink-0"
            ref={messagesEndRef}
          />
        </div>
      </div>

      <button
        aria-label="Scroll to bottom"
        className={`absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-background p-2 shadow-lg transition-all hover:bg-muted ${
          isAtBottom
            ? "pointer-events-none scale-0 opacity-0"
            : "pointer-events-auto scale-100 opacity-100"
        }`}
        onClick={() => scrollToBottom("smooth")}
        type="button"
      >
        <ArrowDownIcon className="size-4" />
      </button>
    </div>
  );
}

export const Messages = PureMessages;

function LangGraphApprovalCard({
  approval,
  disabled,
  isReadonly,
  onRespond,
}: {
  approval: PendingLangGraphApproval;
  disabled: boolean;
  isReadonly: boolean;
  onRespond: (approved: boolean) => void;
}) {
  const displayName =
    approval.displayName ||
    getApprovalDisplayName({
      title: approval.title,
      action: approval.action,
    });

  return (
    <div
      className="group/message fade-in w-full animate-in duration-200"
      data-role="assistant"
    >
      <div className="flex w-full items-start justify-start gap-2 md:gap-3">
        <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
          <SparklesIcon size={14} />
        </div>

        <div className="min-w-0 w-full max-w-[520px]">
          <Tool className="w-full" defaultOpen={true}>
            <ToolHeader
              state="approval-requested"
              type="tool-langGraphApproval"
            />
            <ToolContent>
              <div className="space-y-2 px-4 py-3">
                <div className="font-medium text-sm">{displayName}</div>
                <div className="text-muted-foreground text-sm">
                  {approval.description}
                </div>
              </div>
              <ToolInput input={approval.action} />
              {!isReadonly && (
                <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
                  <Button
                    disabled={disabled}
                    onClick={() => onRespond(false)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Reject
                  </Button>
                  <Button
                    disabled={disabled}
                    onClick={() => onRespond(true)}
                    size="sm"
                    type="button"
                  >
                    Approve
                  </Button>
                </div>
              )}
            </ToolContent>
          </Tool>
        </div>
      </div>
    </div>
  );
}
