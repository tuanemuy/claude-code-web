import type {
  AssistantMessage,
  ResultMessage,
  SDKMessage,
  SystemMessage,
  UserMessage,
} from "@/core/domain/claude/types";

// Re-export type guards for client-side use
export function isAssistantMessage(
  message: SDKMessage,
): message is AssistantMessage {
  return message.type === "assistant";
}

export function isUserMessage(message: SDKMessage): message is UserMessage {
  return message.type === "user";
}

export function isResultMessage(message: SDKMessage): message is ResultMessage {
  return message.type === "result";
}

export function isSystemMessage(message: SDKMessage): message is SystemMessage {
  return message.type === "system";
}

// Helper function to safely parse SDKMessage
export function parseSDKMessage(data: unknown): SDKMessage | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.type !== "string") {
    return null;
  }

  // Basic validation for different message types
  switch (obj.type) {
    case "assistant":
      if (obj.message && typeof obj.session_id === "string") {
        return obj as AssistantMessage;
      }
      break;
    case "user":
      if (obj.message && typeof obj.session_id === "string") {
        return obj as UserMessage;
      }
      break;
    case "result":
      if (typeof obj.session_id === "string") {
        return obj as ResultMessage;
      }
      break;
    case "system":
      if (typeof obj.session_id === "string") {
        return obj as SystemMessage;
      }
      break;
  }

  return null;
}
