import { err, type Result } from "neverthrow";
import {
  type ListProjectQuery,
  listProjectQuerySchema,
  type Project,
} from "@/core/domain/project/types";
import { ApplicationError } from "@/lib/error";
import { validate } from "@/lib/validation";
import type { Context } from "../context";

export type { ListProjectQuery };

export async function listProjects(
  context: Context,
  query: ListProjectQuery,
): Promise<Result<{ items: Project[]; count: number }, ApplicationError>> {
  const parseResult = validate(listProjectQuerySchema, query);

  if (parseResult.isErr()) {
    const error = new ApplicationError(
      "Invalid project query",
      parseResult.error,
    );
    console.error("[listProjects] Query validation failed", error);
    return err(error);
  }

  const result = await context.projectRepository.list(parseResult.value);
  return result.mapErr((error) => {
    const appError = new ApplicationError("Failed to list projects", error);
    console.error("[listProjects] Repository operation failed", appError);
    return appError;
  });
}
