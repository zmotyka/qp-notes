/* ═══════════════════════════════════════════════════════════
   LLM Engine — In-browser inference via WebLLM
   @mlc-ai/web-llm is loaded lazily on first use so the 6 MB
   bundle is NOT downloaded until the user actually needs local AI.
   ═══════════════════════════════════════════════════════════ */

// Type-only imports are erased by tsc — no bundle cost.
import type { InitProgressReport, ChatCompletionChunk, AppConfig, ModelRecord } from '@mlc-ai/web-llm';
import type { ChatMessage } from './provider';

/* ─── Types ─── */

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  sizeMB: number;
  family: string;
  lowResource: boolean;
  cached: boolean;
}

export interface LLMProgress {
  text: string;
  progress: number; // 0‥1
}

export type ProgressCallback = (p: LLMProgress) => void;
export type TokenCallback = (token: string, full: string) => void;

export type LLMStatus = 'idle' | 'loading' | 'ready' | 'generating' | 'error';
export type StatusListener = (status: LLMStatus, detail?: string) => void;

/* ─── Minimal engine interface (avoids importing MLCEngine type statically) ─── */

interface MLCEngineInstance {
  unload(): Promise<void>;
  interruptGenerate(): void;
  chat: {
    completions: {
      create(params: Record<string, unknown>): unknown;
    };
  };
}

/* ─── Lazy WebLLM loader ─── */

type WebLLMModule = typeof import('@mlc-ai/web-llm');
let _webllm: WebLLMModule | null = null;
let _engineConfigCache: {
  mirroredWithHfMirror: AppConfig;
  originalWithHfMirror: AppConfig;
  mirrored: AppConfig;
  original: AppConfig;
} | null = null;

