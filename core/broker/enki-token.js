/**
 * enki-token — la credencial que PRUEBA posesión de la clave privada (no solo enseña el cert).
 *
 * Un cert es público: presentarlo (enki:cert:) es replayable — cualquiera que lo vea suplanta.
 * El token firmado cierra eso: el cliente FIRMA {cert, iat, jti} con su clave privada; el guard
 * verifica (1) que la CA firmó el cert, (2) que la firma del token valida contra la clave pública
 * DEL cert (⇒ posee la privada), (3) frescura (iat en ventana), (4) no-replay (jti único).
 *
 * Formato (JWS-like, compacto, sin deps): 'enki:token:' + b64url(header).b64url(payload).b64url(sig)
 *   header  = { alg:'RS256', typ:'enki-token', v:1 }
 *   payload = { cert:<PEM>, iat:<unix s>, jti:<hex>, sub?:<identifier> }
 *   sig     = RSASSA-PKCS1-v1_5(SHA-256) sobre ASCII(b64url(header)+'.'+b64url(payload))
 *
 * RS256 = RSASSA-PKCS1-v1_5+SHA256 → compatible con WebCrypto del browser (paso 2c) y con las
 * claves RSA-2048 que emite certificate-authority. Node crypto.verify('RSA-SHA256', ...) valida la
 * firma que produce WebCrypto.subtle.sign({name:'RSASSA-PKCS1-v1_5'}, ...). Un solo formato para
 * browser, device y peer core.
 *
 * Banco PURO (sin I/O, sin estado): el anti-replay (cache de jti) vive en el guard, que es stateful.
 */

'use strict';

const crypto = require('crypto');

const PREFIJO = 'enki:token:';

function _b64url(input) {
  return Buffer.from(input).toString('base64url');
}
function _b64urlDecode(str) {
  return Buffer.from(str, 'base64url');
}

// Cliente (device / peer core / tests): construye el token firmado.
// El browser hace lo mismo con WebCrypto (paso 2c) — MISMO formato.
function mint({ certPem, privateKeyPem, sub = null, iatSeconds = null }) {
  if (!certPem || !privateKeyPem) throw new Error('mint: certPem y privateKeyPem requeridos');
  const iat = Number.isFinite(iatSeconds) ? iatSeconds : Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'enki-token', v: 1 };
  const payload = { cert: certPem, iat, jti: crypto.randomBytes(12).toString('hex') };
  if (sub) payload.sub = sub;
  const signingInput = _b64url(JSON.stringify(header)) + '.' + _b64url(JSON.stringify(payload));
  const sig = crypto.sign('RSA-SHA256', Buffer.from(signingInput, 'ascii'), privateKeyPem);
  return PREFIJO + signingInput + '.' + _b64url(sig);
}

// Guard: descompone el token (lanza si está malformado).
function parse(token) {
  if (typeof token !== 'string') throw new Error('token-no-string');
  const raw = token.startsWith(PREFIJO) ? token.slice(PREFIJO.length) : token;
  const parts = raw.split('.');
  if (parts.length !== 3) throw new Error('token-malformado');
  const header = JSON.parse(_b64urlDecode(parts[0]).toString('utf8'));
  const payload = JSON.parse(_b64urlDecode(parts[1]).toString('utf8'));
  const signature = _b64urlDecode(parts[2]);
  return { header, payload, signature, signingInput: parts[0] + '.' + parts[1] };
}

// Guard paso 2: ¿la firma del token valida contra la clave pública DEL cert? (prueba de posesión)
// createPublicKey acepta un cert PEM (extrae su clave) o una clave pública PEM (tests).
function verifySignature(parsed) {
  if (!parsed || !parsed.payload || !parsed.payload.cert) return false;
  let pub;
  try { pub = crypto.createPublicKey({ key: parsed.payload.cert, format: 'pem' }); }
  catch { return false; }
  try { return crypto.verify('RSA-SHA256', Buffer.from(parsed.signingInput, 'ascii'), pub, parsed.signature); }
  catch { return false; }
}

module.exports = { PREFIJO, mint, parse, verifySignature };
