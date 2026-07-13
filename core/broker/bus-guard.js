/**
 * BusGuard — la puerta guardada del broker MQTT.
 *
 * Hace que la IDENTIDAD (el certificado X.509 de certificate-authority) rija el bus entero:
 * verifica la credencial en CONNECT y autoriza PUBLISH/SUBSCRIBE por scope. Cierra la
 * restricción que el prisma cantó — el broker anónimo (core/broker/embedded.js sin authenticate).
 *
 * Escalera de determinismo (el dueño la sube desde el panel de interruptores):
 *   off      → el guard ni se cablea; broker abierto (comportamiento de hoy, cero brickeo)
 *   observe  → verifica + sella identidad + audita, pero PERMITE todo (aprende sin romper)
 *   enforce  → bloquea: anónimo fuera de dominios sensibles, credencial inválida rechazada
 *
 * Banco de CORE (el broker lo necesita síncrono en CONNECT). NO re-implementa cripto:
 * el `verifier` inyectado envuelve certificate-authority.verify (node-forge, ya real).
 * `policy` y `getMode` también inyectados (Strategy + State vivo). Sin verifier → todo anónimo.
 */

'use strict';

// ── Dominios que el anónimo JAMÁS toca en enforce (espejo de la lista del Portal) ──
// La puerta grande hereda el criterio de la puerta lateral: lo sensible exige identidad.
const DOMINIOS_SENSIBLES = new Set([
  'credential', 'credential-manager',
  'security-core', 'certificate-authority',
  'interruptor', 'interruptores',
  'module', 'modules', 'plugin', 'plugin-manager',
  'code', 'code-executor', 'ejecutor',
  'db', 'database', 'database-manager',
  'portal', 'project-manager'
]);

const MODOS = new Set(['off', 'observe', 'enforce']);

// aedes espera un Error con `returnCode` para el CONNACK de rechazo (4 = not authorized).
function _notAuthorized(message) {
  const err = new Error(message || 'not authorized');
  err.returnCode = 4;
  return err;
}

// Extrae el DOMINIO de cualquier forma de topic. CRÍTICO (multi-core): el tráfico interno
// REAL viaja por core/<coreId>/events/<dominio>/<accion> (topics.js: build/event) — NO por
// ui/request/... (eso es solo el frente del navegador). Mirar solo el prefijo del front
// dejaba la puerta interna de par en par (bypass P0: publicar core/<id>/events/credential/...
// se clasificaba como dominio 'core', jamás sensible).
//   ui/request|response/<dominio>/<accion>        → <dominio>
//   core/<id>/events/<dominio>/<accion>           → <dominio>   (el bus interno multi-core)
//   core/<id>/api/<dominio>/...                   → <dominio>   (RPC request-reply)
//   core/<id>/{status,heartbeat,logs,metrics}/... → el tipo     (presencia/telemetría, no sensible)
//   <dominio>.<lo-que-sea>.request                → <dominio>   (evento plano, por si acaso)
function _dominioDeTopic(topic) {
  if (typeof topic !== 'string' || !topic) return null;
  const parts = topic.split('/');
  if (parts[0] === 'ui' && (parts[1] === 'request' || parts[1] === 'response')) {
    return parts[2] ? parts[2].split('.')[0] : null;
  }
  if (parts[0] === 'core' && parts.length >= 3) {
    const type = parts[2];                       // events | api | status | heartbeat | logs | metrics
    if (type === 'events' || type === 'api') {
      return parts[3] ? parts[3].split('.')[0] : type;
    }
    return type;                                 // status/heartbeat/... — el "dominio" es el tipo (no sensible)
  }
  // evento de dominio plano: 'credential.create.request' → 'credential'
  return parts[0].split('.')[0] || null;
}

// ¿el patrón cubre múltiples topics (comodín MQTT)? Un SUBSCRIBE con comodín amplio deja
// al anónimo cosechar todo el bus —incluidas las respuestas RPC (ui/response/#) con api_keys,
// y todos los eventos (core/+/events/#)— sin tocar jamás un dominio sensible nominal.
function _esComodin(topic) {
  return typeof topic === 'string' && (topic.includes('#') || topic.includes('+'));
}

// La política por defecto: el confiable/identificado pasa; el anónimo no toca lo sensible
// ni cosecha por comodín. Inyectable — un despliegue puede endurecerla (scope por identifier
// del SAN, allowlist por type: core-peer/device/client).
function policyPorDefecto(identidad, topic, accion) {
  const dominio = _dominioDeTopic(topic);
  if (identidad && identidad.trusted) return { allow: true, dominio };  // peer core / servicio interno
  const anon = identidad && identidad.anonymous;
  // Firehose: el anónimo no se suscribe a comodines amplios (leería todo el bus).
  if (anon && accion === 'subscribe' && _esComodin(topic)) {
    return { allow: false, reason: 'anonymous-wildcard-subscribe', dominio };
  }
  if (anon && dominio && DOMINIOS_SENSIBLES.has(dominio)) {
    return { allow: false, reason: 'anonymous-sensitive-domain', dominio };
  }
  return { allow: true, dominio };
}

