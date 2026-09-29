/**
 * contabilidad-entrada/declaracion-fuente-faltante — PUENTE STATELESS (A15, hoja del plan).
 *
 * Detecta que una vertical NO publica un hecho necesario y lo DECLARA: queda ABIERTO y
 * se emite un aviso. NO obliga a la vertical a producirlo (`obliga_a_producir:false`):
 * contabilidad se adapta, no manda.
 *
 * **CONTRATO TOLERANTE:** la deteccion se apoya en LA metrica unica de cobertura
 * (completitud-cobertura A12) consultada POR EVENTO. Si su dependencia NO responde
 * (timeout/ausencia), este puente responde `503 UPSTREAM_UNREACHABLE` — **NUNCA fabrica
 * el dato** (no inventa una cobertura ni un hueco que no pudo medir).
 *
 * Invariantes:
 *  - Sin cobertura medida no se declara un hueco: se dice que no se pudo medir (503).
 *  - La declaracion es un AVISO (abierto + aviso), no una orden a la fuente.
 *  - No recuerda: es un puente; declara lo que la metrica le dice, en el momento.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja A15 del plan-construccion y diseno-oop.md (CLASE DeclaracionFuenteFaltante).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class DeclaracionFuenteFaltante extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'declaracion-fuente-faltante';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'declaracion-fuente-faltante.declarar.response', async (d) => {
      const res = await this._declarar(d);
      if (res.status === 200) {
        // Solo un hueco DECLARADO (falta>0) emite el aviso de dominio.
        if (res.data.falta && res.data.declaracion.faltantes.length > 0) {
          this.eventBus?.publish('contabilidad.fuente_faltante', {
            project_id: res.data.project_id,
            vertical: res.data.vertical,
            declaracion: res.data.declaracion,
            faltantes: res.data.declaracion.faltantes,
            correlation_id: d.correlation_id
          });
        }
      } else {
        // Incluye el caso 503 UPSTREAM_UNREACHABLE (dependencia sin responder): nunca se fabrica.
        this.eventBus?.publish('declaracion-fuente-faltante.declarar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion: declarar(hueco) → Aviso de fuente faltante (CONTRATO TOLERANTE) ──
  async _declarar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const vertical = input.vertical != null ? String(input.vertical).trim() : '';
    if (!vertical) return this._invalid('vertical');

    // Si el hueco YA llega declarado por el llamante, no hace falta la metrica externa.
    const faltantesDeclarados = Array.isArray(input.faltantes)
      ? input.faltantes.map(f => String(f)).filter(Boolean)
      : null;

    let faltantes = faltantesDeclarados;
    let origen = faltantesDeclarados ? 'declarado' : null;

    // Sin huecos declarados: se PIDE LA METRICA UNICA (A12) por evento. Contrato tolerante:
    // si no responde, 503 — NUNCA se fabrica la cobertura.
    if (!faltantes) {
      const r = await this._rpc('completitud-cobertura.medir.request',
        { project_id: pid, vertical, esperados: input.esperados, llegados: input.llegados },
        { timeout_ms: 4000 });
      const data = r && r.data ? r.data : null;
      if (!data || !data.cobertura) {
        return this._errorResponse(503, 'UPSTREAM_UNREACHABLE',
          'completitud-cobertura no respondio; no se puede declarar el hueco sin fabricar el dato',
          { dependencia: 'completitud-cobertura', project_id: pid, vertical });
      }
      // La metrica existe pero declara que no hay expectativa: no hay hueco que afirmar.
      if (!data.cobertura.declarada) {
        return {
          status: 200,
          data: {
            project_id: pid,
            vertical,
            falta: false,
            declaracion: null,
            origen: 'completitud-cobertura',
            motivo: 'la cobertura no esta declarada (sin expectativa); no se afirma un hueco'
          }
        };
      }
      faltantes = Array.isArray(data.cobertura.huecos) ? data.cobertura.huecos.map(f => String(f)) : [];
      origen = 'completitud-cobertura';
    }

    // El AVISO: declara que falta, ABIERTO, sin obligar a la fuente a producirlo.
    const declaracion = {
      vertical,
      faltantes,
      falta: faltantes.length > 0,
      abierto: true,
      obliga_a_producir: false,
      aviso: faltantes.length > 0
        ? `la vertical ${vertical} no publica ${faltantes.length} hecho(s) necesario(s)`
        : null,
      motivo: input.motivo != null ? String(input.motivo) : null,
      declarado_en: new Date().toISOString()
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        vertical,
        falta: declaracion.falta,
        declaracion,
        origen
      }
    };
  }

  // ── Fire-and-forget: escucha LA metrica unica (A12). NO la recalcula (la LEE) ni recuerda. ──
  // Si la cobertura trae huecos, DECLARA el hecho faltante en el acto (sin estado).
  onCoberturaMedida(e) {
    const d = (e && (e.data || e)) || {};
    const cov = d.cobertura;
    if (!d.project_id || !d.vertical || !cov || !cov.declarada) return null;
    const faltantes = Array.isArray(cov.huecos) ? cov.huecos.map(f => String(f)) : [];
    if (faltantes.length === 0) return { falta: false, vertical: d.vertical };
    this.eventBus?.publish('contabilidad.fuente_faltante', {
      project_id: d.project_id,
      vertical: d.vertical,
      declaracion: {
        vertical: d.vertical,
        faltantes,
        falta: true,
        abierto: true,
        obliga_a_producir: false,
        aviso: `la vertical ${d.vertical} no publica ${faltantes.length} hecho(s) necesario(s)`,
        motivo: null,
        declarado_en: new Date().toISOString()
      },
      faltantes,
      correlation_id: d.correlation_id
    });
    return { falta: true, vertical: d.vertical, faltantes: faltantes.length };
  }

  // ── Tools ──
  toolDeclarar(params) { return this._declarar(params); }
}

module.exports = DeclaracionFuenteFaltante;
