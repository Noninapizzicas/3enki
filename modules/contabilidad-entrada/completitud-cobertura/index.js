/**
 * contabilidad-entrada/completitud-cobertura — REFLEJO STATELESS (A12, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * PRODUCE **LA METRICA UNICA DE COBERTURA**. Q3/C6/P4 la LEEN: no la recalculan.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * Cuenta cuanta de la entrada esperada se ha recibido. Es determinista: la cobertura es
 * recibidos/esperados, sin ponderaciones ocultas.
 *
 * Honestidad (invariante 13): dato ausente = desconocido. Si NO llega lo esperado y lo
 * recibido (ni en el input ni observado de `contabilidad.hecho_recibido`), la metrica NO
 * se inventa: se declara ABIERTO (senal_presente:false, cobertura:null). Un porcentaje
 * fabricado es una metrica que miente.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia (ventana en memoria acotada, como
 * balance-situacion). PREGUNTA (medir) → sin ui_handler.
 * Ver hoja A12 del plan-construccion y diseno-oop.md (CLASE CompletitudCobertura).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class CompletitudCobertura extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'completitud-cobertura';
    this.version = 'reflejo-0.1.0';
    // Ventana acotada de hechos observados por proyecto (no es store: solo memoria).
    this._observados = new Map(); // project_id -> Set<clave>
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onMedirRequest(e) {
    return this._atender(e, 'medir', 'completitud-cobertura.medir.response', async (d) => {
      const res = await this._medir(d);
      // Reflejo: mide; no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('completitud-cobertura.medir.failed', res);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): llego un hecho → se observa (ventana acotada) ──
  onHechoRecibido(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id || this.project_id;
    if (!pid) return;
    const clave = this._claveHecho(d);
    if (!clave) return;
    let set = this._observados.get(pid);
    if (!set) { set = new Set(); this._observados.set(pid, set); }
    set.add(clave);
    // Ventana acotada: no crece sin fin.
    if (set.size > 5000) {
      const primera = set.values().next().value;
      set.delete(primera);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // _medir(input) → { status, data }  ·  LA metrica unica de cobertura
  // ══════════════════════════════════════════════════════════════════════
  async _medir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // Lo esperado y lo recibido: declarados (arrays o numeros) o de la ventana observada.
    const esperados = this._cuenta(input.esperados, input.claves_esperadas);
    const recibidos = this._cuenta(input.recibidos, input.claves_recibidas);
    if (esperados == null && recibidos == null) {
      const observados = this._observados.get(pid);
      const n = observados ? observados.size : null;
      if (n == null) {
        // Sin dato alguno: la metrica NO se inventa.
        return {
          status: 200,
          data: {
            project_id: pid,
            tipo: 'completitud-cobertura',
            cobertura: null,
            senal_presente: false,
            abierto: { entrada: 'no llego lo esperado ni lo recibido: la cobertura no se inventa (dato ausente = desconocido)' }
          }
        };
      }
      return this._metrica(pid, n, n, input);
    }

    const esp = esperados == null ? recibidos : esperados;
    const rec = recibidos == null ? 0 : recibidos;
    return this._metrica(pid, esp, rec, input);
  }

  _metrica(pid, esperados, recibidos, input) {
    const esp = Number(esperados) || 0;
    const rec = Math.max(0, Number(recibidos) || 0);
    const faltantes = Math.max(0, esp - rec);
    // Determinista y acotada [0,1]: sin ponderaciones ocultas.
    const cobertura = esp > 0 ? this._round(Math.min(rec, esp) / esp, 4) : (esp === 0 && rec === 0 ? 1 : 0);
    const umbral = input.umbral != null ? Number(input.umbral) : null;
    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'completitud-cobertura',
        cobertura,
        cobertura_pct: this._round(cobertura * 100, 2),
        esperados: esp,
        recibidos: rec,
        faltantes,
        completa: faltantes === 0,
        umbral: Number.isFinite(umbral) ? umbral : null,
        bajo_umbral: Number.isFinite(umbral) ? cobertura < umbral : null,
        senal_presente: true,
        formula: 'cobertura = min(recibidos, esperados) / esperados  (acotada a [0,1])',
        abierto: {
          claves: (input.claves_esperadas || input.esperados) ? null : 'no se declararon las claves esperadas: solo se cuenta el total (la metrica agregada no inventa el detalle)'
        }
      }
    };
  }

  // Acepta un numero, o un array (cuenta elementos). null si no se declaro nada.
  _cuenta(numero, lista) {
    if (typeof numero === 'number' && Number.isFinite(numero)) return numero;
    if (Array.isArray(lista)) return lista.length;
    if (Array.isArray(numero)) return numero.length;
    if (numero === undefined || numero === null) return null;
    const n = Number(numero);
    return Number.isFinite(n) ? n : null;
  }

  // Clave determinista de un hecho observado (para no contar duplicados del bus at-least-once).
  _claveHecho(d) {
    const h = d.hecho && typeof d.hecho === 'object' ? d.hecho : d;
    const base = h.clave != null ? String(h.clave)
      : (h.id != null ? String(h.id)
      : (h.documento != null ? String(h.documento) : null));
    return base || null;
  }

  // ── Tools ──
  toolMedir(params) { return this._medir(params); }
}

module.exports = CompletitudCobertura;
