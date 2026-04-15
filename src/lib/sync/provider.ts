/* ═══════════════════════════════════════════════════════════
   Cloud Storage Provider — Abstract Interface
   ═══════════════════════════════════════════════════════════ */

/** Represents a file stored on a cloud provider */
export interface CloudFile {
  id: string;            // provider-specific file ID
  name: string;          // filename (e.g. "my-note.md")
  mimeType: string;
  modified: number;      // timestamp ms
  revision: string;      // etag / revision string for conflict detection
  size: number;
}

/** Represents a folder on a cloud provider */
export interface CloudFolder {
  id: string;
  name: string;
  parentId: string | null;
}

/** Auth tokens returned by OAuth flow */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;     // timestamp ms
}

/** Status of the provider connection */
export type ProviderStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Listener for auth/status changes */
export type StatusListener = (status: ProviderStatus) => void;

/**
 * Abstract cloud storage provider.
 * All providers (Google Drive, OneDrive, Dropbox) implement this interface.
 */
export interface CloudProvider {
  readonly name: string;
  readonly id: 'google-drive' | 'onedrive' | 'dropbox';

  /** Current connection status */
  status: ProviderStatus;

  /** Register a status change listener */
  onStatusChange(listener: StatusListener): void;

  /** Initiate OAuth authorization (opens popup/redirect) */
  authorize(): Promise<void>;

  /** Sign out and clear tokens */
  disconnect(): Promise<void>;

  /** Check if we have valid (non-expired) tokens */
  isAuthenticated(): boolean;

  /** Refresh the access token using the refresh token */
  refreshAuth(): Promise<void>;

  /** Ensure the QP Notes app folder exists, return its ID */
  ensureAppFolder(): Promise<string>;

  /** List all files in the app folder */
  listFiles(folderId: string): Promise<CloudFile[]>;

  /** Download file content (markdown text) by file ID */
  downloadFile(fileId: string): Promise<{ content: string; revision: string }>;

  /** Upload/create a new file; returns the new CloudFile */
  uploadFile(folderId: string, name: string, content: string): Promise<CloudFile>;

  /** Update an existing file; returns updated CloudFile */
  updateFile(fileId: string, content: string, expectedRevision: string | null): Promise<CloudFile>;

  /** Delete a file */
  deleteFile(fileId: string): Promise<void>;

  /** Create a subfolder; returns CloudFolder */
  createFolder(parentId: string, name: string): Promise<CloudFolder>;

  /** List subfolders */
  listFolders(parentId: string): Promise<CloudFolder[]>;

  /** Delete a folder (must be empty or provider handles recursion) */
  deleteFolder(folderId: string): Promise<void>;
}

/* ─── PKCE helpers (shared by all providers) ─── */

/** Generate a cryptographically random code verifier */
export function generateCodeVerifier(length = 64): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(36).padStart(2, '0')).join('').slice(0, 128);
}

/** Derive SHA-256 code challenge from verifier (S256 method) */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Store tokens encrypted in settings */
export async function storeTokens(providerId: string, tokens: AuthTokens): Promise<void> {
  const { setSetting } = await import('../db');
  await setSetting(`sync_tokens_${providerId}`, JSON.stringify(tokens));
}

/** Retrieve stored tokens */
export async function getStoredTokens(providerId: string): Promise<AuthTokens | null> {
  const { getSetting } = await import('../db');
  const raw = await getSetting(`sync_tokens_${providerId}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Clear stored tokens */
export async function clearStoredTokens(providerId: string): Promise<void> {
  const { setSetting } = await import('../db');
  await setSetting(`sync_tokens_${providerId}`, '');
}
