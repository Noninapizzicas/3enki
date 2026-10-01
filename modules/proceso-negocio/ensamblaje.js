/**
 * proceso-negocio/ensamblaje — el RECOMPONEDOR (F7b · ENSAMBLAJE).
 *
 * EL PROBLEMA QUE CIERRA (medido en vivo, 1-oct-2026):
 *   El proceso construye cada módulo como una isla (F4) y verifica que CARGA (F8),
 *   pero NADIE comprueba que lo construido HABLE con lo diseñado. Resultado real en
 *   la vertical nichos: 89 eventos diseñados en el plan (F3b) que ningún módulo
 *   escucha, y 8 módulos que no hacen lo que el plan declaró.
 *
 * POR QUÉ NO LO RESUELVE EL VALIDADOR DE EVENTOS
 *   `blueprint-eventos-conscientes.validate.js` ya sabe detectar un evento publicado
 *   sin consumidor, pero su check es OPT-IN: solo mira los módulos que declaran
 *   `eventos_publicados_que_requieren_consumer[]`, y en nichos ninguno lo declara
 *   (0 de 44). Además es pasivo: solo informa, no forma parte del proceso.
 *
 * LA MATERIA PRIMA — no hay que inventar nada:
 *   `esquemas/plan-construccion.md` (F3b) ya declara, por CADA hoja, sus
 *   `subscribes[]` y `publishes[]`. Eso es el CONTRATO DISEÑADO.
 *   Los `modules/<slug>/module.json` (F4) declaran lo CONSTRUIDO.
 *   El trabajo es CRUZARLOS y decir la verdad de la divergencia.
 *
 * POR QUÉ F7b Y NO OTRA FASE
 *   F7 es el último eslabón que ESCRIBE (las interfaces). Cuando F7b corre, la
 *   realidad escrita está completa: plan (F3b) + módulos (F4) + skills (F5) +
 *   interfaces (F6→F7). Antes no habría nada que recomponer; después (F8) ya es
 *   verificación, no composición. F7b RECOMPONE con la realidad escrita y F8
 *   verifica el resultado.
 *
 * DETERMINISTA (sin LLM): cruzar dos listas no es un juicio, es una cuenta.
 *   El reflejo hace el trabajo; el juicio fuzzy no tiene nada que aportar aquí.
 *
 * Reversible: no toca nada. Solo lee y produce un informe.
 */
'use strict';

// Un evento de transporte del bus (RPC) no es una CONEXIÓN de dominio:
// su consumidor es el `on<Op>Request` del propio módulo. Se excluyen del cruce.
const ES_TRANSPORTE = (e) => typeof e === 'string' && (e.endsWith('.request') || e.endsWith('.response'));

// Normaliza una entrada de subscribes/publishes a {evento, handler?} sin importar
// si viene como string, {event} u {evento}.
function normalizar(lista) {
  if (!Array.isArray(lista)) return [];
  const out = [];
  for (const x of lista) {
    if (typeof x === 'string' && x.trim()) out.push({ evento: x.trim(), handler: null });
    else if (x && typeof x === 'object') {
      const e = x.event || x.evento;
      if (typeof e === 'string' && e.trim()) out.push({ evento: e.trim(), handler: x.handler || null });
    }
  }
  return out;
}

class Ensamblaje {
  /**
   * @param {object} plan     — el bloque ```json enki-plan``` de F3b: {hojas:[{slug,subscribes,publishes,...}]}
   * @param {object} real     — mapa slug → {existe, subscribes, publishes, tiene_interfaz}
   */
  constructor(plan, real) {
    this.plan = plan || {};
    this.real = real || {};
  }

  // Los slugs del plan, con su contrato declarado.
  _hojasDisenadas() {
    const hojas = Array.isArray(this.plan.hojas) ? this.plan.hojas : [];
    return hojas
      .filter((h) => h && typeof h.slug === 'string' && h.slug.trim())
      .map((h) => ({
        slug: h.slug.trim(),
        forma: h.forma || null,
        accion: h.accion || null,
        subscribes: normalizar(h.subscribes),
        publishes: normalizar(h.publishes)
      }));
  }

