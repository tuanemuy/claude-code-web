import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import type { Project } from "@/core/domain/project/types";
import {
  type Session,
  type SessionId,
  sessionIdSchema,
} from "@/core/domain/session/types";
import type { LogParser } from "@/core/domain/watcher/ports/logParser";
import type {
  AssistantLog,
  ClaudeLogEntry,
  SummaryLog,
  SystemLog,
  UserLog,
} from "@/core/domain/watcher/types";
import type { Context } from "../context";
import {
  checkFileProcessingStatus,
  updateFileProcessingStatus,
} from "./checkFileProcessingStatus";

export const processLogFileInputSchema = z.object({
  filePath: z.string().min(1),
  skipTracking: z.boolean().optional(),
});

export type ProcessLogFileInput = z.infer<typeof processLogFileInputSchema>;

export type ProcessLogFileError = {
  type: "PROCESS_LOG_FILE_ERROR";
  message: string;
  cause?: unknown;
};

export async function processLogFile(
  context: Context & { logParser: LogParser },
  input: ProcessLogFileInput,
): Promise<
  Result<{ entriesProcessed: number; skipped: boolean }, ProcessLogFileError>
> {
  const parseResult = processLogFileInputSchema.safeParse(input);
  if (!parseResult.success) {
    return err({
      type: "PROCESS_LOG_FILE_ERROR",
      message: "Invalid input",
      cause: parseResult.error,
    });
  }

  try {
    const skipTracking = input.skipTracking ?? false;

    // Check if file needs processing (unless tracking is skipped)
    if (!skipTracking) {
      const statusResult = await checkFileProcessingStatus(context, {
        filePath: input.filePath,
      });

      if (statusResult.isErr()) {
        console.warn(
          "[processLogFile] Failed to check file processing status",
          statusResult.error,
        );
        // Continue processing despite status check failure
      } else if (!statusResult.value.shouldProcess) {
        console.log(
          `Skipping file (${statusResult.value.reason}): ${input.filePath}`,
        );
        return ok({ entriesProcessed: 0, skipped: true });
      } else {
        console.log(
          `File should be processed (${statusResult.value.reason}): ${input.filePath}`,
        );
      }
    }

    console.log(`Processing log file: ${input.filePath}`);

    const parsedResult = await context.logParser.parseFile(input.filePath);
    if (parsedResult.isErr()) {
      const error = {
        type: "PROCESS_LOG_FILE_ERROR" as const,
        message: "Failed to parse log file",
        cause: parsedResult.error,
      };
      console.error("[processLogFile] Log file parsing failed", {
        filePath: input.filePath,
        error: error.message,
        cause: error.cause,
      });
      return err(error);
    }

    const { projectName, sessionId, entries } = parsedResult.value;

    if (entries.length === 0) {
      console.log(`No valid log entries found in: ${input.filePath}`);

      // Update tracking status even if no entries were processed
      if (!skipTracking) {
        const updateResult = await updateFileProcessingStatus(context, {
          filePath: input.filePath,
        });
        if (updateResult.isErr()) {
          console.warn(
            "[processLogFile] Failed to update file tracking status",
            updateResult.error,
          );
        }
      }

      return ok({ entriesProcessed: 0, skipped: false });
    }

    const ensureProjectResult = await ensureProjectExists(context, projectName);
    if (ensureProjectResult.isErr()) {
      return err(ensureProjectResult.error);
    }
    const project = ensureProjectResult.value;

    const ensureSessionResult = await ensureSessionExists(
      context,
      project,
      sessionId,
    );
    if (ensureSessionResult.isErr()) {
      return err(ensureSessionResult.error);
    }
    const session = ensureSessionResult.value;

    const processEntriesResult = await processLogEntries(
      context,
      sessionId,
      entries,
    );
    if (processEntriesResult.isErr()) {
      return err(processEntriesResult.error);
    }

    // If no summary entry was found and session has no name, generate session name from messages
    const hasSummary = entries.some((entry) => entry.type === "summary");
    if (!hasSummary && session.name === null) {
      const generateNameResult = await generateAndUpdateSessionName(
        context,
        session,
      );
      if (generateNameResult.isErr()) {
        console.warn("[processLogFile] Failed to generate session name", {
          sessionId,
          error: generateNameResult.error.message,
          cause: generateNameResult.error.cause,
        });
      }
    }

    // Update file processing tracking status
    if (!input.skipTracking) {
      const updateResult = await updateFileProcessingStatus(context, {
        filePath: input.filePath,
      });
      if (updateResult.isErr()) {
        console.warn(
          "[processLogFile] Failed to update file tracking status",
          updateResult.error,
        );
      }
    }

    console.log(
      `Successfully processed ${entries.length} entries from: ${input.filePath}`,
    );

    return ok({ entriesProcessed: entries.length, skipped: false });
  } catch (error) {
    const processError = {
      type: "PROCESS_LOG_FILE_ERROR" as const,
      message: `Error processing log file ${input.filePath}`,
      cause: error,
    };
    console.error("[processLogFile] Unexpected error occurred", {
      filePath: input.filePath,
      error: processError.message,
      cause: processError.cause,
    });
    return err(processError);
  }
}

