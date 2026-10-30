'use strict';

const crypto = require('crypto');

const BaseModule = require('../../_shared/base-module');

// Tope del Set de idempotencia en memoria (best-effort: no persiste).
const MAX_CLAVES_IDEMPOTENCIA = 100;
// Telegram corta a 4096 caracteres por mensaje; se deja margen.
const MAX_LARGO_TELEGRAM = 4000;

const ETIQUETAS_METODO = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  bizum: 'Bizum',
  transferencia: 'Transferencia',
  externo_llevadoo: 'Externo'
};

const ORDEN_METODOS = ['efectivo', 'tarjeta', 'bizum', 'transferencia', 'externo_llevadoo'];


/**
 * reporte-cierre — PUENTE del vertical pizzepos.
 *
 * Escucha `caja.cerrada` (fire-and-forget) que publica persistencia-comandero
 * y MANDA el reporte del cierre al dueño:
 *   - Telegram: telegram.send_message.request (parseMode HTML)
 *   - Email   : local.gmail.send.request (opcional, solo si email_destino)
 *
 * Es PUENTE: no calcula el cierre (eso es del custodio), no persiste nada y no
 * escribe ficheros. Solo COMPONE el mensaje a partir de los datos del evento y
 * lo publica en el bus. Si un dato falta, se omite del mensaje — nunca se
 * inventa una cifra (invariante de honestidad).
 *
 * Payload esperado de `caja.cerrada` (lo produce persistencia-comandero):
 *   { fecha, project_id, arqueo, totales, diferencia, cierre, informe }
 *   totales = { total_ventas, total_ingresos, total_propinas,
 *               por_metodo_pago: { efectivo, tarjeta, bizum, transferencia, externo_llevadoo },
 *               por_tipo_cuenta, por_camarero }
 *   cierre  = { cierre_id, fecha_jornada, hora_inicio, hora_cierre, arqueo, totales,
 *               diferencia, estado ('cuadrado'|'sobrante'|'faltante'),
 *               desglose_productos: { porFamilia, porProducto, totalUnidades },
 *               cuentas_cerradas_forzadas: [...] }
 *
 * Ojo: `cierre.esperado` / `cierre.contado` / `cierre.diferencias` (desglose por
 * método) llegan de otra rama del mismo trabajo y PUEDEN NO EXISTIR. Este módulo
 * los usa si están; si no, cae a `totales.por_metodo_pago` + `arqueo` para el
 * efectivo y a `diferencia` para la diferencia global.
 *
 * Idempotencia: best-effort EN MEMORIA. Set acotado a 100 claves `fecha::project_id`.
 * Se pierde al reiniciar el core (no hay persistencia: es un puente). Cubre el caso
 * real — doble `caja.cerrada` en el mismo proceso (reintento del bus o doble clic
 * en el botón de cierre): el segundo intento NO reenvía el reporte.
 */
class ReporteCierreModule extends BaseModule {
  constructor() {
    super();
    this.name = 'reporte-cierre';
    this.version = '1.0.0';

    this.config = {};
    this._enviados = new Set();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.eventBus = context.eventBus;

    // La config del módulo llega en moduleConfig (manifest.config del module.json).
    // El segundo camino (`context.config[name]`) es la compat con cores antiguos.
    const cfg = (context && (context.moduleConfig || (context.config && context.config[this.name]))) || {};
    this.config = { ...cfg };

    this.logger.info('reporte-cierre.loaded', {
      version: this.version,
      telegram_activo: this._telegramActivo(),
      chat_id_configurado: this._chatId() != null,
      email_configurado: this._emailDestino() != null
    });
  }

  async onUnload() {
    this._enviados.clear();
  }

  // ==========================================
  // Bus subscribers
  // ==========================================

