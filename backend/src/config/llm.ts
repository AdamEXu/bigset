import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createAlibaba } from "@ai-sdk/alibaba";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createFireworks } from "@ai-sdk/fireworks";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createHuggingFace } from "@ai-sdk/huggingface";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createTogetherAI } from "@ai-sdk/togetherai";
import { createXai } from "@ai-sdk/xai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

import { env } from "../env.js";
import { FETCH_TIMEOUT_MS } from "../fetch-timeout.js";

// OpenRouter app attribution — surfaces BigSet in OpenRouter's public app
// rankings and per-app analytics. HTTP-Referer is the app's unique identifier;
// X-Title is its display name; X-OpenRouter-Categories places it in the
// marketplace (BigSet is an autonomous research agent → "personal-agent").
// Overridable via env for other deployments.
// https://openrouter.ai/docs/app-attribution
const OPENROUTER_APP_URL =
  process.env.OPENROUTER_APP_URL || "https://bigset.tinyfish.ai";
const OPENROUTER_APP_TITLE =
  process.env.OPENROUTER_APP_TITLE || "TinyFish BigSet";
const OPENROUTER_APP_CATEGORIES =
  process.env.OPENROUTER_APP_CATEGORIES || "personal-agent";

export const LLM_PROVIDER_TYPES = [
  "openrouter",
  "openai",
  "anthropic",
  "google",
  "xai",
  "deepseek",
  "qwen",
  "mistral",
  "groq",
  "togetherai",
  "deepinfra",
  "fireworks",
  "huggingface",
  "ollama",
  "lmstudio",
  "custom",
] as const;

export type LlmProviderType = (typeof LLM_PROVIDER_TYPES)[number];

export type ModelRoleKey =
  | "schemaInference"
  | "populateOrchestrator"
  | "investigateSubagent";

export interface LlmProviderConfig {
  provider: LlmProviderType;
  apiKey: string;
  defaultModel: string;
  baseUrl?: string;
  source: "local" | "env";
}

export interface LlmProviderInput {
  provider: LlmProviderType;
  apiKey: string;
  defaultModel?: string;
  baseUrl?: string;
}

export const LLM_PROVIDER_LABELS: Record<LlmProviderType, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  xai: "xAI",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  mistral: "Mistral AI",
  groq: "Groq",
  togetherai: "Together.ai",
  deepinfra: "DeepInfra",
  fireworks: "Fireworks AI",
  huggingface: "Hugging Face",
  ollama: "Ollama",
  lmstudio: "LM Studio",
  custom: "Custom OpenAI-compatible",
};

export const LLM_PROVIDER_DEFAULT_MODELS_BY_ROLE: Record<
  LlmProviderType,
  Record<ModelRoleKey, string>
