/**
 * nichos/cosechador-alto — SENSOR DE INTENCION REAL del vertical NICHOS (v0.2.0).
 *
 * EL PROBLEMA QUE CIERRA: el sembrador SIEMBRA la categoria («pizzeria en Lorca»)
 * y la fuente devuelve OFERTA (quien ya vende pizza), nunca dinero ni hambre. El
 * alto (autocompletado de Google) es la pregunta que la gente TECLEA de verdad:
 * intencion viva, primer orden. Este modulo la COSECHA y la entra como semillas
 * por la MISMA puerta que usa el dueño (capturador-semilla), para que la cadena
 * entera (normalizar→sondear→juzgar) camine sobre demanda real.
 *
 * LA LECCION DE LA COSECHA 1ª (2026-10-19, 9 consultas → 17 sugerencias → 0
 * sembradas): el ORDEN DE PALABRAS del español decide si Google trae o niega.
 * «barato comer en lorca» (modificador delante) → 0. «dónde comer barato en
 * lorca» → 10 ricas. Y el ancla LARGA («en lorca murcia») estrangula — la viva
 * es «en lorca». FORMA v0.2.0: lista de CONSULTAS NATURALES escritas tal como
 * las teclea la gente (verbo-pregunta delante, modificador de compra detrás,
 * ancla corta). Cada materia lleva SUS modificadores: el estudio del alto las
 * mostro desiguales (comer pide barato/abierto; ocio pide hoy/finde/niños).
 *
 * Que hace (UN RPC): nichos.cosechador.alto.cosechar.request
 *   {project_id, territorio, consultas?, set?, anadir_consultas?,
 *    max_consultas?, ruidos?, max_semillas?, sembrar?:bool}
 *   1. Resuelve el SET de consultas (defecto: futuro-lorca; override por
 *      consultas[] o anadir_consultas[]; tope max_consultas, defecto 60).
 *   2. Consulta el ALTO por cada consulta POR EL GATE (puerto-fuente-datos,
 *      fuente.alto → crawl4rs.sugerencias.request); lee resultado_crudo.sugerencias.
 *   3. DOMA EL RUIDO: domo fuerte SIEMPRE (Lorca-homonimos, lorcana, moneda,
 *      franquicias, agregadores, provincias ajenas) + ruidos extra por invocacion.
 *   4. CLASIFICA (determinista): ancla Lorca/Murcia + modificadores de compra
 *      (abierto/barato/cerca/domicilio/hoy_finde/opiniones) — la señal de dinero.
 *   5. SIEMBRA lo que pasa por la puerta del vertical (dinero primero, tope
 *      max_semillas defecto 25): nichos.semilla.capturar.request, texto = la
 *      sugerencia TAL CUAL, origen 'cosechador-alto'.
 *   6. PULSA nichos.cosechador.alto.cosechado; guarda contadores en el store
 *      (/prisma/pos/nichos/cosechador-alto.json) para auditoria del dueño.
 *
 * Degradacion honesta: alto vacio o caido → 200 con contadores honestos
 * (consultas_con_datos); no siembra, no inventa. Sin project_id/territorio →
 * 400 INVALID_INPUT.
 *
 * Patron: ModuloHibridoReflejo (REFLEJO puro, JS determinista). Sin LLM.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();

// ── DOMADOR DE RUIDO — DOMO FUERTE (determinista, SIEMPRE aplica; los ruidos
// extra por invocacion SUMAN, nunca sustituyen a este). Lo que NO es hambre
// local se queda fuera. ──
const RUIDO_FUERTE = [
  // lorca-homonimos (poeta, vinos, relojes, cripto, Lorca de otras provincias)
  /garci[áa] ?lorca/i, /fed[ée]rico/i, /lorca en granada/i, /lorca granada/i,
  /lorca ja[ée]n/i, /lorca tijuana/i, /lorca alicante/i, /lorca lanjaron/i,
  /vinos? lorca/i, /relojes? lorca/i, /lorca wallet/i, /lorca coin/i,
  /r[óo]mulo/i, /romulo/i,
  // el juego de cartas Disney que secuestra «lorca»
  /lorcana/i,
  // moneda (el CP 30800 tambien es un precio en yenes/dolares)
  /\b(jpy|usd|yen|dolar|dollar|euro)s?\b/i,
  // provincias/territorios ajenos sueltos
  /penn?[íi]?s?cola/i, /castellon/i, /valencia/i, /zaragoza/i, /navarra/i,
  /pamplona/i, /\bgranada\b/i, /\bjaen\b/i, /tijuana/i, /alicante/i,
  /lanjaron/i, /madrid(?! plaza)/i, /barcelona/i, /sevilla/i, /malaga/i,
  /almeria/i, /grada/i,
  // franquicias y agregadores: oferta, no hambre
  /burger king/i, /kfc/i, /telepizza/i, /dominos/i, /mcdonald/i, /subway/i,
  /mercadona/i, /lidl/i, /carrefour/i, /aldi/i,
  /tripadvisor/i, /justeat/i, /glovo/i, /uber\s?eats/i, /infojobs/i, /linkedin/i,
  /indeed/i, /wikipedia/i, /wiktionary/i, /facebook/i, /instagram/i, /tiktok/i,
  // paginas de geografia / institucion
  /municipio/i, /ayuntamiento/i
];

// Modificadores de COMPRA (la señal de dinero que el listado no trae): quien
// teclea esto esta comprando hoy.
const MODIFICADORES = [
  { id: 'abierto_ahora', re: /abierto|ahora|open now/i },
  { id: 'barato', re: /barato|barata|precio|cuanto cuesta|economic/i },
  { id: 'cerca', re: /cerca|m[áa]s cerca|near me/i },
  { id: 'domicilio', re: /domicilio|delivery|reparto|para llevar/i },
  { id: 'hoy_finde', re: /hoy|mañana|este fin de semana|fin de semana|domingo|sabado|finde/i },
  { id: 'opiniones', re: /mejor valorado|opinion|rese[ñn]a|bueno/i }
];

// ── SETS NOMINALES — consultas NATURALES tal como se teclean (v0.2.0). ──
// La lección de la cosecha 1ª en cada línea: verbo DELANTE, modificador DETRÁS,
// ancla CORTA. Materias: comer (el modificador barato/abierto pegado al final),
// diversion (hoy/finde/niños/llueve), trabajar (oficio concreto), vivienda.
const SET_FUTURO_DEFECTO = {
  nombre: 'futuro-lorca',
  consultas: [
    // comer
    'dónde comer barato en lorca',
    'dónde comer en lorca abierto ahora',
    'dónde cenar en lorca hoy',
    'dónde desayunar en lorca',
    'dónde tapear en lorca',
    'menú del día en lorca',
    // diversion
    'dónde salir de fiesta en lorca este fin de semana',
    'qué hacer en lorca hoy',
    'qué hacer en lorca este fin de semana',
    'qué hacer en lorca con niños',
    'qué hacer en lorca cuando llueve',
    'planes en lorca hoy',
    'cine en lorca precio de entradas',
    // trabajar
    'trabajo de camarero en lorca',
    'trabajo de administrativo en lorca',
    'trabajo de almacén en lorca',
    'trabajo en lorca sin experiencia',
    'cursos en lorca',
    'autoescuela en lorca precio',
    // vivienda
    'alquiler barato en lorca'
  ]
};
const NOMBRE_SETS = { 'futuro-lorca': SET_FUTURO_DEFECTO };

/** Una sugerencia pasa el domo (true = entra como candidato). */
function pasaDomo(s, ruidosExtra = []) {
  const t = String(s || '').trim();
  if (t.length < 6 || t.length > 90) return false;
  if (RUIDO_FUERTE.some((re) => re.test(t))) return false;
  return !ruidosExtra.some((re) => re.test(t));
}

