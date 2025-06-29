import { query } from "@anthropic-ai/claude-code";
import { err, ok, type Result } from "neverthrow";
import type { ClaudeService } from "@/core/domain/claude/ports/claudeService";
import type {
  AssistantContent,
  ChunkData,
  SDKMessage,
  SendMessageInput,
  UserContent,
} from "@/core/domain/claude/types";
import { ClaudeError } from "@/lib/error";
import { jsonValueSchema } from "@/lib/json";
import { validate } from "@/lib/validation";

export class AnthropicClaudeService implements ClaudeService {
  constructor(private readonly pathToClaudeCodeExecutable?: string) {}

  async sendMessageStream(
    input: SendMessageInput,
    onChunk: (chunk: ChunkData) => void,
  ): Promise<Result<SDKMessage[], ClaudeError>> {
    try {
      // Build options for Claude Code SDK
      const options: {
        pathToClaudeCodeExecutable?: string;
        resume?: string;
        cwd?: string;
        allowedTools?: string[];
      } = {
        pathToClaudeCodeExecutable: this.pathToClaudeCodeExecutable,
      };

      // Add session resume if Claude session ID is provided
      if (input.sessionId) {
        options.resume = input.sessionId;
      }

      // Add working directory if provided
      if (input.cwd) {
        options.cwd = input.cwd;
      }

      // Add allowed tools if provided
      if (input.allowedTools) {
        options.allowedTools = input.allowedTools;
      }

      const messages: SDKMessage[] = [];

      // Simply pass each SDK message directly to onChunk
      for await (const message of query({
        prompt: input.message,
        options,
      })) {
        const customMessage = message as unknown as SDKMessage;
        messages.push(customMessage);

        // Send the entire message as a chunk
        onChunk(customMessage);
      }

      if (messages.length === 0) {
        throw new Error("No response received from Claude Code SDK");
      }

      return ok(messages);
    } catch (error) {
      return err(
        new ClaudeError("Failed to stream message from Claude", error),
      );
    }
  }

  parseAssistantContent(rawContent: string) {
    const parsed = validate(jsonValueSchema, rawContent);
    if (parsed.isErr()) {
      return err(
        new ClaudeError("Invalid assistant content format", parsed.error),
      );
    }
    if (!Array.isArray(parsed.value)) {
      return err(
        new ClaudeError("Assistant content must be an array of messages"),
      );
    }
    return ok(parsed.value as unknown as AssistantContent);
  }

  parseUserContent(rawContent: string) {
    const parsed = validate(jsonValueSchema, rawContent);
    if (parsed.isErr()) {
      return err(new ClaudeError("Invalid user content format", parsed.error));
    }
    if (typeof parsed.value !== "string" && !Array.isArray(parsed.value)) {
      return err(new ClaudeError("User content must be a string or array"));
    }
    return ok(parsed.value as unknown as UserContent);
  }
}
