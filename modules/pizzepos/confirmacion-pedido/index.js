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
 * Y lee su respuesta del MISMO fichero de eventos del puente por el que entró el
 * pedido (`whatsapp_qr.eventos`), sin tocar el lector compartido: filtrar por el
 * jid que tiene un pedido esperando es todo lo que hace falta. Un "sí" desbloquea
 * el pedido (pedidos.handleConfirmarPedido, que lo manda a cocina); un "no" lo
 * cierra. Si no contesta en 10 minutos, se avisa para que el de la barra decida:
 * un pedido no puede quedarse colgado en silencio.
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

const ESPERA_RESPUESTA_MS = 10 * 60 * 1000;   // 10 min sin respuesta → aviso a barra
const INTERVALO_LECTURA_MS = 5000;            // cada cuánto se mira el fichero del puente

class ConfirmacionPedidoModule {
  constructor() {
    this.name = 'confirmacion-pedido';
    this.version = '1.0.0';

    this.pendientes = new Map();      // pedido_id → { project_slug, jid, nombre, ... timers }
    this.porJid = new Map();          // `${project_slug}:${jid}` → Set<pedido_id>
    this.offsets = new Map();         // ruta del fichero de eventos → byte leído
    this.lector = null;
    this.leyendo = false;
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

    this.lector = setInterval(() => { this._leerRespuestas(); }, INTERVALO_LECTURA_MS);
    if (this.lector.unref) this.lector.unref();

    this.logger?.info?.('confirmacion-pedido.loaded', { version: this.version });
  }

  async onUnload() {
    if (this.lector) clearInterval(this.lector);
    this.lector = null;
    for (const p of this.pendientes.values()) {
      if (p.timer) clearTimeout(p.timer);
      if (p.timerAviso) clearTimeout(p.timerAviso);
    }
    this.pendientes.clear();
    this.porJid.clear();
    this.configCache.clear();
    this.offsets.clear();
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
      timer: null,
      timerAviso: null
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
    const { pedido_id, project_slug, cliente_jid, cliente_nombre, pedidos_entregados } = data;
    if (!project_slug || !cliente_jid) return;

    const cfg = await this._config(project_slug);
    const puente = this._puente(cfg);
    if (!puente) {
      this._metric('confirmacion_pedido.fallido.total', { project: project_slug, razon: 'sin_puente' });
      return;
    }
    const texto = cfg.texto_habitual
      ? this._formatear(cfg.texto_habitual, { nombre: this._pila(cliente_nombre), ref: null, pedido_id })
      : this._textoHabitual(this._pila(cliente_nombre), pedidos_entregados);

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
    reg.timerAviso = setTimeout(() => { this._avisarSinConfirmar(reg).catch(() => {}); }, ESPERA_RESPUESTA_MS);
    if (reg.timerAviso.unref) reg.timerAviso.unref();
    this._metric('confirmacion_pedido.pedida.total', { project: reg.project_slug });
    this.logger?.info?.('confirmacion-pedido.pedida', { pedido_id: reg.pedido_id, ref });
  }

  _textoConfirmacion(nombre, ref) {
    const saludo = nombre ? `¡Hola, ${nombre}!` : '¡Hola!';
    return [
      `${saludo} 👋`,
      `Hemos recibido tu pedido${ref ? ` ${ref}` : ''} y queremos confirmarlo antes de ponerlo en marcha.`,
      'Responde SÍ y lo mandamos a cocina ahora mismo.',
      'Si quieres cambiar algo, dínoslo por aquí.'
    ].join('\n');
  }

