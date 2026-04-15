/* ═══════════════════════════════════════════════════════════
   OneDrive Provider — OAuth 2.0 PKCE + Microsoft Graph API
   ═══════════════════════════════════════════════════════════ */

import {
  type CloudProvider, type CloudFile, type CloudFolder, type AuthTokens,
  type ProviderStatus, type StatusListener,
  generateCodeVerifier, generateCodeChallenge,
  storeTokens, getStoredTokens, clearStoredTokens,
} from './provider';

const AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'Files.ReadWrite.AppFolder offline_access';
const APP_FOLDER_NAME = 'Zed Note';

export class OneDriveProvider implements CloudProvider {
  readonly name = 'OneDrive';
  readonly id = 'onedrive' as const;

  status: ProviderStatus = 'disconnected';
  private tokens: AuthTokens | null = null;
  private clientId: string;
  private redirectUri: string;
  private listeners: StatusListener[] = [];
  private appFolderId: string | null = null;

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
      scope: SCOPES,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      response_mode: 'query',
    });

    const popup = window.open(`${AUTH_URL}?${params}`, 'onedrive-auth', 'width=500,height=600');
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
        } catch { /* cross-origin — keep polling */ }
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

    if (!resp.ok) { this.setStatus('disconnected'); throw new Error(`Token refresh failed: ${resp.status}`); }

    const data = await resp.json();
    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || this.tokens.refreshToken,
      expiresAt: Date.now() + (data.expires_in * 1000) - 60_000,
    };
    await storeTokens(this.id, this.tokens);
    this.setStatus('connected');
  }

  async disconnect(): Promise<void> {
    this.tokens = null;
    this.appFolderId = null;
    await clearStoredTokens(this.id);
    this.setStatus('disconnected');
  }

  /* ─── Graph API fetch ─── */

  private async graphFetch(path: string, options: RequestInit = {}): Promise<Response> {
    if (!this.isAuthenticated() && this.tokens?.refreshToken) await this.refreshAuth();
    if (!this.tokens) throw new Error('Not authenticated');

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${this.tokens.accessToken}`);

    const resp = await fetch(`${GRAPH_BASE}${path}`, { ...options, headers });

    if (resp.status === 401 && this.tokens.refreshToken) {
      await this.refreshAuth();
      headers.set('Authorization', `Bearer ${this.tokens!.accessToken}`);
      return fetch(`${GRAPH_BASE}${path}`, { ...options, headers });
    }

    return resp;
  }

  /* ─── App Folder ─── */

  async ensureAppFolder(): Promise<string> {
    if (this.appFolderId) return this.appFolderId;

    // Try to find existing folder
    const searchResp = await this.graphFetch(`/me/drive/root/children?$filter=name eq '${APP_FOLDER_NAME}'&$select=id,name`);
    const data = await searchResp.json();

    if (data.value?.length > 0) {
      this.appFolderId = data.value[0].id;
      return this.appFolderId!;
    }

    // Create folder
    const createResp = await this.graphFetch('/me/drive/root/children', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: APP_FOLDER_NAME,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      }),
    });
    const folder = await createResp.json();
    this.appFolderId = folder.id;
    return this.appFolderId!;
  }

  /* ─── File Operations ─── */

  async listFiles(folderId: string): Promise<CloudFile[]> {
    const resp = await this.graphFetch(`/me/drive/items/${folderId}/children?$filter=file ne null&$select=id,name,file,lastModifiedDateTime,size,eTag&$top=1000`);
    const data = await resp.json();
    return (data.value || []).map((f: Record<string, unknown>) => ({
      id: f.id as string,
      name: f.name as string,
      mimeType: (f.file as Record<string, string>)?.mimeType || 'text/markdown',
      modified: new Date(f.lastModifiedDateTime as string).getTime(),
      revision: (f.eTag as string) || '',
      size: (f.size as number) || 0,
    }));
  }

  async downloadFile(fileId: string): Promise<{ content: string; revision: string }> {
    // Get content
    const resp = await this.graphFetch(`/me/drive/items/${fileId}/content`);
    const content = await resp.text();

    // Get eTag
    const metaResp = await this.graphFetch(`/me/drive/items/${fileId}?$select=eTag`);
    const meta = await metaResp.json();

    return { content, revision: meta.eTag || '' };
  }

  async uploadFile(folderId: string, name: string, content: string): Promise<CloudFile> {
    const resp = await this.graphFetch(`/me/drive/items/${folderId}:/${encodeURIComponent(name)}:/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/markdown' },
      body: content,
    });
    const f = await resp.json();
    return {
      id: f.id,
      name: f.name,
      mimeType: f.file?.mimeType || 'text/markdown',
      modified: new Date(f.lastModifiedDateTime).getTime(),
      revision: f.eTag || '',
      size: f.size || 0,
    };
  }

  async updateFile(fileId: string, content: string, expectedRevision: string | null): Promise<CloudFile> {
    const headers: Record<string, string> = { 'Content-Type': 'text/markdown' };
    if (expectedRevision) headers['If-Match'] = expectedRevision;

    const resp = await this.graphFetch(`/me/drive/items/${fileId}/content`, {
      method: 'PUT',
      headers,
      body: content,
    });
    const f = await resp.json();
    return {
      id: f.id,
      name: f.name,
      mimeType: f.file?.mimeType || 'text/markdown',
      modified: new Date(f.lastModifiedDateTime).getTime(),
      revision: f.eTag || '',
      size: f.size || 0,
    };
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.graphFetch(`/me/drive/items/${fileId}`, { method: 'DELETE' });
  }

  async createFolder(parentId: string, name: string): Promise<CloudFolder> {
    const resp = await this.graphFetch(`/me/drive/items/${parentId}/children`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    });
    const f = await resp.json();
    return { id: f.id, name: f.name, parentId };
  }

  async listFolders(parentId: string): Promise<CloudFolder[]> {
    const resp = await this.graphFetch(`/me/drive/items/${parentId}/children?$filter=folder ne null&$select=id,name`);
    const data = await resp.json();
    return (data.value || []).map((f: Record<string, string>) => ({
      id: f.id,
      name: f.name,
      parentId,
    }));
  }

  async deleteFolder(folderId: string): Promise<void> {
    await this.graphFetch(`/me/drive/items/${folderId}`, { method: 'DELETE' });
  }
}
