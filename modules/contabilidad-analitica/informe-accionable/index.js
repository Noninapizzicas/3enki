/**
 * contabilidad-analitica/informe-accionable — MICRO-AGENTE (R2, hoja del plan).
 *
 * Todo informe que recibe el cliente lleva QUE HACER con el. La RECOMENDACION es
 * JUICIO: la mitad FUZZY del hibrido vive en el blueprint; esta mitad REFLEJA es la
 * parte DETERMINISTA y HONESTA — aplica las REGLAS DE ACCION **DECLARADAS** al
 * informe/cifra (un motor de reglas puro: campo · operador · umbral → recomendacion)
 * y NO inventa una accion donde no hay regla declarada.
 *
 *   · informe_rico (K3) compone la cifra; esta hoja le adjunta el "que hacer".
 *   · Lo no cubierto por una regla declarada NO se rellena: queda declarado como
 *     juicio (mitad fuzzy), nunca estimado.
 *
 * Invariantes:
 *  - DETERMINISTA: mismo informe + mismas reglas → mismas acciones.
 *  - Dato ausente = desconocido: sin informe no hay nada a lo que adjuntar accion (no se
 *    fabrica); sin reglas declaradas → 0 acciones y el hueco se DECLARA.
 *  - NO escribe, NO persiste.
 *
 * ESCUCHA (R3): el plan declara escucha de `contabilidad.aviso_producido` (motor-avisos K2)
 * y `contabilidad.asiento_asentado` (escritor-diario B2). NINGUN modulo del repo los emite
 * AUN (grupos posteriores): declararlos daria cadena colgada. NO se declaran hasta que su
 * emisor exista.
 *
 * Forma: MICRO-AGENTE (mitad refleja) → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja R2 del plan-construccion y diseno-oop.md (CLASE InformeAccionable).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Los operadores que el motor de reglas declara. Ninguno cablea un criterio de negocio:
// el umbral y el campo los declara la regla; aqui solo vive el como se compara.
const OPERADORES = new Set(['<', '<=', '>', '>=', '==', '!=', 'existe', 'no_existe']);

class InformeAccionable extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'informe-accionable';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onJuzgarRequest(e) {
    return this._atender(e, 'juzgar', 'informe-accionable.juzgar.response', async (d) => {
      const res = this._juzgar(d);
      // Micro-agente (mitad refleja): aplica reglas declaradas; no escribe dominio → sin hecho (R2).
      if (res.status !== 200) this.eventBus?.publish('informe-accionable.juzgar.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // juzgar(informe, reglas) → informe con su "que hacer" (reglas declaradas)
  // ══════════════════════════════════════════════════════════════════════
  _juzgar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // El INFORME: viene YA compuesto (informe-rico K3) o es el aviso/cifra declarado.
    const informe = input.informe !== undefined ? input.informe
      : (input.aviso !== undefined ? input.aviso
        : (input.cifra !== undefined ? input.cifra : undefined));
    if (informe === undefined || informe === null) return this._invalid('informe');

    // Las REGLAS DE ACCION: DECLARADAS. Sin ellas, el "que hacer" es juicio (fuzzy), no se adivina.
    const reglas = this._reglas(input);

    const acciones = [];
    for (const r of reglas) {
      if (!r || typeof r !== 'object') continue;
      if (this._dispara(r, informe)) {
        acciones.push({
          regla: r.id != null ? String(r.id) : (r.clave != null ? String(r.clave) : null),
          recomendacion: r.entonces != null ? String(r.entonces)
            : (r.recomendacion != null ? String(r.recomendacion) : null),
          motivo: r.motivo != null ? String(r.motivo) : null,
          severidad: r.severidad != null ? String(r.severidad) : null
        });
      }
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'informe-accionable',
        informe,
        acciones,
        num_acciones: acciones.length,
        reglas_declaradas: reglas.length,
        // Determinista: aplica reglas; jamas inventa una accion.
        deterministico: true,
        abierto: {
          reglas: reglas.length > 0 ? null
            : 'no se declararon reglas de accion: el "que hacer" de lo no cubierto es juicio (mitad fuzzy del micro-agente)'
        }
      }
    };
  }

  // Evalua una regla DECLARADA contra el informe. Sin campo/operador no dispara (no se adivina).
  _dispara(regla, informe) {
    if (!regla || typeof regla !== 'object') return false;
    const operador = regla.operador != null ? String(regla.operador).trim() : (regla.op != null ? String(regla.op).trim() : null);
    if (!operador || !OPERADORES.has(operador)) return false;
    const campo = regla.campo != null ? String(regla.campo) : (regla.clave != null ? String(regla.clave) : null);
    if (!campo) return false;

    const actual = this._leerCampo(informe, campo);

    if (operador === 'existe') return actual !== undefined && actual !== null;
    if (operador === 'no_existe') return actual === undefined || actual === null;
    if (actual === undefined || actual === null) return false; // sin valor no se dispara (no se estima)

    const umbral = regla.umbral !== undefined ? regla.umbral : regla.valor;
    const a = this._num(actual);
    const b = this._num(umbral);
    if (a === null || b === null) {
      // Comparacion no numerica: igualdad estricta de texto.
      const sa = String(actual);
      const sb = String(umbral);
      if (operador === '==') return sa === sb;
      if (operador === '!=') return sa !== sb;
      return false;
    }
    switch (operador) {
      case '<': return a < b;
      case '<=': return a <= b;
      case '>': return a > b;
      case '>=': return a >= b;
      case '==': return a === b;
      case '!=': return a !== b;
      default: return false;
    }
  }

  // Lee un campo del informe por ruta con puntos (a.b.c). Ausente → undefined.
  _leerCampo(obj, ruta) {
    if (!obj || typeof obj !== 'object') return undefined;
    let cur = obj;
    for (const parte of String(ruta).split('.')) {
      if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
      cur = cur[parte];
    }
    return cur;
  }

  _reglas(input = {}) {
    const raw = Array.isArray(input.reglas) ? input.reglas
      : (Array.isArray(input.acciones) ? input.acciones
        : (input.criterio && Array.isArray(input.criterio.reglas) ? input.criterio.reglas : []));
    return raw;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolJuzgar(params) { return this._juzgar(params); }
}

module.exports = InformeAccionable;
