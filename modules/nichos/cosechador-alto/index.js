/**
 * nichos/cosechador-alto — SENSOR DE INTENCION REAL del vertical NICHOS (v0.1.0).
 *
 * EL PROBLEMA QUE CIERRA: el sembrador SIEMBRA la categoria («pizzeria en Lorca»)
 * y la fuente devuelve OFERTA (quien ya vende pizza), nunca dinero ni hambre. El
 * alto (autocompletado de Google) es la pregunta que la gente TECLEA de verdad:
 * inten cion viva, primer orden. Este modulo la COSECHA y la entra como semillas
 * por la MISMA puerta que usa el dueño (capturador-semilla), para que la cadena
 * entera (normalizar→sondear→juzgar) camine sobre demanda real, no sobre
 * categorias que inventamos.
 *
 * Que hace (UN RPC): nichos.cosechador.alto.cosechar.request
 *   {project_id, territorio, materias?, verbos?, anclas?, max_consultas?, sembrar?:bool}
 *   1. Lee el set de busqueda (JSON en data/nichos/cosechador-alto/set-busqueda.json,
 *      semillas de intencion = materias x verbos x anclas). Por defecto: el set
 *      alto30800 — las 3 materias que mandan en Lorca (diversion/restauracion/
 *      trabajo) con sus modificadores de compra (abierto/barato/precio/finde/niños).
 *   2. Para cada consulta del producto cartesiano, llama al ALTO via el organo web
 *      (crawl4rs.buscar.request, la MISMA puerta con limites que usa el vertical).
 *      El alto se lee del campo extra.suggestions que crawl4rs traspasa de
 *      SearXNG (server autocompleter, backend google).
 *   3. DOMA EL RUIDO (determinista): garcía/lorcana, moneda+30800 (jpy/usd),
 *      granada/jaen/tijuana/alicante (Lorca-homonimo), provincias vecinas sueltas
 *      (murcia/pais valencia), franquicias nacionales, agencias/paginas listado.
 *   4. CLASIFICA (determinista): cada sugerencia que llevan ancla Lorca/Murcia
 *      entra como candidato con modificador de compra (abierto/barato/domicilio/
 *      precio) anotado — es la señal de dinero, no la categoria.
 *   5. SIEMBRA lo que pasa el filtro por la puerta del vertical, IGUAL que el
 *      sembrador: nichos.semilla.capturar.request, texto = la CONSULTA tal cual,
 *      origen 'cosechador-alto'. La cadena hace el resto.
 *   6. PULSA nichos.cosechador.alto.cosechado con contadores; guarda el crudo en
 *      el store del módulo para que el dueño pueda auditar QUÉ SE BUSCO y QUÉ VOLVIÓ.
 *
 * Degradacion honesta: alto vacio o caido → pulsa .failed, no siembra nada, no
 * inventa. Sin project_id → INVALID_INPUT.
 *
 * Patron: ModuloHibridoReflejo (REFLEJO puro, JS determinista). Sin LLM.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();

// ── EL SET DE BUSQUEDA (el norte invertido: primero la HAMBRE, luego la casa) ──
// Materias = de qué habla la gente. Verbos = como pregunta. Anclas = donde.
// Todo proviene del estudio real del alto de Lorca/30800 (2026-10-19):
//   divertirse: que hacer/cine/tiempo/fin de semana
//   comer: donde comer abierto/barato/valorado/domicilio; nombres+telefono no se
//     cosechan (es demanda de visibilidad, otra pieza); si las formas de hambre.
//   trabajar: trabajo + oficio; empleo/formacion es gente pagando por futuro.
const SET_DEFECTO = {
  materias: [
    'diversion', 'ocio', 'que hacer', 'fiesta', 'cine',
    'comer', 'cenar', 'tapear', 'bar', 'kebab', 'pizzeria', 'hamburgueseria',
    'trabajo', 'empleo', 'oposiciones', 'cursos', 'autoescuela',
    'alquiler', 'piso', 'casa'
  ],
  verbos: ['dónde', '', 'barato', 'abierto', 'hoy', 'este fin de semana', 'con niños', 'a domicilio', 'precio'],
  anclas: ['en lorca murcia', 'en lorca', 'en murcia']
};

// ── DOMADOR DE RUIDO (determinista). Lo que NO es hambre local se queda fuera. ──
const RUIDO_FUERTE = [
  // lorca-homonimos (poeta, vinos, relojes, cripto, Lorca de otras provincias)
  /garci[áa]? ?lorca/i, /fed[ée]rico/i, /lorca en granada/i, /lorca granada/i,
  /lorca ja[ée]n/i, /lorca tijuana/i, /lorca alicante/i, /lorca lanjaron/i,
  /vinos? lorca/i, /relojes? lorca/i, /lorca wallet/i, /lorca coin/i,
  /r[óo]mulo/i,
  // el juego de cartas Disney que secuestra «lorca»
  /lorcana/i,
  // moneda+30800 (el CP tambien es un precio en yenes/dolares)
  /\b(jpy|usd|eur|yen|dolar|dollar|euro)s?\b/i,
  // provincias/territorios ajenos sueltos
  /\bmurcia (provincia|región)\b/i, /penn.?í?s?cola/i, /castellon/i, /valencia/i,
  /zaragoza/i, /navarra/i, /pamplona/i, /\bgranada\b/i, /\bjaen\b/i, /tijuana/i,
  /alicante/i, /lanjaron/i, /madrid(?! plaza)/i, /barcelona/i,
  // franquicias y agregadores: oferta, no hambre
  /burger king/i, /kfc/i, /telepizza/i, /dominos/i, /mcdonald/i, /subway/i,
  /mercadona/i, /lidl/i, /carrefour/i, /aldi/i,
  /tripadvisor/i, /justeat/i, /glovo/i, /uber\s?eats/i, /infojobs/i, /linkedin/i,
  /wikipedia/i, /wiktionary/i, /facebook/i, /instagram(?:\.com)/i, /tiktok/i,
  /\.com\b.*\b(ofertas|reviews|opiniones)\b/i,
  // wikipedia/paginas de geografia
  /municipio/i, /ayuntamiento de lorca/i
];

// Modificadores de COMPRA (la señal de dinero que el vertical pedia y ningún
// listado lleva): quien teclea esto esta comprando hoy.
const MODIFICADORES = [
  { id: 'abierto_ahora', re: /abierto|ahora|open now/i },
  { id: 'barato', re: /barato|barata|precio|cuanto cuesta|economic/i },
  { id: 'cerca', re: /cerca|m[áa]s cerca|near me/i },
  { id: 'domicilio', re: /domicilio|delivery|reparto|para llevar/i },
  { id: 'hoy_finde', re: /hoy|mañana|este fin de semana|fin de semana|domingo|sabado/i },
  { id: 'opiniones', re: /mejor valorado|opinion|rese[ñn]a|bueno/i }
];

/** Una sugerencia pasa el domador (true = entra como candidato). */
function pasaDomo(s) {
  const t = String(s || '').trim();
  if (t.length < 6 || t.length > 90) return false;
  return !RUIDO_FUERTE.some((re) => re.test(t));
}

