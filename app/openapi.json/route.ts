import { SITE_URL } from "@/src/config/site";

export const dynamic = "force-static";

export function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "KharchaKitab API",
      description: "Stateless API for KharchaKitab voice-powered expense tracker. This is a local-first application; the server does not store user data. Agents must provide a data snapshot in requests to analyze expenses.",
      version: "0.1.0",
    },
    servers: [
      {
        url: `${SITE_URL}/api`,
      },
    ],
    paths: {
      "/agent": {
        post: {
          summary: "Financial Assistant Agent",
          description: "Interact with the KharchaKitab financial assistant using natural language.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    messages: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          role: { type: "string", enum: ["user", "assistant", "system"] },
                          content: { type: "string" },
                        },
                      },
                    },
                    snapshot: {
                      type: "object",
                      description: "Data snapshot of user expenses and budgets.",
                    },
                    stream: {
                      type: "boolean",
                      default: false,
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      reply: { type: "string" },
                      responseMessages: { type: "array", items: { type: "object" } },
                      pendingActions: { type: "array", items: { type: "object" } },
                    },
                  },
                },
                "text/event-stream": {
                  description: "SSE stream of agent response",
                },
              },
            },
          },
        },
      },
      "/health": {
        get: {
          summary: "API Health Check",
          responses: {
            "200": {
              description: "API is healthy",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string" },
                      timestamp: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/mcp": {
        post: {
          summary: "Model Context Protocol (MCP) Endpoint",
          description: "JSON-RPC 2.0 endpoint for AI agents to interact with expense data using the Model Context Protocol. Agents must provide a data snapshot in the request body.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    jsonrpc: { type: "string", enum: ["2.0"] },
                    method: { type: "string", enum: ["initialize", "tools/list", "tools/call"] },
                    params: {
                      type: "object",
                      description: "Method-specific parameters. For tools/call, include name, arguments, and a data snapshot.",
                    },
                    id: { type: ["string", "number", "null"] },
                  },
                  required: ["jsonrpc", "method"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "JSON-RPC response (result or error)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      jsonrpc: { type: "string" },
                      result: { type: "object" },
                      error: { type: "object" },
                      id: { type: ["string", "number", "null"] },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  return Response.json(spec, {
    headers: {
      "Content-Type": "application/openapi+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
