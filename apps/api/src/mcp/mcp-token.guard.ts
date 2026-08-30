import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { McpTokenService, type ResolvedMcpToken } from "./mcp-token.service.js";

type McpTokenRequest = {
  headers: { authorization?: string };
  mcpToken?: ResolvedMcpToken;
};

/**
 * Resolve the bearer token on the MCP route and attach the caller it names.
 *
 * The route carries @Public(), because SessionGuard runs under APP_GUARD and would reject an MCP client
 * before this guard ran. An unknown, expired or revoked token answers 401 with WWW-Authenticate. Leaving the
 * workspace deletes every token of that membership, so a token that resolves always names a live member and
 * this guard needs no membership check of its own.
 */
@Injectable()
export class McpTokenGuard implements CanActivate {
  constructor(private readonly mcpTokenService: McpTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<McpTokenRequest>();
    const header = request.headers.authorization ?? "";
    const secret = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

    const mcpToken = secret === "" ? null : await this.mcpTokenService.findMcpToken(secret);
    if (mcpToken === null) {
      // The header tells a client that follows the MCP authorization flow which scheme this route accepts.
      context
        .switchToHttp()
        .getResponse<{ setHeader(name: string, value: string): void }>()
        .setHeader("WWW-Authenticate", "Bearer");
      throw new UnauthorizedException("Send a live MCP token as Authorization: Bearer.");
    }
    request.mcpToken = mcpToken;

    return true;
  }
}
