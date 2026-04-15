/* ═══════════════════════════════════════════════════════════
   Dropbox Provider — OAuth 2.0 PKCE + Dropbox API v2
   ═══════════════════════════════════════════════════════════ */

import {
  type CloudProvider, type CloudFile, type CloudFolder, type AuthTokens,
  type ProviderStatus, type StatusListener,
  generateCodeVerifier, generateCodeChallenge,
  storeTokens, getStoredTokens, clearStoredTokens,
} from './provider';

const AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const API_BASE = 'https://api.dropboxapi.com/2';
const CONTENT_BASE = 'https://content.dropboxapi.com/2';
const APP_FOLDER = '/Zed Note';

export class DropboxProvider implements CloudProvider {
  readonly name = 'Dropbox';
  readonly id = 'dropbox' as const;

  status: ProviderStatus = 'disconnected';
  private tokens: AuthTokens | null = null;
  private clientId: string;
  private redirectUri: string;
  private listeners: StatusListener[] = [];

  constructor(clientId: string, redirectUri?: string) {
    this.clientId = clientId;
    this.redirectUri = redirectUri || `${window.location.origin}/auth/callback`;
  }

  onStatusChange(listener: StatusListener): void {
    this.listeners.push(listener);
  }

  private setStatus(s: ProviderStatus): void {
    this.status = s;
    this.listeners.forEach(fn => fn(s));
  }

  async init(): Promise<void> {
    this.tokens = await getStoredTokens(this.id);
    if (this.tokens && this.tokens.expiresAt > Date.now()) {
      this.setStatus('connected');
    } else if (this.tokens?.refreshToken) {
      try { await this.refreshAuth(); } catch { this.setStatus('disconnected'); }
    }
  }

  isAuthenticated(): boolean {
    return !!this.tokens && this.tokens.expiresAt > Date.now();
  }

