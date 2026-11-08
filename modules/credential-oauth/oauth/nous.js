/**
 * Nous Portal OAuth2 — flujo de autorización + refresh.
 *
 * Por qué un adaptador propio y no google.js: Nous NO es un OAuth2 estándar de
 * "authorization code". Usa el flujo DEVICE CODE de OAuth 2.0 (RFC 8628):
 *
 *   1. POST /api/oauth/device/code  → device_code + user_code + verification_uri
 *   2. el humano abre verification_uri e introduce user_code
 *   3. este módulo HACE POLLING de /api/oauth/token hasta que autoriza
 *
 * La diferencia que importa: NO hay callback HTTP ni redirect_uri. El polling
 * vive en el módulo, y el "state" del flow es el propio device_code.
 *
 * Y el refresh ROTA: cada llamada a /api/oauth/token devuelve un refresh_token
 * NUEVO y quema el anterior. Por eso el refresh NO se hace aquí — lo hace
 * credential-manager (credential.rotate.resolve.request), que es el único que
 * posee el token y puede persistir la rotación de forma atómica. Si dos sitios
 * refrescaran, el Portal detecta reuso y REVOCA la cadena entera (es el fallo
 * `refresh_token_reused` documentado en Hermes).
 *
 * Endpoints reales (verificados):
 *   device code:  POST https://portal.nousresearch.com/api/oauth/device/code
 *   token:        POST https://inference-api.nousresearch.com/v1/api/oauth/token
 *   (el token de dispositivo se canjea contra el portal; el de inferencia emite
 *    el access_token de inferencia)
 */

const PORTAL_BASE = process.env.NOUS_PORTAL_BASE_URL || 'https://portal.nousresearch.com';
const DEVICE_CODE_URL = `${PORTAL_BASE}/api/oauth/device/code`;
const PORTAL_TOKEN_URL = `${PORTAL_BASE}/api/oauth/token`;

// El emisor de inferencia es distinto del portal: el device code se canjea en el
// portal, pero el access_token de inferencia sale del inference-api.
const INFERENCE_TOKEN_URL = process.env.NOUS_INFERENCE_TOKEN_URL
  || 'https://inference-api.nousresearch.com/v1/api/oauth/token';

const DEFAULT_SCOPES = ['inference:invoke'];

/**
 * Inicia el flujo de dispositivo. Devuelve { device_code, user_code,
 * verification_uri, expires_in, interval }.
 */
async function startDeviceCode({ clientId, scope = DEFAULT_SCOPES.join(' ') } = {}) {
  if (!clientId) throw new Error('Nous: clientId requerido');

  const resp = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, scope })
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Nous device code falló (${resp.status}): ${data.error_description || data.error || resp.statusText}`);
  }
  if (!data.device_code || !data.user_code) {
    throw new Error('Nous device code sin device_code/user_code');
  }
  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri || data.verification_url || PORTAL_BASE,
    expires_in: data.expires_in || 600,
    interval: data.interval || 5
  };
}

/**
 * Canjea el device_code por el primer par (access_token + refresh_token).
 * El emisor puede responder `authorization_pending` mientras el humano no ha
 * autorizado: NO es un error, es el estado esperado del polling.
 */
async function pollForToken({ deviceCode, clientId, timeoutMs = 600000, intervalMs = 5000 }) {
  const deadline = Date.now() + timeoutMs;
  let ultimoEstado = null;

  while (Date.now() < deadline) {
    const resp = await fetch(INFERENCE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: deviceCode,
        client_id: clientId
      })
    });

    const data = await resp.json().catch(() => ({}));

    if (resp.ok && data.access_token) {
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token || null,
        expires_in: data.expires_in || null,
        token_type: data.token_type || 'Bearer',
        scope: data.scope || null
      };
    }

    // Estados RFC 8628: pending = sigue esperando; slow_down = doblar intervalo.
    const err = data.error || 'unknown';
    ultimoEstado = err;
    if (err === 'authorization_pending' || err === 'slow_down') {
      await new Promise((r) => setTimeout(r, err === 'slow_down' ? intervalMs * 2 : intervalMs));
      continue;
    }
    if (err === 'expired_token') {
      throw new Error('Nous: el código de dispositivo expiró. Inicia el flujo de nuevo.');
    }
    throw new Error(`Nous: ${err} — ${data.error_description || ''}`.trim());
  }

  throw new Error(`Nous: timeout esperando autorización (${ultimoEstado || 'timeout'})`);
}

/**
 * Canjea el primer par y lo entrega a credential-manager para que lo registre
 * como credencial ROTATIVA (credential.rotate.start.request). A partir de ahí
 * el refresh lo gestiona credential-manager; este módulo no vuelve a tocarlo.
 */
async function exchangeDeviceCode({ deviceCode, clientId }) {
  const tokens = await pollForToken({ deviceCode, clientId });
  if (!tokens.refresh_token) {
    throw new Error('Nous: el emisor no devolvió refresh_token (requerido para la rotación)');
  }
  return tokens;
}

/**
 * URL que el humano abre para autorizar (la que se muestra en el chat).
 */
function verificationUrl(userCode) {
  return `${PORTAL_BASE}/manage-subscription?user_code=${encodeURIComponent(userCode)}`;
}

module.exports = {
  startDeviceCode,
  pollForToken,
  exchangeDeviceCode,
  verificationUrl,
  DEVICE_CODE_URL,
  PORTAL_TOKEN_URL,
  INFERENCE_TOKEN_URL,
  DEFAULT_SCOPES
};
