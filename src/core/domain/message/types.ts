import { paginationSchema } from "@/lib/pagination";
import { z } from "zod/v4";
import { type SessionId, sessionIdSchema } from "../session/types";

export const messageIdSchema = z.string().brand("messageId");
export type MessageId = z.infer<typeof messageIdSchema>;

export const messageRoleSchema = z.enum(["user", "assistant"]);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const messageSchema = z.object({
  id: messageIdSchema,
  sessionId: sessionIdSchema,
  role: messageRoleSchema,
  content: z.string().nullable(),
  timestamp: z.date(),
  rawData: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Message = z.infer<typeof messageSchema>;

export const createMessageParamsSchema = z.object({
  sessionId: sessionIdSchema,
  role: messageRoleSchema,
  content: z.string().nullable(),
  timestamp: z.date(),
  rawData: z.string(),
});
export type CreateMessageParams = z.infer<typeof createMessageParamsSchema>;

export const listMessageQuerySchema = z.object({
  pagination: paginationSchema,
  filter: z
    .object({
      sessionId: sessionIdSchema.optional(),
      role: messageRoleSchema.optional(),
    })
    .optional(),
});
export type ListMessageQuery = z.infer<typeof listMessageQuerySchema>;