const ASSET_ENDPOINT_PROBES: { host: string; url: string }[] = [
  { host: 'huggingface.co', url: 'https://huggingface.co/' },
  { host: 'hf-mirror.com', url: 'https://hf-mirror.com/' },
  { host: 'cdn.jsdelivr.net', url: 'https://cdn.jsdelivr.net/' },
  { host: 'raw.githubusercontent.com', url: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/README.md' },
];

async function canReachEndpoint(url: string, timeoutMs = 6000): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // no-cors allows us to detect hard network failures without requiring CORS headers.
    await fetch(url, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function detectBlockedAssetHosts(): Promise<string[]> {
  try {
    const checks = await Promise.all(
      ASSET_ENDPOINT_PROBES.map(async (probe) => {
        try {
          return {
            host: probe.host,
            ok: await canReachEndpoint(probe.url),
          };
        } catch (err) {
          console.warn(`Asset endpoint check failed for ${probe.host}:`, err);
          return { host: probe.host, ok: false };
        }
      }),
    );

    return checks.filter((check) => !check.ok).map((check) => check.host);
  } catch (err) {
    console.warn('detectBlockedAssetHosts failed:', err);
    return [];
  }
}

async function getWebLLM(): Promise<WebLLMModule> {
  if (!_webllm) {
    console.log('[LLM] Dynamically importing @mlc-ai/web-llm...');
    try {
      _webllm = await import('@mlc-ai/web-llm');
      console.log('[LLM] WebLLM module imported successfully');
    } catch (err) {
      console.error('[LLM] Failed to import WebLLM:', err);
      throw err;
    }
  }
  return _webllm;
}

function toJsDelivrModelLib(url: string): string {
  const source = 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/';
  const mirror = 'https://cdn.jsdelivr.net/gh/mlc-ai/binary-mlc-llm-libs@main/';
  return url.startsWith(source) ? url.replace(source, mirror) : url;
}

function replaceKnownModelHosts(value: string): string {
  return value
    .replaceAll('https://huggingface.co/', 'https://hf-mirror.com/')
    .replaceAll('https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/', 'https://cdn.jsdelivr.net/gh/mlc-ai/binary-mlc-llm-libs@main/');
}

function withHostMirrors(record: ModelRecord, useModelLibMirror: boolean): ModelRecord {
  try {
    const transformed = JSON.parse(
      replaceKnownModelHosts(JSON.stringify(record)),
    ) as ModelRecord;

    if (!transformed || !transformed.model_lib) {
      return record;
    }

    return {
      ...transformed,
      model_lib: useModelLibMirror
        ? toJsDelivrModelLib(transformed.model_lib)
        : transformed.model_lib,
    };
  } catch (err) {
    console.warn('Failed to apply host mirrors to model record', err);
    return record;
  }
}

async function getEngineAppConfigs(): Promise<{
  mirroredWithHfMirror: AppConfig;
  originalWithHfMirror: AppConfig;
  mirrored: AppConfig;
  original: AppConfig;
}> {
  if (_engineConfigCache) return _engineConfigCache;

  const { prebuiltAppConfig } = await getWebLLM();
  
  if (!prebuiltAppConfig || !prebuiltAppConfig.model_list || !Array.isArray(prebuiltAppConfig.model_list)) {
    throw new Error('WebLLM prebuiltAppConfig is invalid or missing model_list');
  }

  const modelMap = new Map(
    prebuiltAppConfig.model_list
      .filter((record) => record && record.model_id)
      .map((record) => [record.model_id, record])
  );

  const originalModelList: ModelRecord[] = [];
  const mirroredModelList: ModelRecord[] = [];
  const originalWithHfMirrorModelList: ModelRecord[] = [];
  const mirroredWithHfMirrorModelList: ModelRecord[] = [];

  // First try to find curated models
  for (const curated of CURATED_MODELS) {
    const found = modelMap.get(curated.id);
    if (!found) {
      console.warn(`Curated model not found in WebLLM catalog: ${curated.id}`);
      continue;
    }

    originalModelList.push(found);
    mirroredModelList.push({ ...found, model_lib: toJsDelivrModelLib(found.model_lib) });
    originalWithHfMirrorModelList.push(withHostMirrors(found, false));
    mirroredWithHfMirrorModelList.push(withHostMirrors(found, true));
  }

  // If no curated models found, use all available models as fallback
  if (originalModelList.length === 0) {
    console.warn('No curated models found; falling back to all available models from WebLLM');
    for (const record of prebuiltAppConfig.model_list) {
      if (!record || !record.model_id) continue;
      originalModelList.push(record);
      mirroredModelList.push({ ...record, model_lib: toJsDelivrModelLib(record.model_lib) });
      originalWithHfMirrorModelList.push(withHostMirrors(record, false));
      mirroredWithHfMirrorModelList.push(withHostMirrors(record, true));
    }
  }

  if (originalModelList.length === 0) {
    throw new Error('No models available from WebLLM after fallback');
  }

  _engineConfigCache = {
    mirroredWithHfMirror: {
      ...prebuiltAppConfig,
      useIndexedDBCache: true,
      model_list: mirroredWithHfMirrorModelList,
    },
    originalWithHfMirror: {
      ...prebuiltAppConfig,
      useIndexedDBCache: true,
      model_list: originalWithHfMirrorModelList,
    },
    original: {
      ...prebuiltAppConfig,
      useIndexedDBCache: true,
      model_list: originalModelList,
    },
    mirrored: {
      ...prebuiltAppConfig,
      useIndexedDBCache: true,
      model_list: mirroredModelList,
    },
  };

  console.log(`WebLLM engine configured with ${originalModelList.length} models`);
  return _engineConfigCache;
}

/* ─── Curated model catalog ─── */

/** Subset of prebuilt models suitable for note-taking tasks. */
const CURATED_MODELS: {
  id: string; name: string; description: string; sizeMB: number; family: string;
}[] = [
  {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    name: 'Phi‑3.5 Mini (3.8 B)',
    description: 'Microsoft — fast, capable for summarization & analysis',
    sizeMB: 2300,
    family: 'phi',
  },
  {
    id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.1 8B',
    description: 'Meta — strong general-purpose reasoning',
    sizeMB: 4600,
    family: 'llama',
  },
  {
    id: 'gemma-2-2b-it-q4f16_1-MLC',
    name: 'Gemma 2 2B',
    description: 'Google — lightweight, quick responses',
    sizeMB: 1400,
    family: 'gemma',
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 1.5B',
    description: 'Alibaba — smallest option, runs on low-end devices',
    sizeMB: 1000,
    family: 'qwen',
  },
  {
    id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 1.7B',
    description: 'HuggingFace — ultra-compact, good for basic tasks',
    sizeMB: 1100,
    family: 'smollm',
  },
  {
    id: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC',
    name: 'TinyLlama 1.1B',
    description: 'Community — minimal footprint, basic summarization',
    sizeMB: 680,
    family: 'tinyllama',
  },
];

/* ─── WebGPU Detection ─── */

export interface GPUInfo {
  supported: boolean;
  vendor: string;
  fallbackWasm: boolean;
}

export async function detectWebGPU(): Promise<GPUInfo> {
  if (!navigator.gpu) {
    return { supported: false, vendor: 'none', fallbackWasm: true };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return { supported: false, vendor: 'unknown', fallbackWasm: true };
    }
    const info = adapter.info;
    return {
      supported: true,
      vendor: info?.vendor || 'unknown',
      fallbackWasm: false,
    };
  } catch {
    return { supported: false, vendor: 'error', fallbackWasm: true };
  }
}

/* ─── LLM Engine Wrapper ─── */

class LLMEngineWrapper {
  private engine: MLCEngineInstance | null = null;
  private currentModelId: string | null = null;
  private status: LLMStatus = 'idle';
  private statusListeners: StatusListener[] = [];
  private abortController: AbortController | null = null;
  private pendingLoadPromise: Promise<void> | null = null;
  private pendingLoadModelId: string | null = null;

  onStatusChange(listener: StatusListener): void {
    this.statusListeners.push(listener);
  }

  private setStatus(s: LLMStatus, detail?: string): void {
    this.status = s;
    this.statusListeners.forEach(fn => fn(s, detail));
  }

  getStatus(): LLMStatus { return this.status; }
  getLoadedModelId(): string | null { return this.currentModelId; }

  /** Get curated model catalog with cache status. Triggers WebLLM load. */
  async getModelCatalog(): Promise<ModelInfo[]> {
    const { hasModelInCache } = await getWebLLM();
    const { original } = await getEngineAppConfigs();
    const prebuiltIds = new Set(original.model_list.map(m => m.model_id));

    const catalog: ModelInfo[] = [];
    
    // Try curated models first
    const foundCurated = new Set<string>();
    for (const m of CURATED_MODELS) {
      if (!prebuiltIds.has(m.id)) continue;
      foundCurated.add(m.id);
      const cached = await hasModelInCache(m.id, original).catch(() => false);
      catalog.push({
        id: m.id,
        name: m.name,
        description: m.description,
        sizeMB: m.sizeMB,
        family: m.family,
        lowResource: m.sizeMB < 1500,
        cached,
      });
    }

    // If no curated models found, fall back to all available models
    if (catalog.length === 0) {
      console.warn('No curated models found; listing all available models');
      for (const record of original.model_list) {
        if (!record || !record.model_id) continue;
        const cached = await hasModelInCache(record.model_id, original).catch(() => false);
        catalog.push({
          id: record.model_id,
          name: record.model_id.split('-')[0], // Extract model name from ID
          description: `Available from WebLLM (${(record.model_lib || '').split('/').pop() || 'unknown'})`,
          sizeMB: 2000, // Rough estimate
          family: 'unknown',
          lowResource: false,
          cached,
        });
      }
    }

    return catalog;
  }

  /** Load a model. Downloads if not cached. Triggers WebLLM load. */
  async loadModel(modelId: string, onProgress?: ProgressCallback): Promise<void> {
    console.log(`[LLM] Loading model: ${modelId}`);
    
    if (this.currentModelId === modelId && this.engine) {
      console.log(`[LLM] Model ${modelId} already loaded`);
      this.setStatus('ready', modelId);
      return;
    }

    if (this.pendingLoadPromise) {
      if (this.pendingLoadModelId === modelId) {
        console.log(`[LLM] Model load already in progress for ${modelId}`);
        return this.pendingLoadPromise;
      }
      try {
        await this.pendingLoadPromise;
      } catch {
        // Ignore prior load failure and continue with the new request.
      }
    }

    this.pendingLoadModelId = modelId;
    const runLoad = (async () => {
      if (this.engine) {
        await this.unload();
      }

      this.setStatus('loading', modelId);

      try {
        const { CreateMLCEngine } = await getWebLLM();
        console.log(`[LLM] WebLLM module loaded, getting engine configs...`);
        
        const appConfigs = await getEngineAppConfigs();
        console.log(`[LLM] Engine configs prepared:`, {
          originalModels: appConfigs.original.model_list.length,
          mirroredModels: appConfigs.mirrored.model_list.length,
        });
        
        const initProgressCallback = (report: InitProgressReport) => {
          console.log(`[LLM] Init progress: ${report.text} (${(report.progress * 100).toFixed(1)}%)`);
          onProgress?.({
            text: report.text,
            progress: report.progress,
          });
        };

        // Prefer official sources first. Mirror-host attempts come last because
        // some regions/proxies return HTML challenge pages that can poison cache.
        const attempts: AppConfig[] = [
          appConfigs.original,
          appConfigs.mirrored,
          appConfigs.originalWithHfMirror,
          appConfigs.mirroredWithHfMirror,
        ];

        const { deleteModelAllInfoInCache } = await getWebLLM();

        let lastAttemptError: unknown = null;
        for (let i = 0; i < attempts.length; i++) {
          try {
            const appConfig = attempts[i];
            console.log(`[LLM] Attempt ${i + 1}: Creating engine with ${appConfig.model_list.length} models...`);
            
            this.engine = await CreateMLCEngine(modelId, {
              appConfig,
              initProgressCallback,
            }) as unknown as MLCEngineInstance;
            
            console.log(`[LLM] Engine created successfully`);
            lastAttemptError = null;
            break;
          } catch (attemptErr) {
            console.error(`[LLM] Attempt ${i + 1} failed:`, attemptErr);
            lastAttemptError = attemptErr;
            // Remove partial/corrupted artifacts before the next attempt.
            await deleteModelAllInfoInCache(modelId, appConfigs.original).catch(() => undefined);
          }
        }

        if (!this.engine) {
          throw (lastAttemptError ?? new Error('Unable to initialize WebLLM engine'));
        }

        this.currentModelId = modelId;
        this.setStatus('ready', modelId);
        console.log(`[LLM] Model ${modelId} ready`);
      } catch (err) {
        this.engine = null;
        this.currentModelId = null;
        const rawMsg = err instanceof Error ? err.message : 'Failed to load model';
        let msg = rawMsg;
        console.error(`[LLM] Load error:`, rawMsg);
        
        if (/failed to fetch|networkerror|network error/i.test(rawMsg)) {
          const blockedHosts = await detectBlockedAssetHosts().catch(() => []);
          msg = blockedHosts.length > 0
            ? `Failed to fetch model assets. Unreachable host(s): ${blockedHosts.join(', ')}. Check network/firewall allowlist.`
            : 'Failed to fetch model assets. Check network/firewall and allow huggingface.co or hf-mirror.com, plus cdn.jsdelivr.net and raw.githubusercontent.com. If this persists, delete the cached model and reload it.';
        }
        this.setStatus('error', msg);
        throw new Error(msg, { cause: err instanceof Error ? err : undefined });
      }
    })();

    this.pendingLoadPromise = runLoad;

    try {
      await runLoad;
    } finally {
      if (this.pendingLoadPromise === runLoad) {
        this.pendingLoadPromise = null;
        this.pendingLoadModelId = null;
      }
    }
  }

  /** Unload current model, free GPU memory. */
  async unload(): Promise<void> {
    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
    }
    this.currentModelId = null;
    this.setStatus('idle');
  }

  /** Delete a cached model from storage. */
  async deleteModel(modelId: string): Promise<void> {
    const { deleteModelAllInfoInCache } = await getWebLLM();
    const { original } = await getEngineAppConfigs();
    await deleteModelAllInfoInCache(modelId, original);
  }

  /** Non-streaming chat completion. */
  async chatComplete(
    messages: ChatMessage[],
    opts?: { maxTokens?: number; temperature?: number },
  ): Promise<string> {
    if (!this.engine) throw new Error('No model loaded');
    this.setStatus('generating');

    try {
      const response = await this.engine.chat.completions.create({
        messages,
        max_tokens: opts?.maxTokens ?? 1024,
        temperature: opts?.temperature ?? 0.7,
        stream: false,
      }) as { choices: { message: { content: string } }[] };
      this.setStatus('ready', this.currentModelId!);
      return response.choices[0]?.message?.content || '';
    } catch (err) {
      this.setStatus('error', err instanceof Error ? err.message : 'Generation failed');
      throw err;
    }
  }

  /** Streaming chat completion — calls onToken for each token, returns full response. */
  async chatCompleteStream(
    messages: ChatMessage[],
    onToken: TokenCallback,
    opts?: { maxTokens?: number; temperature?: number },
  ): Promise<string> {
    if (!this.engine) throw new Error('No model loaded');
    this.setStatus('generating');
    this.abortController = new AbortController();

    let fullText = '';

    try {
      const stream = await this.engine.chat.completions.create({
        messages,
        max_tokens: opts?.maxTokens ?? 1024,
        temperature: opts?.temperature ?? 0.7,
        stream: true,
        stream_options: { include_usage: true },
      }) as AsyncIterable<ChatCompletionChunk>;

      for await (const chunk of stream) {
        if (this.abortController.signal.aborted) break;
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          onToken(delta, fullText);
        }
      }

      this.setStatus('ready', this.currentModelId!);
      return fullText;
    } catch (err) {
      if (this.abortController.signal.aborted) {
        this.setStatus('ready', this.currentModelId!);
        return fullText;
      }
      this.setStatus('error', err instanceof Error ? err.message : 'Generation failed');
      throw err;
    } finally {
      this.abortController = null;
    }
  }

  /** Abort current generation. */
  abort(): void {
    this.abortController?.abort();
    if (this.engine) {
      this.engine.interruptGenerate();
    }
  }

  /** Check if a model is cached without loading WebLLM module. */
  async isModelCached(modelId: string): Promise<boolean> {
    const { hasModelInCache } = await getWebLLM();
    const { original } = await getEngineAppConfigs();
    return hasModelInCache(modelId, original).catch(() => false);
  }
}

export const llmEngine = new LLMEngineWrapper();
