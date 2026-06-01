import equal from "fast-deep-equal";
import { ChevronDownIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR, { useSWRConfig } from "swr";
import { useCopyToClipboard } from "usehooks-ts";
import type { Vote } from "@/lib/db/schema";
import { getToolDisplayName, getToolProvider } from "@/lib/tool-display";
import type { ChatMessage, MessageSourceData } from "@/lib/types";
import { fetcher } from "@/lib/utils";
import { Action, Actions } from "./elements/actions";
import {
  CopyIcon,
  LogsIcon,
  PencilEditIcon,
  ThumbDownIcon,
  ThumbUpIcon,
} from "./icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

function formatSourcePayload(source: MessageSourceData) {
  return JSON.stringify(source, null, 2);
}

export function PureMessageActions({
  chatId,
  message,
  vote,
  isLoading,
  setMode,
}: {
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMode?: (mode: "view" | "edit") => void;
}) {
  const { mutate } = useSWRConfig();
  const [_, copyToClipboard] = useCopyToClipboard();
  const [isSourcesOpen, setIsSourcesOpen] = useState(false);
  const [openSourceIds, setOpenSourceIds] = useState<Set<string>>(new Set());
  const hasAssistantText =
    message.role === "assistant" &&
    message.parts.some((part) => part.type === "text" && part.text.trim());

  const inlineSources = useMemo(() => {
    if (!hasAssistantText) {
      return [];
    }

    const sourcesPart = message.parts.find(
      (part) => part.type === "data-sources"
    ) as { data?: { sources?: MessageSourceData[] } } | undefined;

    return Array.isArray(sourcesPart?.data?.sources)
      ? sourcesPart.data.sources
      : [];
  }, [hasAssistantText, message.parts]);

  const sourceCount = hasAssistantText
    ? inlineSources.length || message.metadata?.sourceCount || 0
    : 0;
  const { data: persistedSources, isLoading: isLoadingSources } = useSWR<{
    sources: MessageSourceData[];
  }>(
    isSourcesOpen && sourceCount > 0
      ? `/api/message-sources?chatId=${chatId}&messageId=${message.id}`
      : null,
    fetcher
  );
  const sources = persistedSources?.sources?.length
    ? persistedSources.sources
    : inlineSources;

  if (isLoading) {
    return null;
  }

  const textFromParts = message.parts
    ?.filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  const handleCopy = async () => {
    if (!textFromParts) {
      toast.error("There's no text to copy!");
      return;
    }

    await copyToClipboard(textFromParts);
    toast.success("Copied to clipboard!");
  };

  const toggleSource = (sourceId: string) => {
    setOpenSourceIds((current) => {
      const next = new Set(current);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  };

  // User messages get edit (on hover) and copy actions
  if (message.role === "user") {
    return (
      <Actions className="-mr-0.5 justify-end">
        <div className="relative">
          {setMode && (
            <Action
              className="absolute top-0 -left-10 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/message:opacity-100"
              data-testid="message-edit-button"
              onClick={() => setMode("edit")}
              tooltip="Edit"
            >
              <PencilEditIcon />
            </Action>
          )}
          <Action onClick={handleCopy} tooltip="Copy">
            <CopyIcon />
          </Action>
        </div>
      </Actions>
    );
  }

  return (
    <Actions className="-ml-0.5">
      <Action onClick={handleCopy} tooltip="Copy">
        <CopyIcon />
      </Action>

      {sourceCount > 0 && (
        <>
          <Action
            data-testid="message-sources"
            onClick={() => setIsSourcesOpen(true)}
            tooltip="View Sources"
          >
            <LogsIcon />
          </Action>

          <Dialog onOpenChange={setIsSourcesOpen} open={isSourcesOpen}>
            <DialogContent className="max-h-[85vh] max-w-2xl grid-rows-[auto_minmax(0,1fr)]">
              <DialogHeader>
                <DialogTitle>Message Sources</DialogTitle>
                <DialogDescription>
                  Raw tool outputs and data points used for this response.
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 overflow-y-auto pr-1">
                {isLoadingSources && sources.length === 0 ? (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-muted-foreground text-sm">
                    Loading sources...
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sources.map((source, index) => {
                      const sourceId =
                        source.id || `${message.id}-source-${index}`;
                      const displayTitle =
                        source.displayTitle ||
                        getToolDisplayName(source.toolName || source.title);
                      const provider =
                        source.provider || getToolProvider(source.toolName);
                      const isOpen = openSourceIds.has(sourceId);

                      return (
                        <Collapsible
                          className="rounded-md border bg-muted/20"
                          key={sourceId}
                          onOpenChange={() => toggleSource(sourceId)}
                          open={isOpen}
                        >
                          <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left">
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-sm">
                                {displayTitle || "Source"}
                              </div>
                              {(source.toolName || source.toolCallId) && (
                                <div className="truncate text-muted-foreground text-xs">
                                  {source.toolName}
                                  {source.toolName && source.toolCallId
                                    ? " - "
                                    : ""}
                                  {source.toolCallId}
                                </div>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {provider && (
                                <span className="rounded border bg-background px-2 py-0.5 font-medium text-xs">
                                  {provider}
                                </span>
                              )}
                              <span className="rounded border px-2 py-0.5 text-muted-foreground text-xs">
                                {source.type}
                              </span>
                              <ChevronDownIcon
                                className={`size-4 text-muted-foreground transition-transform ${
                                  isOpen ? "rotate-180" : ""
                                }`}
                              />
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="border-t">
                            <pre className="max-h-72 overflow-auto p-3 text-xs leading-relaxed">
                              {formatSourcePayload(source)}
                            </pre>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}

      <Action
        data-testid="message-upvote"
        disabled={vote?.isUpvoted}
        onClick={() => {
          const upvote = fetch("/api/vote", {
            method: "PATCH",
            body: JSON.stringify({
              chatId,
              messageId: message.id,
              type: "up",
            }),
          });

          toast.promise(upvote, {
            loading: "Upvoting Response...",
            success: () => {
              mutate<Vote[]>(
                `/api/vote?chatId=${chatId}`,
                (currentVotes) => {
                  if (!currentVotes) {
                    return [];
                  }

                  const votesWithoutCurrent = currentVotes.filter(
                    (currentVote) => currentVote.messageId !== message.id
                  );

                  return [
                    ...votesWithoutCurrent,
                    {
                      chatId,
                      messageId: message.id,
                      isUpvoted: true,
                    },
                  ];
                },
                { revalidate: false }
              );

              return "Upvoted Response!";
            },
            error: "Failed to upvote response.",
          });
        }}
        tooltip="Upvote Response"
      >
        <ThumbUpIcon />
      </Action>

      <Action
        data-testid="message-downvote"
        disabled={vote && !vote.isUpvoted}
        onClick={() => {
          const downvote = fetch("/api/vote", {
            method: "PATCH",
            body: JSON.stringify({
              chatId,
              messageId: message.id,
              type: "down",
            }),
          });

          toast.promise(downvote, {
            loading: "Downvoting Response...",
            success: () => {
              mutate<Vote[]>(
                `/api/vote?chatId=${chatId}`,
                (currentVotes) => {
                  if (!currentVotes) {
                    return [];
                  }

                  const votesWithoutCurrent = currentVotes.filter(
                    (currentVote) => currentVote.messageId !== message.id
                  );

                  return [
                    ...votesWithoutCurrent,
                    {
                      chatId,
                      messageId: message.id,
                      isUpvoted: false,
                    },
                  ];
                },
                { revalidate: false }
              );

              return "Downvoted Response!";
            },
            error: "Failed to downvote response.",
          });
        }}
        tooltip="Downvote Response"
      >
        <ThumbDownIcon />
      </Action>
    </Actions>
  );
}

export const MessageActions = memo(
  PureMessageActions,
  (prevProps, nextProps) => {
    if (!equal(prevProps.vote, nextProps.vote)) {
      return false;
    }
    if (prevProps.isLoading !== nextProps.isLoading) {
      return false;
    }
    if (!equal(prevProps.message.parts, nextProps.message.parts)) {
      return false;
    }
    if (!equal(prevProps.message.metadata, nextProps.message.metadata)) {
      return false;
    }

    return true;
  }
);