> = {
  openrouter: {
    schemaInference: env.SCHEMA_INFERENCE_MODEL,
    populateOrchestrator: env.POPULATE_ORCHESTRATOR_MODEL,
    investigateSubagent: env.INVESTIGATE_SUBAGENT_MODEL,
  },
  openai: {
    schemaInference: "gpt-5.6-luna",
    populateOrchestrator: "gpt-5.6-luna",
    investigateSubagent: "gpt-5.6-luna",
  },
  anthropic: {
    schemaInference: "claude-sonnet-5",
    populateOrchestrator: "claude-sonnet-5",
    investigateSubagent: "claude-sonnet-5",
  },
  google: {
    schemaInference: "gemini-3.6-flash",
    populateOrchestrator: "gemini-3.6-flash",
    investigateSubagent: "gemini-3.6-flash",
  },
  xai: {
    schemaInference: "grok-4.5",
    populateOrchestrator: "grok-4.5",
    investigateSubagent: "grok-4.5",
  },
  deepseek: {
    schemaInference: "deepseek-v4-flash",
    populateOrchestrator: "deepseek-v4-flash",
    investigateSubagent: "deepseek-v4-flash",
  },
  qwen: {
    schemaInference: "qwen3.7-max",
    populateOrchestrator: "qwen3.7-max",
    investigateSubagent: "qwen3.6-plus",
  },
  mistral: {
    schemaInference: "mistral-medium-latest",
    populateOrchestrator: "mistral-medium-latest",
    investigateSubagent: "mistral-medium-latest",
  },
  groq: {
    schemaInference: "openai/gpt-oss-120b",
    populateOrchestrator: "openai/gpt-oss-120b",
    investigateSubagent: "openai/gpt-oss-120b",
  },
  togetherai: {
    schemaInference: "deepseek-ai/DeepSeek-V4-Flash-0731",
    populateOrchestrator: "deepseek-ai/DeepSeek-V4-Flash-0731",
    investigateSubagent: "deepseek-ai/DeepSeek-V4-Flash-0731",
  },
  deepinfra: {
    schemaInference: "deepseek-ai/DeepSeek-V4-Flash-0731",
    populateOrchestrator: "deepseek-ai/DeepSeek-V4-Flash-0731",
    investigateSubagent: "deepseek-ai/DeepSeek-V4-Flash-0731",
  },
  fireworks: {
    schemaInference: "accounts/fireworks/models/deepseek-v4-flash-0731",
    populateOrchestrator: "accounts/fireworks/models/deepseek-v4-flash-0731",
    investigateSubagent: "accounts/fireworks/models/deepseek-v4-flash-0731",
  },
  huggingface: {
    schemaInference: "zai-org/GLM-5.2",
    populateOrchestrator: "zai-org/GLM-5.2",
    investigateSubagent: "deepseek-ai/DeepSeek-V4-Flash-0731",
  },
  ollama: {
    schemaInference: "",
    populateOrchestrator: "",
    investigateSubagent: "",
  },
  lmstudio: {
    schemaInference: "",
    populateOrchestrator: "",
    investigateSubagent: "",
  },
  custom: {
    schemaInference: "",
    populateOrchestrator: "",
    investigateSubagent: "",
  },
};

export const LLM_PROVIDER_DEFAULT_MODELS: Record<LlmProviderType, string> = {
  openrouter: LLM_PROVIDER_DEFAULT_MODELS_BY_ROLE.openrouter.schemaInference,
  openai: LLM_PROVIDER_DEFAULT_MODELS_BY_ROLE.openai.schemaInference,
  anthropic: LLM_PROVIDER_DEFAULT_MODELS_BY_ROLE.anthropic.schemaInference,
  google: LLM_PROVIDER_DEFAULT_MODELS_BY_ROLE.google.schemaInference,
  xai: LLM_PROVIDER_DEFAULT_MODELS_BY_ROLE.xai.schemaInference,
  deepseek: LLM_PROVIDER_DEFAULT_MODELS_BY_ROLE.deepseek.schemaInference,
  qwen: LLM_PROVIDER_DEFAULT_MODELS_BY_ROLE.qwen.schemaInference,
  mistral: LLM_PROVIDER_DEFAULT_MODELS_BY_ROLE.mistral.schemaInference,
  groq: LLM_PROVIDER_DEFAULT_MODELS_BY_ROLE.groq.schemaInference,
  togetherai: LLM_PROVIDER_DEFAULT_MODELS_BY_ROLE.togetherai.schemaInference,
  deepinfra: LLM_PROVIDER_DEFAULT_MODELS_BY_ROLE.deepinfra.schemaInference,
  fireworks: LLM_PROVIDER_DEFAULT_MODELS_BY_ROLE.fireworks.schemaInference,
  huggingface: LLM_PROVIDER_DEFAULT_MODELS_BY_ROLE.huggingface.schemaInference,
  ollama: "",
  lmstudio: "",
  custom: "",
};

export function isLlmProviderType(value: unknown): value is LlmProviderType {
  return (
    typeof value === "string" &&
    (LLM_PROVIDER_TYPES as readonly string[]).includes(value)
  );
}