/** Modificadores de compra que lleva la sugerencia. */
function modificadoresDe(s) {
  return MODIFICADORES.filter((m) => m.re.test(s)).map((m) => m.id);
}

/** ¿La pregunta es del territorio? (ancla Lorca/Murcia/30800) */
function anclaLocal(s) {
  return /\blorca\b/i.test(s) || /\bmurcia\b/i.test(s) || /30800/.test(s);
}

/** id corto para una consulta (hash simple, sin crypto). */
function idDe(texto) {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) | 0;
  return 'alto-' + Math.abs(h).toString(36);
}

class CosechadorAlto extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cosechador-alto';
    this.version = '0.2.0';
    // estado por proyecto: { cosechas: [{ts, ...contadores}] } (auditoria)
    this.estadoPorProyecto = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'cosechador-alto.json',
      dir: '/prisma/pos/nichos',
      snapshot: (pid) => ({ estado: this.estadoPorProyecto.get(pid) || null }),
      hidratar: (pid, data) => {
        if (data && data.estado) this.estadoPorProyecto.set(pid, data.estado);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── RPC ──
  onCosecharRequest(e) {
    return this._atender(
      e,
      'cosechar',
      'nichos.cosechador.alto.cosechar.response',
      (d) => this._cosechar(d)
    );
  }

  // =============================================================
  // PROYECCION — _cosechar
  // =============================================================

  async _cosechar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.territorio || typeof input.territorio !== 'string') {
      return this._invalid('territorio');
    }

    const projectId = input.project_id;
    const territorio = input.territorio.trim();

    // 1. EL SET — la lista de CONSULTAS NATURALES. Defecto: futuro-lorca.
    //    Override completo {consultas:[...]} o set nominal; suma anadir_consultas.
    let consultas;
    if (Array.isArray(input.consultas) && input.consultas.length > 0) {
      consultas = input.consultas.map((c) => String(c).trim()).filter(Boolean);
    } else {
      const set = (input.set && NOMBRE_SETS[input.set]) || SET_FUTURO_DEFECTO;
      consultas = set.consultas.slice();
    }
    if (Array.isArray(input.anadir_consultas)) {
      consultas = consultas.concat(
        input.anadir_consultas.map((c) => String(c).trim()).filter(Boolean)
      );
    }
    // tope de consultas (cada una = una llamada al alto): defecto 60, max 300.
    const tope = Math.min(input.max_consultas || 60, 300);
    consultas = consultas.slice(0, tope);

    // ruidos EXTRA por invocacion (patrones regex-string; invalidos se sueltan).
    const ruidosExtra = (Array.isArray(input.ruidos) ? input.ruidos : [])
      .map((p) => { try { return new RegExp(String(p), 'i'); } catch (_e) { return null; } })
      .filter(Boolean);

    // 2. COSECHAR — consulta por consulta, contra el alto, POR EL GATE
    //    (puerto-fuente-datos): la misma puerta con limites del vertical.
    //    fuente.alto → topic crawl4rs.sugerencias.request (SearXNG
    //    autocompleter, backend google). El crudo llega en
    //    resultado_crudo.sugerencias (el gate lo envuelve; J2 no lo toca).
    const sugeridas = [];       // { consulta, n, sugerencias[] }
    let consultasConDatos = 0;
    for (const q of consultas) {
      let lista = [];
      try {
        const resp = await this._rpc('nichos.fuente.consumir.request', {
          project_id: projectId,
          fuente: { tipo: 'alto', nombre: 'alto', coste_unitario: 0 },
          query: q
        }, { timeout_ms: 15000 });
        const crudo = resp && resp.data && resp.data.resultado_crudo ? resp.data.resultado_crudo : null;
        if (crudo && Array.isArray(crudo.sugerencias)) {
          lista = crudo.sugerencias.filter((s) => typeof s === 'string');
        }
      } catch (_e) { /* degradacion honesta: consulta sin datos */}
      if (lista.length > 0) consultasConDatos++;
      sugeridas.push({ consulta: q, n: lista.length, sugerencias: lista.slice(0, 12) });
    }

    // 3+4. FILTRAR + CLASIFICAR — determinista, todo lo que entra queda anotado.
    const vistas = new Set();
    const candidatos = [];
    for (const s of sugeridas) {
      for (const sug of s.sugerencias) {
        if (vistas.has(sug)) continue;
        vistas.add(sug);
        if (!pasaDomo(sug, ruidosExtra)) continue;
        if (!anclaLocal(sug)) continue;
        candidatos.push({
          texto: sug,
          consulta: s.consulta,
          modificadores: modificadoresDe(sug)
        });
      }
    }

    // 5. SEMBRAR — por la puerta del vertical, la sugerencia TAL CUAL. Solo si
    //    piden sembrar (defecto SIEMPRE: es el sentido del modulo). DINERO
    //    PRIMERO: con modificador de compra delante; tope max_semillas (25).
    const sembradas = [];
    const topeSemillas = input.sembrar === false
      ? 0
      : Math.min(
          (Number.isInteger(input.max_semillas) && input.max_semillas > 0) ? input.max_semillas : 25,
          candidatos.length
        );
    if (input.sembrar !== false) {
      const ordenadas = candidatos
        .map((c, i) => ({ c, i }))
        .sort((a, b) => (b.c.modificadores.length - a.c.modificadores.length) || (a.i - b.i))
        .slice(0, topeSemillas);
      for (const { c } of ordenadas) {
        this.eventBus?.publish('nichos.semilla.capturar.request', {
          request_id: `alto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          correlation_id: `cosechador-alto-${Date.now()}`,
          project_id: projectId,
          texto: c.texto,
          origen: 'cosechador-alto',
          territorio,
          alto: { consulta: c.consulta, modificadores: c.modificadores }
        });
        sembradas.push({ id: idDe(c.texto), texto: c.texto, consulta: c.consulta, modificadores: c.modificadores });
      }
    }

    // 6. PULSO + store para auditoria del dueño.
    const ts = nowISO();
    const resumen = {
      consultas_total: consultas.length,
      consultas_con_datos: consultasConDatos,
      sugerencias_brutas: sugeridas.reduce((a, s) => a + s.n, 0),
      limpias: candidatos.length,
      sembradas: sembradas.length,
      con_dinero: candidatos.filter((c) => c.modificadores.length > 0).length
    };

    this.eventBus?.publish('nichos.cosechador.alto.cosechado', {
      project_id: projectId,
      territorio,
      set: (input.set && NOMBRE_SETS[input.set] ? input.set : SET_FUTURO_DEFECTO.nombre),
      ...resumen,
      timestamp: ts
    });

    const estado = this.estadoPorProyecto.get(projectId) || { cosechas: [] };
    estado.cosechas.unshift({ ts, ...resumen });
    estado.cosechas = estado.cosechas.slice(0, 50);
    this.estadoPorProyecto.set(projectId, estado);
    this._persist.marcarDirty(projectId);

    return {
      status: 200,
      data: {
        resumen: { ...resumen, tope_semillas: topeSemillas },
        candidatos: candidatos.slice(0, 100),
        sembradas: sembradas.length
      }
    };
  }

  _idProyecto() {
    // los reflejos no llevan project_id activo en memoria: el store se dirige
    // por el project_id de la llamada.
    return null;
  }
}

module.exports = CosechadorAlto;