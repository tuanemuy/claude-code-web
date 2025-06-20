import {
  type Project,
  type ProjectId,
  projectIdSchema,
} from "@/core/domain/project/types";
import { ApplicationError } from "@/lib/error";
import { validate } from "@/lib/validation";
import { type Result, err } from "neverthrow";
import type { Context } from "../context";

export async function getProject(
  context: Context,
  id: ProjectId,
): Promise<Result<Project | null, ApplicationError>> {
  const parseResult = validate(projectIdSchema, id);

  if (parseResult.isErr()) {
    return err(new ApplicationError("Invalid project ID", parseResult.error));
  }

  const result = await context.projectRepository.findById(parseResult.value);
  return result.mapErr(
    (error) => new ApplicationError("Failed to get project", error),
  );
}

export async function getProjectByPath(
  context: Context,
  path: string,
): Promise<Result<Project | null, ApplicationError>> {
  const result = await context.projectRepository.findByPath(path);
  return result.mapErr(
    (error) => new ApplicationError("Failed to get project by path", error),
  );
}
