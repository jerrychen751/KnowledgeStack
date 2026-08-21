/** The wire shapes of the /auth routes, which sign a person in through Google and report the open session. */

/** The body `GET /auth/google` and `GET /sources/connect/:provider` answer with. The browser leaves the app for this URL, where the person grants access. */
export type AuthorizationUrlResponse = {
  authorizeUrl: string;
};

/** The body `GET /auth/session` answers with. The route answers 401 instead when the cookie names no live session, and `activeWorkspace` is null until the person creates or joins one. */
export type SessionResponse = {
  activeWorkspace: { id: string; name: string } | null;
  user: {
    externalDisplayName: string;
    externalEmail: string;
    externalImageUrl: string | null;
    id: string;
  };
};
