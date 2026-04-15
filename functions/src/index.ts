import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import cors from 'cors';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import type {
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  VerifiedAuthenticationResponse,
  VerifiedRegistrationResponse,
} from '@simplewebauthn/server';

admin.initializeApp();

const db = admin.firestore();
const corsHandler = cors({ origin: true });

const RP_NAME = process.env.PASSKEY_RP_NAME || 'Zed Notetaker';
const RP_ID = process.env.PASSKEY_RP_ID || 'zed-notetaker.web.app';
const ORIGINS = (process.env.PASSKEY_ORIGINS || 'https://zed-notetaker.web.app,https://zed-notetaker.firebaseapp.com')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

function withCors(
  req: functions.Request,
  res: any,
  handler: () => Promise<void>,
): void {
  corsHandler(req, res, () => {
    void handler().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      logger.error('Passkey endpoint failed', { message });
      res.status(400).json({ error: message });
    });
  });
}

async function requireUser(req: functions.Request): Promise<admin.auth.DecodedIdToken> {
  const authHeader = req.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Missing Authorization bearer token');
  }
  const token = authHeader.slice('Bearer '.length).trim();
  return admin.auth().verifyIdToken(token, true);
}

function requestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function saveChallenge(id: string, data: Record<string, unknown>): Promise<void> {
  await db.collection('passkeyChallenges').doc(id).set({
    ...data,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: Date.now() + (5 * 60 * 1000),
  });
}

async function consumeChallenge(id: string): Promise<FirebaseFirestore.DocumentData> {
  const ref = db.collection('passkeyChallenges').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error('Challenge not found or expired');
  }
  const data = snap.data()!;
  await ref.delete().catch(() => undefined);
  if (typeof data.expiresAt !== 'number' || data.expiresAt < Date.now()) {
    throw new Error('Challenge expired');
  }
  return data;
}

function mapAuthenticatorFromDb(data: FirebaseFirestore.DocumentData) {
  return {
    id: data.credentialID as string,
    publicKey: isoBase64URL.toBuffer(data.credentialPublicKey as string),
    counter: Number(data.counter || 0),
    transports: (data.transports || []) as AuthenticatorTransportFuture[],
  };
}

export const registerOptions = functions.onRequest({ cors: true }, (req, res) => {
  withCors(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const decoded = await requireUser(req);
    const uid = decoded.uid;
    const credentialsSnap = await db.collection('passkeyCredentials').where('uid', '==', uid).get();
    const excludeCredentials = credentialsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: data.credentialID as string,
        transports: (data.transports || []) as AuthenticatorTransportFuture[],
      };
    });

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: decoded.email || `uid:${uid}`,
      userDisplayName: decoded.name || decoded.email || 'Zed User',
      userID: Buffer.from(uid, 'utf8'),
      timeout: 60000,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      excludeCredentials,
    });

    const id = requestId();
    await saveChallenge(`register-${uid}-${id}`, {
      flow: 'register',
      uid,
      challenge: options.challenge,
    });

    res.json({ requestId: id, options });
  });
});

export const registerVerify = functions.onRequest({ cors: true }, (req, res) => {
  withCors(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const decoded = await requireUser(req);
    const uid = decoded.uid;
    const { requestId: rid, response } = req.body as { requestId?: string; response?: RegistrationResponseJSON };

    if (!rid || !response) {
      throw new Error('Missing requestId or response');
    }

    const challenge = await consumeChallenge(`register-${uid}-${rid}`);
    const verification: VerifiedRegistrationResponse = await verifyRegistrationResponse({
      response,
      expectedChallenge: String(challenge.challenge || ''),
      expectedOrigin: ORIGINS,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('Registration verification failed');
    }

    const info = verification.registrationInfo;
    const credentialID = info.credential.id;
    const credentialPublicKey = isoBase64URL.fromBuffer(info.credential.publicKey);

    await db.collection('passkeyCredentials').doc(`${uid}_${credentialID}`).set({
      uid,
      credentialID,
      credentialPublicKey,
      counter: info.credential.counter,
      transports: response.response.transports || [],
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    res.json({ verified: true });
  });
});

export const registerStatus = functions.onRequest({ cors: true }, (req, res) => {
  withCors(req, res, async () => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const decoded = await requireUser(req);
    const uid = decoded.uid;
    const credentialsSnap = await db.collection('passkeyCredentials').where('uid', '==', uid).limit(1).get();
    res.json({ enrolled: !credentialsSnap.empty });
  });
});

export const authOptions = functions.onRequest({ cors: true }, (req, res) => {
  withCors(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      timeout: 60000,
      userVerification: 'preferred',
      allowCredentials: [],
    });

    const rid = requestId();
    await saveChallenge(`auth-${rid}`, {
      flow: 'auth',
      challenge: options.challenge,
    });

    res.json({ requestId: rid, options });
  });
});

export const authVerify = functions.onRequest({ cors: true }, (req, res) => {
  withCors(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const { requestId: rid, response } = req.body as { requestId?: string; response?: AuthenticationResponseJSON };
    if (!rid || !response) {
      throw new Error('Missing requestId or response');
    }

    const challenge = await consumeChallenge(`auth-${rid}`);
    const credentialID = response.id;

    const credSnap = await db.collection('passkeyCredentials').where('credentialID', '==', credentialID).limit(1).get();
    if (credSnap.empty) {
      throw new Error('Unknown passkey credential');
    }

    const credDoc = credSnap.docs[0];
    const cred = credDoc.data();

    const verification: VerifiedAuthenticationResponse = await verifyAuthenticationResponse({
      response,
      expectedChallenge: String(challenge.challenge || ''),
      expectedOrigin: ORIGINS,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: mapAuthenticatorFromDb(cred),
    });

    if (!verification.verified || !verification.authenticationInfo) {
      throw new Error('Authentication verification failed');
    }

    const uid = String(cred.uid);

    await credDoc.ref.set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const customToken = await admin.auth().createCustomToken(uid, { amr: 'passkey' });

    res.json({
      verified: true,
      uid,
      customToken,
    });
  });
});