  /**
   * Disparador: caja.cerrada. Fire-and-forget — nunca lanza hacia el bus; si
   * algo falla se declara en el resultado (abierto) y se loguea.
   */
  async onCajaCerrada(event) {
    try {
      return await this._reportar(event);
    } catch (err) {
      this.logger.warn('reporte-cierre.caja_cerrada.failed', {
        error_message: err && err.message ? err.message : String(err)
      });
      return {
        ok: false,
        canales: [],
        abierto: [`error: ${err && err.message ? err.message : String(err)}`]
      };
    }
  }

  // ==========================================
  // Lógica central
  // ==========================================

  async _reportar(event) {
    const data = (event && event.data) || event || {};
    const cierre = data.cierre || {};
    const fecha = data.fecha || cierre.fecha_jornada || null;
    const project_id = data.project_id || cierre.project_id || null;

    if (!fecha) {
      this.logger.warn('reporte-cierre.caja_cerrada.sin_fecha', { project_id });
      this._incrementar('reporte-cierre.reporte.descartado', { razon: 'sin_fecha' });
      return {
        ok: false,
        canales: [],
        abierto: ['fecha: el evento caja.cerrada no trae fecha — sin fecha no hay reporte que componer']
      };
    }

    // Idempotencia (best-effort, memoria): mismo cierre dos veces = un solo envío.
    const clave = `${fecha}::${project_id || 'global'}`;
    if (this._enviados.has(clave)) {
      this.logger.info('reporte-cierre.reporte.duplicado', { fecha, project_id });
      this._incrementar('reporte-cierre.reporte.descartado', { razon: 'duplicado' });
      return {
        ok: true,
        duplicado: true,
        fecha,
        project_id,
        canales: [],
        abierto: ['duplicado: este cierre ya se envió en esta ejecución (no se reenvía)']
      };
    }

    const modelo = this._modelo(data);
    const canales = [];
    const abierto = [];

    // --- Telegram ---
    if (!this._telegramActivo()) {
      abierto.push('telegram: desactivado (telegram_activo=false)');
    } else if (this._chatId() == null) {
      abierto.push('telegram: sin chat_id — configura reporte-cierre.config.chat_id');
      this.logger.warn('reporte-cierre.telegram.sin_chat_id', { fecha, project_id });
    } else {
      const ok = await this._enviarTelegram(modelo, data);
      if (ok) canales.push('telegram');
      else abierto.push('telegram: la publicación al bus falló');
    }

    // --- Email (opcional) ---
    const emailDestino = this._emailDestino();
    if (!emailDestino) {
      abierto.push('email: sin email_destino configurado');
    } else {
      const ok = await this._enviarEmail(modelo, data, fecha);
      if (ok) canales.push('email');
      else abierto.push('email: la publicación al bus falló');
    }

    // Solo se recuerda como enviado si al menos un canal salió: así un cierre que
    // no pudo notificarse (sin chat_id) sigue siendo reintentable tras configurar.
    if (canales.length > 0) this._recordar(clave);

    const resultado = {
      ok: canales.length > 0,
      duplicado: false,
      fecha,
      project_id,
      estado: modelo.estado,
      canales,
      abierto
    };

    await this._publicarEvento('cierre.reporte_enviado', {
      fecha,
      project_id,
      canales,
      ok: resultado.ok
    }, data);

    this.logger.info('reporte-cierre.reporte', {
      fecha,
      project_id: project_id || 'global',
      estado: modelo.estado,
      canales,
      abierto
    });

    return resultado;
  }

