import type { RepositoryError } from "@/lib/error";
import type { Result } from "neverthrow";
import type {
  CreateMessageParams,
  ListMessageQuery,
  Message,
  MessageId,
} from "../types";

export interface MessageRepository {
  create(
    params: CreateMessageParams,
  ): Promise<Result<Message, RepositoryError>>;
  findById(id: MessageId): Promise<Result<Message | null, RepositoryError>>;
  delete(id: MessageId): Promise<Result<void, RepositoryError>>;
  list(
    query: ListMessageQuery,
  ): Promise<Result<{ items: Message[]; count: number }, RepositoryError>>;
}
