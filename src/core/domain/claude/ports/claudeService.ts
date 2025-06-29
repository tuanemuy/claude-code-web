import type { Result } from "neverthrow";
import type { ClaudeError } from "@/lib/error";
import type {
  AssistantContent,
  ChunkData,
  SDKMessage,
  SendMessageInput,
  UserContent,
} from "../types";

export interface ClaudeService {
  sendMessageStream(
    input: SendMessageInput,
    onChunk: (chunk: ChunkData) => void,
  ): Promise<Result<SDKMessage[], ClaudeError>>;
  parseAssistantContent(
    rawContent: string,
  ): Result<AssistantContent, ClaudeError>;
  parseUserContent(rawContent: string): Result<UserContent, ClaudeError>;
}