  // RPC minimo (BaseModule no lo trae): publica y espera la response correlada por request_id.
  _rpc(evento, payload = {}, { timeout_ms = 5000 } = {}) {
    if (!this.eventBus || !this.eventBus.subscribe || !this.eventBus.publish) return Promise.resolve(null);
    const request_id = crypto.randomUUID();
    const responseEvent = evento.endsWith('.request')
      ? evento.slice(0, -'.request'.length) + '.response'
      : evento + '.response';
    return new Promise((resolve) => {
      let unsub = null;
      let cerrado = false;
      const timeout = setTimeout(() => {
        cerrado = true;
        if (unsub) unsub();
        resolve(null);
      }, timeout_ms);
      try {
        unsub = this.eventBus.subscribe(responseEvent, (event) => {
          const d = (event && event.data) || event;
          if (cerrado || !d || d.request_id !== request_id) return;
          clearTimeout(timeout);
          cerrado = true;
          if (unsub) unsub();
          resolve(d);
        });
        this.eventBus.publish(evento, { request_id, ...payload });
      } catch (_) {
        clearTimeout(timeout);
        cerrado = true;
        if (unsub) unsub();
        resolve(null);
      }
    });
  }

  // Bot del proyecto duenno del cierre (telegram-bridge: un bot por proyecto). Cacheado.
  async _botDelProyecto(project_id) {
    const deConfig = this.config.bot_name || 'Pro_nonina_bot';
    if (!project_id || this.config.bot_por_proyecto === false) return deConfig;
    if (this._botsPorProyecto && this._botsPorProyecto.has(project_id)) return this._botsPorProyecto.get(project_id);
    try {
      const lista = await this._rpc('telegram.bridge.listar.request', {}, {
        timeout_ms: this.config.timeout_bridge_ms || 5000
      });
      const vinculos = (lista && ((lista.data && lista.data.vinculos) || lista.vinculos)) || [];
      const v = vinculos.find((x) => x && x.project_id === project_id && x.botName);
      if (v) {
        this._botsPorProyecto = this._botsPorProyecto || new Map();
        this._botsPorProyecto.set(project_id, v.botName);
        return v.botName;
      }
    } catch (_) { /* sin bridge: se usa el bot de config */ }
    return deConfig;
  }

  // ==========================================
  // Canales
  // ==========================================

  async _enviarTelegram(modelo, sourceData) {
    const texto = this._recortar(this._componerTexto(modelo), MAX_LARGO_TELEGRAM);
    // El bot se resuelve POR PROYECTO: la app es una sola y el cierre de The Pirate no debe
    // salir por el bot de Nonina. Si no hay vinculo, se cae al bot de config.
    const botName = await this._botDelProyecto(sourceData && sourceData.project_id);
    try {
      await this.eventBus.publish('telegram.send_message.request', {
        request_id: crypto.randomUUID(),
        botName,
        chatId: this._chatId(),
        text: texto,
        parseMode: 'HTML',
        correlation_id: sourceData && sourceData.correlation_id
      });
      this._incrementar('reporte-cierre.reporte.enviado', { canal: 'telegram' });
      return true;
    } catch (err) {
      this.logger.warn('reporte-cierre.telegram.publish_failed', {
        error_message: err && err.message ? err.message : String(err)
      });
      return false;
    }
  }

  async _enviarEmail(modelo, sourceData, fecha) {
    try {
      await this.eventBus.publish('local.gmail.send.request', {
        request_id: crypto.randomUUID(),
        account: 'default',
        to: this._emailDestino(),
        subject: `Cierre de caja ${fecha} — ${modelo.estado === 'desconocido' ? 'sin estado' : modelo.estado}`,
        body: this._componerHtml(modelo),
        html: true,
        correlation_id: sourceData && sourceData.correlation_id
      });
      this._incrementar('reporte-cierre.reporte.enviado', { canal: 'email' });
      return true;
    } catch (err) {
      this.logger.warn('reporte-cierre.email.publish_failed', {
        error_message: err && err.message ? err.message : String(err)
      });
      return false;
    }
  }

  // ==========================================
  // MODELO — de payload a datos listos para pintar
  // ==========================================