class BusGuard {
  /**
   * @param {Object} opts
   * @param {(pem:string)=>{valid:boolean,type?:string,identifier?:string,error?:string}} [opts.verifier]
   *        Envuelve certificate-authority.verify. Puede ser async (devuelve Promise). Ausente → todo anónimo.
   * @param {(identidad,topic,accion)=>{allow:boolean,reason?:string}} [opts.policy] Default: policyPorDefecto.
   * @param {()=>('off'|'observe'|'enforce')} [opts.getMode] Estado VIVO del interruptor. Default: 'off'.
   * @param {Iterable<string>} [opts.trustedClientIds] clientIds internos (el core, servicios) que
   *        pasan como confiables durante la MIGRACIÓN. NOTA DE SEGURIDAD: sin auth el clientId es
   *        spoofeable — esto es un crutch del peldaño observe/early-enforce; el estado final es que
   *        el core porte su propio certificado (identidad real), no que se confíe por nombre.
   * @param {Object} [opts.logger]
   * @param {Object} [opts.metrics]
   */
  constructor(opts = {}) {
    this.verifier = typeof opts.verifier === 'function' ? opts.verifier : null;
    this.policy = typeof opts.policy === 'function' ? opts.policy : policyPorDefecto;
    // Modo: interno mutable (setMode, lo mueve security-core desde el interruptor) o inyectado
    // (getMode, para tests y despliegues que lo derivan de otra fuente). Nace en 'off'.
    this._mode = MODOS.has(opts.mode) ? opts.mode : 'off';
    this.getMode = typeof opts.getMode === 'function' ? opts.getMode : () => this._mode;
    this.trustedClientIds = new Set(opts.trustedClientIds || []);
    this.logger = opts.logger || null;
    this.metrics = opts.metrics || null;

    this.stats = {
      authenticated: 0,
      anonymous: 0,
      rejected: 0,
      verifier_unavailable: 0,
      publish_denied: 0,
      subscribe_denied: 0
    };
  }

  _modoActual() {
    const m = this.getMode();
    return MODOS.has(m) ? m : 'off';
  }

  // El dueño sube/baja el peldaño (vía security-core desde el interruptor). Idempotente.
  setMode(m) {
    if (!MODOS.has(m)) return this._mode;
    this._mode = m;
    this.logger?.info?.('security.bus.mode_changed', { mode: m });
    return this._mode;
  }

  // Puente tardío: security-core cablea el verifier a certificate-authority cuando carga.
  setVerifier(fn) { if (typeof fn === 'function') this.verifier = fn; }
  addTrustedClientId(id) { if (id) this.trustedClientIds.add(id); }

  // password del CONNECT = 'enki:cert:<base64(PEM)>'  (extensible: 'enki:token:<jwt>')
  _extraerCredencial(password) {
    if (!password) return null;
    const raw = Buffer.isBuffer(password) ? password.toString('utf8') : String(password);
    if (raw.startsWith('enki:cert:')) {
      const b64 = raw.slice('enki:cert:'.length);
      try { return { scheme: 'cert', pem: Buffer.from(b64, 'base64').toString('utf8') }; }
      catch { return { scheme: 'cert', pem: null, malformed: true }; }
    }
    if (raw.startsWith('enki:token:')) {
      return { scheme: 'token', token: raw.slice('enki:token:'.length) };
    }
    return { scheme: 'unknown', malformed: true };
  }

  async _resolverIdentidad(password) {
    const cred = this._extraerCredencial(password);
    if (!cred) return { anonymous: true, credencialPresente: false };
    // Hoy solo se verifica el esquema 'cert' (token queda para la fase JWT).
    if (cred.scheme !== 'cert' || !cred.pem) {
      return { anonymous: true, credencialPresente: true, valid: false, error: 'credencial-malformada' };
    }
    if (!this.verifier) {
      // El guard aún no tiene puente a certificate-authority (arranque): trata como anónimo.
      return { anonymous: true, credencialPresente: true, valid: false, error: 'verifier-ausente' };
    }
    try {
      const v = await this.verifier(cred.pem);
      if (v && v.valid) {
        return { anonymous: false, credencialPresente: true, valid: true, type: v.type, identifier: v.identifier };
      }
      return { anonymous: true, credencialPresente: true, valid: false, error: (v && v.error) || 'invalida' };
    } catch (err) {
      // certificate-authority caído → no cerramos el bus por una caída: degradar a observe.
      this.stats.verifier_unavailable++;
      this.metrics?.increment?.('security.bus.verifier_unavailable');
      return { anonymous: true, credencialPresente: true, valid: false, error: 'verifier-unavailable', degradar: true };
    }
  }

