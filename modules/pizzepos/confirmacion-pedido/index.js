/**
 * confirmacion-pedido — la puerta de la confianza, del lado del cliente.
 *
 * Escucha lo que decide `pedidos` al nacer un pedido de tienda y hace UNA cosa:
 * hablar con el cliente por WhatsApp.
 *
 *   · pedido.confirmacion_pendiente → a los N segundos (config, 30 por defecto)
 *     le pide que confirme. Su pedido NO ha entrado en cocina todavía.
 *   · pedido.cliente_habitual → le saluda como a uno de casa. Su pedido ya está
 *     en cocina, aquí no se le pide nada.
 *
 * Y escucha su respuesta por el BUS, no por un fichero: `whatsapp-bot` publica
 * `whatsapp.mensaje.recibido` por cada mensaje entrante, y aquí se mira si el que
 * escribe es un cliente con un pedido esperando. Un "sí" publica
 * `pedido.confirmacion_respondida` (lo aplica `pedidos`, que es su dueño) y un "no"
 * publica `pedido.confirmacion_rechazada`. Nadie llama a nadie en proceso: si
 * `pedidos` se recarga, el evento sigue siendo el mismo contrato.
 *
 * La espera tiene DOS tramos (la doble puerta que pidió el dueño):
 *   · a los 10 minutos sin contestar, un ÚLTIMO mensaje amable: «¿lo ponemos en
 *     marcha?». Se da por hecho que la gente se distrae; nadie pierde su cena por eso.
 *   · diez minutos más sin contestar, se publica `pedido.sin_confirmar`: la barra
 *     recibe el aviso por Telegram y `pedidos` RETIRA el pedido con su cuenta. Nunca
 *     entró en cocina (su cuenta nació con enviar_cocina:false), así que no queda nada
 *     abierto en el mostrador ni un pedido fantasma al que un mensaje tardío confirme.
 *
 * Idempotencia: el puente puede entregar el MISMO mensaje dos veces (mismo
 * `message_id`, ver bridges/whatsapp-qr/ingest/ingest.js). El id se recuerda: la
 * segunda entrega no vuelve a responder por el mismo pedido.
 */

'use strict';

const fs = require('fs').promises;
const crypto = require('crypto');

// Respuestas que valen como SÍ / NO. Se comparan sobre el texto normalizado (sin
// acentos, minúsculas, sin signos) y solo si el mensaje es corto: un párrafo que
// contenga "sí" en medio no es una confirmación, es una conversación.
const SI = ['si', 'sii', 'siii', 'ok', 'okei', 'okey', 'vale', 'confirmo', 'confirmado',
  'de acuerdo', 'adelante', 'perfecto', 'correcto', 'eso es', 'claro', 'venga', 'hecho'];
const NO = ['no', 'nop', 'nope', 'cancela', 'cancelalo', 'anula', 'anulalo', 'mejor no',
  'dejalo', 'nada', 'olvidalo'];

const ESPERA_RESPUESTA_MS = 10 * 60 * 1000;   // 1ª espera → último mensaje antes de retirar
const SEGUNDA_ESPERA_MS  = 10 * 60 * 1000;    // 2ª espera → se retira el pedido
const VISTOS_MAX = 1000;                     // ids de mensaje recordados (ventana acotada)

class ConfirmacionPedidoModule {
  constructor() {
    this.name = 'confirmacion-pedido';
    this.version = '1.2.0';

    this.pendientes = new Map();      // pedido_id → { project_slug, jid, nombre, ... timers }
    this.porJid = new Map();          // `${project_slug}:${jid}` → Set<pedido_id>
    this.vistos = new Map();          // clave de mensaje ya atendido → ts (idempotencia)
    this.esperaRespuestaMs = ESPERA_RESPUESTA_MS;
    this.segundaEsperaMs = SEGUNDA_ESPERA_MS;
    this.configCache = new Map();
  }

  // ==========================================
  // Ciclo de vida
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.moduleRegistry = core.moduleRegistry;

