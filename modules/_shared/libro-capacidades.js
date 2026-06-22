/**
 * LibroDeCapacidades — el corazón del Conserje (abrir el camino al comerciante).
 *
 * Abstracción pura, sin bus ni I/O: dado el GRAFO de lo que el sistema OFRECE
 * y el ESTADO de lo que el comerciante USA, devuelve la BRECHA priorizada — las
 * capacidades que le darían valor y aún no aprovecha, ordenadas por intención.
 *
 * No hay sondas hardcodeadas. El empujón emerge de la estructura:
 *   OFRECE (capacidades declaradas) − USA (lo que toca de verdad) = oportunidad.
 *
 * La señal de oro es la INTENCIÓN: el comerciante declara qué quiere con lo que
 * ALARGA LA MANO a tocar. Una capacidad que INTENTA usar pero no está montada
 * (su precondición no se cumple) pesa más que una que nunca ha mirado.
 *
 * Dos formas de brecha:
 *   - descubrimiento: ofrecida, nunca tocada      ("esto existe y te daría valor")
 *   - desbloqueo:     intentada, no lista (vacía)  ("lo buscas, te falta montarlo") ← prioridad
 *
 * `requiere` ordena la apertura: no se empuja "diseña la carta" si aún no hay
 * marca. Abre el camino EN ORDEN, como una mano que guía.
 */

'use strict';

// Pesos de priorizacion. La intencion (desbloqueo) manda; lo bloqueado no se empuja.
const PESO_DESBLOQUEO = 3;     // intentada pero no lista -> el empujon mas afilado
const PESO_DESCUBRIMIENTO = 1; // ofrecida, nunca tocada

class LibroDeCapacidades {
  /**
   * @param {Array<Capacidad>} capacidades  el grafo de lo que el sistema OFRECE.
   *   Capacidad = { id, ofrece, requiere?: [id], entrada, valor?: 1..10 }
   */
  constructor(capacidades = []) {
    this.capacidades = new Map();
    for (const c of capacidades) {
      if (!c || !c.id) continue;
      this.capacidades.set(c.id, {
        id: c.id,
        ofrece: c.ofrece || c.id,
        requiere: Array.isArray(c.requiere) ? c.requiere : [],
        entrada: c.entrada || null,
        valor: Number.isFinite(c.valor) ? c.valor : 5
      });
    }
  }

  /**
   * La BRECHA priorizada para un proyecto.
   * @param {Object} estado  { usadas: Set|Array, intentadas: Set|Array }
   *   - usadas:     capacidades que YA entregan valor (store lleno / op completada)
   *   - intentadas: capacidades que TOCA pero su precondicion no se cumple (vacias)
   * @returns {Array<ItemBrecha>} ordenada por prioridad desc.
   *   ItemBrecha = { id, ofrece, entrada, tipo, listo, bloqueada_por, prioridad }
   */
  brecha(estado = {}) {
    const usadas = _set(estado.usadas);
    const intentadas = _set(estado.intentadas);
    const items = [];

    for (const cap of this.capacidades.values()) {
      if (usadas.has(cap.id)) continue;                      // ya aprovecha -> fuera de la brecha

      const bloqueada_por = cap.requiere.filter(r => !usadas.has(r));
      const listo = bloqueada_por.length === 0;              // precondiciones cumplidas
      const intentada = intentadas.has(cap.id);
      const tipo = intentada ? 'desbloqueo' : 'descubrimiento';

      // Lo bloqueado no se empuja (prioridad 0): primero se abre lo que requiere.
      const prioridad = listo
        ? cap.valor * (intentada ? PESO_DESBLOQUEO : PESO_DESCUBRIMIENTO)
        : 0;

      items.push({
        id: cap.id, ofrece: cap.ofrece, entrada: cap.entrada,
        tipo, listo, bloqueada_por, prioridad
      });
    }

    // prioridad desc; a igualdad, valor desc; luego id estable.
    items.sort((a, b) =>
      b.prioridad - a.prioridad ||
      (this.capacidades.get(b.id).valor - this.capacidades.get(a.id).valor) ||
      a.id.localeCompare(b.id));
    return items;
  }

  /**
   * El SIGUIENTE empujon: el item de mayor prioridad que esté LISTO (precondiciones
   * cumplidas). null si no hay nada accionable (todo usado o todo bloqueado).
   */
  siguienteEmpujon(estado = {}) {
    const top = this.brecha(estado).find(i => i.listo && i.prioridad > 0);
    return top || null;
  }
}

function _set(x) {
  if (x instanceof Set) return x;
  if (Array.isArray(x)) return new Set(x);
  return new Set();
}

/**
 * Grafo de capacidades del subsistema pizzepos — sale casi entero de la sección
 * "Bases compartidas" de CLAUDE.md. El Conserje lo cruza con el uso real.
 */
const PIZZEPOS_CAPACIDADES = [
  {
    id: 'marca', valor: 9,
    ofrece: 'tu identidad de marca — de aquí salen las cartas y el diseño',
    requiere: [],
    entrada: 'carta-marketing.completar_onboarding'
  },
  {
    id: 'recetas', valor: 8,
    ofrece: 'tu recetario con ingredientes y costes',
    requiere: [],
    entrada: 'recetas.crear'
  },
  {
    id: 'escandallo', valor: 7,
    ofrece: 'el coste real de cada receta (food cost)',
    requiere: ['recetas'],
    entrada: 'escandallo.calcular'
  },
  {
    id: 'carta', valor: 9,
    ofrece: 'tu carta de productos lista para vender',
    requiere: ['recetas'],
    entrada: 'menu-generator.preparar'
  },
  {
    id: 'diseno', valor: 6,
    ofrece: 'el diseño visual de tu carta impresa',
    requiere: ['marca', 'carta'],
    entrada: 'carta-design.disenar'
  },
  {
    id: 'digital', valor: 7,
    ofrece: 'tu carta pública online (PWA)',
    requiere: ['carta', 'marca'],
    entrada: 'carta-digital.get_carta_publica'
  }
];

module.exports = { LibroDeCapacidades, PIZZEPOS_CAPACIDADES, PESO_DESBLOQUEO, PESO_DESCUBRIMIENTO };