  // ── aedes: authenticate(client, username, password, callback) ──
  authenticate(client, username, password, callback) {
    const cb = typeof callback === 'function' ? callback : () => {};
    const modo = this._modoActual();
    if (modo === 'off') { if (client) client.enkiIdentity = { anonymous: true, credencialPresente: false }; return cb(null, true); }

    // Confiable por clientId interno (crutch de migración — ver nota de seguridad en el constructor).
    if (client && this.trustedClientIds.has(client.id)) {
      client.enkiIdentity = { trusted: true, anonymous: false, valid: true, identifier: client.id };
      return cb(null, true);
    }

    Promise.resolve(this._resolverIdentidad(password)).then((identidad) => {
      if (client) client.enkiIdentity = identidad;

      if (identidad.anonymous && !identidad.credencialPresente) this.stats.anonymous++;
      else if (identidad.valid) this.stats.authenticated++;

      if (identidad.valid) {
        this.metrics?.increment?.('security.bus.authenticated');
        this.logger?.debug?.('security.bus.authenticated', { client_id: client?.id, type: identidad.type, identifier: identidad.identifier });
      }

      // enforce: una credencial PRESENTE pero inválida no entra (salvo degradación honesta por verifier caído).
      if (modo === 'enforce' && identidad.credencialPresente && !identidad.valid && !identidad.degradar) {
        this.stats.rejected++;
        this.metrics?.increment?.('security.bus.rejected', { stage: 'connect' });
        this.logger?.warn?.('security.bus.connect_rejected', { client_id: client?.id, error: identidad.error });
        return cb(_notAuthorized('certificado invalido'), false);
      }
      // Anónimo entra al CONNECT; la política de PUBLISH decide qué puede tocar.
      return cb(null, true);
    }).catch((err) => {
      // Ante lo inesperado, degradación honesta: en enforce logueamos y dejamos pasar (observe de facto).
      this.logger?.error?.('security.bus.authenticate_error', { error: err?.message });
      if (client) client.enkiIdentity = { anonymous: true, credencialPresente: false, error: 'authenticate-error' };
      return cb(null, true);
    });
  }

  // ── aedes: authorizePublish(client, packet, callback) ──
  authorizePublish(client, packet, callback) {
    const cb = typeof callback === 'function' ? callback : () => {};
    const modo = this._modoActual();
    if (modo === 'off') return cb(null);
    if (!client) return cb(null); // el propio broker/núcleo publica sin restricción
    // Confiable por clientId ANTES de mirar la identidad sellada: cubre al core que se
    // conectó en 'off' (identidad anónima) y sigue vivo cuando el dueño sube a 'enforce' —
    // sin esto, el núcleo se bloquearía a sí mismo al cambiar de peldaño.
    if (this.trustedClientIds.has(client.id)) return cb(null);

    const identidad = client.enkiIdentity || { anonymous: true, credencialPresente: false };
    let veredicto;
    try { veredicto = this.policy(identidad, packet?.topic, 'publish'); }
    catch { veredicto = { allow: true }; } // una política que revienta no debe cerrar el bus

    if (!veredicto.allow) {
      this.stats.publish_denied++;
      this.metrics?.increment?.('security.bus.rejected', { stage: 'publish', domain: veredicto.dominio });
      this.logger?.warn?.('security.bus.publish_denied', {
        client_id: client.id, topic: packet?.topic, reason: veredicto.reason, mode: modo
      });
      if (modo === 'enforce') return cb(_notAuthorized(`publish denegado: ${veredicto.reason}`));
      // observe: deja pasar pero ya quedó auditado (aprende sin romper).
    }
    return cb(null);
  }

  // ── aedes: authorizeSubscribe(client, subscription, callback) ──
  authorizeSubscribe(client, subscription, callback) {
    const cb = typeof callback === 'function' ? callback : () => {};
    const modo = this._modoActual();
    if (modo === 'off') return cb(null, subscription);
    if (!client) return cb(null, subscription);
    if (this.trustedClientIds.has(client.id)) return cb(null, subscription); // el núcleo, robusto al cambio de peldaño

    const identidad = client.enkiIdentity || { anonymous: true, credencialPresente: false };
    let veredicto;
    try { veredicto = this.policy(identidad, subscription?.topic, 'subscribe'); }
    catch { veredicto = { allow: true }; }

    if (!veredicto.allow) {
      this.stats.subscribe_denied++;
      this.metrics?.increment?.('security.bus.rejected', { stage: 'subscribe', domain: veredicto.dominio });
      this.logger?.warn?.('security.bus.subscribe_denied', {
        client_id: client.id, topic: subscription?.topic, reason: veredicto.reason, mode: modo
      });
      if (modo === 'enforce') return cb(null, null); // null = suscripción negada
    }
    return cb(null, subscription);
  }

  getStats() {
    return { ...this.stats, mode: this._modoActual() };
  }
}

module.exports = BusGuard;
module.exports.BusGuard = BusGuard;
module.exports.policyPorDefecto = policyPorDefecto;
module.exports.DOMINIOS_SENSIBLES = DOMINIOS_SENSIBLES;
module.exports._dominioDeTopic = _dominioDeTopic;
