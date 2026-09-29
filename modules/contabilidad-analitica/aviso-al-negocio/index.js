/**
 * contabilidad-analitica/aviso-al-negocio — PUENTE STATELESS (R1, hoja del plan).
 *
 * LA CARA DE ENTREGA: el aviso ENTREGADO y CONFIRMADO al negocio cliente. COMPLETA `motor-avisos`
 * (K2), que solo PRODUCE el aviso — aqui se ENTREGA por el canal y se CONFIRMA la entrega.
 *
 * ATRIBUTOS del diseno: `canal:ParametroDeclarable`.
 *   METODOS: entregar(a:Aviso):Confirmacion.
 *   REGLA: el aviso ENTREGADO y CONFIRMADO al negocio cliente. Cara de entrega que COMPLETA
 *          `motor-avisos` K2, que solo PRODUCE.
 *
 * Invariantes:
 *  - ENTREGA, NO DECIDE: no decide QUE avisar, A QUIEN ni POR QUE canal — eso ya viene decidido en
 *    el Aviso (K2 + catalogo K6). Aqui se ENVIa por el canal y se devuelve la confirmacion.
 *  - EL CANAL ES DECLARABLE (ParametroDeclarable): sin canal declarado NO se inventa un canal;
 *    el aviso queda `entregado:false` con el hueco declarado.
 *  - LA ENTREGA ES POR EL CANAL: se emite por el canal de avisos (motor/telegram/email) POR EVENTO;
 *    si el canal no confirma, `entregado:false` y `confirmado:false` (jamas se afirma entregado).
 *  - Sin estado: un puente. No recuerda avisos.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja R1 del plan-construccion y diseno-oop.md (CLASE AvisoAlNegocio).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Canal declarable → evento de entrega. Solo fija la IDENTIDAD de cada canal, no criterio de negocio.
const CANALES = {
  telegram: { evento: 'telegram.send_message.request', canal: 'telegram' },
  email: { evento: 'email.send.request', canal: 'email' },
  push: { evento: 'push.send.request', canal: 'push' },
  motor: { evento: 'motor-avisos.producir.request', canal: 'motor-avisos' }
};

class AvisoAlNegocio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'aviso-al-negocio';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onEntregarRequest(e) {
    return this._atender(e, 'entregar', 'aviso-al-negocio.entregar.response', async (d) => {
      const res = await this._entregar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: el aviso quedo ENTREGADO (y confirmado si el canal confirmo).
        this.eventBus?.publish('contabilidad.aviso_entregado', {
          project_id: res.data.project_id,
          aviso_id: res.data.aviso_id,
          confirmacion: res.data.confirmacion,
          entregado: res.data.confirmacion.entregado,
          canal: res.data.confirmacion.canal,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('aviso-al-negocio.entregar.failed', res);
      }
      return res;
    });
  }

  // ── Fire-and-forget del flujo: un aviso PRODUCIDO (K2) llega para ENTREGARSE ──
  onAvisoProducido(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    return this._entregar({
      project_id: d.project_id,
      aviso: d.aviso || d,
      aviso_id: d.aviso_id,
      canal: d.canal,
      destino: d.destino,
      correlation_id: d.correlation_id
    });
  }

  // ── proyeccion: entregar(a:Aviso) → Confirmacion (entrega, no decide) ──
  async _entregar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const aviso = input.aviso && typeof input.aviso === 'object' ? input.aviso : null;
    if (!aviso) return this._invalid('aviso');

    const aviso_id = input.aviso_id != null ? String(input.aviso_id) : (aviso.id != null ? String(aviso.id) : null);

    // El CANAL es ParametroDeclarable (aviso > catalogo > null). Sin canal NO se inventa uno.
    const canal = this._canal(input.canal != null ? input.canal : aviso.canal);
    if (!canal) {
      return {
        status: 200,
        data: {
          project_id: pid,
          aviso_id,
          aviso,
          confirmacion: {
            entregado: false,
            confirmado: false,
            canal: null,
            motivo: 'el canal no esta declarado: el puente ENTREGA, no inventa por donde'
          },
          abierto: true,
          faltan: ['canal'],
          decide: false
        }
      };
    }

    // LA ENTREGA: se emite por el canal declarado POR EVENTO. Si el canal no confirma → no entregado.
    const resp = await this._rpc(canal.evento, {
      project_id: pid,
      aviso,
      aviso_id,
      destino: input.destino != null ? input.destino : aviso.destino,
      texto: this._texto(aviso),
      canal: canal.canal
    }, { timeout_ms: 8000 }).catch(() => null);

    const data = resp && resp.data ? resp.data : null;
    const entregado = Boolean(data && (data.entregado === true || data.sent === true || data.status === 200 || data.ok === true));

    const confirmacion = {
      entregado,
      confirmado: entregado,
      canal: canal.canal,
      canal_evento: canal.evento,
      destino: input.destino != null ? input.destino : (aviso.destino != null ? aviso.destino : null),
      id_mensaje: data && (data.id_mensaje != null ? String(data.id_mensaje) : (data.message_id != null ? String(data.message_id) : null)),
      entregado_en: entregado ? new Date().toISOString() : null,
      motivo: entregado
        ? 'el aviso quedo ENTREGADO por el canal declarado y el canal lo confirmo'
        : 'el canal no confirmo la entrega: el aviso NO se declara entregado'
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        aviso_id,
        aviso,
        confirmacion,
        // ENTREGA, no decide: que aviso, a quien y por que canal venia ya decidido (K2/K6).
        decide: false,
        completa_a: 'motor-avisos (K2, que solo PRODUCE)',
        abierto: {
          entrega: entregado ? null : 'el canal no confirmo la entrega — no se afirma entregado',
          destino: confirmacion.destino === null ? 'el destino del aviso no estaba declarado (ParametroDeclarable)' : null
        },
        faltan: entregado ? [] : ['confirmacion_canal']
      }
    };
  }

  _canal(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    const c = String(raw).toLowerCase().trim();
    return CANALES[c] || null;
  }

  _texto(aviso) {
    const asunto = aviso.asunto != null ? String(aviso.asunto) : 'aviso';
    const motivo = aviso.motivo != null ? String(aviso.motivo) : '';
    return motivo ? `${asunto}: ${motivo}` : asunto;
  }

  // ── Tools ──
  toolEntregar(params) { return this._entregar(params); }
}

module.exports = AvisoAlNegocio;
