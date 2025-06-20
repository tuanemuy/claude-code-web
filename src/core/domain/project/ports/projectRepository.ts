import type { RepositoryError } from "@/lib/error";
import type { Result } from "neverthrow";
import type {
  CreateProjectParams,
  ListProjectQuery,
  Project,
  ProjectId,
  UpdateProjectParams,
} from "../types";

export interface ProjectRepository {
  create(
    params: CreateProjectParams,
  ): Promise<Result<Project, RepositoryError>>;
  findById(id: ProjectId): Promise<Result<Project | null, RepositoryError>>;
  findByPath(path: string): Promise<Result<Project | null, RepositoryError>>;
  update(
    params: UpdateProjectParams,
  ): Promise<Result<Project, RepositoryError>>;
  delete(id: ProjectId): Promise<Result<void, RepositoryError>>;
  list(
    query: ListProjectQuery,
  ): Promise<Result<{ items: Project[]; count: number }, RepositoryError>>;
}
