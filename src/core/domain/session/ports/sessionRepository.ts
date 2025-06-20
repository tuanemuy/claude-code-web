import type { RepositoryError } from "@/lib/error";
import type { Result } from "neverthrow";
import type {
  CreateSessionParams,
  ListSessionQuery,
  Session,
  SessionId,
} from "../types";

export interface SessionRepository {
  create(
    params: CreateSessionParams,
  ): Promise<Result<Session, RepositoryError>>;
  findById(id: SessionId): Promise<Result<Session | null, RepositoryError>>;
  delete(id: SessionId): Promise<Result<void, RepositoryError>>;
  list(
    query: ListSessionQuery,
  ): Promise<Result<{ items: Session[]; count: number }, RepositoryError>>;
}
