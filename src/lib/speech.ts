/* ═══════════════════════════════════════════════════════════
   Speech Input & Transcription
   Web Speech API (online) · Whisper via Transformers.js (offline)
   ═══════════════════════════════════════════════════════════ */

/* ─── Types ─── */

export type SpeechBackend = 'webspeech' | 'whisper';

export interface SpeechOptions {
  lang?: string;
  backend?: SpeechBackend;
  continuous?: boolean;
}

export type TranscriptCallback = (text: string, isFinal: boolean) => void;
export type StatusCallback = (status: 'idle' | 'listening' | 'processing' | 'error', message?: string) => void;

/* ─── Web Speech API ─── */

let recognition: any | null = null;
let isListening = false;

export function isWebSpeechSupported(): boolean {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
}

export function startWebSpeech(
  onTranscript: TranscriptCallback,
  onStatus: StatusCallback,
  options: SpeechOptions = {},
): void {
  if (isListening) {
    stopSpeech();
    return;
  }

  const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    onStatus('error', 'Web Speech API not supported');
    return;
  }

  recognition = new SpeechRecognitionCtor();
  recognition.lang = options.lang || 'en-US';
  recognition.continuous = options.continuous ?? true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    onStatus('listening');
  };

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let interim = '';
    let final = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        final += transcript;
      } else {
        interim += transcript;
      }
    }

    if (final) onTranscript(final, true);
    if (interim) onTranscript(interim, false);
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === 'no-speech') return; // ignore, keep listening
    isListening = false;
    onStatus('error', `Speech error: ${event.error}`);
  };

  recognition.onend = () => {
    // Auto-restart in continuous mode
    if (isListening && options.continuous !== false) {
      try { recognition?.start(); } catch { /* already started */ }
    } else {
      isListening = false;
      onStatus('idle');
    }
  };

  recognition.start();
}

export function stopSpeech(): void {
  isListening = false;
  if (recognition) {
    recognition.onend = null;
    try { recognition.stop(); } catch { /* */ }
    recognition = null;
  }
}

export function getSpeechListening(): boolean {
  return isListening;
}

/* ─── Whisper Offline (via Transformers.js) ─── */

let whisperPipeline: any = null;

export async function loadWhisperModel(
  onProgress?: (pct: number, label: string) => void,
): Promise<boolean> {
  try {
    onProgress?.(5, 'Loading Transformers.js…');
    const { pipeline } = await import('@xenova/transformers' as any);
    onProgress?.(20, 'Downloading Whisper model…');
    whisperPipeline = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
      progress_callback: (p: { status: string; progress?: number }) => {
        if (p.progress !== undefined) {
          onProgress?.(20 + Math.round(p.progress * 0.7), `Model: ${Math.round(p.progress)}%`);
        }
      },
    });
    onProgress?.(100, 'Whisper ready');
    return true;
  } catch (err) {
    console.warn('Whisper load failed:', err);
    return false;
  }
}

export async function transcribeWithWhisper(audioBlob: Blob): Promise<string> {
  if (!whisperPipeline) throw new Error('Whisper model not loaded');
  const arrayBuffer = await audioBlob.arrayBuffer();
  const result = await whisperPipeline(new Float32Array(arrayBuffer));
  return result.text?.trim() || '';
}

export function isWhisperLoaded(): boolean {
  return whisperPipeline !== null;
}

/* ─── Audio Recording ─── */

let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];

export async function startRecording(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioChunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };
  mediaRecorder.start(250); // collect in 250ms chunks
}

export async function stopRecording(): Promise<Blob> {
  return new Promise((resolve) => {
    if (!mediaRecorder) { resolve(new Blob()); return; }
    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      audioChunks = [];
      // Stop all tracks
      mediaRecorder?.stream.getTracks().forEach(t => t.stop());
      mediaRecorder = null;
      resolve(blob);
    };
    mediaRecorder.stop();
  });
}

/* ─── Language Options ─── */

export const SPEECH_LANGUAGES = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'es-ES', label: 'Spanish' },
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
  { code: 'it-IT', label: 'Italian' },
  { code: 'pt-BR', label: 'Portuguese (BR)' },
  { code: 'ja-JP', label: 'Japanese' },
  { code: 'ko-KR', label: 'Korean' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
  { code: 'zh-TW', label: 'Chinese (Traditional)' },
  { code: 'ar-SA', label: 'Arabic' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'ru-RU', label: 'Russian' },
  { code: 'nl-NL', label: 'Dutch' },
  { code: 'pl-PL', label: 'Polish' },
  { code: 'sv-SE', label: 'Swedish' },
  { code: 'tr-TR', label: 'Turkish' },
  { code: 'uk-UA', label: 'Ukrainian' },
  { code: 'vi-VN', label: 'Vietnamese' },
] as const;