  /**
   * Traduce el payload de caja.cerrada a un modelo plano. Cada campo es
   * null cuando el dato no viene: el mensaje lo omite en vez de inventarlo.
   */
  _modelo(data) {
    const cierre = data.cierre || {};
    const totales = data.totales || cierre.totales || {};
    const fecha = data.fecha || cierre.fecha_jornada || null;
    const diferencia = this._numero(
      data.diferencia !== undefined && data.diferencia !== null ? data.diferencia : cierre.diferencia
    );

    const estado = this._estado(cierre.estado, diferencia);
    const metodos = this._metodos(data, diferencia);
    const { productos, unidades } = this._topProductos(cierre.desglose_productos);
    const forzadas = this._cuentasForzadas(cierre.cuentas_cerradas_forzadas);

    return {
      fecha,
      fechaTexto: this._fechaTexto(fecha),
      horaTexto: this._horaTexto(cierre.hora_cierre),
      estado,
      diferencia,
      estadoTexto: this._estadoTexto(estado, diferencia),
      totalIngresos: this._numero(totales.total_ingresos),
      ventas: this._numero(totales.total_ventas),
      propinas: this._numero(totales.total_propinas),
      metodos,
      productos,
      unidades,
      forzadas
    };
  }

  /**
   * Desglose por método de pago.
   *
   * Orden de fuentes por método:
   *   1. cierre.esperado / cierre.contado / cierre.diferencias (rama nueva, si están)
   *   2. cierre.diferencias[metodo] como objeto { esperado, contado, diferencia } o número
   *   3. para efectivo: totales.por_metodo_pago.efectivo como esperado y
   *      arqueo.efectivo / arqueo.total_contado como contado
   *   4. totales.por_metodo_pago[metodo] como importe cobrado
   */
  _metodos(data, diferenciaGlobal) {
    const cierre = data.cierre || {};
    const totales = data.totales || cierre.totales || {};
    const arqueo = data.arqueo || cierre.arqueo || {};

    const porMetodo = totales.por_metodo_pago || {};
    const esperadoDecl = (cierre.esperado && typeof cierre.esperado === 'object') ? cierre.esperado : {};
    const contadoDecl = (cierre.contado && typeof cierre.contado === 'object') ? cierre.contado : {};
    const difDecl = (cierre.diferencias && typeof cierre.diferencias === 'object') ? cierre.diferencias : {};

    const claves = ORDEN_METODOS.slice();
    for (const fuente of [porMetodo, esperadoDecl, contadoDecl, difDecl]) {
      for (const clave of Object.keys(fuente)) {
        if (!claves.includes(clave)) claves.push(clave);
      }
    }

    const filas = [];
    for (const clave of claves) {
      const entradaDif = difDecl[clave];
      const difObj = (entradaDif && typeof entradaDif === 'object') ? entradaDif : {};

      const total = this._numero(porMetodo[clave]);
      let esperado = this._numero(esperadoDecl[clave] !== undefined && esperadoDecl[clave] !== null
        ? esperadoDecl[clave]
        : difObj.esperado);
      let contado = this._numero(contadoDecl[clave] !== undefined && contadoDecl[clave] !== null
        ? contadoDecl[clave]
        : difObj.contado);
      let dif = this._numero(
        difObj.diferencia !== undefined && difObj.diferencia !== null
          ? difObj.diferencia
          : (typeof entradaDif === 'number' ? entradaDif : null)
      );

      if (clave === 'efectivo') {
        // El arqueo solo cuenta efectivo físico: es el único método con "contado".
        if (esperado == null) esperado = total;
        if (contado == null) {
          const arqueoEfectivo = this._numero(arqueo.efectivo);
          contado = arqueoEfectivo !== null ? arqueoEfectivo : this._numero(arqueo.total_contado);
        }
        // La `diferencia` del hecho es exactamente contado − esperado del efectivo.
        if (dif == null) dif = diferenciaGlobal;
      }

      const hayDatos = total !== null || esperado !== null || contado !== null || dif !== null;
      if (!hayDatos) continue;
      // Método sin movimiento y sin desglose: no se pinta (ruido).
      const todoCero = [total, esperado, contado, dif].every(v => v === null || v === 0);
      if (todoCero) continue;

      const partes = [];
      if (esperado !== null) partes.push(`esperado ${this._importe(esperado)}`);
      if (contado !== null) partes.push(`contado ${this._importe(contado)}`);
      if (dif !== null) partes.push(`dif. ${this._importe(dif)}`);
      // Sin desglose esperado/contado, el importe cobrado es el único dato honesto.
      if (partes.length === 0 && total !== null) partes.push(this._importe(total));

      filas.push({
        etiqueta: ETIQUETAS_METODO[clave] || this._capitalizar(clave),
        detalle: partes.join(' · ')
      });
    }

    return filas;
  }