async function ensureProjectExists(
  context: Context,
  projectName: string,
): Promise<Result<Project, ProcessLogFileError>> {
  const result = await context.projectRepository.upsert({
    name: projectName,
    path: projectName,
  });

  if (result.isErr()) {
    const error = {
      type: "PROCESS_LOG_FILE_ERROR" as const,
      message: `Failed to ensure project exists: ${result.error.message}`,
      cause: result.error,
    };
    console.error("[ensureProjectExists] Project upsert failed", {
      projectName,
      error: error.message,
      cause: error.cause,
    });
    return err(error);
  }

  console.log(`Ensured project exists: ${projectName}`);
  return ok(result.value);
}

async function ensureSessionExists(
  context: Context,
  project: Project,
  sessionId: string,
): Promise<Result<Session, ProcessLogFileError>> {
  const brandedSessionId = sessionIdSchema.parse(sessionId);

  // First try to find the session by ID
  const findSessionResult =
    await context.sessionRepository.findById(brandedSessionId);
  if (findSessionResult.isErr()) {
    const error = {
      type: "PROCESS_LOG_FILE_ERROR" as const,
      message: `Failed to find session: ${findSessionResult.error.message}`,
      cause: findSessionResult.error,
    };
    console.error("[ensureSessionExists] Failed to find session", {
      sessionId,
      error: error.message,
      cause: error.cause,
    });
    return err(error);
  }

  const existingSession = findSessionResult.value;

  if (!existingSession) {
    const result = await context.sessionRepository.upsert({
      id: brandedSessionId,
      projectId: project.id,
      name: null,
      cwd: "/tmp",
    });
    if (result.isErr()) {
      // Check if the error is due to session already existing (race condition)
      const errorCause = result.error.cause;
      const isAlreadyExistsError =
        result.error.message.includes("already exists") ||
        (errorCause &&
          typeof errorCause === "object" &&
          "message" in errorCause &&
          typeof errorCause.message === "string" &&
          errorCause.message.includes("already exists"));

      if (isAlreadyExistsError) {
        // Session was created by another concurrent operation, try to fetch it
        console.log(
          `Session already exists (created concurrently): ${sessionId}`,
        );
        const retryResult =
          await context.sessionRepository.findById(brandedSessionId);
        if (retryResult.isOk() && retryResult.value) {
          return ok(retryResult.value);
        }
      }

      const error = {
        type: "PROCESS_LOG_FILE_ERROR" as const,
        message: `Failed to create session: ${result.error.message}`,
        cause: result.error,
      };
      console.error("[ensureSessionExists] Session creation failed", {
        sessionId,
        projectName: project.name,
        error: error.message,
        cause: error.cause,
      });
      return err(error);
    }
    console.log(`Created session: ${sessionId} for project: ${project.name}`);
    return ok(result.value);
  }

  return ok(existingSession);
}

async function processLogEntries(
  context: Context,
  sessionId: string,
  entries: ClaudeLogEntry[],
): Promise<Result<void, ProcessLogFileError>> {
  const brandedSessionId = sessionIdSchema.parse(sessionId);
  for (const entry of entries) {
    try {
      if (entry.type === "user" || entry.type === "assistant") {
        const result = await processMessageEntry(
          context,
          brandedSessionId,
          entry as UserLog | AssistantLog,
        );
        if (result.isErr()) {
          console.warn("[processLogEntries] Failed to process message entry", {
            entryType: entry.type,
            uuid: entry.uuid,
            error: result.error.message,
            cause: result.error.cause,
          });
        }
      } else if (entry.type === "system") {
        const result = await processSystemEntry(
          context,
          brandedSessionId,
          entry as SystemLog,
        );
        if (result.isErr()) {
          console.warn("[processLogEntries] Failed to process system entry", {
            entryType: entry.type,
            uuid: entry.uuid,
            error: result.error.message,
            cause: result.error.cause,
          });
        }
      } else if (entry.type === "summary") {
        const result = await processSummaryEntry(
          context,
          brandedSessionId,
          entry as SummaryLog,
        );
        if (result.isErr()) {
          console.warn("[processLogEntries] Failed to process summary entry", {
            entryType: entry.type,
            error: result.error.message,
            cause: result.error.cause,
          });
        }
      }
    } catch (error) {
      console.warn("[processLogEntries] Failed to process log entry", {
        entryType: entry.type,
        uuid: "uuid" in entry ? entry.uuid : "summary",
        error: error instanceof Error ? error.message : String(error),
        cause: error,
      });
    }
  }

  return ok(undefined);
}

