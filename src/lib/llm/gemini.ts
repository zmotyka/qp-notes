/* ═══════════════════════════════════════════════════════════
   Google Gemini Provider — Gemini 1.5 Flash, Gemini 1.5 Pro
   ═══════════════════════════════════════════════════════════ */

import type { ExternalProvider, ExternalModel, ChatMessage, StreamCallbacks } from './provider';

const GEMINI_MODELS: ExternalModel[] = [
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', contextWindow: 1048576 },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextWindow: 2097152 },
];

function toGeminiContents(messages: ChatMessage[]): { contents: unknown[]; systemInstruction?: unknown } {
  const system = messages.find(m => m.role === 'system');
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  return {
    contents,
    ...(system ? { systemInstruction: { parts: [{ text: system.content }] } } : {}),
  };
}

export const geminiProvider: ExternalProvider = {
  id: 'gemini',
  name: 'Google Gemini',
  models: GEMINI_MODELS,

  async validate(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      );
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
    const { contents, systemInstruction } = toGeminiContents(messages);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        ...(systemInstruction ? { systemInstruction } : {}),
        generationConfig: {
          maxOutputTokens: opts?.maxTokens ?? 1024,
          temperature: opts?.temperature ?? 0.7,
        },
      }),
      signal: callbacks.signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Gemini error ${res.status}: ${err}`);
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
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            full += text;
            callbacks.onToken(text, full);
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    return full;
  },
};