export function llmProviderLabel(provider: LlmProviderType): string {
  return LLM_PROVIDER_LABELS[provider];
}

export function defaultModelForLlmProvider(provider: LlmProviderType): string {
  return LLM_PROVIDER_DEFAULT_MODELS[provider];
}

export function defaultModelForLlmProviderRole(
  provider: LlmProviderType,
  role: ModelRoleKey,
): string {
  return LLM_PROVIDER_DEFAULT_MODELS_BY_ROLE[provider][role];
}

export function defaultBaseUrlForLlmProvider(
  provider: LlmProviderType,
): string | undefined {
  if (provider === "openrouter") {
    return env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  }
  if (provider === "google") {
    return (
      env.GOOGLE_GENERATIVE_AI_BASE_URL ||
      "https://generativelanguage.googleapis.com/v1beta"
    );
  }
  if (provider === "xai") {
    return env.XAI_BASE_URL || "https://api.x.ai/v1";
  }
  if (provider === "deepseek") {
    return env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  }
  if (provider === "qwen") {
    return (
      env.QWEN_BASE_URL ||
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    );
  }
  if (provider === "mistral") {
    return env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1";
  }
  if (provider === "groq") {
    return env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
  }
  if (provider === "togetherai") {
    return env.TOGETHER_BASE_URL || "https://api.together.xyz/v1";
  }
  if (provider === "deepinfra") {
    return env.DEEPINFRA_BASE_URL || "https://api.deepinfra.com/v1";
  }
  if (provider === "fireworks") {
    return (
      env.FIREWORKS_BASE_URL ||
      "https://api.fireworks.ai/inference/v1"
    );
  }
  if (provider === "huggingface") {
    return env.HUGGINGFACE_BASE_URL || "https://router.huggingface.co/v1";
  }
  if (provider === "ollama") {
    return env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
  }
  if (provider === "lmstudio") {
    return env.LM_STUDIO_BASE_URL || "http://localhost:1234/v1";
  }
  return undefined;
}

function isOpenAiCompatibleProvider(provider: LlmProviderType): boolean {
  return provider === "custom" || provider === "ollama" || provider === "lmstudio";
}

function providerAllowsMissingApiKey(provider: LlmProviderType): boolean {
  return isOpenAiCompatibleProvider(provider);
}

function isLoopbackHost(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(
    hostname,
  );
}

function normalizeLocalLoopbackForBackend(parsed: URL): void {
  if (env.IS_LOCAL_MODE && isLoopbackHost(parsed.hostname)) {
    // In local dev the backend runs inside Docker. From the container,
    // localhost points at the container, not the host machine where LM Studio
    // and other local OpenAI-compatible servers usually listen.
    parsed.hostname = "host.docker.internal";
  }
}

export function normalizeBaseUrl(baseUrl?: string): string | undefined {
  const trimmed = baseUrl?.trim();
  if (!trimmed) return undefined;
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Base URL must start with http:// or https://");
  }
  normalizeLocalLoopbackForBackend(parsed);
  return parsed.toString().replace(/\/+$/, "");
}

export function normalizeCustomBaseUrl(baseUrl?: string): string | undefined {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return undefined;

  const parsed = new URL(normalized);
  if (parsed.pathname === "" || parsed.pathname === "/") {
    parsed.pathname = "/v1";
  }
  return parsed.toString().replace(/\/+$/, "");
}

export function normalizeLlmProviderInput(
  input: LlmProviderInput,
  source: "local" | "env",
): LlmProviderConfig {
  const provider = input.provider;
  const apiKey = input.apiKey.trim();
  if (!apiKey && !providerAllowsMissingApiKey(provider)) {
    throw new Error(`${llmProviderLabel(provider)} API key is required`);
  }

  const baseUrl =
    isOpenAiCompatibleProvider(provider)
      ? normalizeCustomBaseUrl(
          input.baseUrl ?? defaultBaseUrlForLlmProvider(provider),
        )
      : normalizeBaseUrl(input.baseUrl) ?? defaultBaseUrlForLlmProvider(provider);

  if (isOpenAiCompatibleProvider(provider) && !baseUrl) {
    throw new Error(`${llmProviderLabel(provider)} requires a base URL`);
  }

  const defaultModel =
    input.defaultModel?.trim() || defaultModelForLlmProvider(provider);

  return {
    provider,
    apiKey,
    defaultModel,
    baseUrl,
    source,
  };
}