async function processMessageEntry(
  context: Context,
  sessionId: SessionId,
  entry: UserLog | AssistantLog,
): Promise<Result<void, ProcessLogFileError>> {
  let content: string | null = null;

  if (entry.type === "user" && entry.message?.content) {
    // Use claude service to parse user content
    const parseResult = context.claudeService.parseUserContent(
      typeof entry.message.content === "string"
        ? entry.message.content
        : JSON.stringify(entry.message.content),
    );
    if (parseResult.isOk()) {
      content =
        typeof parseResult.value === "string"
          ? parseResult.value
          : JSON.stringify(parseResult.value);
    } else {
      // Fallback to raw content if parsing fails
      content =
        typeof entry.message.content === "string"
          ? entry.message.content
          : JSON.stringify(entry.message.content);
    }
  } else if (entry.type === "assistant" && entry.message?.content) {
    // Use claude service to parse assistant content
    const parseResult = context.claudeService.parseAssistantContent(
      JSON.stringify(entry.message.content),
    );
    if (parseResult.isOk()) {
      content = JSON.stringify(parseResult.value);
    } else {
      // Fallback to raw content if parsing fails
      content = JSON.stringify(entry.message.content);
    }
  }

  if (!entry.message?.role) {
    return err({
      type: "PROCESS_LOG_FILE_ERROR",
      message: `Invalid message entry: missing role for ${entry.type} entry`,
    });
  }

  const result = await context.messageRepository.upsert({
    sessionId,
    role: entry.message.role,
    content,
    timestamp: new Date(entry.timestamp),
    rawData: JSON.stringify(entry),
    uuid: entry.uuid,
    parentUuid: entry.parentUuid,
    cwd: entry.cwd,
  });

  if (result.isErr()) {
    const error = {
      type: "PROCESS_LOG_FILE_ERROR" as const,
      message: `Failed to create message: ${result.error.message}`,
      cause: result.error,
    };
    console.error("[processMessageEntry] Message create failed", {
      sessionId,
      role: entry.message?.role,
      uuid: entry.uuid,
      error: error.message,
      cause: error.cause,
    });
    return err(error);
  }

  // Update session cwd to match the latest message's cwd
  const sessionUpdateResult = await context.sessionRepository.updateCwd(
    sessionId,
    entry.cwd,
  );

  if (sessionUpdateResult.isErr()) {
    console.warn("[processMessageEntry] Failed to update session cwd", {
      sessionId,
      cwd: entry.cwd,
      error: sessionUpdateResult.error.message,
      cause: sessionUpdateResult.error.cause,
    });
  }

  // Update session's last message timestamp
  const timestampUpdateResult =
    await context.sessionRepository.updateLastMessageAt(
      sessionId,
      new Date(entry.timestamp),
    );

  if (timestampUpdateResult.isErr()) {
    console.warn(
      "[processMessageEntry] Failed to update session lastMessageAt",
      {
        sessionId,
        timestamp: entry.timestamp,
        error: timestampUpdateResult.error.message,
        cause: timestampUpdateResult.error.cause,
      },
    );
  }

  return ok(undefined);
}

async function processSystemEntry(
  context: Context,
  sessionId: SessionId,
  entry: SystemLog,
): Promise<Result<void, ProcessLogFileError>> {
  const result = await context.messageRepository.upsert({
    sessionId,
    role: "assistant",
    content: `[SYSTEM] ${entry.content}`,
    timestamp: new Date(entry.timestamp),
    rawData: JSON.stringify(entry),
    uuid: entry.uuid,
    parentUuid: entry.parentUuid,
    cwd: entry.cwd,
  });

  if (result.isErr()) {
    const error = {
      type: "PROCESS_LOG_FILE_ERROR" as const,
      message: `Failed to create system message: ${result.error.message}`,
      cause: result.error,
    };
    console.error("[processSystemEntry] System message create failed", {
      sessionId,
      uuid: entry.uuid,
      error: error.message,
      cause: error.cause,
    });
    return err(error);
  }

  // Update session cwd to match the latest message's cwd
  const sessionUpdateResult = await context.sessionRepository.updateCwd(
    sessionId,
    entry.cwd,
  );

  if (sessionUpdateResult.isErr()) {
    console.warn("[processSystemEntry] Failed to update session cwd", {
      sessionId,
      cwd: entry.cwd,
      error: sessionUpdateResult.error.message,
      cause: sessionUpdateResult.error.cause,
    });
  }

  // Update session's last message timestamp
  const timestampUpdateResult =
    await context.sessionRepository.updateLastMessageAt(
      sessionId,
      new Date(entry.timestamp),
    );

  if (timestampUpdateResult.isErr()) {
    console.warn(
      "[processSystemEntry] Failed to update session lastMessageAt",
      {
        sessionId,
        timestamp: entry.timestamp,
        error: timestampUpdateResult.error.message,
        cause: timestampUpdateResult.error.cause,
      },
    );
  }

  return ok(undefined);
}

