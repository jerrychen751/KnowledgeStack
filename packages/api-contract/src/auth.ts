/** The wire shapes of the /auth routes, which sign a person in through Google and report the open session. */

import { z } from "zod";

export const startSignInResponseSchema = z.object({
  authorizeUrl: z.string(),
});

/** The body `GET /auth/google` answers with. The browser leaves the app for this URL, where the person grants access to their Google account. */
export type StartSignInResponse = z.infer<typeof startSignInResponseSchema>;

export const findAccountResponseSchema = z.object({
  activeWorkspace: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable(),
  user: z.object({
    externalDisplayName: z.string(),
    externalEmail: z.string(),
    externalImageUrl: z.string().nullable(),
    id: z.string(),
  }),
});

/** The body `GET /auth/session` answers with. The route answers 401 instead when the cookie names no live session, and `activeWorkspace` is null until the person creates or joins one. */
export type FindAccountResponse = z.infer<typeof findAccountResponseSchema>;