  /** TOP 5 productos por importe + total de unidades del día. */
  _topProductos(desglose) {
    const porProducto = (desglose && desglose.porProducto) || {};
    const entradas = Object.keys(porProducto).map(nombre => ({
      nombre,
      cantidad: this._numero(porProducto[nombre] && porProducto[nombre].cantidad) || 0,
      importe: this._numero(porProducto[nombre] && porProducto[nombre].importe) || 0
    }));

    // Orden estable: importe desc (empates conservan el orden de inserción).
    const ordenadas = entradas.slice().sort((a, b) => b.importe - a.importe);
    const top = ordenadas.slice(0, 5);

    let unidades = this._numero(desglose && desglose.totalUnidades);
    if (unidades === null) {
      unidades = entradas.reduce((acc, p) => acc + p.cantidad, 0);
    }

    return { productos: top, unidades };
  }

  /** Cuentas que se cerraron a la fuerza al cerrar caja (aviso al dueño). */
  _cuentasForzadas(lista) {
    if (!Array.isArray(lista) || lista.length === 0) return null;
    const nombres = lista
      .map(c => (c && (c.nombre || c.ref_display)) || null)
      .filter(Boolean)
      .slice(0, 3);
    return { total: lista.length, nombres };
  }

  // ==========================================
  // RENDER — Telegram (HTML)
  // ==========================================

  _componerTexto(modelo) {
    const lineas = [];

    lineas.push(`🧾 <b>Cierre de caja · ${this._escapar(modelo.fechaTexto)}`
      + (modelo.horaTexto ? ` · ${this._escapar(modelo.horaTexto)}` : '') + '</b>');
    lineas.push(`Estado: <b>${this._escapar(modelo.estadoTexto)}</b>`);
    lineas.push('');

    if (modelo.totalIngresos !== null) {
      const ventas = modelo.ventas !== null
        ? ` · ${modelo.ventas} ${modelo.ventas === 1 ? 'venta' : 'ventas'}`
        : '';
      lineas.push(`💰 Total del día: <b>${this._importe(modelo.totalIngresos)}</b>${ventas}`);
    } else if (modelo.ventas !== null) {
      lineas.push(`💰 Ventas: <b>${modelo.ventas}</b>`);
    }

    if (modelo.metodos.length > 0) {
      lineas.push('');
      lineas.push('<b>Por método de pago</b>');
      for (const fila of modelo.metodos) {
        lineas.push(`· <b>${this._escapar(fila.etiqueta)}</b>: ${this._escapar(fila.detalle)}`);
      }
    }

    if (modelo.propinas !== null && modelo.propinas > 0) {
      lineas.push('');
      lineas.push(`🎁 Propinas: <b>${this._importe(modelo.propinas)}</b>`);
    }

    if (modelo.productos.length > 0) {
      lineas.push('');
      const n = modelo.productos.length;
      lineas.push(`<b>Top ${n} ${n === 1 ? 'producto' : 'productos'}</b>`);
      for (const p of modelo.productos) {
        lineas.push(`· <b>${this._escapar(p.nombre)}</b> · ${p.cantidad} ud · ${this._importe(p.importe)}`);
      }
      lineas.push(`Total: ${modelo.unidades} ud`);
    }

    if (modelo.forzadas) {
      lineas.push('');
      const nombres = modelo.forzadas.nombres.length > 0
        ? `: ${modelo.forzadas.nombres.map(n => this._escapar(n)).join(', ')}`
          + (modelo.forzadas.total > modelo.forzadas.nombres.length ? '…' : '')
        : '';
      lineas.push(`⚠️ ${modelo.forzadas.total} ${modelo.forzadas.total === 1 ? 'cuenta cerrada' : 'cuentas cerradas'} a la fuerza${nombres}`);
    }

    return lineas.join('\n');
  }