    // Las suscripciones (pedido.confirmacion_pendiente, pedido.cliente_habitual,
    // whatsapp.mensaje.recibido) las auto-wirea el loader desde module.json: no hay
    // reloj propio, no hay fichero que leer, no hay offset que comparar.
    this.logger?.info?.('confirmacion-pedido.loaded', { version: this.version });
  }

  async onUnload() {
    for (const p of this.pendientes.values()) {
      if (p.timer) clearTimeout(p.timer);
      if (p.timerAviso) clearTimeout(p.timerAviso);
      if (p.timerRecordatorio) clearTimeout(p.timerRecordatorio);
      if (p.timerBorrado) clearTimeout(p.timerBorrado);
    }
    this.pendientes.clear();
    this.porJid.clear();
    this.configCache.clear();
    this.vistos.clear();
    this.logger?.info?.('confirmacion-pedido.unloaded', {});
  }

  // ==========================================
  // Bus
  // ==========================================

  // Cliente que NO conocemos (o que aún no lleva los pedidos de confianza): su pedido
  // está parado. Se le pide confirmación tras la espera configurada — ni al instante
  // (parece un robot que no te ha leído) ni tarde (se enfría).
  async onPedidoConfirmacionPendiente(event) {
    const data = event?.data || event || {};
    const { pedido_id, project_slug, project_id, cuenta_id, cliente_jid, cliente_nombre } = data;
    if (!pedido_id || !project_slug || !cliente_jid) {
      this.logger?.warn?.('confirmacion-pedido.sin_datos', {
        pedido_id: pedido_id || null, project_slug: project_slug || null, con_jid: !!cliente_jid
      });
      return;
    }

    const cfg = await this._config(project_slug);
    const espera = Number.isInteger(cfg.espera_segundos) ? cfg.espera_segundos : 30;
    const reg = {
      pedido_id,
      project_slug,
      project_id: project_id || project_slug,
      cuenta_id: cuenta_id || null,
      jid: cliente_jid,
      nombre: cliente_nombre || null,
      creado_en: Date.now(),
      pedida_at: null,
      recordado_at: null,
      timer: null,
      timerAviso: null,
      timerRecordatorio: null,
      timerBorrado: null
    };
    reg.timer = setTimeout(() => { this._pedirConfirmacion(reg).catch(() => {}); }, espera * 1000);
    if (reg.timer.unref) reg.timer.unref();
    this._registrar(reg);

    this.logger?.info?.('confirmacion-pedido.programada', { pedido_id, project_slug, espera_segundos: espera });
  }

  // Cliente de siempre: ni confirmación ni espera. Un saludo con su nombre, como se
  // le hablaría en el mostrador. Su pedido ya está en cocina.
  async onPedidoClienteHabitual(event) {
    const data = event?.data || event || {};
    const { pedido_id, project_slug, cliente_jid, cliente_nombre } = data;
    if (!project_slug || !cliente_jid) return;

    const cfg = await this._config(project_slug);
    const puente = this._puente(cfg);
    if (!puente) {
      this._metric('confirmacion_pedido.fallido.total', { project: project_slug, razon: 'sin_puente' });
      return;
    }
    const texto = cfg.texto_habitual
      ? this._formatear(cfg.texto_habitual, { nombre: this._pila(cliente_nombre), ref: null, pedido_id })
      : this._textoHabitual(this._pila(cliente_nombre));

    const envio = await this._enviar(puente, cliente_jid, texto);
    this._metric(envio.ok ? 'confirmacion_pedido.habitual.total' : 'confirmacion_pedido.fallido.total',
      envio.ok ? { project: project_slug } : { project: project_slug, razon: envio.motivo });
    if (!envio.ok) {
      this.logger?.warn?.('confirmacion-pedido.habitual_fallido', { pedido_id, motivo: envio.motivo });
    }
  }

  // ==========================================
  // Mensajes
  // ==========================================

  async _pedirConfirmacion(reg) {
    if (!this.pendientes.has(reg.pedido_id)) return;   // ya respondió o se cerró
    const cfg = await this._config(reg.project_slug);
    const puente = this._puente(cfg);
    if (!puente) {
      this._metric('confirmacion_pedido.fallido.total', { project: reg.project_slug, razon: 'sin_puente' });
      return;
    }
    const ref = await this._refPedido(reg);
    const texto = cfg.texto_confirmacion
      ? this._formatear(cfg.texto_confirmacion, { nombre: this._pila(reg.nombre), ref, pedido_id: reg.pedido_id })
      : this._textoConfirmacion(this._pila(reg.nombre), ref);

    const envio = await this._enviar(puente, reg.jid, texto);
    if (!envio.ok) {
      this._metric('confirmacion_pedido.fallido.total', { project: reg.project_slug, razon: envio.motivo });
      this.logger?.warn?.('confirmacion-pedido.peticion_fallida', { pedido_id: reg.pedido_id, motivo: envio.motivo });
      // Si no se pudo pedir, no se deja colgado: se avisa igual para que la barra decida.
      await this._avisarSinConfirmar(reg);
      return;
    }
    reg.pedida_at = new Date().toISOString();
    // Primera espera agotada → último mensaje. No se retira nada todavía: aquí se
    // supone buena fe (el cliente está ocupado, no ha mirado el móvil).
    reg.timerRecordatorio = setTimeout(() => { this._recordar(reg).catch(() => {}); }, this.esperaRespuestaMs);
    if (reg.timerRecordatorio.unref) reg.timerRecordatorio.unref();
    this._metric('confirmacion_pedido.pedida.total', { project: reg.project_slug });
    this.logger?.info?.('confirmacion-pedido.pedida', { pedido_id: reg.pedido_id, ref });
  }

  // La segunda oportunidad: pasados los primeros 10 minutos sin respuesta se le
  // pregunta UNA vez más, con el mismo tono cordial y la misma firmeza. Su pedido
  // sigue parado (nunca entró en cocina) y su SÍ aún vale.
  async _recordar(reg) {
    if (!this.pendientes.has(reg.pedido_id)) return;   // respondió o se cerró mientras
    const cfg = await this._config(reg.project_slug);
    const puente = this._puente(cfg);
    if (!puente) {
      this._metric('confirmacion_pedido.fallido.total', { project: reg.project_slug, razon: 'sin_puente' });
      await this._avisarSinConfirmar(reg);
      return;
    }
    const ref = await this._refPedido(reg);
    const texto = cfg.texto_recordatorio
      ? this._formatear(cfg.texto_recordatorio, { nombre: this._pila(reg.nombre), ref, pedido_id: reg.pedido_id })
      : this._textoRecordatorio(this._pila(reg.nombre), ref);

    const envio = await this._enviar(puente, reg.jid, texto);
    if (!envio.ok) {
      // Si ya no se puede hablar con el cliente, no se le deja otros 10 minutos de
      // espera que nadie va a leer: se retira y la barra recibe el aviso.
      this._metric('confirmacion_pedido.fallido.total', { project: reg.project_slug, razon: envio.motivo });
      this.logger?.warn?.('confirmacion-pedido.recordatorio_fallido', { pedido_id: reg.pedido_id, motivo: envio.motivo });
      await this._avisarSinConfirmar(reg);
      return;
    }

    reg.recordado_at = new Date().toISOString();
    const segunda = Number.isInteger(cfg.segunda_espera_segundos) && cfg.segunda_espera_segundos >= 0
      ? cfg.segunda_espera_segundos * 1000
      : this.segundaEsperaMs;
    reg.timerBorrado = setTimeout(() => { this._avisarSinConfirmar(reg).catch(() => {}); }, segunda);
    if (reg.timerBorrado.unref) reg.timerBorrado.unref();
    this._metric('confirmacion_pedido.recordatorio.total', { project: reg.project_slug });
    this.logger?.info?.('confirmacion-pedido.recordatorio', { pedido_id: reg.pedido_id, ref, segunda_espera_ms: segunda });
  }

  _textoConfirmacion(nombre, ref) {
    const saludo = nombre ? `¡Hola, ${nombre}!` : '¡Hola!';
    return [
      `${saludo} 👋`,
      `Tenemos tu pedido${ref ? ` ${ref}` : ''} apuntado, con todo lo que nos has dicho.`,
      'Antes de ponerlo en cocina queremos asegurarnos de que está bien: preferimos preguntarte un momento a servirte algo que no querías.',
      '¿Serías tan amable de confirmarnos el pedido para empezar a prepararlo? Con un «sí» nos basta.',
      'Si quieres cambiar algo, dínoslo y lo ajustamos sin problema.',
      'En cuanto nos confirmes, lo ponemos en marcha ahora mismo 🙏'
    ].join('\n');
  }

  _textoRecordatorio(nombre, ref) {
    const saludo = nombre ? `¡Hola de nuevo, ${nombre}!` : '¡Hola de nuevo!';
    return [
      `${saludo} 👋`,
      `Tu pedido${ref ? ` ${ref}` : ''} sigue apartado aquí, esperándote.`,
      '¿Lo ponemos en marcha? Con un «sí» nos basta y lo mandamos al horno.',
      'Si prefieres dejarlo, respóndenos «no» y lo quitamos sin ningún problema.'
    ].join('\n');
  }

  _textoHabitual(nombre) {
    const saludo = nombre ? `¡${nombre}!` : '¡Hola!';
    return [
      `${saludo} Qué alegría verte por aquí 🍕`,
      'Ya estamos con tu pedido.',
      'Te avisamos en cuanto esté listo.'
    ].join('\n');
  }

  _formatear(plantilla, vars) {
    return String(plantilla)
      .replace(/\{nombre\}/g, vars.nombre || '')
      .replace(/\{ref\}/g, vars.ref || '')
      .trim();
  }

  // ==========================================
  // La respuesta del cliente (por el bus)
  // ==========================================

  // `whatsapp-bot` publica un `whatsapp.mensaje.recibido` por cada mensaje entrante
  // ({ project_slug, phone_number_id, from, message_type, message_id, has_text, text,
  // timestamp, contact_name, interaction, media, location }). Aquí NO se lee ningún
  // fichero ni se compara ningún offset: si el que escribe es un cliente con un pedido
  // esperando y su texto es un sí/no, se publica la respuesta y el que la aplica es
  // `pedidos` (su dueño), no este módulo.
  async onWhatsappMensajeRecibido(event) {
    const data = event?.data || event || {};
    const message_id = data.message_id ? String(data.message_id) : null;

    // Mismo mensaje dos veces = misma respuesta una sola vez. Se recuerda el id ANTES
    // de mirar nada más, para que un reintento del puente no vuelva a preguntar.
    if (!this._primeraVez(message_id, data)) return;

    const project_slug = data.project_slug ? String(data.project_slug) : null;
    const jid = String(data.from || '').trim().toLowerCase();
    if (!jid) return;
    if (jid.endsWith('@g.us')) return;                        // un grupo no confirma un pedido

    // El texto es la respuesta; si el cliente tocó un botón/lista, su título es el texto.
    const texto = String(data.text || data.interaction?.title || '').trim();
    if (!texto || texto.length > 40) return;                  // un párrafo no es un "sí"
    // Los mensajes que MANDA el negocio no son respuestas (retro-compat: el eco del puente).
    if (/^pedido recibido/i.test(texto)) return;

    const pendientes = this._pendientesDe(jid, project_slug);
    if (pendientes.length === 0) return;                      // no espera nada de este jid

    const respuesta = this._clasificar(texto);
    if (!respuesta) return;                                   // habla de otra cosa

    // El más antiguo primero: si alguien tiene dos pedidos parados, contesta al que
    // lleva más tiempo esperando y el otro se queda pendiente (no se adivina).
    pendientes.sort((a, b) => a.creado_en - b.creado_en);
    const reg = pendientes[0];

    // Se cierra ANTES de publicar: si el mismo mensaje se reentrega, ya no hay pendiente
    // y la segunda entrega no puede volver a responder por este pedido.
    this._cerrar(reg.pedido_id);

    const evento = respuesta === 'si' ? 'pedido.confirmacion_respondida' : 'pedido.confirmacion_rechazada';
    await this._publicar(evento, {
      pedido_id: reg.pedido_id,
      project_id: reg.project_id,
      project_slug: reg.project_slug,
      cuenta_id: reg.cuenta_id,
      jid: reg.jid,
      respuesta,
      ...(respuesta === 'no' ? { motivo: 'cliente_dijo_no' } : {}),
      whatsapp_message_id: message_id,
      respondida_at: new Date().toISOString()
    });

    this._metric(respuesta === 'si' ? 'confirmacion_pedido.confirmado.total' : 'confirmacion_pedido.rechazado.total',
      { project: reg.project_slug });
    this.logger?.info?.('confirmacion-pedido.respondida', { pedido_id: reg.pedido_id, respuesta, evento });
  }

  // ¿Primera vez que vemos este mensaje? Se recuerda el `message_id` (o, si el evento
  // no lo trae, una huella de lo que identifica el mensaje) con ventana acotada: un
  // proceso de días no puede acumular ids sin fin.
  _primeraVez(message_id, data) {
    const clave = message_id
      ? `id:${message_id}`
      : `huella:${data.project_slug || ''}|${data.from || ''}|${data.text || ''}|${data.timestamp || ''}`;
    if (this.vistos.has(clave)) return false;
    this.vistos.set(clave, Date.now());
    if (this.vistos.size > VISTOS_MAX) {
      const mas_viejo = this.vistos.keys().next().value;
      this.vistos.delete(mas_viejo);
    }
    return true;
  }

  _clasificar(texto) {
    const limpio = texto.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!limpio) return null;
    if (SI.includes(limpio)) return 'si';
    if (NO.includes(limpio)) return 'no';
    // "sí, adelante" / "vale perfecto": la primera palabra manda si es un sí claro.
    const primera = limpio.split(' ')[0];
    if (SI.includes(primera) && limpio.split(' ').length <= 3) return 'si';
    if (NO.includes(primera) && limpio.split(' ').length <= 3) return 'no';
    return null;
  }

  // ==========================================
  // Pendientes
  // ==========================================

  _clave(project_slug, jid) {
    return `${project_slug}:${String(jid || '').toLowerCase()}`;
  }

  _registrar(reg) {
    this.pendientes.set(reg.pedido_id, reg);
    const k = this._clave(reg.project_slug, reg.jid);
    if (!this.porJid.has(k)) this.porJid.set(k, new Set());
    this.porJid.get(k).add(reg.pedido_id);
  }

  // Pendientes que pueden responder a este jid. Si el evento trae project_slug, se
  // filtra por proyecto: el cliente de un negocio no confirma el pedido del de al lado.
  _pendientesDe(jid, project_slug = null) {
    const out = [];
    for (const reg of this.pendientes.values()) {
      if (String(reg.jid).toLowerCase() !== jid) continue;
      if (project_slug && reg.project_slug !== project_slug) continue;
      out.push(reg);
    }
    return out;
  }

  _cerrar(pedido_id) {
    const reg = this.pendientes.get(pedido_id);
    if (!reg) return;
    if (reg.timer) clearTimeout(reg.timer);
    if (reg.timerAviso) clearTimeout(reg.timerAviso);
    if (reg.timerRecordatorio) clearTimeout(reg.timerRecordatorio);
    if (reg.timerBorrado) clearTimeout(reg.timerBorrado);
    this.pendientes.delete(pedido_id);
    const k = this._clave(reg.project_slug, reg.jid);
    const set = this.porJid.get(k);
    if (set) { set.delete(pedido_id); if (set.size === 0) this.porJid.delete(k); }
  }

  // Se agotaron las DOS esperas (10 + 10 minutos) sin una palabra del cliente. Se
  // publica el aviso para la barra (notificador-pedidos → Telegram) y se CIERRA el
  // pendiente: `pedidos` retira el pedido con su cuenta, así que ya no hay nada a lo
  // que un mensaje tardío pueda confirmar. Si el cliente escribe más tarde no se abre
  // un pedido fantasma: su pedido, sencillamente, ya no existe.
  async _avisarSinConfirmar(reg) {
    if (!this.pendientes.has(reg.pedido_id)) return;
    await this._publicar('pedido.sin_confirmar', {
      pedido_id: reg.pedido_id,
      project_id: reg.project_id,
      project_slug: reg.project_slug,
      cuenta_id: reg.cuenta_id,
      cliente_nombre: reg.nombre,
      pedida_at: reg.pedida_at,
      recordado_at: reg.recordado_at || null,
      esperando_desde: new Date(reg.creado_en).toISOString(),
      motivo: 'sin_respuesta'
    });
    this._metric('confirmacion_pedido.sin_confirmar.total', { project: reg.project_slug });
    this.logger?.info?.('confirmacion-pedido.sin_confirmar', { pedido_id: reg.pedido_id });
    // El pedido se retira del sistema: este pendiente ya no tiene a qué responder.
    this._cerrar(reg.pedido_id);
  }

  // ==========================================
  // Datos: config, puente, ref
  // ==========================================

  async _config(project_slug) {
    if (this.configCache.has(project_slug)) return this.configCache.get(project_slug);
    let cfg = {};
    const base = await this._basePath(project_slug);
    if (base) {
      try {
        const raw = await fs.readFile(`${base}/config/config.json`, 'utf8');
        const json = JSON.parse(raw);
        cfg = json?.confirmacion_pedidos || {};
        cfg._qr = json?.whatsapp_qr || null;
      } catch (_err) { cfg = {}; }
    }
    this.configCache.set(project_slug, cfg);
    return cfg;
  }

  // El puente se busca con el slug del PROYECTO: este módulo solo habla con el
  // cliente de su negocio (the-pirate), nunca con el de al lado.
  _puente(cfg) {
    const qr = cfg && cfg._qr;
    if (!qr || qr.activo === false) return null;
    const url = qr.url || process.env.WA_PUENTE_URL || `http://127.0.0.1:${process.env.WA_PUENTE_PORT || 8235}/send`;
    const slug = qr.slug || null;
    if (!slug) return null;
    return { url: String(url), slug: String(slug) };
  }

  async _basePath(project_id) {
    try {
      const pm = this.moduleRegistry?.get('project-manager')?.instance;
      const res = await pm?.handleGetProject?.({ params: { id: project_id } });
      return res?.data?.project?.base_path || null;
    } catch (_err) { return null; }
  }

  async _refPedido(reg) {
    try {
      const cuentas = this.moduleRegistry?.get('cuentas')?.instance;
      if (!reg.cuenta_id || !cuentas?.handleGetCuenta) return null;
      const res = await cuentas.handleGetCuenta({ project_id: reg.project_id, id: reg.cuenta_id });
      const rd = String(res?.data?.ref_display || '');
      const m = rd.match(/[A-Z]\s?\d{3}/);
      return m ? m[0] : (rd || null);
    } catch (_err) { return null; }
  }


  _pila(nombre) {
    const n = typeof nombre === 'string' ? nombre.trim().replace(/\s+/g, ' ') : '';
    if (!n) return null;
    return n.split(' ')[0];
  }

  // ==========================================
  // Transporte
  // ==========================================

  async _enviar(puente, to, text) {
    try {
      const res = await fetch(puente.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: puente.slug, to, text }),
        signal: AbortSignal.timeout(8000)
      });
      const cuerpo = await res.json().catch(() => null);
      if (cuerpo && cuerpo.ok === true) return { ok: true, message_id: cuerpo.id || null };
      return { ok: false, motivo: 'puente_rechaza', detalle: String(cuerpo?.error || `HTTP ${res.status}`) };
    } catch (err) {
      return { ok: false, motivo: 'puente_no_responde', detalle: err?.message || String(err) };
    }
  }

  async _publicar(evento, payload) {
    try {
      await this.eventBus?.publish?.(evento, { ...payload, correlation_id: crypto.randomUUID() });
    } catch (err) {
      this.logger?.warn?.('confirmacion-pedido.publish_error', { evento, error_message: err?.message });
    }
  }

  _metric(nombre, labels) {
    try { this.metrics?.increment?.(nombre, labels); } catch (_) { /* ignore */ }
  }
}

module.exports = ConfirmacionPedidoModule;
