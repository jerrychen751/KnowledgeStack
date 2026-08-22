/** The wire shapes of the /workspaces routes, which the API serves from src/workspaces/. */

/** One workspace the signed-in person belongs to. `joinCode` holds 8 characters from the alphabet that excludes I, L, O, 0 and 1, such as "K7QW2M4D". `joinedAt` is an ISO 8601 timestamp, such as "2026-08-20T16:42:03.000Z". */
export type Workspace = {
  id: string;
  name: string;
  joinCode: string;
  memberCount: number;
  sourceCount: number;
  joinedAt: string;
};

/** The body `GET /workspaces` answers with, oldest membership first. `activeWorkspaceId` names the workspace this browser reads, and is null until the person creates or joins one. */
export type ListWorkspacesResponse = {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
};

/** The body `POST /workspaces` reads. The name holds 1 through 60 characters after the API trims it. */
export type CreateWorkspaceRequest = {
  name: string;
};

/** The body `POST /workspaces/join` reads. The API drops every character outside the join-code alphabet before it compares, so "k7qw-2m4d" and "K7QW2M4D" name one workspace. */
export type JoinWorkspaceRequest = {
  code: string;
};

/** The body `POST /workspaces` answers with, after it opens the new workspace in this browser. It carries no member or source count, because the caller reloads the list. */
export type CreateWorkspaceResponse = {
  workspace: {
    id: string;
    joinCode: string;
    name: string;
  };
};

/** The body `POST /workspaces/join` answers with, after it opens the workspace in this browser. It carries the fields of `CreateWorkspaceResponse`, because both routes answer with the workspace they opened. */
export type JoinWorkspaceResponse = CreateWorkspaceResponse;
