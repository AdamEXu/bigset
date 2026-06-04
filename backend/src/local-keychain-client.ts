import { env } from "./env.js";
import {
  type LocalCredentialService,
  localKeychainAccount,
} from "./local-credential-types.js";

interface KeychainGetResponse {
  apiKey: string | null;
  keychainAccount: string;
}

interface KeychainSetResponse {
  keychainAccount: string;
}

function requireKeychainConfig(): { url: string; token: string } {
  if (!env.LOCAL_KEYCHAIN_URL || !env.LOCAL_KEYCHAIN_TOKEN) {
    throw new Error(
      "Local keychain bridge is not configured. Run `make dev` to start it.",
    );
  }
  return { url: env.LOCAL_KEYCHAIN_URL, token: env.LOCAL_KEYCHAIN_TOKEN };
}

function keychainUrl(path: string): string {
  const { url } = requireKeychainConfig();
  return new URL(path, url).toString();
}

async function keychainRequest<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { token } = requireKeychainConfig();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    env.LOCAL_KEYCHAIN_TIMEOUT_MS,
  );

  try {
    const response = await fetch(keychainUrl(path), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    if (!response.ok) {
      throw new Error(payload?.error || `Keychain bridge error (${response.status})`);
    }

    return payload as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Local keychain bridge timed out.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export function expectedKeychainAccount(
  service: LocalCredentialService,
): string {
  return localKeychainAccount(env.BIGSET_LOCAL_WORKSPACE_ID, service);
}

export async function getKeychainCredential(
  service: LocalCredentialService,
): Promise<{ apiKey: string; keychainAccount: string } | null> {
  const result = await keychainRequest<KeychainGetResponse>("/credentials/get", {
    service,
  });

  if (!result.apiKey) return null;
  return {
    apiKey: result.apiKey,
    keychainAccount: result.keychainAccount,
  };
}

export async function setKeychainCredential(
  service: LocalCredentialService,
  apiKey: string,
): Promise<{ keychainAccount: string }> {
  return await keychainRequest<KeychainSetResponse>("/credentials/set", {
    service,
    apiKey,
  });
}
