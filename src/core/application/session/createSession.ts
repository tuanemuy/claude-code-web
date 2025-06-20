import {
  type CreateSessionParams,
  type Session,
  createSessionParamsSchema,
} from "@/core/domain/session/types";
import { ApplicationError } from "@/lib/error";
import { validate } from "@/lib/validation";
import { type Result, err } from "neverthrow";
import type { Context } from "../context";

export async function createSession(
  context: Context,
  input: CreateSessionParams,
): Promise<Result<Session, ApplicationError>> {
  const parseResult = validate(createSessionParamsSchema, input);

  if (parseResult.isErr()) {
    return err(
      new ApplicationError("Invalid session input", parseResult.error),
    );
  }

  const params = parseResult.value;

  const result = await context.sessionRepository.create(params);
  return result.mapErr(
    (error) => new ApplicationError("Failed to create session", error),
  );
}
