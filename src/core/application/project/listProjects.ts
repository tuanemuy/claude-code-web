import {
  type ListProjectQuery,
  type Project,
  listProjectQuerySchema,
} from "@/core/domain/project/types";
import { ApplicationError } from "@/lib/error";
import { validate } from "@/lib/validation";
import { type Result, err } from "neverthrow";
import type { Context } from "../context";

export async function listProjects(
  context: Context,
  query: ListProjectQuery,
): Promise<Result<{ items: Project[]; count: number }, ApplicationError>> {
  const parseResult = validate(listProjectQuerySchema, query);

  if (parseResult.isErr()) {
    return err(
      new ApplicationError("Invalid project query", parseResult.error),
    );
  }

  const result = await context.projectRepository.list(parseResult.value);
  return result.mapErr(
    (error) => new ApplicationError("Failed to list projects", error),
  );
}
