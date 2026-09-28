/**
 * contabilidad/asiento-ajuste — PUENTE STATELESS (B5, hoja del plan).
 *
 * PLANO 1 de los 4 planos de correccion: por donde la correccion del asesor
 * ENTRA al libro SIN BORRAR. El ajuste SUMA: nunca modifica ni borra el asiento
 * original. La traza (B4) queda intacta — es requisito de auditoria.
 *
 * PUENTE (patron real, stateless): sin PosPersistencia ni project.activated.
 * Cada op entra objeto, sale objeto. La dependencia con el libro es por EVENTO:
 * el ajuste se compone aqui y se ENVIA al diario publicando
 * contabilidad.asiento.ajustar.request (B2 es el UNICO escritor; aqui no se
 * escribe nada). La dependencia con traza-asiento (B4) tambien es por EVENTO:
 * verificarNoBorrado LEE por contabilidad.traza.consultar.request (contrato
 * TOLERANTE: si la traza no responde, se DECLARA la dependencia no disponible y
 * NUNCA se afirma que el original sigue ahi).
 *
 * Emisor/par de fallo: exito publica contabilidad.ajuste_recibido; error su par
 * determinista. NO REUTILIZA: la correccion que suma sobre el libro es propia
 * del dominio contable (espejo de A13 del lado del asiento).
 *
 * Ver hoja B5 del diseno-oop y bloque `asiento-ajuste` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Tipos de correccion admitidos (el ajuste SUMA, nunca borra).
const TIPOS_CORRECCION = ['AJUSTE', 'CORRIGE', 'ANULA', 'REGULARIZA'];

class AsientoAjuste extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'asiento-ajuste';
    this.version = 'reflejo-0.1.0';
    // Puente stateless: sin store que persistir (el libro vive en B2; la traza en B4).
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC ──
  onRecibirRequest(e) {
    return this._atender(e, 'recibir', 'contabilidad.ajuste.recibir.response', async (d) => {
      const res = await this._recibir(d);
      if (res.status === 200) {
        // El ajuste se ENVIA al diario (B2) por EVENTO: aqui no se escribe el libro.
        const senal = await this._senalarAlDiario(d, res.data);
        if (senal.ok) {
          this.eventBus?.publish('contabilidad.ajuste_recibido', {
            ...res.data,
            senal_libro: senal.data || null,
            correlation_id: d.correlation_id
          });
        } else {
          this.eventBus?.publish('contabilidad.ajuste_recibido.failed', {
            status: senal.status || 503,
            error: senal.error || {
              code: 'DEPENDENCIA_NO_DISPONIBLE',
              message: 'escritor-diario (B2) no confirmo el asiento de ajuste'
            },
            detalle: res.data
          });
          this.eventBus?.publish('contabilidad.asiento.ajustar.failed', {
            status: senal.status || 503,
            error: senal.error || { code: 'DEPENDENCIA_NO_DISPONIBLE', message: 'escritor-diario (B2) no respondio' }
          });
        }
      } else {
        this.eventBus?.publish('contabilidad.ajuste.recibir.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras (deterministas) ──

  // recibir(correccion: Asiento) -> Asiento de ajuste listo para el libro (B2).
  // El ajuste SUMA: lleva clave_original y borra_original:false — NUNCA borra.
  async _recibir(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const correccion = (input && (input.correccion || input.asiento)) || null;
    if (!correccion || typeof correccion !== 'object') return this._invalid('correccion');

    const tipo = String(correccion.tipo || (input && input.tipo) || 'AJUSTE').toUpperCase();
    if (!TIPOS_CORRECCION.includes(tipo)) return this._invalid('correccion.tipo');

    // A que original apunta: se DECLARA, no se asume.
    const claveOriginal = (input && (input.clave_original || input.clave_natural_original))
      || correccion.clave_original || (correccion.original && correccion.original.clave_natural) || null;
    if (!claveOriginal) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'la correccion no declara el asiento original al que apunta: se declara, no se asume', {
          senal: 'ORIGINAL_NO_DECLARADO'
        });
    }

    // El original debe seguir en la traza (B4): la correccion SUMA sobre el, no lo borra.
    const verificado = await this._verificarNoBorrado(pid, claveOriginal);
    if (!verificado.ok) return verificado.res;

    const apuntes = Array.isArray(correccion.apuntes) ? correccion.apuntes
      : (Array.isArray(correccion.lineas) ? correccion.lineas : null);
    if (!apuntes || apuntes.length < 2) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'un asiento de ajuste exige al menos dos apuntes (partida doble)', {
          n_apuntes: apuntes ? apuntes.length : 0
        });
    }
    const sumas = this._sumas(apuntes);
    if (Math.abs(sumas.debe - sumas.haber) > 0.005) {
      return this._errorResponse(409, 'DESCUADRE',
        `el asiento de ajuste NO cuadra: debe ${sumas.debe} != haber ${sumas.haber}`, {
          debe: sumas.debe, haber: sumas.haber, simbolico: 'DESCUADRE'
        });
    }

    const asientoAjuste = {
      tipo: 'AJUSTE',
      correccion_tipo: tipo,
      origen: (input && input.origen) || 'ASESOR_B5',
      apuntes,
      debe: sumas.debe,
      haber: sumas.haber,
      clave_original: claveOriginal,
      clave_natural: (input && input.clave_natural) || correccion.clave_natural || null,
      periodo: (input && input.periodo) || correccion.periodo || null,
      motivo: (input && input.motivo) || correccion.motivo || null,
      borra_original: false,
      suma: true,
      destino: 'escritor-diario (B2)'
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        asiento_ajuste: asientoAjuste,
        clave_original: claveOriginal,
        original_intacto: verificado.original_intacto,
        borrado: false,
        suma: true,
        regla: 'el ajuste SUMA: nunca modifica ni borra el asiento original'
      }
    };
  }

  // verificarNoBorrado() -> ok — el original sigue en la traza (B4) por EVENTO.
  async _verificarNoBorrado(pid, claveOriginal) {
    const resp = await this._rpc('contabilidad.traza.consultar.request', {
      project_id: pid,
      clave_natural: claveOriginal
    }, { timeout_ms: 4000 });

    if (!resp || resp.status !== 200) {
      return {
        ok: false,
        res: this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
          'traza-asiento (B4) no respondio: NO se afirma que el original siga intacto', {
            dependencia: 'traza-asiento',
            clave_original: claveOriginal,
            accion: 'NO_AFIRMAR_INTACTO_PUBLICAR_FALLO'
          })
      };
    }
    const hallada = !!(resp.data && (resp.data.hallada || resp.data.entrada));
    if (!hallada) {
      return {
        ok: false,
        res: this._errorResponse(404, 'ORIGINAL_NO_EN_TRAZA',
          `el asiento original ${claveOriginal} no esta en la traza: el asiento original no se borra`, {
            clave_original: claveOriginal,
            simbolico: 'ORIGINAL_NO_EN_TRAZA'
          })
      };
    }
    return { ok: true, original_intacto: true, entrada_traza: resp.data.entrada };
  }

  // señalarAlDiario(ajuste) -> el ajuste se ENVIA a B2 por EVENTO (aqui no se escribe).
  async _senalarAlDiario(d, data) {
    const pid = (d && d.project_id) || (data && data.project_id);
    if (!pid) return { ok: false, status: 400, error: { code: 'INVALID_INPUT', message: 'project_id requerido' } };

    const resp = await this._rpc('contabilidad.asiento.ajustar.request', {
      project_id: pid,
      rol: 'ADMISION',
      asiento: data.asiento_ajuste,
      clave_natural: data.asiento_ajuste && data.asiento_ajuste.clave_natural,
      unidad_de_cierre: d && d.unidad_de_cierre
    }, { timeout_ms: 5000 });

    if (!resp || resp.status !== 200) {
      return {
        ok: false,
        status: (resp && resp.status) || 503,
        error: (resp && resp.error) || { code: 'DEPENDENCIA_NO_DISPONIBLE', message: 'escritor-diario (B2) no respondio' }
      };
    }
    return { ok: true, data: { asiento: (resp.data && resp.data.asiento) || null, clave_natural: (resp.data && resp.data.clave_natural) || null } };
  }

  _sumas(apuntes) {
    let debe = 0;
    let haber = 0;
    for (const a of apuntes) {
      debe += Number(a && a.debe) || 0;
      haber += Number(a && a.haber) || 0;
    }
    return { debe: this._round(debe, 2), haber: this._round(haber, 2) };
  }

  // ── Tools ──
  toolRecibir(params) { return this._recibir(params); }
  toolVerificarNoBorrado(params) {
    const pid = params && params.project_id;
    if (!pid) return this._invalid('project_id');
    const clave = params && (params.clave_original || params.clave_natural);
    if (!clave) return this._invalid('clave_original');
    return this._verificarNoBorrado(pid, clave);
  }
}

module.exports = AsientoAjuste;
