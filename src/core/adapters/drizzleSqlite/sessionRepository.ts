import type { SessionRepository } from "@/core/domain/session/ports/sessionRepository";
import {
  type CreateSessionParams,
  type ListSessionQuery,
  type Session,
  type SessionId,
  sessionSchema,
} from "@/core/domain/session/types";
import { RepositoryError } from "@/lib/error";
import { validate } from "@/lib/validation";
import { and, eq, sql } from "drizzle-orm";
import { type Result, err, ok } from "neverthrow";
import type { Database } from "./client";
import { sessions } from "./schema";

export class DrizzleSqliteSessionRepository implements SessionRepository {
  constructor(private readonly db: Database) {}

  async create(
    params: CreateSessionParams,
  ): Promise<Result<Session, RepositoryError>> {
    try {
      const result = await this.db.insert(sessions).values(params).returning();

      const session = result[0];
      if (!session) {
        return err(new RepositoryError("Failed to create session"));
      }

      return validate(sessionSchema, session).mapErr((error) => {
        return new RepositoryError("Invalid session data", error);
      });
    } catch (error) {
      return err(new RepositoryError("Failed to create session", error));
    }
  }

  async findById(
    id: SessionId,
  ): Promise<Result<Session | null, RepositoryError>> {
    try {
      const result = await this.db
        .select()
        .from(sessions)
        .where(eq(sessions.id, id))
        .limit(1);

      const session = result[0];
      if (!session) {
        return ok(null);
      }

      return validate(sessionSchema, session)
        .map((validSession) => validSession)
        .mapErr((error) => new RepositoryError("Invalid session data", error));
    } catch (error) {
      return err(new RepositoryError("Failed to find session", error));
    }
  }

  async delete(id: SessionId): Promise<Result<void, RepositoryError>> {
    try {
      await this.db.delete(sessions).where(eq(sessions.id, id));
      return ok(undefined);
    } catch (error) {
      return err(new RepositoryError("Failed to delete session", error));
    }
  }

  async list(
    query: ListSessionQuery,
  ): Promise<Result<{ items: Session[]; count: number }, RepositoryError>> {
    const { pagination, filter } = query;
    const limit = pagination.limit;
    const offset = (pagination.page - 1) * pagination.limit;

    const filters = [
      filter?.projectId ? eq(sessions.projectId, filter.projectId) : undefined,
    ].filter((filter) => filter !== undefined);

    try {
      const [items, countResult] = await Promise.all([
        this.db
          .select()
          .from(sessions)
          .where(and(...filters))
          .limit(limit)
          .offset(offset),
        this.db
          .select({ count: sql`count(*)` })
          .from(sessions)
          .where(and(...filters)),
      ]);

      const validItems = items
        .map((item) => validate(sessionSchema, item).unwrapOr(null))
        .filter((item) => item !== null);

      return ok({
        items: validItems,
        count: Number(countResult[0]?.count || 0),
      });
    } catch (error) {
      return err(new RepositoryError("Failed to list sessions", error));
    }
  }
}