  /**
   * La recomposición completa. Determinista, sin efectos: es una cuenta.
   * Devuelve la verdad de la divergencia entre lo DISEÑADO (F3b) y lo ESCRITO
   * (módulos + interfaces reales).
   */
  recomponer() {
    const hojas = this._hojasDisenadas();

    // ── 1. Qué se diseñó, en conjuntos de eventos de DOMINIO ──
    const disenados = new Map(); // slug → {sub:Set, pub:Set}
    for (const h of hojas) {
      disenados.set(h.slug, {
        sub: new Set(h.subscribes.map((x) => x.evento)),
        pub: new Set(h.publishes.map((x) => x.evento))
      });
    }

    // ── 2. Qué se escribió ──
    const escritos = new Map();
    for (const [slug, r] of Object.entries(this.real)) {
      escritos.set(slug, {
        existe: !!r.existe,
        sub: new Set(normalizar(r.subscribes).map((x) => x.evento)),
        pub: new Set(normalizar(r.publishes).map((x) => x.evento)),
        tiene_interfaz: !!r.tiene_interfaz
      });
    }

    // ── 3. Divergencia POR HOJA ──
    const hojas_divergentes = [];
    for (const [slug, dis] of disenados) {
      const esc = escritos.get(slug);
      if (!esc) {
        hojas_divergentes.push({
          slug, tipo: 'NO_ESCRITA',
          motivo: 'el plan (F3b) la declara pero no hay módulo escrito',
          falta_subscribes: [...dis.sub].filter((e) => !ES_TRANSPORTE(e)).sort(),
          falta_publishes: [...dis.pub].filter((e) => !ES_TRANSPORTE(e)).sort()
        });
        continue;
      }
      // Solo los eventos de DOMINIO: los .request/.response los atiende el
      // propio módulo por su handler RPC y no son conexiones entre piezas.
      const dis_sub = [...dis.sub].filter((e) => !ES_TRANSPORTE(e));
      const dis_pub = [...dis.pub].filter((e) => !ES_TRANSPORTE(e));
      const real_sub = [...esc.sub];
      const real_pub = [...esc.pub];

      const falta_subscribes = dis_sub.filter((e) => !real_sub.includes(e)).sort();
      const falta_publishes = dis_pub.filter((e) => !real_pub.includes(e)).sort();
      // Lo que el módulo hace y el plan NO declaró (ruido, no siempre error).
      const extra_subscribes = real_sub.filter((e) => !ES_TRANSPORTE(e) && !dis_sub.includes(e)).sort();
      const extra_publishes = real_pub.filter((e) => !ES_TRANSPORTE(e) && !dis_pub.includes(e)).sort();

      if (falta_subscribes.length || falta_publishes.length || extra_subscribes.length || extra_publishes.length) {
        hojas_divergentes.push({
          slug, tipo: 'DIVERGENTE',
          forma: disenados.size ? null : null,
          falta_subscribes, falta_publishes,
          extra_subscribes, extra_publishes
        });
      }
    }

    // ── 4. CONEXIONES DE DOMINIO ROTAS (el cruce global) ──
    // Un evento de dominio lo publica alguien y nadie lo escucha → se pierde.
    // Se calcula sobre lo ESCRITO (la realidad), que es lo que importa.
    const pubsReal = new Map(); // evento → [slug]
    const subsReal = new Set();
    for (const [slug, esc] of escritos) {
      for (const e of esc.pub) {
        if (ES_TRANSPORTE(e)) continue;
        if (!pubsReal.has(e)) pubsReal.set(e, []);
        pubsReal.get(e).push(slug);
      }
      for (const e of esc.sub) if (!ES_TRANSPORTE(e)) subsReal.add(e);
    }
    const conexiones_rotas = [...pubsReal.entries()]
      .filter(([e]) => !subsReal.has(e))
      .map(([evento, publica_en]) => ({ evento, publica_en: publica_en.sort() }))
      .sort((a, b) => a.evento.localeCompare(b.evento));

    // ── 5. Resumen ──
    const total_hojas = hojas.length;
    const escritas = [...disenados.keys()].filter((s) => escritos.has(s)).length;
    const divergentes = hojas_divergentes.filter((h) => h.tipo === 'DIVERGENTE').length;

    return {
      esquema: 'ensamblaje-f7b-v1',
      total_hojas,
      hojas_escritas: escritas,
      hojas_no_escritas: total_hojas - escritas,
      hojas_divergentes: divergentes,
      conexiones_rotas_count: conexiones_rotas.length,
      hojas_divergentes_detalle: hojas_divergentes.sort((a, b) => a.slug.localeCompare(b.slug)),
      conexiones_rotas,
      // El veredicto: ¿se puede poner en servicio ENSAMBLADO?
      ensamblado: (total_hojas - escritas) === 0 && divergentes === 0 && conexiones_rotas.length === 0
    };
  }
}

module.exports = { Ensamblaje, normalizar, ES_TRANSPORTE };
