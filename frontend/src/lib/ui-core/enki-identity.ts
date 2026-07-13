/**
 * enki-identity — la identidad del navegador para el bus guardado (paso 2c).
 *
 * El front prueba QUIÉN es sin que su clave privada salga jamás del dispositivo:
 *   1. genera un par RSA en WebCrypto — la privada es NO-EXTRAÍBLE (vive en IndexedDB como CryptoKey)
 *   2. enrola: manda su clave PÚBLICA a certificate-authority/enroll → recibe un cert firmado por la CA
 *   3. en cada CONNECT mintea un token firmado (enki:token:) que el BusGuard verifica
 *
 * Formato del token IDÉNTICO a core/broker/enki-token.js (RS256 = RSASSA-PKCS1-v1_5 + SHA-256):
 *   'enki:token:' + b64url(header).b64url(payload).b64url(sig)
 * Node crypto.verify('RSA-SHA256', ...) valida la firma que produce WebCrypto.subtle.sign.
 *
 * Inerte hasta que se use: si no hay cert enrolado, credentialForConnect() devuelve null y el
 * front conecta anónimo (funciona en 'off'/'observe'). El enrolamiento se hace UNA vez durante
 * 'observe' (bus abierto), antes de que el dueño suba a 'enforce'.
 */

const DB_NAME = 'enki-identity';
const STORE = 'keys';
const KEY_ID = 'client-signing-key';
const CERT_LS = 'enki.identity.cert';       // localStorage: el cert PEM (público)
const IDENTIFIER_LS = 'enki.identity.id';   // localStorage: el identifier estable de este cliente

// ── base64url ──
function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function utf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// ── IndexedDB: la CryptoKey privada no-extraíble persiste entre recargas ──
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function idbGet(key: string): Promise<unknown> {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    tx.onsuccess = () => res(tx.result);
    tx.onerror = () => rej(tx.error);
  });
}
async function idbPut(key: string, val: unknown): Promise<void> {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite').objectStore(STORE).put(val, key);
    tx.onsuccess = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

const ALG = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

// El par: privada no-extraíble (extractable=false); la pública se exporta para enrolar.
async function ensureKeypair(): Promise<CryptoKeyPair> {
  const existing = (await idbGet(KEY_ID)) as CryptoKeyPair | undefined;
  if (existing?.privateKey) return existing;
  const kp = await crypto.subtle.generateKey(ALG, false, ['sign', 'verify']);
  await idbPut(KEY_ID, kp);   // CryptoKey no-extraíble se persiste como objeto estructurado
  return kp;
}

function derToPem(der: ArrayBuffer, label: string): string {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(der)));
  const lines = b64.match(/.{1,64}/g)?.join('\n') ?? b64;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----\n`;
}

async function publicKeyPem(kp: CryptoKeyPair): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', kp.publicKey);
  return derToPem(spki, 'PUBLIC KEY');
}

// identifier estable por dispositivo (para el SAN urn:eventcore:client:<id>)
function getIdentifier(): string {
  let id = localStorage.getItem(IDENTIFIER_LS);
  if (!id) {
    id = 'web-' + b64url(crypto.getRandomValues(new Uint8Array(8)));
    localStorage.setItem(IDENTIFIER_LS, id);
  }
  return id;
}

export function hasCert(): boolean {
  return !!localStorage.getItem(CERT_LS);
}

/**
 * Enrola UNA vez (durante 'observe', bus abierto): manda la pubkey a la CA, guarda el cert.
 * mqttRequest es la función del front (domain, action, payload) → respuesta.
 */
export async function ensureEnrolled(
  mqttRequest: (domain: string, action: string, payload: unknown) => Promise<{ data?: { certificate?: string } }>,
  opts: { commonName?: string; project?: string } = {}
): Promise<boolean> {
  if (hasCert()) return true;
  const kp = await ensureKeypair();
  const publicKeyPem_ = await publicKeyPem(kp);
  const identifier = getIdentifier();
  const res = await mqttRequest('certificate-authority', 'enroll', {
    publicKeyPem: publicKeyPem_,
    type: 'client',
    identifier,
    scope: opts.project || 'system',   // el navegador de una tienda → project=<id>; sistema si no
    commonName: opts.commonName || `Navegador ${identifier}`
  });
  const cert = res?.data?.certificate;
  if (!cert) return false;
  localStorage.setItem(CERT_LS, cert);
  return true;
}

/** Mintea un token firmado fresco. Devuelve null si aún no hay cert (→ conectar anónimo). */
export async function mintToken(): Promise<string | null> {
  const cert = localStorage.getItem(CERT_LS);
  if (!cert) return null;
  const kp = await ensureKeypair();
  const header = { alg: 'RS256', typ: 'enki-token', v: 1 };
  const payload = {
    cert,
    iat: Math.floor(Date.now() / 1000),
    jti: b64url(crypto.getRandomValues(new Uint8Array(12))),
    sub: getIdentifier()
  };
  const signingInput = b64url(utf8(JSON.stringify(header))) + '.' + b64url(utf8(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign(ALG.name, kp.privateKey, utf8(signingInput));
  return 'enki:token:' + signingInput + '.' + b64url(sig);
}

/** La credencial para el MQTT CONNECT (password). null → el front conecta anónimo. */
export async function credentialForConnect(): Promise<string | null> {
  try { return await mintToken(); }
  catch { return null; }
}
