/**
 * contabilidad/aviso-al-negocio — PUENTE STATELESS (R1, hoja del plan).
 *
 * EL AVISO QUE LLEGA DE VERDAD. El requisito del dueno ("informacion rica que
 * avise") se cumple aqui: completa el motor de avisos (K2), que solo PRODUCE, con
 * la cara de ENTREGA al negocio. Sin confirmacion de entrega el aviso NO consta
 * como recibido — la honestidad es la invariante: nadie da por entregado sin
 * confirmacion.
 *
 * Tres momentos en una parcela:
 *   _entregar(aviso)  -> empuja el aviso por el CANAL DECLARABLE (K7). El canal es
 *                        un puerto: hay canales que el propio sistema puede
 *                        confirmar (PANEL/INTERNO: la superficie es la prueba) y
 *                        canales externos (TELEGRAM/EMAIL/WHATSAPP) que exigen la
 *                        confirmacion del adaptador.
 *   _confirmar(entrega) -> Confirmacion {confirmado, evidencia}. Es el acto que
 *                        convierte "enviado" en "recibido".
 *
 * EL CANAL ES DECLARABLE (K7 es [ABIERTO]): no hay canal cableado como ley. Hay un
 * catalogo BASE con su forma de confirmacion; el declarante (dueno/asesor) lo
 * sobreescribe. Si el canal externo no confirma, se declara `sin_confirmacion:true`
 * y NO se emite el evento de dominio aviso_confirmado — el aviso NO consta como
 * recibido.
 *
 * La dependencia con motor-avisos (K2) es por EVENTO: K2 ENRUTA publicando
 * `contabilidad.aviso.enrutar.request` y aqui se ENTREGA y CONFIRMA. NUNCA por
 * require cruzado.
 *
 * PUENTE (patron real, stateless): SIN PosPersistencia y SIN project.activated en
 * el CODIGO — no guarda estado; reacciona a un aviso enrutado y lo entrega. El
 * catalogo de canales es configuracion del adaptador, no parcela persistente.
 *
 * Emisor/par de fallo: exito publica contabilidad.aviso_entregado y (si se
 * confirma) contabilidad.aviso_confirmado; error su par determinista.
 * NO REUTILIZA: completa K2 (que solo PRODUCE); la entrega al negocio contable no
 * existe en el inventario.
 *
 * Ver hoja R1 del diseno-oop y bloque `aviso-al-negocio` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Canales DECLARABLES y su forma de confirmacion (K7, [ABIERTO]: no ley cableada).
//   auto_confirma: el canal es una superficie del propio sistema → la entrega es la prueba.
const CATALOGO_CANALES = {
  PANEL: { auto_confirma: true, evidencia: 'AVISO_VISIBLE_EN_PANEL', externo: false },
  INTERNO: { auto_confirma: true, evidencia: 'ENTREGADO_AL_BUS_INTERNO', externo: false },
  TELEGRAM: { auto_confirma: false, evidencia: 'ACK_DEL_ADAPTADOR', externo: true },
  EMAIL: { auto_confirma: false, evidencia: 'ACK_DEL_ADAPTADOR', externo: true },
  WHATSAPP: { auto_confirma: false, evidencia: 'ACK_DEL_ADAPTADOR', externo: true }
};

// Canal por defecto si no se declara: el panel (superficie del sistema).
const CANAL_DEFECTO = 'PANEL';

class AvisoAlNegocio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'aviso-al-negocio';
    this.version = 'reflejo-0.1.0';
    // Puente stateless: sin store que persistir. El catalogo de canales es
    // configuracion del adaptador, no parcela persistente.
    this._secuencia = 0;
    this._canales = new Map(Object.entries(CATALOGO_CANALES));
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC ──
  // motor-avisos (K2) ENRUTA el aviso publicado → aqui se ENTREGA y (si procede) se CONFIRMA.
  onEnrutarRequest(e) {
    return this._atender(e, 'enrutar', 'contabilidad.aviso.enrutar.response', async (d) => {
      const entregado = this._entregar(d);
      if (entregado.status !== 200) {
        this.eventBus?.publish('contabilidad.aviso.enrutar.failed', entregado);
        return entregado;
      }

      // El aviso LLEGA: se declara la entrega (nunca se queda en pantalla muda).
      this.eventBus?.publish('contabilidad.aviso_entregado', {
        ...entregado.data,
        correlation_id: d.correlation_id
      });

      // La ENTREGA no es la RECEPCION: se intenta confirmar por el canal declarado.
      const confirmacion = await this._confirmar(entregado.data.entrega, d);
      if (confirmacion.confirmado) {
        this.eventBus?.publish('contabilidad.aviso_confirmado', {
          ...entregado.data,
          confirmacion,
          correlation_id: d.correlation_id
        });
      }

      return {
        status: 200,
        data: {
          ...entregado.data,
          confirmacion,
          // Honestidad: sin confirmacion el aviso NO consta como recibido.
          consta_como_recibido: confirmacion.confirmado,
          sin_confirmacion: !confirmacion.confirmado,
          llega_al_negocio: true
        }
      };
    });
  }

  // ── proyecciones (entrega + confirmacion, deterministas) ──

  // entregar(aviso) -> ok. El canal es DECLARABLE (K7); empuja, no deja en pantalla muda.
  _entregar(input) {
    const aviso = (input && (input.aviso || input)) || null;
    const pid = (input && input.project_id) || (aviso && aviso.project_id);
    if (!pid) return this._invalid('project_id');
    if (!aviso || typeof aviso !== 'object') return this._invalid('aviso');

    const canal = String((input && (input.canal || input.canal_entrega)) || aviso.canal || CANAL_DEFECTO).toUpperCase();
    const def = this._canales.get(canal) || null;

    const destinatario = String((input && (input.destinatario || input.cola_destino)) || aviso.destinatario || aviso.cola_destino || '').toUpperCase() || null;
    if (!destinatario) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'el aviso no trae destinatario: no se entrega un aviso sin silla de destino', { aviso_id: aviso.id || null });
    }

    this._secuencia += 1;
    const entrega = {
      id: `${pid}-R1-${this._secuencia}`,
      project_id: pid,
      aviso_id: aviso.id || null,
      tipo: aviso.tipo || null,
      destinatario,
      canal,
      canal_declarable: true,
      canal_externo: !!(def && def.externo),
      canal_se_conocia: !!def,
      texto: aviso.texto || aviso.motivo || aviso.tipo || null,
      prioridad: aviso.prioridad || 'NORMAL',
      familia: aviso.familia || 'GENERAL',
      entregado_en: new Date().toISOString(),
      // La entrega es un hecho; la RECEPCION la fija la confirmacion.
      estado: 'ENTREGADO',
      pantalla_muda: false
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        entrega,
        aviso_id: entrega.aviso_id,
        canal,
        destinatario,
        entregado: true,
        canal_declarable: true,
        ley_cableada: false
      }
    };
  }

  // confirmar(entrega) -> Confirmacion {confirmado, evidencia}. La honestidad en acto.
  // Canales del propio sistema (PANEL/INTERNO): la entrega es la prueba.
  // Canales externos: se PIDE la confirmacion al adaptador por EVENTO (puerto declarable);
  //   sin respuesta NO se da por recibido.
  async _confirmar(entrega, input) {
    const pid = (input && input.project_id) || (entrega && entrega.project_id);
    const canal = String((entrega && entrega.canal) || CANAL_DEFECTO).toUpperCase();
    const def = this._canales.get(canal) || null;

    // Confirmacion declarada en el payload (el adaptador la trae consigo).
    const declarada = input && (input.confirmacion || input.confirmado !== undefined);
    if (declarada) {
      const confirmado = input.confirmado === true || !!(input.confirmacion && (input.confirmacion.confirmado === true || input.confirmacion.ack));
      return {
        confirmado: !!confirmado,
        canal,
        evidencia: (input.confirmacion && input.confirmacion.evidencia) || (confirmado ? 'ACK_DECLARADO' : null),
        confirmado_en: confirmado ? new Date().toISOString() : null,
        declarada: true,
        sin_confirmacion: !confirmado,
        motivo: confirmado ? null : 'el adaptador NO confirmo la entrega'
      };
    }

    // Canal del propio sistema: la superficie es la prueba (auto-confirma).
    if (def && def.auto_confirma) {
      return {
        confirmado: true,
        canal,
        evidencia: def.evidencia,
        confirmado_en: new Date().toISOString(),
        declarada: false,
        auto_confirmada: true,
        sin_confirmacion: false,
        motivo: null
      };
    }

    // Canal externo: se PIDE la confirmacion al adaptador por EVENTO (puerto K7).
    const resp = await this._rpc('contabilidad.canal.entregar.request', {
      project_id: pid,
      entrega,
      canal,
      destinatario: entrega && entrega.destinatario,
      correlation_id: (input && input.correlation_id) || null
    }, { timeout_ms: 4000 });

    if (resp && resp.status === 200 && resp.data && (resp.data.confirmado === true || resp.data.ack === true)) {
      return {
        confirmado: true,
        canal,
        evidencia: resp.data.evidencia || 'ACK_DEL_ADAPTADOR',
        confirmado_en: new Date().toISOString(),
        declarada: false,
        sin_confirmacion: false,
        motivo: null
      };
    }

    // Sin confirmacion del canal externo: el aviso NO consta como recibido (honestidad).
    this.eventBus?.publish('contabilidad.aviso_confirmado.failed', {
      status: (resp && resp.status) || 503,
      error: {
        code: 'SIN_CONFIRMACION_DE_ENTREGA',
        message: 'el canal externo no confirmo la entrega: el aviso NO consta como recibido',
        details: { canal, aviso_id: entrega && entrega.aviso_id }
      },
      correlation_id: (input && input.correlation_id) || null
    });

    return {
      confirmado: false,
      canal,
      evidencia: null,
      confirmado_en: null,
      declarada: false,
      sin_confirmacion: true,
      motivo: 'el canal externo no respondio/confirmo: nadie da por entregado sin confirmacion',
      canal_declarable: true
    };
  }

  // declararCanal(rol, canal, {auto_confirma, evidencia}) -> ok (K7, DECLARABLE).
  _declararCanal(input) {
    const canal = String((input && (input.canal || input.canal_entrega)) || '').toUpperCase();
    if (!canal) return this._invalid('canal');
    const rol = String((input && input.rol) || '').toUpperCase();
    if (rol && !['DUENO', 'ASESOR'].includes(rol)) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'el canal de entrega (K7) lo declara DUENO o ASESOR', { rol_recibido: rol || null });
    }
    const entrada = {
      auto_confirma: input && input.auto_confirma !== undefined ? !!input.auto_confirma : false,
      evidencia: (input && input.evidencia) || 'ACK_DEL_ADAPTADOR',
      externo: input && input.externo !== undefined ? !!input.externo : true,
      declarado: true,
      declarado_por: rol || null,
      declarado_en: new Date().toISOString()
    };
    this._canales.set(canal, entrada);
    return { status: 200, data: { project_id: (input && input.project_id) || null, canal, entrada, ley_cableada: false } };
  }

  // ── Tools ──
  toolEntregar(params) { return this._entregar(params); }
  toolDeclararCanal(params) { return this._declararCanal(params); }
}

module.exports = AvisoAlNegocio;
