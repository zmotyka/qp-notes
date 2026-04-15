/* ═══════════════════════════════════════════════════════════
   Google Drive Provider — OAuth 2.0 PKCE + Drive v3 API
   ═══════════════════════════════════════════════════════════ */

import {
  type CloudProvider, type CloudFile, type CloudFolder, type AuthTokens,
  type ProviderStatus, type StatusListener,
  generateCodeVerifier, generateCodeChallenge,
  storeTokens, getStoredTokens, clearStoredTokens,
} from './provider';

const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const APP_FOLDER_NAME = 'Zed Note';

export class GoogleDriveProvider implements CloudProvider {
  readonly name = 'Google Drive';
  readonly id = 'google-drive' as const;

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

  /** Load persisted tokens on startup */
  async init(): Promise<void> {
    this.tokens = await getStoredTokens(this.id);
    if (this.tokens && this.tokens.expiresAt > Date.now()) {
      this.setStatus('connected');
    } else if (this.tokens?.refreshToken) {
      try {
        await this.refreshAuth();
      } catch {
        this.setStatus('disconnected');
      }
    }
  }

  isAuthenticated(): boolean {
    return !!this.tokens && this.tokens.expiresAt > Date.now();
  }

  /** OAuth 2.0 PKCE authorization via popup */
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
      access_type: 'offline',
      prompt: 'consent',
    });

    const popup = window.open(`${AUTH_URL}?${params}`, 'google-auth', 'width=500,height=600');
    if (!popup) {
      this.setStatus('error');
      throw new Error('Popup blocked — please allow popups for this site');
    }

    const code = await this.waitForAuthCode(popup, state);
    await this.exchangeCode(code, verifier);
  }

  /**
   * Accept an access token obtained externally (e.g. from Firebase Auth).
   * No refresh token is stored — user will need to reconnect after expiry.
   */
  async authorizeWithExternalToken(accessToken: string, expiresAt: number): Promise<void> {
    this.setStatus('connecting');
    this.tokens = { accessToken, refreshToken: null, expiresAt };
    await storeTokens(this.id, this.tokens);
    this.setStatus('connected');
  }
  private waitForAuthCode(popup: Window, expectedState: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(interval);
            reject(new Error('Auth popup closed'));
            return;
          }
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
        } catch {
          // Cross-origin — popup hasn't redirected yet, keep polling
        }
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

    if (!resp.ok) {
      this.setStatus('error');
      throw new Error(`Token exchange failed: ${resp.status}`);
    }

    const data = await resp.json();
    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      expiresAt: Date.now() + (data.expires_in * 1000) - 60_000, // 1 min early buffer
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

    if (!resp.ok) {
      this.setStatus('disconnected');
      throw new Error(`Token refresh failed: ${resp.status}`);
    }

    const data = await resp.json();
    this.tokens = {
      accessToken: data.access_token,
      refreshToken: this.tokens.refreshToken, // Google doesn't return new refresh token
      expiresAt: Date.now() + (data.expires_in * 1000) - 60_000,
    };
    await storeTokens(this.id, this.tokens);
    this.setStatus('connected');
  }

  async disconnect(): Promise<void> {
    if (this.tokens?.accessToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${this.tokens.accessToken}`, {
          method: 'POST',
        });
      } catch { /* best-effort revoke */ }
    }
    this.tokens = null;
    this.appFolderId = null;
    await clearStoredTokens(this.id);
    this.setStatus('disconnected');
  }

  /* ─── Authenticated fetch helper ─── */

  private async apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.isAuthenticated() && this.tokens?.refreshToken) {
      await this.refreshAuth();
    }
    if (!this.tokens) throw new Error('Not authenticated');

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${this.tokens.accessToken}`);

    const resp = await fetch(url, { ...options, headers });

    // Handle 401 — token expired mid-session
    if (resp.status === 401 && this.tokens.refreshToken) {
      await this.refreshAuth();
      headers.set('Authorization', `Bearer ${this.tokens!.accessToken}`);
      return fetch(url, { ...options, headers });
    }

    return resp;
  }

  /* ─── App Folder ─── */

  async ensureAppFolder(): Promise<string> {
    if (this.appFolderId) return this.appFolderId;

    // Search for existing folder
    const q = `name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const resp = await this.apiFetch(`${API_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
    const data = await resp.json();

    if (data.files?.length > 0) {
      this.appFolderId = data.files[0].id;
      return this.appFolderId!;
    }

    // Create folder
    const createResp = await this.apiFetch(`${API_BASE}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: APP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    const folder = await createResp.json();
    this.appFolderId = folder.id;
    return this.appFolderId!;
  }

  /* ─── File Operations ─── */

  async listFiles(folderId: string): Promise<CloudFile[]> {
    const q = `'${folderId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`;
    const fields = 'files(id,name,mimeType,modifiedTime,size,version)';
    const resp = await this.apiFetch(`${API_BASE}/files?q=${encodeURIComponent(q)}&fields=${fields}&pageSize=1000`);
    const data = await resp.json();

    return (data.files || []).map((f: Record<string, string>) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType || 'text/markdown',
      modified: new Date(f.modifiedTime).getTime(),
      revision: f.version || '',
      size: parseInt(f.size || '0', 10),
    }));
  }

  async downloadFile(fileId: string): Promise<{ content: string; revision: string }> {
    const resp = await this.apiFetch(`${API_BASE}/files/${fileId}?alt=media`);
    const content = await resp.text();

    // Get metadata for revision
    const metaResp = await this.apiFetch(`${API_BASE}/files/${fileId}?fields=version`);
    const meta = await metaResp.json();

    return { content, revision: meta.version || '' };
  }

  async uploadFile(folderId: string, name: string, content: string): Promise<CloudFile> {
    const metadata = {
      name,
      parents: [folderId],
      mimeType: 'text/markdown',
    };

    const boundary = '---qpnotes' + Date.now();
    const body = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`,
      `--${boundary}\r\nContent-Type: text/markdown\r\n\r\n${content}`,
      `--${boundary}--`,
    ].join('\r\n');

    const resp = await this.apiFetch(`${UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,version`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });

    const f = await resp.json();
    return {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modified: new Date(f.modifiedTime).getTime(),
      revision: f.version || '',
      size: parseInt(f.size || '0', 10),
    };
  }

  async updateFile(fileId: string, content: string, _expectedRevision: string | null): Promise<CloudFile> {
    const resp = await this.apiFetch(`${UPLOAD_BASE}/files/${fileId}?uploadType=media&fields=id,name,mimeType,modifiedTime,size,version`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'text/markdown' },
      body: content,
    });

    const f = await resp.json();
    return {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modified: new Date(f.modifiedTime).getTime(),
      revision: f.version || '',
      size: parseInt(f.size || '0', 10),
    };
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.apiFetch(`${API_BASE}/files/${fileId}`, { method: 'DELETE' });
  }

  async createFolder(parentId: string, name: string): Promise<CloudFolder> {
    const resp = await this.apiFetch(`${API_BASE}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        parents: [parentId],
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    const f = await resp.json();
    return { id: f.id, name: f.name, parentId };
  }

  async listFolders(parentId: string): Promise<CloudFolder[]> {
    const q = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const resp = await this.apiFetch(`${API_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
    const data = await resp.json();
    return (data.files || []).map((f: Record<string, string>) => ({
      id: f.id,
      name: f.name,
      parentId,
    }));
  }

  async deleteFolder(folderId: string): Promise<void> {
    await this.apiFetch(`${API_BASE}/files/${folderId}`, { method: 'DELETE' });
  }
}