  _textoHabitual(nombre, entregados) {
    const cuantos = Number(entregados) || 0;
    const saludo = nombre ? `¡${nombre}!` : '¡Hola!';
    return [
      `${saludo} Ya estamos con tu pedido 🍕`,
      cuantos > 0
        ? `Con esta van ${cuantos + 1} — gracias por seguir viniendo.`
        : 'Gracias por venir.',
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
  // Lectura de la respuesta
  // ==========================================

  async _leerRespuestas() {
    if (this.leyendo) return;         // una lectura a la vez
    this.leyendo = true;
    try {
      // Un fichero de eventos por proyecto con la puerta abierta. Cada uno con su
      // propio offset: el lector del puente es compartido, los pendientes no.
      for (const cfg of this.configCache.values()) {
        if (!cfg || !cfg.eventos) continue;
        await this._leerFichero(cfg.eventos);
      }
    } catch (err) {
      this.logger?.warn?.('confirmacion-pedido.lectura_error', { error_message: err?.message || String(err) });
    } finally {
      this.leyendo = false;
    }
  }

  async _leerFichero(ruta) {
    const st = await fs.stat(ruta).catch(() => null);
    if (!st) return;
    // Primer arranque: lo que ya estaba escrito NO es una respuesta a nada.
    if (!this.offsets.has(ruta) || st.size < this.offsets.get(ruta)) {
      this.offsets.set(ruta, st.size);
      return;
    }
    const desde = this.offsets.get(ruta);
    if (st.size === desde) return;

    const fh = await fs.open(ruta, 'r');
    try {
      const buf = Buffer.alloc(st.size - desde);
      await fh.read(buf, 0, buf.length, desde);
      this.offsets.set(ruta, st.size);
      for (const linea of buf.toString('utf8').split('\n')) {
        const t = linea.trim();
        if (!t) continue;
        let ev; try { ev = JSON.parse(t); } catch { continue; }
        await this._procesarEvento(ev);
      }
    } finally {
      await fh.close();
    }
  }

  async _procesarEvento(ev) {
    if (!ev || ev.tipo !== 'mensaje') return;
    if (ev.grupo === true || ev.grupo === 'True') return;      // un grupo no confirma un pedido
    const jid = String(ev.de || '').trim().toLowerCase();
    if (!jid) return;
    const texto = String(ev.texto || '').trim();
    if (!texto || texto.length > 40) return;                   // un párrafo no es un "sí"
    // Los mensajes que MANDA el puente también vuelven al fichero: no son respuestas.
    if (/^pedido recibido/i.test(texto)) return;

    const pedidos = this._pendientesDe(jid);
    if (pedidos.length === 0) return;

    const respuesta = this._clasificar(texto);
    if (!respuesta) return;                                    // habla de otra cosa

    // El más antiguo primero: si alguien tiene dos pedidos parados, contesta al que
    // lleva más tiempo esperando y el otro se queda pendiente (no se adivina).
    pedidos.sort((a, b) => a.creado_en - b.creado_en);
    const reg = pedidos[0];

    const r = respuesta === 'si'
      ? await this._llamarPedidos('handleConfirmarPedido', { pedido_id: reg.pedido_id })
      : await this._llamarPedidos('handleRechazarPedido', { pedido_id: reg.pedido_id, motivo: 'cliente_dijo_no' });

    if (r && r.status >= 400) {
      this.logger?.warn?.('confirmacion-pedido.respuesta_no_aplicada', {
        pedido_id: reg.pedido_id, respuesta, status: r.status
      });
      return;
    }
    this._cerrar(reg.pedido_id);
    this._metric(respuesta === 'si' ? 'confirmacion_pedido.confirmado.total' : 'confirmacion_pedido.rechazado.total',
      { project: reg.project_slug });
    this.logger?.info?.('confirmacion-pedido.respondida', { pedido_id: reg.pedido_id, respuesta });
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

  _pendientesDe(jid) {
    const out = [];
    for (const reg of this.pendientes.values()) {
      if (String(reg.jid).toLowerCase() === jid) out.push(reg);
    }
    return out;
  }

  _cerrar(pedido_id) {
    const reg = this.pendientes.get(pedido_id);
    if (!reg) return;
    if (reg.timer) clearTimeout(reg.timer);
    if (reg.timerAviso) clearTimeout(reg.timerAviso);
    this.pendientes.delete(pedido_id);
    const k = this._clave(reg.project_slug, reg.jid);
    const set = this.porJid.get(k);
    if (set) { set.delete(pedido_id); if (set.size === 0) this.porJid.delete(k); }
  }

  // No contestó. No se confirma solo: se avisa para que el de la barra lo mande con
  // un clic (`pedidos.handleConfirmarPedido`) o llame al cliente. Un pedido parado en
  // silencio es peor que un pedido rechazado.
  async _avisarSinConfirmar(reg) {
    if (!this.pendientes.has(reg.pedido_id)) return;
    await this._publicar('pedido.sin_confirmar', {
      pedido_id: reg.pedido_id,
      project_id: reg.project_id,
      project_slug: reg.project_slug,
      cuenta_id: reg.cuenta_id,
      cliente_nombre: reg.nombre,
      pedida_at: reg.pedida_at,
      esperando_desde: new Date(reg.creado_en).toISOString()
    });
    this._metric('confirmacion_pedido.sin_confirmar.total', { project: reg.project_slug });
    this.logger?.info?.('confirmacion-pedido.sin_confirmar', { pedido_id: reg.pedido_id });
    // Sigue pendiente: si más tarde contesta, su "sí" aún vale.
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
    // La ruta del fichero de eventos del puente: config del proyecto o entorno.
    cfg.eventos = cfg.eventos || (cfg._qr && cfg._qr.eventos) || process.env.WA_EVENTOS || null;
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

  async _llamarPedidos(metodo, args) {
    const pedidos = this.moduleRegistry?.get('pedidos')?.instance;
    if (!pedidos || typeof pedidos[metodo] !== 'function') return null;
    try { return await pedidos[metodo](args); }
    catch (err) { this.logger?.warn?.('confirmacion-pedido.pedidos_error', { metodo, error_message: err?.message }); return null; }
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
