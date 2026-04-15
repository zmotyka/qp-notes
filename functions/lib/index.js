"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authVerify = exports.authOptions = exports.registerStatus = exports.registerVerify = exports.registerOptions = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v2/https"));
const logger = __importStar(require("firebase-functions/logger"));
const cors_1 = __importDefault(require("cors"));
const server_1 = require("@simplewebauthn/server");
const helpers_1 = require("@simplewebauthn/server/helpers");
admin.initializeApp();
const db = admin.firestore();
const corsHandler = (0, cors_1.default)({ origin: true });
const RP_NAME = process.env.PASSKEY_RP_NAME || 'Zed Notetaker';
const RP_ID = process.env.PASSKEY_RP_ID || 'zed-notetaker.web.app';
const ORIGINS = (process.env.PASSKEY_ORIGINS || 'https://zed-notetaker.web.app,https://zed-notetaker.firebaseapp.com')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
function withCors(req, res, handler) {
    corsHandler(req, res, () => {
        void handler().catch((error) => {
            const message = error instanceof Error ? error.message : 'Unexpected error';
            logger.error('Passkey endpoint failed', { message });
            res.status(400).json({ error: message });
        });
    });
}
async function requireUser(req) {
    const authHeader = req.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
        throw new Error('Missing Authorization bearer token');
    }
    const token = authHeader.slice('Bearer '.length).trim();
    return admin.auth().verifyIdToken(token, true);
}
function requestId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
async function saveChallenge(id, data) {
    await db.collection('passkeyChallenges').doc(id).set({
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: Date.now() + (5 * 60 * 1000),
    });
}
async function consumeChallenge(id) {
    const ref = db.collection('passkeyChallenges').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
        throw new Error('Challenge not found or expired');
    }
    const data = snap.data();
    await ref.delete().catch(() => undefined);
    if (typeof data.expiresAt !== 'number' || data.expiresAt < Date.now()) {
        throw new Error('Challenge expired');
    }
    return data;
}
function mapAuthenticatorFromDb(data) {
    return {
        id: data.credentialID,
        publicKey: helpers_1.isoBase64URL.toBuffer(data.credentialPublicKey),
        counter: Number(data.counter || 0),
        transports: (data.transports || []),
    };
}
exports.registerOptions = functions.onRequest({ cors: true }, (req, res) => {
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
                id: data.credentialID,
                transports: (data.transports || []),
            };
        });
        const options = await (0, server_1.generateRegistrationOptions)({
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
exports.registerVerify = functions.onRequest({ cors: true }, (req, res) => {
    withCors(req, res, async () => {
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed' });
            return;
        }
        const decoded = await requireUser(req);
        const uid = decoded.uid;
        const { requestId: rid, response } = req.body;
        if (!rid || !response) {
            throw new Error('Missing requestId or response');
        }
        const challenge = await consumeChallenge(`register-${uid}-${rid}`);
        const verification = await (0, server_1.verifyRegistrationResponse)({
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
        const credentialPublicKey = helpers_1.isoBase64URL.fromBuffer(info.credential.publicKey);
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
exports.registerStatus = functions.onRequest({ cors: true }, (req, res) => {
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
exports.authOptions = functions.onRequest({ cors: true }, (req, res) => {
    withCors(req, res, async () => {
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed' });
            return;
        }
        const options = await (0, server_1.generateAuthenticationOptions)({
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
exports.authVerify = functions.onRequest({ cors: true }, (req, res) => {
    withCors(req, res, async () => {
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed' });
            return;
        }
        const { requestId: rid, response } = req.body;
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
        const verification = await (0, server_1.verifyAuthenticationResponse)({
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
//# sourceMappingURL=index.js.map