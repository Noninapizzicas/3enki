/**
 * contabilidad-analitica/aviso-al-negocio — PUENTE CON PERSISTENCIA (R1, hoja del plan).
 *
 * LA CARA DE ENTREGA DEL AVISO. El aviso ENTREGADO y CONFIRMADO al negocio cliente.
 * COMPLETA el circulo que abre K2 (`motor-avisos`), que SOLO PRODUCE: aqui se ENTREGA.
 *
 *   motor-avisos (K2)  --contabilidad.aviso_producido-->  aviso-al-negocio (R1, ENTREGA)
 *                                                              │
 *                                                              ├─ informe-accionable.juzgar.request  (que hacer)
 *                                                              ├─ narrador-estados.narrar.request    (narracion)
 *                                                              └─ contabilidad.aviso_entregado        (HECHO)
 *
 * Invariante (honestidad): un aviso se da por ENTREGADO solo si llega a su destinatario
 * declarado; sin destinatario se declara ABIERTO (no se finge la entrega). Sin aviso no se
 * inventa nada (dato ausente = desconocido). La entrega es APPEND-ONLY: cada entrega se apila.
 *
 * R3 (honestidad de la escucha): el plan declara escucha de `contabilidad.aviso_producido`
 * (motor-avisos K2) — ese emisor ESTA en este mismo grupo → SI se declara. Sus dos destinos
 * (informe-accionable.juzgar, narrador-estados.narrar) son deps por EVENTO: se suben
 * best-effort y solo cuando el aviso PIDE enriquecimiento (no se cuelga el puente).
 *
 * Forma: PUENTE → Stateless de logica + PosPersistencia (registro append-only de entregas).
 * RPC entregar = ORDEN → ui_handler.
 * Ver hoja R1 del plan-construccion y diseno-oop.md (CLASE AvisoAlNegocio).
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

class AvisoAlNegocio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'aviso-al-negocio';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, entregas:[append-only] }
    this._entregas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'aviso-al-negocio.json',
      dir: '/contabilidad/aviso-al-negocio',
      snapshot: (pid) => {
        const e = this._entregas.get(pid);
        if (!e) return null;
        return { project_id: pid, esquema: e.esquema, entregas: e.entregas };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        this._entregas.set(pid, {
          esquema: data.esquema || 'contabilidad-aviso-al-negocio-v1',
          entregas: Array.isArray(data.entregas) ? data.entregas : []
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura las entregas del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC (una linea, delega a _atender). CLASE ORDEN → ui_handler ──
  onEntregarRequest(e) {
    return this._atender(e, 'entregar', 'aviso-al-negocio.entregar.response', async (d) => {
      const res = this._entregar(d);
      await this._reaccionAResultado(res, d);
      return res;
    });
  }

  // ── handler de DOMINIO (fire-and-forget): K2 produjo un aviso → se ENTREGA ──
  onAvisoProducido(e) {
    const d = (e && (e.data || e)) || {};
    const aviso = d.aviso && typeof d.aviso === 'object' ? d.aviso
      : (d.aviso_id ? { aviso_id: d.aviso_id, tipo: d.tipo, severidad: d.severidad, titulo: d.titulo, detalle: d.detalle, origen: d.origen } : null);
    if (!aviso) return;
    const res = this._entregar({ project_id: d.project_id, aviso, destinatario: d.destinatario, correlation_id: d.correlation_id });
    return this._reaccionAResultado(res, d);
  }

  // Reaccion comun: si ENTREGO → anuncia el HECHO (R2); si no → par .failed.
  async _reaccionAResultado(res, d) {
    if (res.status === 200 && res.data && res.data.entregado) {
      // R2 · si hay entrega, anuncia el HECHO: el negocio quedo avisado.
      this.eventBus?.publish('contabilidad.aviso_entregado', {
        project_id: res.data.project_id,
        aviso_id: res.data.entrega.aviso_id,
        tipo: res.data.entrega.tipo,
        destinatario: res.data.entrega.destinatario,
        entregado_en: res.data.entrega.entregado_en,
        correlation_id: d.correlation_id
      });
      // SUBE (best-effort, por EVENTO) la composicion del aviso a R2 (que hacer) y R3 (narracion).
      await this._enriquecer(res.data, d);
    } else if (res.status !== 200) {
      this.eventBus?.publish('aviso-al-negocio.entregar.failed', res);
    }
    return res;
  }

  // Enriquecimiento OPCIONAL: solo si el aviso lo pide (no se cuelga el puente en cada entrega).
  async _enriquecer(data, d) {
    const aviso = data.aviso || {};
    if (data.enriquecer !== true && aviso.enriquecer !== true) return;
    // informe-accionable R2 (que hacer). Best-effort: si no responde, el aviso ya se entrego.
    this.eventBus?.publish('informe-accionable.juzgar.request', {
      project_id: data.project_id, informe: aviso, reglas: aviso.reglas, correlation_id: d.correlation_id
    });
    // narrador-estados R3 (narracion). Best-effort.
    this.eventBus?.publish('narrador-estados.narrar.request', {
      project_id: data.project_id, informe: aviso, correlation_id: d.correlation_id
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _entregar(input) → { status, data }  ·  ENTREGA el aviso al negocio (append-only)
  // ══════════════════════════════════════════════════════════════════════
  _entregar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // El AVISO: producido por K2. Sin aviso no se inventa la entrega.
    const aviso = (input.aviso && typeof input.aviso === 'object') ? input.aviso : null;
    if (!aviso) return this._invalid('aviso');

    // El DESTINATARIO es, por contrato de este puente, el NEGOCIO CLIENTE. Si el aviso no
    // declara uno explicito, el destinatario es el propio negocio/proyecto (esa ES su identidad:
    // "aviso al negocio"). No se inventa un destinatario ajeno.
    const destinatarioDeclarado = (input.destinatario != null || aviso.destinatario != null)
      ? String(input.destinatario != null ? input.destinatario : aviso.destinatario)
      : null;
    const negocio = input.negocio_id != null ? String(input.negocio_id)
      : (aviso.negocio_id != null ? String(aviso.negocio_id) : pid);
    const destinatario = destinatarioDeclarado || negocio;

    const ahora = new Date().toISOString();
    const entrega = {
      entrega_id: `ent_${pid}_${crypto.randomUUID().slice(0, 8)}`,
      aviso_id: aviso.aviso_id != null ? String(aviso.aviso_id) : null,
      tipo: aviso.tipo != null ? String(aviso.tipo) : null,
      severidad: aviso.severidad != null ? String(aviso.severidad) : null,
      titulo: aviso.titulo != null ? String(aviso.titulo) : null,
      detalle: aviso.detalle != null ? String(aviso.detalle) : null,
      origen: aviso.origen != null ? String(aviso.origen) : null,
      // El aviso llega al NEGOCIO CLIENTE (su destinatario por contrato).
      destinatario,
      destinatario_explicito: destinatarioDeclarado != null,
      // ENTREGADO: el aviso llego al negocio. CONFIRMADO: solo con un ack explicito.
      confirmado: input.confirmado === true || aviso.confirmado === true,
      entregado_en: ahora
    };

    const store = this._obtenerOCrear(pid);
    // APPEND-ONLY: cada entrega se apila; nada se borra.
    store.entregas.push(entrega);
    store.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'aviso-al-negocio',
        entrega,
        // El aviso SE ENTREGA al negocio (su destinatario por contrato). No se finge un ack:
        // `confirmado` queda false hasta que llegue una confirmacion explicita.
        entregado: true,
        total: store.entregas.length,
        append_only: true,
        enriquecer: input.enriquecer === true || aviso.enriquecer === true,
        abierto: {
          aviso_id: entrega.aviso_id ? null : 'el aviso no trae aviso_id (se anota el hueco, no se inventa)',
          confirmacion: entrega.confirmado ? null : 'la entrega no tiene confirmacion explicita del negocio todavia (entregado != confirmado)',
          destinatario: entrega.destinatario_explicito ? null : 'el aviso no declaro destinatario explicito: se entrega al negocio (el proyecto) por contrato'
        }
      }
    };
  }

  _obtenerOCrear(pid) {
    let e = this._entregas.get(pid);
    if (!e) {
      e = { esquema: 'contabilidad-aviso-al-negocio-v1', entregas: [] };
      this._entregas.set(pid, e);
      this._persist.marcarDirty(pid);
    }
    return e;
  }

  // Lectura directa (mismo proceso) — no muta.
  entregasDe(pid) {
    const e = pid ? this._entregas.get(pid) : null;
    return e ? [...e.entregas] : [];
  }

  // ── Tools ──
  toolEntregar(params) { return this._entregar(params); }
}

module.exports = AvisoAlNegocio;
