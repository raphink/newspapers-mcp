// No-op OAuth provider for MCP auth compliance.
// Newspapers MCP accesses only public APIs, so no real user authentication is needed.
// This provider auto-approves all authorization requests and issues opaque tokens.

import crypto from "node:crypto";
import { Response } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

// In-memory client store with dynamic registration support
class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.clients.get(clientId);
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">
  ): OAuthClientInformationFull {
    const clientId = crypto.randomUUID();
    const full: OAuthClientInformationFull = {
      ...client,
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    this.clients.set(clientId, full);
    return full;
  }
}

// Pending authorization codes waiting to be exchanged
interface PendingCode {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  expiresAt: number;
}

export class NoOpOAuthProvider implements OAuthServerProvider {
  private _clientsStore = new InMemoryClientsStore();
  private pendingCodes = new Map<string, PendingCode>();
  private issuedTokens = new Set<string>();

  get clientsStore(): OAuthRegisteredClientsStore {
    return this._clientsStore;
  }

  // Auto-approve: generate a code and redirect back immediately
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const code = crypto.randomUUID();
    this.pendingCodes.set(code, {
      clientId: client.client_id,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 min TTL
    });

    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (params.state) {
      redirectUrl.searchParams.set("state", params.state);
    }
    res.redirect(302, redirectUrl.toString());
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const pending = this.pendingCodes.get(authorizationCode);
    if (!pending) throw new Error("Unknown authorization code");
    return pending.codeChallenge;
  }

  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<OAuthTokens> {
    const pending = this.pendingCodes.get(authorizationCode);
    if (!pending || pending.expiresAt < Date.now()) {
      this.pendingCodes.delete(authorizationCode);
      throw new Error("Invalid or expired authorization code");
    }
    this.pendingCodes.delete(authorizationCode);

    const accessToken = crypto.randomUUID();
    const refreshToken = crypto.randomUUID();
    this.issuedTokens.add(accessToken);

    return {
      access_token: accessToken,
      token_type: "bearer",
      refresh_token: refreshToken,
      expires_in: 3600,
    };
  }

  async exchangeRefreshToken(): Promise<OAuthTokens> {
    const accessToken = crypto.randomUUID();
    const refreshToken = crypto.randomUUID();
    this.issuedTokens.add(accessToken);

    return {
      access_token: accessToken,
      token_type: "bearer",
      refresh_token: refreshToken,
      expires_in: 3600,
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    // Accept any token — this server has no protected resources
    return {
      token,
      clientId: "anonymous",
      scopes: [],
    };
  }
}
