import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { getFirebaseAuth } from './firebase';

export interface PasskeySupport {
  webauthn: boolean;
  platformAuthenticator: boolean;
}

interface AuthOptionsResponse {
  requestId: string;
  options: Record<string, unknown>;
}

interface VerifyAuthResponse {
  verified: boolean;
  customToken?: string;
  uid?: string;
  error?: string;
}

interface RegisterOptionsResponse {
  requestId: string;
  options: Record<string, unknown>;
}

interface VerifyRegisterResponse {
  verified: boolean;
  error?: string;
}

const PASSKEY_API_BASE = (import.meta.env.VITE_PASSKEY_API_BASE || '').trim().replace(/\/+$/, '');
const PASSKEY_FUNCTION_PATH_MAP: Record<string, string> = {
  '/api/passkey/register/options': '/registerOptions',
  '/api/passkey/register/verify': '/registerVerify',
  '/api/passkey/register/status': '/registerStatus',
  '/api/passkey/auth/options': '/authOptions',
  '/api/passkey/auth/verify': '/authVerify',
};

function isCloudFunctionsEndpointBase(base: string): boolean {
  return /cloudfunctions\.net$/i.test(base);
}

function passkeyApiUrl(path: string): string {
  if (!PASSKEY_API_BASE) return path;
  if (isCloudFunctionsEndpointBase(PASSKEY_API_BASE)) {
    const functionPath = PASSKEY_FUNCTION_PATH_MAP[path];
    return `${PASSKEY_API_BASE}${functionPath || path}`;
  }
  return `${PASSKEY_API_BASE}${path}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    const msg = (data as { error?: string }).error || `Request failed (${response.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function getPasskeySupport(): Promise<PasskeySupport> {
  const webauthn = browserSupportsWebAuthn();
  if (!webauthn) {
    return { webauthn: false, platformAuthenticator: false };
  }

  const platformAuthenticator = await platformAuthenticatorIsAvailable().catch(() => false);
  return { webauthn: true, platformAuthenticator };
}

export async function canUsePasskeySignIn(): Promise<boolean> {
  const support = await getPasskeySupport();
  return support.webauthn && support.platformAuthenticator;
}

export async function signInWithPasskeyFlow(): Promise<string> {
  const optionsRes = await fetchJson<AuthOptionsResponse>(passkeyApiUrl('/api/passkey/auth/options'), {
    method: 'POST',
    body: JSON.stringify({}),
  });

  const authResponse = await startAuthentication({
    optionsJSON: optionsRes.options as any,
    useBrowserAutofill: true,
  });

  const verifyRes = await fetchJson<VerifyAuthResponse>(passkeyApiUrl('/api/passkey/auth/verify'), {
    method: 'POST',
    body: JSON.stringify({
      requestId: optionsRes.requestId,
      response: authResponse,
    }),
  });

  if (!verifyRes.verified || !verifyRes.customToken) {
    throw new Error(verifyRes.error || 'Passkey verification failed');
  }

  return verifyRes.customToken;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in with Google first to add a passkey');
  const idToken = await user.getIdToken();
  return { Authorization: `Bearer ${idToken}` };
}

export async function enrollCurrentUserPasskey(): Promise<void> {
  const headers = await getAuthHeader();

  const optionsRes = await fetchJson<RegisterOptionsResponse>(passkeyApiUrl('/api/passkey/register/options'), {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  const registrationResponse = await startRegistration({
    optionsJSON: optionsRes.options as any,
  });

  const verifyRes = await fetchJson<VerifyRegisterResponse>(passkeyApiUrl('/api/passkey/register/verify'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      requestId: optionsRes.requestId,
      response: registrationResponse,
    }),
  });

  if (!verifyRes.verified) {
    throw new Error(verifyRes.error || 'Passkey registration failed');
  }
}

export async function getPasskeyEnrollmentStatus(): Promise<{ enrolled: boolean }> {
  const headers = await getAuthHeader();
  return fetchJson<{ enrolled: boolean }>(passkeyApiUrl('/api/passkey/register/status'), {
    method: 'GET',
    headers,
  });
}
