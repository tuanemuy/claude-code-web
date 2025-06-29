import { err, ok, type Result } from "neverthrow";
import { z } from "zod/v4";
import type { ChunkData, SDKMessage } from "@/core/domain/claude/types";
import { isResultMessage } from "@/core/domain/claude/types";
import type { Session } from "@/core/domain/session/types";
import { sessionIdSchema } from "@/core/domain/session/types";
import { ApplicationError } from "@/lib/error";
import { validate } from "@/lib/validation";
import type { Context } from "../context";

export const sendMessageStreamInputSchema = z
  .object({
    message: z.string().min(1),
    sessionId: z.string().min(1).optional(),
    cwd: z.string().min(1).optional(),
    allowedTools: z.array(z.string()).optional(),
  })
  .refine(
    (data) => {
      // If no sessionId is provided (new session), cwd is required
      if (!data.sessionId && !data.cwd) {
        return false;
      }
      return true;
    },
    {
      message:
        "cwd is required when creating a new session (no sessionId provided)",
      path: ["cwd"],
    },
  );
export type SendMessageStreamInput = z.infer<
  typeof sendMessageStreamInputSchema
>;

export async function sendMessageStream(
  context: Context,
  input: SendMessageStreamInput,
  onChunk: (chunk: ChunkData) => void,
): Promise<
  Result<{ session: Session; messages: SDKMessage[] }, ApplicationError>
> {
  console.log("[sendMessageStream] Starting streaming message processing", {
    sessionId: input.sessionId,
    messageLength:
      typeof input.message === "string" ? input.message.length : undefined,
  });

  const parseResult = validate(sendMessageStreamInputSchema, input);
  if (parseResult.isErr()) {
    const error = new ApplicationError("Invalid input", parseResult.error);
    console.error("[sendMessageStream] Input validation failed", {
      error: error.message,
      cause: error.cause,
    });
    return err(error);
  }

  const params = parseResult.value;

  try {
    let session: Session | null = null;
    if (params.sessionId) {
      // Existing session: fetch from database
      const parsedSessionId = sessionIdSchema.parse(params.sessionId);
      const sessionResult =
        await context.sessionRepository.findById(parsedSessionId);
      if (sessionResult.isErr()) {
        const error = new ApplicationError(
          "Failed to get session",
          sessionResult.error,
        );
        console.error("[sendMessageStream] Session retrieval failed", {
          sessionId: parsedSessionId,
          error: error.message,
          cause: error.cause,
        });
        return err(error);
      }
      if (!sessionResult.value) {
        const error = new ApplicationError("Session not found");
        console.error("[sendMessageStream] Session not found", {
          sessionId: parsedSessionId,
          error: error.message,
        });
        return err(error);
      }
      session = sessionResult.value;
    }

    // Send to Claude with streaming
    const claudeResult = await context.claudeService.sendMessageStream(
      {
        message: params.message,
        sessionId: session?.id || undefined, // Use session ID for resuming, undefined for new sessions
        cwd: params.cwd || (session ? session.cwd : undefined),
        allowedTools: params.allowedTools,
      },
      onChunk,
    );
    if (claudeResult.isErr()) {
      const error = new ApplicationError(
        "Failed to send message to Claude",
        claudeResult.error,
      );
      console.error(
        "[sendMessageStream] Claude API streaming call failed",
        error,
      );
      return err(error);
    }

    const messages = claudeResult.value;

    if (!params.sessionId) {
      // Create session in database with our generated session ID
      if (!params.cwd) {
        const error = new ApplicationError(
          "cwd is required when creating a new session",
        );
        console.error("[sendMessageStream] Missing cwd for new session", {
          error: error.message,
        });
        return err(error);
      }

      const sessionId = claudeResult.value
        .map((message) =>
          isResultMessage(message) ? message.session_id : null,
        )
        .filter((id): id is string => id !== null)[0];
      const parsedSessionId = sessionIdSchema.parse(sessionId);
      const createSessionResult = await context.sessionRepository.upsert({
        id: parsedSessionId,
        projectId: null,
        name: null,
        cwd: params.cwd,
      });
      if (createSessionResult.isErr()) {
        const error = new ApplicationError(
          "Failed to create session",
          createSessionResult.error,
        );
        console.error("[sendMessageStream] Session creation failed", {
          error: error.message,
          cause: error.cause,
        });
        return err(error);
      }
      session = createSessionResult.value;
    }

    if (!session) {
      return err(new ApplicationError("Session was not created or found"));
    }

    // Update session after successful Claude communication
    const updateSessionResult = await context.sessionRepository.upsert({
      id: session.id,
      projectId: session.projectId,
      name: session.name,
      cwd: session.cwd,
    });
    if (updateSessionResult.isErr()) {
      console.warn(
        "[sendMessageStream] Failed to update session lastMessageAt",
        {
          sessionId: session.id,
          error: updateSessionResult.error.message,
        },
      );
      // Don't fail the entire operation for session update failure
    } else {
      session = updateSessionResult.value;
    }

    return ok({
      session,
      messages,
    });
  } catch (error) {
    const appError = new ApplicationError(
      "Unexpected error in sendMessageStream",
      error,
    );
    console.error("[sendMessageStream] Unexpected error occurred", {
      error: appError.message,
      cause: appError.cause,
    });
    return err(appError);
  }
}
