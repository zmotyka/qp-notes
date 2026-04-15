/* ═══════════════════════════════════════════════════════════
   Anthropic Provider — Claude 3.5 Sonnet, Claude 3 Haiku
   ═══════════════════════════════════════════════════════════ */

import type { ExternalProvider, ExternalModel, ChatMessage, StreamCallbacks } from './provider';

const ANTHROPIC_MODELS: ExternalModel[] = [
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindow: 200000 },
  { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', contextWindow: 200000 },
];

export const anthropicProvider: ExternalProvider = {
  id: 'anthropic',
  name: 'Anthropic',
  models: ANTHROPIC_MODELS,

  async validate(apiKey: string): Promise<boolean> {
    try {
      // Minimal request to test key validity
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      // 200 = valid, 401 = invalid key, 429 = rate limited but key is valid
      return res.ok || res.status === 429;
    } catch {
      return false;
    }
  },

  async chatStream(
    apiKey: string,
    modelId: string,
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    opts?,
  ): Promise<string> {
    // Anthropic separates system from messages
    const system = messages.find(m => m.role === 'system')?.content || '';
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: opts?.maxTokens ?? 1024,
        temperature: opts?.temperature ?? 0.7,
        system,
        messages: chatMessages,
        stream: true,
      }),
      signal: callbacks.signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Anthropic error ${res.status}: ${err}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop()!;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            full += parsed.delta.text;
            callbacks.onToken(parsed.delta.text, full);
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    return full;
  },
};