async function processSummaryEntry(
  context: Context,
  sessionId: SessionId,
  entry: SummaryLog,
): Promise<Result<void, ProcessLogFileError>> {
  try {
    // Generate session name from summary text
    const summaryText = entry.summary;
    if (!summaryText) {
      console.log(
        "[processSummaryEntry] Empty summary, skipping name generation",
      );
      return ok(undefined);
    }

    // Extract a session name from the summary
    const sessionName = generateSessionNameFromSummary(summaryText);

    // Update the session name directly using the adapter
    const updateResult = await context.sessionRepository.updateName(
      sessionId,
      sessionName,
    );

    if (updateResult.isErr()) {
      const error = {
        type: "PROCESS_LOG_FILE_ERROR" as const,
        message: `Failed to update session name from summary: ${updateResult.error.message}`,
        cause: updateResult.error,
      };
      console.error("[processSummaryEntry] Session name update failed", {
        sessionId,
        sessionName,
        error: error.message,
        cause: error.cause,
      });
      return err(error);
    }

    console.log(
      `Updated session name from summary: ${sessionId} -> "${sessionName}"`,
    );
    return ok(undefined);
  } catch (error) {
    const processError = {
      type: "PROCESS_LOG_FILE_ERROR" as const,
      message: `Failed to process summary entry: ${error instanceof Error ? error.message : String(error)}`,
      cause: error,
    };
    console.error("[processSummaryEntry] Unexpected error", {
      sessionId,
      error: processError.message,
      cause: processError.cause,
    });
    return err(processError);
  }
}

function generateSessionNameFromSummary(summaryText: string): string {
  // Clean and extract meaningful text from summary
  const cleaned = summaryText.trim();

  // Extract first sentence or meaningful phrase
  const sentences = cleaned.split(/[.!?]+/);
  const firstSentence = sentences[0]?.trim();

  if (!firstSentence) {
    return "Generated Session";
  }

  // Remove common prefixes and clean up
  let name = firstSentence
    .replace(/^(Summary|Session|Chat|Conversation|Discussion):\s*/i, "")
    .replace(/^(The|This|A|An)\s+/i, "")
    .trim();

  // Truncate to reasonable length
  const maxLength = 50;
  if (name.length > maxLength) {
    name = `${name.substring(0, maxLength - 3)}...`;
  }

  return name || "Generated Session";
}

async function generateAndUpdateSessionName(
  context: Context,
  session: Session,
): Promise<Result<void, ProcessLogFileError>> {
  try {
    const sessionId = session.id;

    // Generate session name from messages using adapter directly
    const messagesResult = await context.messageRepository.list({
      pagination: { page: 1, limit: 5, order: "asc", orderBy: "timestamp" },
      filter: { sessionId },
    });

    if (messagesResult.isErr()) {
      return err({
        type: "PROCESS_LOG_FILE_ERROR",
        message: `Failed to fetch messages for session name generation: ${messagesResult.error.message}`,
        cause: messagesResult.error,
      });
    }

    const { items } = messagesResult.value;
    if (items.length === 0) {
      return ok(undefined); // No messages, no name generation needed
    }

    // Find the first user message with meaningful content that doesn't start with <
    const firstUserMessage = items.find(
      (msg) =>
        msg.role === "user" &&
        msg.content &&
        msg.content.trim().length > 0 &&
        !msg.content.trim().startsWith("<"),
    );

    if (!firstUserMessage?.content) {
      return ok(undefined); // No meaningful content found
    }

    // Use first line of user message, truncated
    const firstLine = firstUserMessage.content.split("\n")[0];
    const sessionName = truncateSessionName(firstLine);

    // Only update if we got a meaningful name (not "Untitled Session")
    if (sessionName !== "Untitled Session") {
      const updateResult = await context.sessionRepository.updateName(
        sessionId,
        sessionName,
      );

      if (updateResult.isErr()) {
        return err({
          type: "PROCESS_LOG_FILE_ERROR",
          message: `Failed to update session name: ${updateResult.error.message}`,
          cause: updateResult.error,
        });
      }

      console.log(
        `Generated and updated session name: ${sessionId} -> "${sessionName}"`,
      );
    }

    return ok(undefined);
  } catch (error) {
    return err({
      type: "PROCESS_LOG_FILE_ERROR",
      message: `Failed to generate and update session name: ${error instanceof Error ? error.message : String(error)}`,
      cause: error,
    });
  }
}

function truncateSessionName(text: string): string {
  const maxLength = 50;
  const cleaned = text.trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.substring(0, maxLength - 3)}...`;
}