  async authorize(): Promise<void> {
    this.setStatus('connecting');
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = crypto.randomUUID();

    sessionStorage.setItem('pkce_verifier', verifier);
    sessionStorage.setItem('pkce_state', state);

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      token_access_type: 'offline',
    });

    const popup = window.open(`${AUTH_URL}?${params}`, 'dropbox-auth', 'width=500,height=600');
    if (!popup) { this.setStatus('error'); throw new Error('Popup blocked'); }

    const code = await this.waitForAuthCode(popup, state);
    await this.exchangeCode(code, verifier);
  }

  private waitForAuthCode(popup: Window, expectedState: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        try {
          if (popup.closed) { clearInterval(interval); reject(new Error('Auth popup closed')); return; }
          const url = new URL(popup.location.href);
          if (url.origin === window.location.origin) {
            clearInterval(interval);
            popup.close();
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');
            const error = url.searchParams.get('error');
            if (error) { reject(new Error(`Auth failed: ${error}`)); return; }
            if (state !== expectedState) { reject(new Error('State mismatch')); return; }
            if (!code) { reject(new Error('No code received')); return; }
            resolve(code);
          }
        } catch { /* cross-origin */ }
      }, 200);
    });
  }

  private async exchangeCode(code: string, verifier: string): Promise<void> {
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
      }),
    });

    if (!resp.ok) { this.setStatus('error'); throw new Error(`Token exchange failed: ${resp.status}`); }

    const data = await resp.json();
    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      expiresAt: Date.now() + (data.expires_in * 1000) - 60_000,
    };
    await storeTokens(this.id, this.tokens);
    this.setStatus('connected');
  }

  async refreshAuth(): Promise<void> {
    if (!this.tokens?.refreshToken) throw new Error('No refresh token');

    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        refresh_token: this.tokens.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!resp.ok) { this.setStatus('disconnected'); throw new Error(`Refresh failed: ${resp.status}`); }

    const data = await resp.json();
    this.tokens = {
      accessToken: data.access_token,
      refreshToken: this.tokens.refreshToken,
      expiresAt: Date.now() + (data.expires_in * 1000) - 60_000,
    };
    await storeTokens(this.id, this.tokens);
    this.setStatus('connected');
  }

  async disconnect(): Promise<void> {
    if (this.tokens?.accessToken) {
      try {
        await fetch(`${API_BASE}/auth/token/revoke`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.tokens.accessToken}` },
        });
      } catch { /* best-effort revoke */ }
    }
    this.tokens = null;
    await clearStoredTokens(this.id);
    this.setStatus('disconnected');
  }

  /* ─── API helpers ─── */

  private async apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.isAuthenticated() && this.tokens?.refreshToken) await this.refreshAuth();
    if (!this.tokens) throw new Error('Not authenticated');

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${this.tokens.accessToken}`);

    const resp = await fetch(url, { ...options, headers });

    if (resp.status === 401 && this.tokens.refreshToken) {
      await this.refreshAuth();
      headers.set('Authorization', `Bearer ${this.tokens!.accessToken}`);
      return fetch(url, { ...options, headers });
    }

    return resp;
  }

  private async rpc(endpoint: string, body: unknown): Promise<unknown> {
    const resp = await this.apiFetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (resp.status === 409) {
      const err = await resp.json();
      throw new Error(`Dropbox conflict: ${JSON.stringify(err)}`);
    }
    // Some endpoints return empty body (e.g. delete)
    const text = await resp.text();
    return text ? JSON.parse(text) : null;
  }

  /* ─── App Folder ─── */

  async ensureAppFolder(): Promise<string> {
    try {
      await this.rpc('/files/create_folder_v2', { path: APP_FOLDER, autorename: false });
    } catch {
      // Folder already exists — that's fine
    }
    return APP_FOLDER;
  }

  /* ─── File Operations ─── */

  async listFiles(folderId: string): Promise<CloudFile[]> {
    const data = await this.rpc('/files/list_folder', {
      path: folderId,
      recursive: false,
      include_deleted: false,
    }) as { entries: Record<string, unknown>[] };

    return (data.entries || [])
      .filter((e: Record<string, unknown>) => (e['.tag'] as string) === 'file')
      .map((e: Record<string, unknown>) => ({
        id: e.path_lower as string,
        name: e.name as string,
        mimeType: 'text/markdown',
        modified: new Date(e.server_modified as string).getTime(),
        revision: (e.rev as string) || '',
        size: (e.size as number) || 0,
      }));
  }

  async downloadFile(fileId: string): Promise<{ content: string; revision: string }> {
    const resp = await this.apiFetch(`${CONTENT_BASE}/files/download`, {
      method: 'POST',
      headers: { 'Dropbox-API-Arg': JSON.stringify({ path: fileId }) },
    });
    const content = await resp.text();
    const resultHeader = resp.headers.get('Dropbox-API-Result');
    const meta = resultHeader ? JSON.parse(resultHeader) : {};
    return { content, revision: meta.rev || '' };
  }

  async uploadFile(folderId: string, name: string, content: string): Promise<CloudFile> {
    const path = `${folderId}/${name}`;
    const resp = await this.apiFetch(`${CONTENT_BASE}/files/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
          path,
          mode: 'add',
          autorename: true,
          mute: false,
        }),
      },
      body: content,
    });
    const f = await resp.json();
    return {
      id: f.path_lower,
      name: f.name,
      mimeType: 'text/markdown',
      modified: new Date(f.server_modified).getTime(),
      revision: f.rev || '',
      size: f.size || 0,
    };
  }

  async updateFile(fileId: string, content: string, expectedRevision: string | null): Promise<CloudFile> {
    const mode = expectedRevision
      ? { '.tag': 'update', update: expectedRevision }
      : { '.tag': 'overwrite' };

    const resp = await this.apiFetch(`${CONTENT_BASE}/files/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path: fileId, mode, mute: false }),
      },
      body: content,
    });
    const f = await resp.json();
    return {
      id: f.path_lower,
      name: f.name,
      mimeType: 'text/markdown',
      modified: new Date(f.server_modified).getTime(),
      revision: f.rev || '',
      size: f.size || 0,
    };
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.rpc('/files/delete_v2', { path: fileId });
  }

  async createFolder(parentId: string, name: string): Promise<CloudFolder> {
    const path = `${parentId}/${name}`;
    const result = await this.rpc('/files/create_folder_v2', { path, autorename: false }) as { metadata: Record<string, string> };
    return {
      id: result.metadata.path_lower,
      name: result.metadata.name,
      parentId,
    };
  }

  async listFolders(parentId: string): Promise<CloudFolder[]> {
    const data = await this.rpc('/files/list_folder', {
      path: parentId,
      recursive: false,
      include_deleted: false,
    }) as { entries: Record<string, unknown>[] };

    return (data.entries || [])
      .filter((e: Record<string, unknown>) => (e['.tag'] as string) === 'folder')
      .map((e: Record<string, unknown>) => ({
        id: e.path_lower as string,
        name: e.name as string,
        parentId,
      }));
  }

  async deleteFolder(folderId: string): Promise<void> {
    await this.rpc('/files/delete_v2', { path: folderId });
  }
}