  // ==========================================
  // RENDER — Email (HTML simple, mismo contenido)
  // ==========================================

  _componerHtml(modelo) {
    const esc = (t) => this._escapar(t);
    const colorEstado = modelo.estado === 'cuadrado' ? '#1a7f37'
      : modelo.estado === 'faltante' ? '#c62828'
        : modelo.estado === 'sobrante' ? '#b26a00' : '#555';

    const filas = [];
    if (modelo.totalIngresos !== null) {
      filas.push(`<tr><td>Total del día</td><td><b>${esc(this._importe(modelo.totalIngresos))}</b></td></tr>`);
    }
    if (modelo.ventas !== null) {
      filas.push(`<tr><td>Ventas</td><td><b>${modelo.ventas}</b></td></tr>`);
    }
    for (const fila of modelo.metodos) {
      filas.push(`<tr><td>${esc(fila.etiqueta)}</td><td>${esc(fila.detalle)}</td></tr>`);
    }
    if (modelo.propinas !== null && modelo.propinas > 0) {
      filas.push(`<tr><td>Propinas</td><td><b>${esc(this._importe(modelo.propinas))}</b></td></tr>`);
    }

    const filasProductos = modelo.productos.map(p =>
      `<tr><td>${esc(p.nombre)}</td><td style="text-align:right">${p.cantidad} ud</td>`
      + `<td style="text-align:right">${esc(this._importe(p.importe))}</td></tr>`
    ).join('');

    const bloqueForzadas = modelo.forzadas
      ? `<p style="color:#b26a00"><b>⚠️ ${modelo.forzadas.total} `
      + `${modelo.forzadas.total === 1 ? 'cuenta cerrada' : 'cuentas cerradas'} a la fuerza</b>`
      + (modelo.forzadas.nombres.length > 0 ? `: ${esc(modelo.forzadas.nombres.join(', '))}` : '')
      + '</p>'
      : '';

    return [
      '<!DOCTYPE html><html><head><meta charset="utf-8"></head>',
      '<body style="font-family:Arial,Helvetica,sans-serif;color:#222;padding:16px;">',
      `<h2 style="margin:0 0 4px">Cierre de caja · ${esc(modelo.fechaTexto)}`
      + `${modelo.horaTexto ? ' · ' + esc(modelo.horaTexto) : ''}</h2>`,
      `<p style="margin:0 0 16px;color:${colorEstado}"><b>${esc(modelo.estadoTexto)}</b></p>`,
      '<table cellspacing="0" cellpadding="6" style="border-collapse:collapse;min-width:320px">',
      '<tbody>', filas.join(''), '</tbody></table>',
      modelo.productos.length > 0
        ? `<h3 style="margin:20px 0 6px">Top ${modelo.productos.length} ${modelo.productos.length === 1 ? 'producto' : 'productos'}</h3>`
          + '<table cellspacing="0" cellpadding="6" style="border-collapse:collapse;min-width:320px"><tbody>'
          + filasProductos
          + `<tr><td><b>Total</b></td><td style="text-align:right"><b>${modelo.unidades} ud</b></td><td></td></tr>`
          + '</tbody></table>'
        : '',
      bloqueForzadas,
      '<p style="margin-top:24px;color:#888;font-size:12px">Reporte automático del cierre de caja.</p>',
      '</body></html>'
    ].join('');
  }

