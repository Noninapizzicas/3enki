/**
 * contabilidad-analitica/sello-cobertura — REFLEJO STATELESS (Q3, hoja del plan).
 *
 * La MARCA DE COMPLETITUD de lo consultado, FUERA de ciclo: si falta cobertura lo dice
 * ANTES de que se decida. Es un REFLEJO que SELLA — y sellar, aqui, es MARCAR EL OBJETO
 * DEVUELTO, no escribir estado. Este modulo NO persiste, NO muta nada y NO guarda store:
 * la marca vive SOLO en la respuesta que se devuelve a quien pregunto.
 *
 * (Cura del error anterior: en el intento previo este modulo era un ESCRITOR MUDO — su
 *  `sellar` escribia y no lo anunciaba. La correccion es NO escribir: si no hay escritura,
 *  no hay hecho que anunciar y R2 no aplica. La marca es del retorno, no del disco.)
 *
 * LEE la metrica UNICA (`completitud-cobertura` A12): NO la recalcula. Sube best-effort
 * `completitud-cobertura.medir.request` (PREGUNTA→PREGUNTA) para obtener esperados/llegados,
 * o usa lo DECLARADO en el input. ≠ `aviso-cuadre` C6 (que solo avisa al cierre).
 *
 * Invariante (13): dato ausente = desconocido. Sin metrica de cobertura NO se inventa un
 * sello de "completo": la marca queda `indeterminada` — no se dice completo lo que no se sabe.
 *
 * ESCUCHA (R3): el plan declara escucha de `contabilidad.hecho_recibido`; su emisor
 * `puerto-evento-vertical` (A1) SI existe en el repo → SI se declara.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. PREGUNTA → sin ui_handler.
 * Ver hoja Q3 del plan-construccion y diseno-oop.md (CLASE SelloCobertura).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class SelloCobertura extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'sello-cobertura';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onSellarRequest(e) {
    return this._atender(e, 'sellar', 'sello-cobertura.sellar.response', async (d) => {
      const res = await this._sellar(d);
      // Reflejo: SELLA (marca el objeto devuelto); NO escribe estado → NO hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('sello-cobertura.sellar.failed', res);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): llego un hecho → se observa (ventana acotada) ──
  // Observar NO es escribir: solo se guarda en memoria para el sello de la proxima consulta.
  onHechoRecibido(e) {
    const d = (e && (e.data || e)) || {};
    this._vistos = this._vistos || [];
    this._vistos.push({ project_id: d.project_id || null, hecho_id: (d.hecho && d.hecho.id) || d.hecho_id || null, en: new Date().toISOString() });
    if (this._vistos.length > 1000) this._vistos.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // _sellar(input) → { status, data }  ·  MARCA la completitud de lo consultado
  // ══════════════════════════════════════════════════════════════════════
  async _sellar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // LEE la metrica unica: declarada en el input, o pedida por EVENTO a completitud-cobertura.
    const { metrica, fuente } = await this._metricaDe(input);

    const esperados = this._num(metrica && metrica.esperados);
    const llegados = this._num(metrica && metrica.llegados);
    const faltantesDeclarados = Array.isArray(metrica && metrica.faltantes)
      ? metrica.faltantes.map((f) => (f && typeof f === 'object') ? (f.cuenta != null ? String(f.cuenta) : (f.clave != null ? String(f.clave) : null)) : (f != null ? String(f) : null)).filter((x) => x != null)
      : [];

    // Hay metrica SOLO si trae esperados y llegados (sin ambos, no se afirma nada).
    const hayMetrica = esperados !== null && llegados !== null;
    const faltan = hayMetrica ? this._round(Math.max(esperados - llegados, 0), 2) : null;
    const cobertura = (hayMetrica && esperados > 0) ? this._round(llegados / esperados, 4) : null;
    const completo = hayMetrica ? this._round(Math.max(esperados - llegados, 0), 2) === 0 : null;

    // La MARCA (sello): no dice completo lo que no se sabe.
    const sello = {
      completo,
      estado: completo === null ? 'INDETERMINADO' : (completo ? 'COMPLETO' : 'INCOMPLETO'),
      esperados: hayMetrica ? esperados : null,
      llegados: hayMetrica ? llegados : null,
      faltan,
      cobertura,
      faltantes: faltantesDeclarados,
      // FUERA de ciclo: la marca ANTES de decidir (no espera al cierre como C6).
      fuera_de_ciclo: true,
      // NO se escribe nada: la marca es del objeto devuelto.
      persistido: false
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'sello-cobertura',
        fuente: fuente || null,
        sello,
        // Se sella lo CONSULTADO (respuesta a algo); no se recalcula la metrica.
        recalcula_metrica: false,
        abierto: {
          metrica: hayMetrica ? null : 'no llego la metrica de cobertura (ni declarada ni de completitud-cobertura): la marca queda INDETERMINADA (no se dice completo lo que no se sabe)',
          faltantes: (faltan !== null && faltan > 0 && faltantesDeclarados.length === 0)
            ? 'la metrica dice que faltan hechos pero NO nombra cuales: la marca los declara sin inventarlos'
            : null
        }
      }
    };
  }

  // Trae la metrica unica: declarada, o pedida por EVENTO a completitud-cobertura (PREGUNTA).
  async _metricaDe(input) {
    const directa = (input.metrica && typeof input.metrica === 'object') ? input.metrica
      : ((input.cobertura && typeof input.cobertura === 'object') ? input.cobertura
        : ((input.senal && typeof input.senal === 'object') ? input.senal : null));
    if (directa) return { metrica: directa, fuente: 'declarado' };

    const resp = await this._rpc('completitud-cobertura.medir.request', {
      project_id: input.project_id || this.project_id,
      ejercicio: input.ejercicio, desde: input.desde, hasta: input.hasta
    }, { timeout_ms: 800 });
    const d = (resp && (resp.data || resp)) || null;
    if (d && (d.esperados != null || d.llegados != null || d.metrica)) {
      return { metrica: d.metrica || d, fuente: 'completitud-cobertura' };
    }
    return { metrica: null, fuente: null };
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolSellar(params) { return this._sellar(params); }
}

module.exports = SelloCobertura;
