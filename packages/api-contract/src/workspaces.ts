/** The wire shapes of the /workspaces routes, which the API serves from src/workspaces/. */

import { z } from "zod";

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  joinCode: z.string(),
  memberCount: z.number().int(),
  sourceCount: z.number().int(),
  joinedAt: z.string(),
});

/** One workspace the signed-in person belongs to. `joinCode` holds 8 characters from the alphabet that excludes I, L, O, 0 and 1, such as "K7QW2M4D". `joinedAt` is an ISO 8601 timestamp, such as "2026-08-20T16:42:03.000Z". */
export type Workspace = z.infer<typeof workspaceSchema>;

export const listWorkspacesResponseSchema = z.object({
  workspaces: z.array(workspaceSchema),
  activeWorkspaceId: z.string().nullable(),
});

/** The body `GET /workspaces` answers with, oldest membership first. `activeWorkspaceId` names the workspace this browser reads, and is null until the person creates or joins one. */
export type ListWorkspacesResponse = z.infer<typeof listWorkspacesResponseSchema>;

export const createWorkspaceRequestSchema = z.object(
  {
    name: z
      .string({ error: "name must be a non-empty string." })
      .trim()
      .min(1, "name must be a non-empty string.")
      .max(60, "name must hold 60 characters or fewer."),
  },
  { error: "The body must be one JSON object." },
);

/** The body `POST /workspaces` reads. The name holds 1 through 60 characters after the API trims it. */
export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequestSchema>;

export const joinWorkspaceRequestSchema = z.object(
  {
    code: z
      .string({ error: "code must be a non-empty string." })
      .trim()
      .min(1, "code must be a non-empty string.")
      .max(60, "code must hold 60 characters or fewer."),
  },
  { error: "The body must be one JSON object." },
);

/** The body `POST /workspaces/join` reads. The API drops every character outside the join-code alphabet before it compares, so "k7qw-2m4d" and "K7QW2M4D" name one workspace. */
export type JoinWorkspaceRequest = z.infer<typeof joinWorkspaceRequestSchema>;

export const createWorkspaceResponseSchema = z.object({
  workspace: z.object({
    id: z.string(),
    joinCode: z.string(),
    name: z.string(),
  }),
});

/** The body `POST /workspaces` answers with, after it opens the new workspace in this browser. It carries no member or source count, because the caller reloads the list. */
export type CreateWorkspaceResponse = z.infer<typeof createWorkspaceResponseSchema>;

export const joinWorkspaceResponseSchema = createWorkspaceResponseSchema;

/** The body `POST /workspaces/join` answers with, after it opens the workspace in this browser. It carries the fields of `CreateWorkspaceResponse`, because both routes answer with the workspace they opened. */
export type JoinWorkspaceResponse = z.infer<typeof joinWorkspaceResponseSchema>;
