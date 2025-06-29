"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bot, Loader2, Send, Settings, User, Wrench, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { detectPermissionError } from "@/core/application/authorization/detectPermissionError";
import { formatAllowedTool } from "@/core/application/authorization/formatAllowedTool";
import type { PermissionRequest } from "@/core/domain/authorization/types";
import type { Message } from "@/core/domain/message/types";
import {
  isAssistantMessage,
  isResultMessage,
  isSystemMessage,
  isUserMessage,
  parseSDKMessage,
} from "@/lib/claude";
import { formatTime } from "@/lib/date";
import { MessageContent } from "./MessageContent";
import { PermissionDialog } from "./PermissionDialog";

interface ChatInterfaceProps {
  sessionId?: string;
  projectId?: string;
  initialMessages: Message[];
  cwd?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  messageType?: "init" | "result" | "thinking" | "tool_use" | "normal";
}

export function ChatInterface({
  sessionId,
  projectId: _projectId,
  initialMessages,
  cwd,
}: ChatInterfaceProps) {
  const _router = useRouter();
  const [currentSessionId, setCurrentSessionId] = useState(sessionId);
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content || "",
      timestamp: msg.timestamp,
    })),
  );
  const [input, setInput] = useState("");
  const [currentCwd, setCurrentCwd] = useState(cwd || "");
  const [isLoading, setIsLoading] = useState(false);
  const [permissionRequest, setPermissionRequest] =
    useState<PermissionRequest | null>(null);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pendingToolUsesRef = useRef<
    Map<
      string,
      {
        id: string;
        name: string;
        input: Record<string, unknown>;
      }
    >
  >(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);

  const getMessageIcon = (
    role: ChatMessage["role"],
    messageType?: ChatMessage["messageType"],
  ) => {
    if (role === "user") {
      return (
        <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary-foreground" />
      );
    }
    if (
      role === "system" ||
      messageType === "init" ||
      messageType === "result"
    ) {
      return <Settings className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted" />;
    }
    if (role === "tool" || messageType === "tool_use") {
      return <Wrench className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted" />;
    }
    return <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted" />;
  };

  const getMessageStyle = (
    role: ChatMessage["role"],
    messageType?: ChatMessage["messageType"],
  ) => {
    if (role === "user") {
      return "bg-primary text-primary-foreground";
    }
    if (
      role === "system" ||
      messageType === "init" ||
      messageType === "result"
    ) {
      return "bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-100 border border-blue-200 dark:border-blue-800";
    }
    if (role === "tool" || messageType === "tool_use") {
      return "bg-orange-50 dark:bg-orange-950 text-orange-900 dark:text-orange-100 border border-orange-200 dark:border-orange-800";
    }
    return "bg-muted";
  };

  const getAvatarStyle = (
    role: ChatMessage["role"],
    messageType?: ChatMessage["messageType"],
  ) => {
    if (role === "user") {
      return "bg-primary";
    }
    if (
      role === "system" ||
      messageType === "init" ||
      messageType === "result"
    ) {
      return "bg-blue-500";
    }
    if (role === "tool" || messageType === "tool_use") {
      return "bg-orange-500";
    }
    return "bg-muted-foreground";
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });

  const sendMessage = async (message: string, allowedTools?: string[]) => {
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: message,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Create new AbortController for this request
    const controller = new AbortController();
    setAbortController(controller);

    try {
      const url = new URL("/api/messages/stream", window.location.origin);
      url.searchParams.set("message", message);
      if (currentSessionId) {
        url.searchParams.set("sessionId", currentSessionId);
      }
      if (currentCwd) {
        url.searchParams.set("cwd", currentCwd);
      }
      if (allowedTools) {
        url.searchParams.set("allowedTools", JSON.stringify(allowedTools));
      }

      const eventSource = new EventSource(url.toString());
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "chunk") {
            // data.content is now an SDKMessage object
            const sdkMessage = parseSDKMessage(data.content);

            if (!sdkMessage) {
              console.warn("Failed to parse SDK message:", data.content);
              return;
            }

            setMessages((prev) => {
              let newMessage: ChatMessage;

              // Handle different SDKMessage types using type guards
              if (isAssistantMessage(sdkMessage)) {
                newMessage = {
                  id: `msg-${Date.now()}-${Math.random()}`,
                  role: "assistant",
                  content: JSON.stringify(sdkMessage.message.content),
                  timestamp: new Date(),
                  isStreaming: false,
                };
              } else if (isUserMessage(sdkMessage)) {
                newMessage = {
                  id: `msg-${Date.now()}-${Math.random()}`,
                  role: "user",
                  content: JSON.stringify(sdkMessage.message.content),
                  timestamp: new Date(),
                  isStreaming: false,
                };
              } else if (isSystemMessage(sdkMessage)) {
                // Handle system messages if needed
                return prev;
              } else if (isResultMessage(sdkMessage)) {
                // Handle result messages if needed
                return prev;
              } else {
                // For any other types, skip
                return prev;
              }

              // Handle tool use content blocks within messages
              if (
                isAssistantMessage(sdkMessage) &&
                sdkMessage.message?.content
              ) {
                for (const contentBlock of sdkMessage.message.content) {
                  if (contentBlock.type === "tool_use") {
                    pendingToolUsesRef.current.set(contentBlock.id, {
                      id: contentBlock.id,
                      name: contentBlock.name,
                      input: contentBlock.input as Record<string, unknown>,
                    });
                  }
                }
              }

              // Handle tool results from user messages
              if (isUserMessage(sdkMessage) && sdkMessage.message?.content) {
                const content = sdkMessage.message.content;
                // Only process if content is an array (content blocks)
                if (Array.isArray(content)) {
                  for (const contentBlock of content) {
                    if (
                      typeof contentBlock === "object" &&
                      contentBlock !== null &&
                      "type" in contentBlock &&
                      contentBlock.type === "tool_result"
                    ) {
                      const toolResult = contentBlock as any; // Type assertion needed for tool_result
                      const pendingToolUse = pendingToolUsesRef.current.get(
                        toolResult.tool_use_id,
                      );
                      if (pendingToolUse) {
                        const permissionResult = detectPermissionError(
                          toolResult,
                          pendingToolUse,
                        );
                        if (permissionResult.isOk() && permissionResult.value) {
                          setPermissionRequest(permissionResult.value);
                          setShowPermissionDialog(true);
                          eventSource.close();
                          setIsLoading(false);
                          return prev;
                        }
                        pendingToolUsesRef.current.delete(
                          toolResult.tool_use_id,
                        );
                      }
                    }
                  }
                }
              }

              return [...prev, newMessage];
            });
          } else if (data.type === "complete") {
            eventSource.close();
            eventSourceRef.current = null;
            setIsLoading(false);
            setAbortController(null);

            if (!currentSessionId && data.sessionId) {
              setCurrentSessionId(data.sessionId);
              window.history.replaceState(
                null,
                "",
                `/sessions/${data.sessionId}`,
              );
            }
          } else if (data.type === "error") {
            const errorMessage: ChatMessage = {
              id: `error-${Date.now()}`,
              role: "assistant",
              content: JSON.stringify([
                { type: "text", text: `Error: ${data.error}` },
              ]),
              timestamp: new Date(),
              isStreaming: false,
            };
            setMessages((prev) => [...prev, errorMessage]);
            eventSource.close();
            eventSourceRef.current = null;
            setIsLoading(false);
            setAbortController(null);
          }
        } catch (e) {
          console.error("Failed to parse SSE data:", e);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;
        setIsLoading(false);
        setAbortController(null);
      };
    } catch (error) {
      console.error("Failed to send message:", error);
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: JSON.stringify([
          { type: "text", text: "Failed to send message. Please try again." },
        ]),
        timestamp: new Date(),
        isStreaming: false,
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsLoading(false);
      setAbortController(null);
    }
  };

  const handleAbort = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    setIsLoading(false);

    // Add abort message
    const abortMessage: ChatMessage = {
      id: `abort-${Date.now()}`,
      role: "assistant",
      content: JSON.stringify([
        {
          type: "text",
          text: "Request was cancelled by user.",
        },
      ]),
      timestamp: new Date(),
      isStreaming: false,
    };
    setMessages((prev) => [...prev, abortMessage]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input;
    setInput("");
    await sendMessage(message);
  };

  const handlePermissionAllow = async () => {
    if (!permissionRequest) return;

    // Remove the tool use from pending map
    pendingToolUsesRef.current.delete(permissionRequest.originalToolUse.id);

    try {
      const allowedToolResult = formatAllowedTool(permissionRequest);
      if (allowedToolResult.isErr()) {
        console.error(
          "Failed to format allowed tool:",
          allowedToolResult.error,
        );
        return;
      }

      const allowedTool = allowedToolResult.value;

      setShowPermissionDialog(false);
      setPermissionRequest(null);

      await sendMessage("continue", [allowedTool]);
    } catch (error) {
      console.error("Failed to handle permission allow:", error);
      setIsLoading(false);
    }
  };

  const handlePermissionDeny = () => {
    // Remove the specific tool use from pending map
    if (permissionRequest) {
      pendingToolUsesRef.current.delete(permissionRequest.originalToolUse.id);
    }

    setShowPermissionDialog(false);
    setPermissionRequest(null);

    // Add a message indicating permission was denied
    const denyMessage: ChatMessage = {
      id: `deny-${Date.now()}`,
      role: "assistant",
      content: JSON.stringify([
        {
          type: "text",
          text: "Permission denied. Tool execution was blocked.",
        },
      ]),
      timestamp: new Date(),
      isStreaming: false,
    };
    setMessages((prev) => [...prev, denyMessage]);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Messages Area */}
      <div className="flex-1 overflow-hidden">
        <div
          className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 space-y-4"
          ref={scrollRef}
        >
          <AnimatePresence initial={false}>
            {messages.map((message, index) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className={`flex gap-2 sm:gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`flex gap-2 sm:gap-3 max-w-[85%] sm:max-w-[80%] ${
                    message.role === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  <motion.div
                    className="flex-shrink-0"
                    whileTap={{ scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <div
                      className={`w-8 h-8 sm:w-9 sm:h-9 ${getAvatarStyle(message.role, message.messageType)} rounded-full flex items-center justify-center shadow-sm`}
                    >
                      {getMessageIcon(message.role, message.messageType)}
                    </div>
                  </motion.div>
                  <motion.div
                    className={`rounded-2xl px-4 py-3 sm:px-4 sm:py-3 min-w-0 shadow-sm ${getMessageStyle(message.role, message.messageType)}`}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <div className="break-words text-sm sm:text-base">
                      <MessageContent
                        content={message.content}
                        isStreaming={message.isStreaming}
                      />
                      {message.isStreaming && (
                        <span className="inline-block w-2 h-4 bg-current opacity-50 animate-pulse ml-1" />
                      )}
                    </div>
                    <div className="text-xs opacity-70 mt-1">
                      {formatTime(message.timestamp)}
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Input Form */}
      <div className="border-t bg-muted">
        <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-4 space-y-4">
          {/* CWD Input for new sessions */}
          {!currentSessionId && (
            <div className="w-full">
              <Label htmlFor="cwd" className="text-sm font-medium">
                Working Directory
              </Label>
              <Input
                id="cwd"
                value={currentCwd}
                onChange={(e) => setCurrentCwd(e.target.value)}
                placeholder="/path/to/your/project"
                className="mt-2 bg-background"
                disabled={isLoading}
              />
            </div>
          )}

          <div className="flex items-end gap-2 sm:gap-3 w-full">
            <Textarea
              name="message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              rows={5}
              className="h-[5.75rem] leading-[1.75] resize-none bg-background"
              onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                if (
                  e.key === "Enter" &&
                  (e.ctrlKey || e.metaKey) &&
                  !e.shiftKey
                ) {
                  e.preventDefault();
                  handleSubmit({ preventDefault: () => {} } as React.FormEvent);
                }
              }}
              disabled={isLoading}
            />
            <div className="flex gap-2">
              {isLoading && (
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  <Button
                    type="button"
                    onClick={handleAbort}
                    size="icon"
                    variant="destructive"
                    className="size-10 rounded-full"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </motion.div>
              )}
              <motion.div
                whileTap={{ scale: 0.9 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <Button
                  type="submit"
                  disabled={
                    !input.trim() ||
                    isLoading ||
                    (!currentSessionId && !currentCwd.trim())
                  }
                  size="icon"
                  className="size-10 rounded-full"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </motion.div>
            </div>
          </div>
        </form>
      </div>

      {/* Permission Dialog */}
      <PermissionDialog
        open={showPermissionDialog}
        onOpenChange={setShowPermissionDialog}
        request={permissionRequest}
        onAllow={handlePermissionAllow}
        onDeny={handlePermissionDeny}
      />
    </div>
  );
}
