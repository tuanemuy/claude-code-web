import {
  type ListSessionQuery,
  type Session,
  listSessionQuerySchema,
} from "@/core/domain/session/types";
import { ApplicationError } from "@/lib/error";
import { validate } from "@/lib/validation";
import { type Result, err } from "neverthrow";
import type { Context } from "../context";

export async function listSessions(
  context: Context,
  query: ListSessionQuery,
): Promise<Result<{ items: Session[]; count: number }, ApplicationError>> {
  const parseResult = validate(listSessionQuerySchema, query);

  if (parseResult.isErr()) {
    return err(
      new ApplicationError("Invalid session query", parseResult.error),
    );
  }

  const result = await context.sessionRepository.list(parseResult.value);
  return result.mapErr(
    (error) => new ApplicationError("Failed to list sessions", error),
  );
}
