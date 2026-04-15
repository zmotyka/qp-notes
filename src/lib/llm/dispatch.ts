/* ═══════════════════════════════════════════════════════════
   AI Dispatch — Unified interface over local + external LLMs
   with fallback chain support
   ═══════════════════════════════════════════════════════════ */

import { getSetting, setSetting } from '../db';
import { llmEngine, type TokenCallback } from './engine';
import {
  getProvider,
  getAllProviders,
  loadApiKey,
  getProviderModel,
  registerProvider,
  type ChatMessage,
} from './provider';
import { openaiProvider } from './openai';
import { anthropicProvider } from './anthropic';
import { geminiProvider } from './gemini';

/* ─── Register all external providers ─── */
registerProvider(openaiProvider);
registerProvider(anthropicProvider);
registerProvider(geminiProvider);

/* ─── Fallback Chain ─── */

export type FallbackEntry =
  | { type: 'external'; providerId: string }
  | { type: 'local' };

const DEFAULT_CHAIN: FallbackEntry[] = [{ type: 'local' }];

export async function getFallbackChain(): Promise<FallbackEntry[]> {
  const raw = await getSetting('llm-fallback-chain');
  if (!raw) return DEFAULT_CHAIN;
  try {
    return JSON.parse(raw) as FallbackEntry[];
  } catch {
    return DEFAULT_CHAIN;
  }
}

export async function setFallbackChain(chain: FallbackEntry[]): Promise<void> {
  await setSetting('llm-fallback-chain', JSON.stringify(chain));
}

/**
 * Build fallback chain from current configured providers.
 * Order: configured externals first (in provider registration order), then local.
 */
export async function buildAutoChain(): Promise<FallbackEntry[]> {
  const chain: FallbackEntry[] = [];
  for (const p of getAllProviders()) {
    const key = await loadApiKey(p.id);
    if (key) chain.push({ type: 'external', providerId: p.id });
  }
  chain.push({ type: 'local' });
  return chain;
}

/* ─── Active Provider Preference ─── */

export async function getActiveProvider(): Promise<string> {
  return (await getSetting('llm-active-provider')) || 'local';
}

export async function setActiveProvider(id: string): Promise<void> {
  await setSetting('llm-active-provider', id);
}

/* ─── Unified Chat Dispatch ─── */

export interface DispatchResult {
  text: string;
  provider: string; // which provider actually responded
}

/**
 * Send a chat request. Tries the active provider first,
 * then walks the fallback chain on failure.
 */
export async function dispatchChat(
  messages: ChatMessage[],
  onToken: TokenCallback,
  opts?: { maxTokens?: number; temperature?: number },
): Promise<DispatchResult> {
  const chain = await getFallbackChain();
  const activeId = await getActiveProvider();

  // Reorder chain: active provider first, then rest
  const ordered = [
    ...chain.filter(e => entryId(e) === activeId),
    ...chain.filter(e => entryId(e) !== activeId),
  ];

  let lastError: Error | null = null;

  for (const entry of ordered) {
    try {
      if (entry.type === 'local') {
        return await dispatchLocal(messages, onToken, opts);
      } else {
        return await dispatchExternal(entry.providerId, messages, onToken, opts);
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Continue to next in chain
    }
  }

  throw lastError ?? new Error('No LLM providers available');
}

function entryId(e: FallbackEntry): string {
  return e.type === 'local' ? 'local' : e.providerId;
}

async function dispatchLocal(
  messages: ChatMessage[],
  onToken: TokenCallback,
  opts?: { maxTokens?: number; temperature?: number },
): Promise<DispatchResult> {
  if (llmEngine.getStatus() !== 'ready') {
    throw new Error('Local model not loaded');
  }

  const text = await llmEngine.chatCompleteStream(messages, onToken, opts);
  return { text, provider: 'local' };
}

async function dispatchExternal(
  providerId: string,
  messages: ChatMessage[],
  onToken: TokenCallback,
  opts?: { maxTokens?: number; temperature?: number },
): Promise<DispatchResult> {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);

  const apiKey = await loadApiKey(providerId);
  if (!apiKey) throw new Error(`No API key for ${provider.name}`);

  const modelId = (await getProviderModel(providerId)) || provider.models[0].id;

  const abortController = new AbortController();
  // Store for external abort access
  _currentAbort = abortController;

  try {
    const text = await provider.chatStream(apiKey, modelId, messages, {
      onToken,
      signal: abortController.signal,
    }, opts);
    return { text, provider: providerId };
  } finally {
    _currentAbort = null;
  }
}

let _currentAbort: AbortController | null = null;

/** Abort current external generation. For local, delegates to llmEngine.abort(). */
export function abortGeneration(): void {
  _currentAbort?.abort();
  llmEngine.abort();
}

/* ─── Re-exports for convenience ─── */
export { getAllProviders, getProvider, loadApiKey, saveApiKey, deleteApiKey, getProviderModel, setProviderModel } from './provider';
