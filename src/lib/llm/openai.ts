/* ═══════════════════════════════════════════════════════════
   OpenAI Provider — GPT-4o, GPT-4o-mini
   ═══════════════════════════════════════════════════════════ */

import type { ExternalProvider, ExternalModel, ChatMessage, StreamCallbacks } from './provider';

const OPENAI_MODELS: ExternalModel[] = [
  { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000 },
];

export const openaiProvider: ExternalProvider = {
  id: 'openai',
  name: 'OpenAI',
  models: OPENAI_MODELS,

  async validate(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return res.ok;
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
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        max_tokens: opts?.maxTokens ?? 1024,
        temperature: opts?.temperature ?? 0.7,
        stream: true,
      }),
      signal: callbacks.signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`OpenAI error ${res.status}: ${err}`);
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
      buffer = lines.pop()!; // keep incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            callbacks.onToken(delta, full);
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    return full;
  },
};
