'use strict';

/**
 * MotorDeReconsolidacion — el árbitro plasticidad/rigidez, PURO (sin bus, sin fs).
 *
 * El corazón del lazo que diseñamos: observa instancias FIRMADAS (esqueletos), y
 * por ÁMBITO (p.ej. tipo='pizza') aprende los INVARIANTES — las dimensiones que se
 * mantienen constantes a través de las instancias. La repetición es el árbitro:
 *
 *   - acumula → al cruzar umbralSellar, SELLA los invariantes (estabilidad ganada).
 *   - instancia que respeta los invariantes → REFUERZO (sube confianza, mielina).
 *   - instancia que VIOLA un invariante:
 *       · 1 vez (o pocas)            → ENFORCE: el artefacto está MAL (el caso Hip Hop:
 *                                       "pizza sin masa" viola el invariante → incompleta).
 *       · la MISMA violación ×N       → RECONSOLIDAR: el método evolucionó (focaccias);
 *                                       el patrón cede, re-deriva invariantes (plasticidad).
 *
 * umbralReabrir es la HISTÉRESIS: evita que un one-off (ruido) re-abra el patrón.
 * Es el "gemelo-de-sustantivos" del minero del destilador: misma recurrencia, pero
 * la firma llega ya hecha (la computó el reflejo) en vez de reducirse de una traza.
 *
 * Solo razona sobre dimensiones BOOLEANAS (presencia: tiene_masa, tiene_queso…).
 * Las escalares que varían legítimamente (n_toppings) NUNCA se vuelven invariante.
 * Esa elección — qué dimensiones cuentan — la fija quien construye la firma (formaDe):
 * el dial plasticidad/rigidez vive ahí, no aquí.
 */

class MotorDeReconsolidacion {
  constructor(opts = {}) {
    this.umbralSellar = opts.umbralSellar || 3;          // instancias para sellar un patrón
    this.umbralReabrir = opts.umbralReabrir || 3;        // violaciones IGUALES para reconsolidar
    this.fraccionInvariante = opts.fraccionInvariante || 1.0;  // 1.0 = constante en TODAS
    this.ambitos = new Map();   // ambito -> { instancias, sellado:{invariantes,confianza}|null, violaciones:Map }
  }

  _amb(ambito) {
    if (!this.ambitos.has(ambito)) {
      this.ambitos.set(ambito, { instancias: [], sellado: null, violaciones: new Map() });
    }
    return this.ambitos.get(ambito);
  }

  // invariantes: dimensiones BOOLEANAS donde TODAS (>= fraccion) las instancias coinciden.
  _invariantes(instancias) {
    const inv = {};
    if (!instancias.length) return inv;
    const dims = new Set();
    for (const i of instancias) for (const d of Object.keys(i)) if (typeof i[d] === 'boolean') dims.add(d);
    for (const d of dims) {
      const vals = instancias.map(i => i[d]);
      const trues = vals.filter(v => v === true).length;
      if (trues / vals.length >= this.fraccionInvariante) inv[d] = true;
      else if ((vals.length - trues) / vals.length >= this.fraccionInvariante) inv[d] = false;
    }
    return inv;
  }

  _viola(firma, invariantes) {
    const v = [];
    for (const [d, val] of Object.entries(invariantes)) {
      if (firma[d] !== val) v.push({ dim: d, esperado: val, fue: firma[d] });
    }
    return v;
  }

  // Observa una firma en su ámbito. Devuelve el veredicto del árbitro.
  observar(ambito, firma) {
    const a = this._amb(ambito);

    if (a.sellado) {
      const viola = this._viola(firma, a.sellado.invariantes);
      if (viola.length === 0) {
        a.sellado.confianza += 1;
        return { tipo: 'refuerzo', ambito, confianza: a.sellado.confianza };
      }
      const clave = viola.map(x => x.dim).sort().join('+');
      a.violaciones.set(clave, (a.violaciones.get(clave) || 0) + 1);
      if (a.violaciones.get(clave) >= this.umbralReabrir) {
        a.instancias.push(firma);
        a.sellado.invariantes = this._invariantes(a.instancias);
        a.sellado.confianza = a.instancias.length;
        a.violaciones.delete(clave);
        return { tipo: 'reconsolidar', ambito, viola, invariantes: a.sellado.invariantes };
      }
      return { tipo: 'enforce', ambito, viola };   // el artefacto está mal (todavía)
    }

    a.instancias.push(firma);
    if (a.instancias.length >= this.umbralSellar) {
      a.sellado = { invariantes: this._invariantes(a.instancias), confianza: a.instancias.length };
      return { tipo: 'sellar', ambito, invariantes: a.sellado.invariantes };
    }
    return { tipo: 'observado', ambito, n: a.instancias.length };
  }

  patron(ambito) {
    const a = this.ambitos.get(ambito);
    return (a && a.sellado) ? { invariantes: a.sellado.invariantes, confianza: a.sellado.confianza } : null;
  }
}

module.exports = MotorDeReconsolidacion;