  // ==========================================
  // Helpers de formato y config
  // ==========================================

  /**
   * Importe en formato español: coma decimal y punto de miles.
   * Implementación propia (no Intl) para que sea determinista y no dependa
   * de los datos de locale del runtime.
   */
  _importe(valor) {
    const n = this._numero(valor);
    if (n === null) return null;
    const negativo = n < 0;
    const [entera, decimales] = Math.abs(n).toFixed(2).split('.');
    const conMiles = entera.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${negativo ? '-' : ''}${conMiles},${decimales} €`;
  }

  _numero(valor) {
    if (valor === undefined || valor === null || valor === '') return null;
    const n = typeof valor === 'number' ? valor : Number(valor);
    return Number.isFinite(n) ? n : null;
  }

  /** '2026-10-30' → '30/10/2026'. Si no es ISO, se respeta tal cual. */
  _fechaTexto(fecha) {
    if (!fecha) return 'sin fecha';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(fecha);
  }

  /** '2026-10-30T23:12:45.000Z' → '23:12' (hora local del servidor). */
  _horaTexto(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  /** Normaliza el estado a 'cuadrado' | 'sobrante' | 'faltante' | 'desconocido'. */
  _estado(declarado, diferencia) {
    const e = typeof declarado === 'string' ? declarado.trim().toLowerCase() : '';
    if (e === 'cuadrado' || e === 'sobrante' || e === 'faltante') return e;
    if (diferencia === null) return 'desconocido';
    if (diferencia === 0) return 'cuadrado';
    return diferencia > 0 ? 'sobrante' : 'faltante';
  }

  _estadoTexto(estado, diferencia) {
    switch (estado) {
      case 'cuadrado':
        return 'Cuadrado ✅';
      case 'sobrante':
        return diferencia !== null ? `Sobrante ${this._importe(Math.abs(diferencia))} ⚠️` : 'Sobrante ⚠️';
      case 'faltante':
        return diferencia !== null ? `Faltante ${this._importe(Math.abs(diferencia))} ⚠️` : 'Faltante ⚠️';
      default:
        return 'Estado no declarado';
    }
  }

  _escapar(texto) {
    if (texto === undefined || texto === null) return '';
    return String(texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Telegram corta a 4096; margen para no partir una entidad HTML. */
  _recortar(texto, max) {
    if (typeof texto !== 'string' || texto.length <= max) return texto;
    return `${texto.slice(0, max - 20)}\n… (reporte recortado)`;
  }

  _capitalizar(texto) {
    const s = String(texto || '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  _telegramActivo() {
    return this.config.telegram_activo !== false;
  }

  /** chat_id: numérico si es un id de chat (incluye grupos negativos), string si no. */
  _chatId() {
    const raw = this.config.chat_id;
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    return /^-?\d+$/.test(s) ? Number(s) : s;
  }

  _emailDestino() {
    const raw = this.config.email_destino;
    if (Array.isArray(raw)) {
      const limpios = raw.map(x => String(x).trim()).filter(Boolean);
      return limpios.length > 0 ? limpios : null;
    }
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim();
    return s ? s : null;
  }

  // ==========================================
  // Idempotencia best-effort (memoria, acotada)
  // ==========================================

  _recordar(clave) {
    this._enviados.add(clave);
    while (this._enviados.size > MAX_CLAVES_IDEMPOTENCIA) {
      const masAntiguo = this._enviados.values().next().value;
      this._enviados.delete(masAntiguo);
    }
  }

  _incrementar(metrica, etiquetas) {
    try {
      if (this.metrics && typeof this.metrics.increment === 'function') {
        this.metrics.increment(metrica, etiquetas);
      }
    } catch (_) { /* métricas son observabilidad: nunca tumban el envío */ }
  }
}

module.exports = ReporteCierreModule;