export function createLanguageModel(
  config: LlmProviderConfig,
  modelId?: string,
): LanguageModelV3 {
  const resolvedModelId = (modelId?.trim() || config.defaultModel).trim();
  if (!resolvedModelId) {
    throw new Error("Model name is required");
  }

  switch (config.provider) {
    case "openrouter": {
      const provider = createOpenRouter({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
        headers: {
          "HTTP-Referer": OPENROUTER_APP_URL,
          "X-Title": OPENROUTER_APP_TITLE,
          "X-OpenRouter-Categories": OPENROUTER_APP_CATEGORIES,
        },
      });
      return provider(resolvedModelId);
    }
    case "openai": {
      const provider = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      return provider(resolvedModelId);
    }
    case "anthropic": {
      const provider = createAnthropic({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      return provider(resolvedModelId);
    }
    case "google": {
      const provider = createGoogleGenerativeAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      return provider(resolvedModelId);
    }
    case "xai": {
      const provider = createXai({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      return provider(resolvedModelId);
    }
    case "deepseek": {
      const provider = createDeepSeek({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      return provider(resolvedModelId);
    }
    case "qwen": {
      const provider = createAlibaba({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      return provider(resolvedModelId);
    }
    case "mistral": {
      const provider = createMistral({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      return provider(resolvedModelId);
    }
    case "groq": {
      const provider = createGroq({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      return provider(resolvedModelId);
    }
    case "togetherai": {
      const provider = createTogetherAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      return provider(resolvedModelId);
    }
    case "deepinfra": {
      const provider = createDeepInfra({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      return provider(resolvedModelId);
    }
    case "fireworks": {
      const provider = createFireworks({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      return provider(resolvedModelId);
    }
    case "huggingface": {
      const provider = createHuggingFace({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      return provider(resolvedModelId);
    }
    case "ollama":
    case "lmstudio":
    case "custom": {
      if (!config.baseUrl) {
        throw new Error(`${llmProviderLabel(config.provider)} requires a base URL`);
      }
      const provider = createOpenAICompatible({
        name: config.provider,
        apiKey: config.apiKey || undefined,
        baseURL: config.baseUrl,
      });
      return provider(resolvedModelId);
    }
  }
}

export function modelsUrlForLlmProvider(
  provider: LlmProviderType,
  baseUrl?: string,
): string {
  const resolvedBaseUrl = (
    baseUrl ||
    defaultBaseUrlForLlmProvider(provider) ||
    "https://api.openai.com/v1"
  ).replace(/\/+$/, "");

  if (provider === "deepinfra") {
    return resolvedBaseUrl.endsWith("/openai")
      ? `${resolvedBaseUrl}/models`
      : `${resolvedBaseUrl}/openai/models`;
  }

  return `${resolvedBaseUrl}/models`;
}

type ProviderVerificationRequest = {
  url: string;
  headers: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
  fallbackStatuses?: number[];
};

function openAiStyleModelsVerificationRequest(
  config: LlmProviderConfig,
): ProviderVerificationRequest {
  return {
    url: modelsUrlForLlmProvider(config.provider, config.baseUrl),
    headers: { Authorization: `Bearer ${config.apiKey}` },
  };
}

function qwenChatVerificationRequest(
  config: LlmProviderConfig,
): ProviderVerificationRequest {
  const baseUrl = (
    config.baseUrl ||
    defaultBaseUrlForLlmProvider("qwen") ||
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
  ).replace(/\/+$/, "");

  return {
    url: `${baseUrl}/chat/completions`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.defaultModel || defaultModelForLlmProvider("qwen"),
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
    }),
  };
}

function providerVerificationRequests(
  config: LlmProviderConfig,
): ProviderVerificationRequest[] {
  switch (config.provider) {
    case "openrouter": {
      const baseUrl = (config.baseUrl || "https://openrouter.ai/api/v1").replace(
        /\/+$/,
        "",
      );
      return [{
        url: `${baseUrl}/key`,
        headers: { Authorization: `Bearer ${config.apiKey}` },
      }];
    }
    case "openai": {
      const baseUrl = (config.baseUrl || "https://api.openai.com/v1").replace(
        /\/+$/,
        "",
      );
      return [{
        url: `${baseUrl}/models`,
        headers: { Authorization: `Bearer ${config.apiKey}` },
      }];
    }
    case "anthropic": {
      const baseUrl = (config.baseUrl || "https://api.anthropic.com/v1").replace(
        /\/+$/,
        "",
      );
      return [{
        url: `${baseUrl}/models?limit=1`,
        headers: {
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
      }];
    }
    case "google": {
      const baseUrl = (
        config.baseUrl || "https://generativelanguage.googleapis.com/v1beta"
      ).replace(/\/+$/, "");
      return [{
        url: `${baseUrl}/models`,
        headers: { "x-goog-api-key": config.apiKey },
      }];
    }
    case "qwen": {
      return [
        {
          ...openAiStyleModelsVerificationRequest(config),
          fallbackStatuses: [404, 405],
        },
        qwenChatVerificationRequest(config),
      ];
    }
    case "xai":
    case "deepseek":
    case "mistral":
    case "groq":
    case "togetherai":
    case "deepinfra":
    case "fireworks":
    case "huggingface": {
      return [openAiStyleModelsVerificationRequest(config)];
    }
    case "ollama":
    case "lmstudio":
    case "custom": {
      if (!config.baseUrl) {
        throw new Error(`${llmProviderLabel(config.provider)} requires a base URL`);
      }
      const baseUrl = config.baseUrl.replace(/\/+$/, "");
      return [{
        url: `${baseUrl}/models`,
        headers: config.apiKey
          ? { Authorization: `Bearer ${config.apiKey}` }
          : {},
      }];
    }
  }
}

export async function verifyLlmProviderConfig(
  config: LlmProviderConfig,
): Promise<void> {
  const requests = providerVerificationRequests(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let lastResponseStatus: number | undefined;
  let lastUrl: string | undefined;

  try {
    for (const request of requests) {
      lastUrl = request.url;
      const response = await fetch(request.url, {
        method: request.method ?? "GET",
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
      });

      if (response.ok) return;

      lastResponseStatus = response.status;
      if (request.fallbackStatuses?.includes(response.status)) {
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `${llmProviderLabel(config.provider)} rejected that API key.`,
        );
      }
      throw new Error(
        `${llmProviderLabel(config.provider)} verification failed with HTTP ${response.status}.`,
      );
    }

    throw new Error(
      `${llmProviderLabel(config.provider)} verification failed with HTTP ${lastResponseStatus ?? "unknown"}.`,
    );
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `${llmProviderLabel(config.provider)} verification timed out after ${FETCH_TIMEOUT_MS / 1000} seconds.`,
      );
    }
    if (err instanceof Error && err.message === "fetch failed") {
      const displayUrl = (lastUrl ?? requests[0]?.url ?? "").replace(
        "host.docker.internal",
        "localhost",
      );
      const localHint =
        config.provider === "ollama"
          ? " Start Ollama and confirm the OpenAI-compatible endpoint is enabled."
          : config.provider === "lmstudio"
            ? " Start the LM Studio local server and confirm the port."
            : config.provider === "custom"
              ? " Check that the endpoint is running and reachable."
              : "";
      throw new Error(
        `${llmProviderLabel(config.provider)} verification failed: could not reach ${displayUrl}.${localHint}`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
