import { paginationSchema } from "@/lib/pagination";
import { z } from "zod/v4";

export const projectIdSchema = z.string().brand("projectId");
export type ProjectId = z.infer<typeof projectIdSchema>;

export const projectSchema = z.object({
  id: projectIdSchema,
  name: z.string(),
  path: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Project = z.infer<typeof projectSchema>;

export const createProjectParamsSchema = z.object({
  name: z.string(),
  path: z.string(),
});
export type CreateProjectParams = z.infer<typeof createProjectParamsSchema>;

export const updateProjectParamsSchema = z.object({
  id: projectIdSchema,
  name: z.string().optional(),
  path: z.string().optional(),
});
export type UpdateProjectParams = z.infer<typeof updateProjectParamsSchema>;

export const listProjectQuerySchema = z.object({
  pagination: paginationSchema,
  filter: z
    .object({
      name: z.string().optional(),
      path: z.string().optional(),
    })
    .optional(),
});
export type ListProjectQuery = z.infer<typeof listProjectQuerySchema>;
