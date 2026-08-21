import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_ROUTE = "isPublicRoute";

/** Let a request without a session cookie reach the route. SessionGuard still attaches a session when a cookie names one. */
export const Public = () => SetMetadata(IS_PUBLIC_ROUTE, true);
