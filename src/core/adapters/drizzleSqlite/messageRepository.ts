import type { MessageRepository } from "@/core/domain/message/ports/messageRepository";
import {
  type CreateMessageParams,
  type ListMessageQuery,
  type Message,
  type MessageId,
  messageSchema,
} from "@/core/domain/message/types";
import { RepositoryError } from "@/lib/error";
import { validate } from "@/lib/validation";
import { and, eq, sql } from "drizzle-orm";
import { type Result, err, ok } from "neverthrow";
import type { Database } from "./client";
import { messages } from "./schema";

export class DrizzleSqliteMessageRepository implements MessageRepository {
  constructor(private readonly db: Database) {}

  async create(
    params: CreateMessageParams,
  ): Promise<Result<Message, RepositoryError>> {
    try {
      const result = await this.db.insert(messages).values(params).returning();

      const message = result[0];
      if (!message) {
        return err(new RepositoryError("Failed to create message"));
      }

      return validate(messageSchema, message).mapErr((error) => {
        return new RepositoryError("Invalid message data", error);
      });
    } catch (error) {
      return err(new RepositoryError("Failed to create message", error));
    }
  }

  async findById(
    id: MessageId,
  ): Promise<Result<Message | null, RepositoryError>> {
    try {
      const result = await this.db
        .select()
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1);

      const message = result[0];
      if (!message) {
        return ok(null);
      }

      return validate(messageSchema, message)
        .map((validMessage) => validMessage)
        .mapErr((error) => new RepositoryError("Invalid message data", error));
    } catch (error) {
      return err(new RepositoryError("Failed to find message", error));
    }
  }

  async delete(id: MessageId): Promise<Result<void, RepositoryError>> {
    try {
      await this.db.delete(messages).where(eq(messages.id, id));
      return ok(undefined);
    } catch (error) {
      return err(new RepositoryError("Failed to delete message", error));
    }
  }

  async list(
    query: ListMessageQuery,
  ): Promise<Result<{ items: Message[]; count: number }, RepositoryError>> {
    const { pagination, filter } = query;
    const limit = pagination.limit;
    const offset = (pagination.page - 1) * pagination.limit;

    const filters = [
      filter?.sessionId ? eq(messages.sessionId, filter.sessionId) : undefined,
      filter?.role ? eq(messages.role, filter.role) : undefined,
    ].filter((filter) => filter !== undefined);

    try {
      const [items, countResult] = await Promise.all([
        this.db
          .select()
          .from(messages)
          .where(and(...filters))
          .limit(limit)
          .offset(offset),
        this.db
          .select({ count: sql`count(*)` })
          .from(messages)
          .where(and(...filters)),
      ]);

      const validItems = items
        .map((item) => validate(messageSchema, item).unwrapOr(null))
        .filter((item) => item !== null);

      return ok({
        items: validItems,
        count: Number(countResult[0]?.count || 0),
      });
    } catch (error) {
      return err(new RepositoryError("Failed to list messages", error));
    }
  }
}
