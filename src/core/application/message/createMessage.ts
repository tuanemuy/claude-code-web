import {
  type CreateMessageParams,
  type Message,
  createMessageParamsSchema,
} from "@/core/domain/message/types";
import { ApplicationError } from "@/lib/error";
import { validate } from "@/lib/validation";
import { type Result, err } from "neverthrow";
import type { Context } from "../context";

export async function createMessage(
  context: Context,
  input: CreateMessageParams,
): Promise<Result<Message, ApplicationError>> {
  const parseResult = validate(createMessageParamsSchema, input);

  if (parseResult.isErr()) {
    return err(
      new ApplicationError("Invalid message input", parseResult.error),
    );
  }

  const params = parseResult.value;

  const result = await context.messageRepository.create(params);
  return result.mapErr(
    (error) => new ApplicationError("Failed to create message", error),
  );
}
