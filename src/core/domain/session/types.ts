import { paginationSchema } from "@/lib/pagination";
import { z } from "zod/v4";
import { type ProjectId, projectIdSchema } from "../project/types";

export const sessionIdSchema = z.string().brand("sessionId");
export type SessionId = z.infer<typeof sessionIdSchema>;

export const sessionSchema = z.object({
  id: sessionIdSchema,
  projectId: projectIdSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Session = z.infer<typeof sessionSchema>;

export const createSessionParamsSchema = z.object({
  id: sessionIdSchema,
  projectId: projectIdSchema,
});
export type CreateSessionParams = z.infer<typeof createSessionParamsSchema>;

export const listSessionQuerySchema = z.object({
  pagination: paginationSchema,
  filter: z
    .object({
      projectId: projectIdSchema.optional(),
    })
    .optional(),
});
export type ListSessionQuery = z.infer<typeof listSessionQuerySchema>;
