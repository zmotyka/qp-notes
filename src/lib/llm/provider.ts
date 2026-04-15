/* ═══════════════════════════════════════════════════════════
   External LLM Provider Abstraction + API Key Encryption
   ═══════════════════════════════════════════════════════════ */

import { getSetting, setSetting } from '../db';

/* ─── Types ─── */

export interface ExternalModel {
  id: string;
  name: string;
  contextWindow: number;
}

export interface StreamCallbacks {
  onToken: (token: string, full: string) => void;
  signal?: AbortSignal;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ExternalProvider {
  readonly id: string;
  readonly name: string;
  readonly models: ExternalModel[];
  /** Test connectivity + key validity. */
  validate(apiKey: string): Promise<boolean>;
  /** Streaming chat completion. Returns full accumulated text. */
  chatStream(
    apiKey: string,
    modelId: string,
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    opts?: { maxTokens?: number; temperature?: number },
  ): Promise<string>;
}

/* ─── AES-GCM 256-bit Key Encryption ─── */

const ENC_KEY_NAME = 'qp-enc-key';
const ENC_ALGO = 'AES-GCM';
const KEY_LENGTH = 256;

/** Derive or retrieve the app-level encryption key from IndexedDB. */
async function getEncryptionKey(): Promise<CryptoKey> {
  const stored = await getSetting(ENC_KEY_NAME);
  if (stored) {
    const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', raw, ENC_ALGO, false, ['encrypt', 'decrypt']);
  }
  // Generate new key on first use
  const key = await crypto.subtle.generateKey(
    { name: ENC_ALGO, length: KEY_LENGTH },
    true, // extractable so we can persist
    ['encrypt', 'decrypt'],
  );
  const exported = await crypto.subtle.exportKey('raw', key);
  await setSetting(ENC_KEY_NAME, btoa(String.fromCharCode(...new Uint8Array(exported))));
  // Re-import as non-extractable for runtime use
  return crypto.subtle.importKey('raw', exported, ENC_ALGO, false, ['encrypt', 'decrypt']);
}

/** Encrypt a plaintext string → base64(iv + ciphertext). */
export async function encryptApiKey(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: ENC_ALGO, iv }, key, encoded);
  // Concatenate iv + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

/** Decrypt base64(iv + ciphertext) → plaintext string. */
export async function decryptApiKey(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: ENC_ALGO, iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

/* ─── Provider Registry ─── */

const providers = new Map<string, ExternalProvider>();

export function registerProvider(provider: ExternalProvider): void {
  providers.set(provider.id, provider);
}

export function getProvider(id: string): ExternalProvider | undefined {
  return providers.get(id);
}

export function getAllProviders(): ExternalProvider[] {
  return Array.from(providers.values());
}

/* ─── Credential Management ─── */

export async function saveApiKey(providerId: string, apiKey: string): Promise<void> {
  const encrypted = await encryptApiKey(apiKey);
  await setSetting(`llm-key-${providerId}`, encrypted);
}

export async function loadApiKey(providerId: string): Promise<string | null> {
  const encrypted = await getSetting(`llm-key-${providerId}`);
  if (!encrypted) return null;
  try {
    return await decryptApiKey(encrypted);
  } catch {
    return null;
  }
}

export async function deleteApiKey(providerId: string): Promise<void> {
  await setSetting(`llm-key-${providerId}`, '');
}

/** Get the saved model preference for a provider. */
export async function getProviderModel(providerId: string): Promise<string | null> {
  return (await getSetting(`llm-model-${providerId}`)) || null;
}

/** Save model preference for a provider. */
export async function setProviderModel(providerId: string, modelId: string): Promise<void> {
  await setSetting(`llm-model-${providerId}`, modelId);
}