/** Modificadores que lleva la sugerencia. */ 
function modificadoresDe(s) {
  return MODIFICADORES.filter((m) => m.re.test(s)).map((m) => m.id);
}

/** ancla territorial: es de Lorca/Murcia la pregunta? */
function anclaLocal(s) {
  return /\blorca\b/i.test(s) || /\bmurcia\b/i.test(s) || /30800/i.test(s);
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
    this.version = '0.1.0';
    // estado por proyecto: { cosechas: [{ts, consultas, sugerencias, sembradas}] }
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

  // ── RPC HANDLER ──
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
    const pid = this._idProyecto();

    // 1. EL SET — las preguntas que se hacen al alto. Por defecto el set 30800
    //    (estudio real), overridable por {materias,verbos,anclas}.
    const set = {
      materias: Array.isArray(input.materias) && input.materias.length ? input.materias : SET_DEFECTO.materias,
      verbos: Array.isArray(input.verbos) && input.verbos.length ? input.verbos : SET_DEFECTO.verbos,
      anclas: Array.isArray(input.anclas) && input.anclas.length ? input.anclas : SET_DEFECTO.anclas
    };

    // tope de consultas (cada una es una llamada al alto): defecto 60.
    const tope = Math.min(input.max_consultas || 60, 300);
    const consultas = [];
    for (const ancla of set.anclas) {
      for (const materia of set.materias) {
        for (const verbo of set.verbos) {
          const q = `${verbo} ${materia} ${ancla}`.trim();
          if (q) consultas.push(q);
        }
        if (consultas.length >= tope) break;
      }
      if (consultas.length >= tope) break;
    }

    // 2. COSECHAR — consulta por consulta, contra el alto. POR EL GATE
    //    (puerto-fuente-datos): es la misma puerta con límites que usa el resto
    //    del vertical. fuente.alto → topic crawl4rs.sugerencias.request (el
    //    escalón EL ALTO de crawl4rs v0.6.0: autocompleter SearXNG → Google).
    //    La respuesta del crudo viaja en resultado_crudo.sugerencias (string
    //    plano; el gate ya lo envolvió — J2 no lo toca).
    const sugeridas = [];      // { consulta, sugerencias: [] }
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
      } catch (_e) { /* degradacion honesta: consulta sin datos */ }
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
        if (!pasaDomo(sug)) continue;
        if (!anclaLocal(sug)) continue;
        candidatos.push({
          texto: sug,
          consulta: s.consulta,
          modificadores: modificadoresDe(sug)
        });
      }
    }

    // 5. SEMBRAR — por la puerta del vertical, la consulta tal cual. Solo si
    //    piden sembrar (por defecto SIEMPRE: es el sentido del modulo).
    //    DINERO PRIMERO: los que llevan modificador de compra (barato/abierto/
    //    domicilio...) van delante, y el tope max_semillas (defecto 25) corta
    //    la cosecha a un tamaño que la cadena (LLM + sondeo por semilla) digiere.
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
        const textoSemilla = c.texto.replace(/\blorca murcia\b/i, 'Lorca').trim();
        this.eventBus?.publish('nichos.semilla.capturar.request', {
          request_id: `alto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          correlation_id: `cosechador-alto-${Date.now()}`,
          project_id: projectId,
          texto: textoSemilla,
          origen: 'cosechador-alto',
          territorio,
          alto: { consulta: c.consulta, modificadores: c.modificadores }
        });
        sembradas.push({ id: idDe(c.texto), texto: textoSemilla, consulta: c.consulta, modificadores: c.modificadores });
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
      ...resumen,
      timestamp: ts
    });

    // guarda en el store (cosechas recientes, para auditoria).
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