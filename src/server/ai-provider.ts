import "server-only";

import { decryptSetting } from "@/server/settings-crypto";
import type { AiProvider } from "@/generated/prisma/client";

export class AiProviderError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AiProviderError";
  }
}

export type AiConfig = {
  aiProvider: AiProvider | null;
  aiEndpoint: string | null;
  aiModel: string | null;
  aiApiKeyEncrypted: string | null;
};

export type AiCallResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

function endpointFor(config: AiConfig) {
  if (config.aiProvider === "OPENAI") return "https://api.openai.com/v1/responses";
  if (config.aiProvider === "AZURE_OPENAI" && config.aiEndpoint) {
    const endpoint = new URL(config.aiEndpoint);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) {
      throw new AiProviderError("ai-config-invalid");
    }
    return `${endpoint.origin}${endpoint.pathname.replace(/\/$/, "")}/openai/v1/responses`;
  }
  throw new AiProviderError("ai-not-configured");
}

export async function callAi(config: AiConfig, instructions: string, input: string): Promise<AiCallResult> {
  if (!config.aiProvider || !config.aiModel || !config.aiApiKeyEncrypted) {
    throw new AiProviderError("ai-not-configured");
  }
  const apiKey = decryptSetting(config.aiApiKeyEncrypted);
  const response = await fetch(endpointFor(config), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.aiProvider === "OPENAI" ? { authorization: `Bearer ${apiKey}` } : { "api-key": apiKey }),
    },
    body: JSON.stringify({
      model: config.aiModel,
      instructions,
      input,
      store: false,
      max_output_tokens: 600,
      text: { format: { type: "json_object" } },
    }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  }).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === "TimeoutError") throw new AiProviderError("ai-timeout");
    throw new AiProviderError("ai-provider-unavailable");
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new AiProviderError("ai-provider-auth");
    if (response.status === 429) throw new AiProviderError("ai-provider-rate-limit");
    throw new AiProviderError("ai-provider-error");
  }
  const body = await response.json().catch(() => null) as {
    output_text?: unknown;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  } | null;
  const outputText = typeof body?.output_text === "string"
    ? body.output_text
    : body?.output?.flatMap((item) => item.content ?? []).find((part) => part.type === "output_text")?.text;
  if (!outputText) throw new AiProviderError("ai-invalid-response");

  return {
    text: outputText,
    inputTokens: Number.isFinite(body?.usage?.input_tokens) ? Number(body?.usage?.input_tokens) : 0,
    outputTokens: Number.isFinite(body?.usage?.output_tokens) ? Number(body?.usage?.output_tokens) : 0,
  };
}

export function parseAiJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiProviderError("ai-invalid-response");
  }
}
