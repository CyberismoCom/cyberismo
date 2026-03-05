import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { checkResourceAllowed } from '@modelcontextprotocol/sdk/shared/auth-utils.js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { StreamableHTTPTransport, mcpAuthRouter } from '@hono/mcp';
import { bearerAuth } from 'hono/bearer-auth';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';

export const createExampleApp = () => {
  const CONFIG = {
    host: process.env.HOST || 'localhost',
    port: Number(process.env.PORT) || 3000,
    auth: {
      host: process.env.AUTH_HOST || process.env.HOST || 'localhost',
      port: Number(process.env.AUTH_PORT) || 8080,
      realm: process.env.AUTH_REALM || 'master',
      clientId: process.env.OAUTH_CLIENT_ID || 'mcp-server',
      clientSecret: process.env.OAUTH_CLIENT_SECRET || '',
    },
  };

  function createOAuthUrls() {
    const authBaseUrl = new URL(
      `http://${CONFIG.auth.host}:${CONFIG.auth.port}/realms/${CONFIG.auth.realm}/`,
    );
    return {
      issuer: authBaseUrl.toString(),
      introspection_endpoint: new URL(
        'protocol/openid-connect/token/introspect',
        authBaseUrl,
      ).toString(),
      authorization_endpoint: new URL(
        'protocol/openid-connect/auth',
        authBaseUrl,
      ).toString(),
      token_endpoint: new URL(
        'protocol/openid-connect/token',
        authBaseUrl,
      ).toString(),
      registration_endpoint: new URL(
        'clients-registrations/openid-connect',
        authBaseUrl,
      ).toString(),
    };
  }

  const mcpServerUrl = new URL(`http://${CONFIG.host}:${CONFIG.port}`);
  const oauthUrls = createOAuthUrls();

  const tokenVerifier = {
    verifyAccessToken: async (token: string) => {
      const endpoint = oauthUrls.introspection_endpoint;

      const params = new URLSearchParams({
        token,
        client_id: CONFIG.auth.clientId,
      });
      if (CONFIG.auth.clientSecret) {
        params.set('client_secret', CONFIG.auth.clientSecret);
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!response.ok) {
        const txt = await response.text();
        throw new Error(`Invalid or expired token: ${txt}`);
      }

      const data = (await response.json()) as Record<string, unknown>;

      if (data.active === false) throw new Error('Inactive token');
      if (!data.aud) throw new Error('Resource indicator (aud) missing');

      const audiences: string[] = Array.isArray(data.aud)
        ? (data.aud as string[])
        : [data.aud as string];
      const allowed = audiences.some((a) =>
        checkResourceAllowed({
          requestedResource: a,
          configuredResource: mcpServerUrl,
        }),
      );
      if (!allowed) {
        throw new Error(
          `None of the provided audiences are allowed. Expected ${mcpServerUrl}`,
        );
      }

      return {
        token,
        clientId: data.client_id as string,
        scopes: typeof data.scope === 'string' ? data.scope.split(' ') : [],
        expiresAt: data.exp as number,
      };
    },
  };

  function createMcpServer() {
    const server = new McpServer({ name: 'example-server', version: '1.0.0' });

    server.registerTool(
      'add',
      {
        title: 'Addition Tool',
        description: 'Add two numbers together',
        inputSchema: {
          a: z.number().describe('First number to add'),
          b: z.number().describe('Second number to add'),
        },
      },
      async ({ a, b }) => ({
        content: [{ type: 'text', text: `${a} + ${b} = ${a + b}` }],
      }),
    );

    server.registerTool(
      'multiply',
      {
        title: 'Multiplication Tool',
        description: 'Multiply two numbers together',
        inputSchema: {
          x: z.number().describe('First number to multiply'),
          y: z.number().describe('Second number to multiply'),
        },
      },
      async ({ x, y }) => ({
        content: [{ type: 'text', text: `${x} × ${y} = ${x * y}` }],
      }),
    );

    return server;
  }

  // In-memory store: populated on DCR, read back during /authorize
  const clients = new Map<string, OAuthClientInformationFull>();

  const provider: OAuthServerProvider = {
    skipLocalPkceValidation: true,

    clientsStore: {
      getClient: async (clientId: string) => {
        const client = clients.get(clientId);
        console.log('[getClient]', clientId, '->', JSON.stringify(client));
        return client;
      },

      registerClient: async (client: OAuthClientInformationFull) => {
        console.log(
          '[registerClient] body from MCP Inspector:',
          JSON.stringify(client),
        );
        const res = await fetch(oauthUrls.registration_endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(client),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Client registration failed: ${res.status} ${body}`);
        }
        const registered = (await res.json()) as OAuthClientInformationFull;
        console.log(
          '[registerClient] response from Keycloak:',
          JSON.stringify(registered),
        );
        clients.set(registered.client_id, registered);
        return registered;
      },
    },

    authorize: async (
      client: OAuthClientInformationFull,
      params: {
        redirectUri: string;
        codeChallenge: string;
        state?: string;
        scopes?: string[];
      },
      c: { res: Response },
    ) => {
      console.log(
        '[authorize] redirectUri from MCP Inspector:',
        params.redirectUri,
      );
      console.log('[authorize] client.redirect_uris:', client.redirect_uris);
      const url = new URL(oauthUrls.authorization_endpoint);
      url.searchParams.set('client_id', client.client_id);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('redirect_uri', params.redirectUri);
      url.searchParams.set('code_challenge', params.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
      if (params.state) url.searchParams.set('state', params.state);
      if (params.scopes?.length)
        url.searchParams.set('scope', params.scopes.join(' '));
      c.res = Response.redirect(url.toString(), 302);
    },

    challengeForAuthorizationCode: async () => '',

    exchangeAuthorizationCode: async (
      client: OAuthClientInformationFull,
      code: string,
      codeVerifier?: string,
      redirectUri?: string,
    ) => {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: client.client_id,
        code,
      });
      if (codeVerifier) params.set('code_verifier', codeVerifier);
      if (redirectUri) params.set('redirect_uri', redirectUri);
      const res = await fetch(oauthUrls.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
      return res.json();
    },

    exchangeRefreshToken: async (
      client: OAuthClientInformationFull,
      refreshToken: string,
      scopes?: string[],
    ) => {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: client.client_id,
        refresh_token: refreshToken,
      });
      if (scopes?.length) params.set('scope', scopes.join(' '));
      const res = await fetch(oauthUrls.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
      return res.json();
    },

    verifyAccessToken: tokenVerifier.verifyAccessToken,
  };

  const transports: Record<string, StreamableHTTPTransport> = {};

  const app = new Hono();

  app.use('*', cors({ origin: '*', exposeHeaders: ['Mcp-Session-Id'] }));

  // OAuth discovery endpoints
  app.route(
    '/',
    mcpAuthRouter({
      provider,
      issuerUrl: mcpServerUrl,
      resourceServerUrl: mcpServerUrl,
      scopesSupported: ['mcp:tools'],
      resourceName: 'MCP Demo Server',
      clientRegistrationOptions: { clientIdGeneration: false },
    }),
  );

  // MCP endpoint – verify bearer token
  app.use(
    '/mcp',
    bearerAuth({
      verifyToken: async (token) => {
        try {
          await tokenVerifier.verifyAccessToken(token);
          return true;
        } catch {
          return false;
        }
      },
    }),
  );

  app.post('/mcp', async (c) => {
    const sessionId = c.req.header('mcp-session-id');
    let transport: StreamableHTTPTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(await c.req.json())) {
      transport = new StreamableHTTPTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports[id] = transport;
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) delete transports[transport.sessionId];
      };
      const server = createMcpServer();
      await server.connect(transport);
    } else {
      return c.json(
        {
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID' },
          id: null,
        },
        400,
      );
    }

    return (await transport.handleRequest(c)) ?? c.body(null, 204);
  });

  app.get('/mcp', async (c) => {
    const sessionId = c.req.header('mcp-session-id');
    if (!sessionId || !transports[sessionId])
      return c.text('Invalid or missing session ID', 400);
    return (await transports[sessionId].handleRequest(c)) ?? c.body(null, 204);
  });

  app.delete('/mcp', async (c) => {
    const sessionId = c.req.header('mcp-session-id');
    if (!sessionId || !transports[sessionId])
      return c.text('Invalid or missing session ID', 400);
    return (await transports[sessionId].handleRequest(c)) ?? c.body(null, 204);
  });
  return app;
};

// serve({ fetch: app.fetch, port: CONFIG.port }, () => {
//   console.log(`🚀 MCP Server running on ${mcpServerUrl.origin}`);
//   console.log(`📡 MCP endpoint available at ${mcpServerUrl.origin}/mcp`);
// });
