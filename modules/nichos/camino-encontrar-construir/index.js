'use strict';

/**
 * nichos/camino-encontrar-construir — MICRO-AGENTE del vertical NICHOS (F2 · C4).
 *
 * F0 §4: «El sistema puede ENCONTRAR (demanda real, demostrable — camino rápido a
 * caja, riesgo bajo) o CONSTRUIR (crear la necesidad — riesgo alto, más margen).
 * CADA CICLO DECIDE CUÁL. Es un nodo de decisión por oportunidad.»
 *
 * REGLA (F3 · diseno-oop.md:480-501 — la autoridad sobre este módulo):
 *   riesgo ← estimarRiesgo(informe)                  // fuzzy
 *   atajo  ← buscaCaminoRapidoACaja(informe)         // fuzzy
 *   SI atajo.existe Y riesgo.esBajo      → ENCONTRAR(atajo)
 *   SI politica.exige_vb_previo_construir Y riesgo.esAlto
 *                                        → SolicitudDecision CAMINO_CONSTRUIR_VB
 *   RESTO                                → CONSTRUIR(riesgo)
 *   «decide el carácter de D1; si la política exige vb humano para construir
 *    (riesgo alto), emite SolicitudDecision — NO SE ARROGA EL RIESGO»
 *
 * ── EL ERROR QUE ESTA VERSIÓN REPARA (medido en vivo, 15-oct-2026) ──────────────
 * La v0.1.0 decidía por RECUENTO, no por juicio:
 *
 *     const totalRequeridas = informe.requisitos?.length || 1;      // el informe del
 *     const cubiertas = capacidades.filter(c => c.activa !== false).length;
 *     const ratio = cubiertas / totalRequeridas;                     // embudo NO trae
 *     if (ratio >= 0.8) → 'TOTAL' → ENCONTRAR                        // `requisitos` → 1
 *
 * El informe real que produce `estudio-demanda` es
 * `{demanda_1er_orden, disposicion_a_pagar, fuentes_usadas, coste}` — sin `requisitos`,
 * sin `dominio`. Así que el divisor era SIEMPRE 1, el ratio SIEMPRE = tamaño del
 * catálogo (≥1) y la cobertura SIEMPRE 'TOTAL': ENCONTRAR incondicional.
 *
 * Prueba viva (sonda RPC, nicho inventado "prueba-crochet", nada que ver con el
 * catálogo): devolvió `{tipo:"ENCONTRAR", capacidades:[comercio-pizzepos-pos,
 * impresion-3d-por-encargo, construccion-obra-y-mecanizado], cobertura:"TOTAL"}`.
 *
 * Consecuencia: **CONSTRUIR era código muerto** — la rama «crear la necesidad» del
 * negocio (el filo del F0) no podía dispararse nunca. Este módulo decide por JUICIO
 * (riesgo + atajo), con el norte como EVIDENCIA (nunca como puerta) y un fallback
 * determinista si el LLM no responde.
 *
 * ── EL EJE DE MONETIZACIÓN (v0.3.0) ────────────────────────────────────────────
 * Decidir CONSTRUIR no se queda en la etiqueta: **el acto declara el eje**. Monetizar
 * un nicho son TRES patas — CAPTURAR al cliente, ENTREGAR, COBRAR — y C4 las declara
 * en el norte (como encargos, autor `constructor`) en el mismo acto de decidir. Así
 * el segundo piso del norte («podemos construir») nace de una decisión, no de un
 * formulario que alguien rellene; y el ciclo siguiente ya siembra, sondea y juzga
 * desde «tenemos ∪ podemos construir». El catálogo es idempotente por id: re-declarar
 * cada ciclo no duplica. (Este es el eje que el esquema viejo `nichos-capacidades-v1`
 * modelaba — `<nicho>:captura|entrega|cobro`, declarado por CONSTRUCTOR — y que se
 * perdió al migrar el store: el norte quedó con un solo piso.)
 *
 * Patrón: ModuloHibridoReflejo.
 */

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

const RIESGOS = ['BAJO', 'ALTO'];
const TIPOS_CAMINO = ['ENCONTRAR', 'CONSTRUIR'];
const TIPO_SOLICITUD_VB = 'CAMINO_CONSTRUIR_VB';

// EL EJE DE MONETIZACIÓN — monetizar un nicho son TRES patas: capturar al
// cliente, entregar, cobrar. Cuando C4 decide CONSTRUIR las declara en el norte
// (segundo piso: «podemos construir»), y el buscador vuelve a nacer de
// «tenemos ∪ podemos construir». Estas tres palabras son las que el sondeador
// conoce como EJES (no discriminan dominio: solo nombran la pata).
const EJES = ['captura', 'entrega', 'cobro'];

// Aciertos mínimos para que un cruce de palabras cuente como ENCAJE real. Con 1 solo
// acierto entran genéricos («taller» es etiqueta legítima de impresion-3d y también
// describe un taller de crochet): es ruido, no encaje. El juicio fino es del LLM.
const UMBRAL_ENCAJE = 2;

// Palabras que no distinguen nada al cruzar el nicho con el norte.
const VACIAS = new Set([
  'para', 'como', 'este', 'esta', 'esto', 'esos', 'esas', 'unos', 'unas', 'donde',
  'cuando', 'tiene', 'tener', 'hacer', 'puede', 'pueden', 'sobre', 'entre', 'desde',
  'hasta', 'pero', 'porque', 'aunque', 'mismo', 'misma', 'otro', 'otra', 'otros',
  'otras', 'todo', 'toda', 'todos', 'todas', 'mas', 'menos', 'muy', 'sin', 'con',
  'los', 'las', 'del', 'una', 'que', 'por', 'son', 'estan', 'ser', 'hay', 'the',
  'and', 'for', 'with', 'that', 'this'
]);

const PROMPT_SISTEMA = [
  'Eres el juez que decide el CARÁCTER de un nicho en el embudo de un buscador de nichos.',
  'Recibes: (a) el informe de demanda del nicho, (b) el veredicto de viabilidad y',
  '(c) el catálogo de lo que el operador YA sabe hacer (sus capacidades).',
  '',
  'Decide DOS cosas:',
  '',
  '1. ATAJO — ¿existe un CAMINO RÁPIDO A CAJA? Es true SOLO si la demanda ya está',
  '   demostrada (demanda de primer orden concreta) Y se conoce lo que el pagador está',
  '   dispuesto a pagar. Si hay que educar al mercado, o los números económicos se',
  '   desconocen, es false.',
  '',
  '2. RIESGO — BAJO si se entra por demanda ya existente y sabemos servirla con alguna',
  '   capacidad del catálogo; ALTO si hay que crear la necesidad desde cero, o si no',
  '   sabemos servirla con lo que tenemos.',
  '',
  'Las capacidades del catálogo son EVIDENCIA, no requisito: si el nicho no encaja con',
  'ninguna, dilo — eso sube el riesgo, no cierra la puerta.',
  '',
  'Responde SOLO con un JSON:',
  '{"atajo_existe":<true|false>,"riesgo":"<BAJO|ALTO>","razon":"<justificación concisa>"}',
  'Sin explicación adicional. Solo el JSON.'
].join('\n');

class CaminoEncontrarConstruir extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'camino-encontrar-construir';
    this.version = '0.3.0';
  }

  // ── RPC HANDLER ──
  onDecidirRequest(e) {
    return this._atender(e, 'decidir', 'nichos.camino.decidir.response', d => this._decidir(d));
  }

  // ── PROYECCION: _decidir (juicio → camino, según la regla de F3) ──
  async _decidir(input) {
    if (!input.informe) return this._invalid('informe');
    if (!input.veredicto) return this._invalid('veredicto');

    const projectId = input.project_id;
    const idNicho = input.informe.id_nicho || input.id_nicho || 'sin-id';

    try {
      // 1. EL NORTE — lo que YA sabemos hacer. Evidencia para el juicio.
      const capacidades = await this._leerNorte(projectId);
      const encaje = this._evaluarEncaje(capacidades, input);

      // 2. LA POLÍTICA DEL DUEÑO (F2 · C2) — solo ella puede exigir VB previo.
      const criterio = await this._leerCriterio(projectId);

      // 3. EL JUICIO (riesgo + atajo) — el micro-agente.
      const juicio = await this._juzgar(input, encaje, capacidades, projectId);

      // 4. ÁRBOL DE DECISIÓN DE F3 — en este orden, sin atajos.
      if (juicio.atajo.existe && juicio.riesgo === 'BAJO') {
        return this._decidirEncontrar(idNicho, juicio, encaje);
      }
      if (this._exigeVbPrevio(criterio) && juicio.riesgo === 'ALTO') {
        return this._solicitarVb(idNicho, juicio, encaje, projectId);
      }
      return this._decidirConstruir(idNicho, juicio, encaje, projectId);
    } catch (err) {
      return this._errorResponse(502, 'ERROR_CAMINO', err.message || 'error al decidir camino', {});
    }
  }

  // =============================================================
  // LAS TRES SALIDAS DEL ÁRBOL
  // =============================================================

  /** Encontrar: hay atajo a caja y el riesgo es bajo. */
  _decidirEncontrar(idNicho, juicio, encaje) {
    const camino = {
      tipo: 'ENCONTRAR',
      razon: juicio.razon,
      riesgo: juicio.riesgo,
      atajo: juicio.atajo,
      capacidades_encajadas: encaje
    };
    this.eventBus?.publish('nichos.camino.decidido', {
      id_nicho: idNicho,
      tipo: camino.tipo,
      riesgo: camino.riesgo,
      capacidades_encajadas: encaje.map(c => c.id),
      timestamp: nowISO()
    });
    return { status: 200, data: { camino } };
  }

  /** Construir: hay que crear la necesidad. La rama que la v0.1.0 hacía inalcanzable. */
  _decidirConstruir(idNicho, juicio, encaje, projectId) {
    // EL ACTO DECLARA EL EJE. Decidir CONSTRUIR no es solo devolver una etiqueta:
    // es declarar en el norte las tres patas que hay que levantar para MONETIZAR
    // este nicho. Así el segundo piso del norte nace del ACTO de decidir (no de
    // un formulario que alguien rellena) y el ciclo siguiente ya busca desde
    // «tenemos ∪ podemos construir». El catálogo es idempotente por id: repetir
    // la declaración en cada ciclo no duplica nada — es una declaración viva.
    const por_construir = this._declararEjesConstruir(idNicho, projectId, encaje);

    const camino = {
      tipo: 'CONSTRUIR',
      razon: juicio.razon,
      riesgo: juicio.riesgo,
      capacidades_encajadas: encaje,
      capacidades_por_construir: por_construir
    };
    this.eventBus?.publish('nichos.camino.decidido', {
      id_nicho: idNicho,
      tipo: camino.tipo,
      riesgo: camino.riesgo,
      capacidades_encajadas: encaje.map(c => c.id),
      capacidades_por_construir: por_construir,
      timestamp: nowISO()
    });
    return { status: 200, data: { camino } };
  }

  /**
   * Solicitud de decisión al dueño. F3: «no se arroga el riesgo». Solo se alcanza
   * cuando la POLÍTICA DECLARADA lo manda (`exige_vb_previo_construir === true`);
   * hoy ese campo nace ABIERTO en el custodio, así que esta rama duerme.
   */
  _solicitarVb(idNicho, juicio, encaje, projectId) {
    const solicitud = {
      tipo: TIPO_SOLICITUD_VB,
      contexto: `Construir «${idNicho}» (riesgo ALTO) exige el visto bueno del dueño: ${juicio.razon}`,
      opciones: TIPOS_CAMINO,
      dueno: 'dueño',
      id_nicho: idNicho,
      riesgo: juicio.riesgo,
      atajo_posible: juicio.atajo,
      capacidades_encajadas: encaje.map(c => c.id)
    };

    this.eventBus?.publish('nichos.cola.decisiones.encolar.request', {
      request_id: `cam-enc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      project_id: projectId,
      solicitud_decision: solicitud
    });
    this.eventBus?.publish('nichos.camino.decidido', {
      id_nicho: idNicho,
      tipo: TIPO_SOLICITUD_VB,
      riesgo: juicio.riesgo,
      capacidades_encajadas: encaje.map(c => c.id),
      timestamp: nowISO()
    });

    return {
      status: 200,
      data: {
        camino: {
          tipo: TIPO_SOLICITUD_VB,
          razon: juicio.razon,
          riesgo: juicio.riesgo,
          capacidades_encajadas: encaje
        },
        solicitud_decision: solicitud
      }
    };
  }

  // =============================================================
  // EL EJE DE MONETIZACIÓN — capturar · entregar · cobrar
  // =============================================================
  /**
   * _declararEjesConstruir — el acto que llena el segundo piso del norte.
   *
   * Declara, como ENCARGOS, las tres patas de monetización del nicho. El autor
   * es `constructor` (C4 ES el constructor: quien decide construir es quien
   * declara qué hay que construir). Sin `project_id` no se declara nada — el
   * norte es PER-PROYECTO y un encargo sin casa no existe.
   */
  _declararEjesConstruir(idNicho, projectId, encaje) {
    if (!projectId) return [];
    const base = this._slug(idNicho);
    if (!base) return [];

    const dominio = (encaje && encaje[0] && encaje[0].dominio)
      || this._tokens(idNicho).values().next().value
      || null;
    const etiquetas = Array.from(this._tokens(idNicho)).slice(0, 20);

    for (const eje of EJES) {
      this.eventBus?.publish('nichos.catalogo.capacidad.encargar.request', {
        request_id: `cam-enc-${eje}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        project_id: projectId,
        por_autor: 'constructor',
        capacidad: {
          id: `${base}:${eje}`,
          descripcion: `capacidad ${eje} para: ${idNicho}`,
          meta: { dominio, eje, nicho: base, nicho_texto: String(idNicho), etiquetas }
        }
      });
    }
    return EJES.map((eje) => `${base}:${eje}`);
  }

  /** _slug — el id de las patas no puede llevar espacios ni tildes. */
  _slug(texto) {
    return String(texto || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  // =============================================================
  // EL NORTE — capacidades disponibles (lo que YA sabemos hacer)
  // =============================================================
  async _leerNorte(projectId) {
    const resp = await this._rpc('nichos.catalogo.capacidad.disponibles.request', {
      project_id: projectId
    }, { timeout_ms: 12000 });
    const caps = resp && resp.data && resp.data.capacidades;
    return Array.isArray(caps) ? caps.filter(c => c && c.activa !== false) : [];
  }

  // =============================================================
  // LA POLÍTICA DEL DUEÑO (F2 · C2)
  // =============================================================
  async _leerCriterio(projectId) {
    const resp = await this._rpc('nichos.criterio.viabilidad.leer.request', {
      project_id: projectId
    }, { timeout_ms: 10000 });
    return (resp && resp.data && resp.data.umbral_viabilidad) || null;
  }

  /**
   * Un dato ausente NO se asume: `exige_vb_previo_construir` nace ABIERTO y solo un
   * `true` DECLARADO por el dueño enciende el gate. Hasta entonces C4 decide
   * CONSTRUIR sin arrogarse nada, que es exactamente lo que manda la regla de F3.
   */
  _exigeVbPrevio(criterio) {
    const umbral = criterio && criterio.umbral;
    return !!(umbral && umbral.exige_vb_previo_construir === true);
  }

  // =============================================================
  // EL JUICIO (fuzzy) — riesgo + atajo. Fallback determinista.
  // =============================================================
  async _juzgar(input, encaje, capacidades, projectId) {
    const determinista = this._juicioDeterminista(input.informe, encaje);
    const llm = await this._pedirAlLLM(input, encaje, capacidades, projectId);
    if (!llm) return determinista;

    return {
      riesgo: RIESGOS.includes(llm.riesgo) ? llm.riesgo : determinista.riesgo,
      atajo: {
        existe: typeof llm.atajo_existe === 'boolean'
          ? llm.atajo_existe
          : determinista.atajo.existe,
        detalle: llm.razon || determinista.atajo.detalle
      },
      razon: llm.razon || determinista.razon,
      fuente: 'llm'
    };
  }

  /**
   * La vara de F2 · C1: demanda de primer orden + disposición a pagar. Sin números
   * no hay atajo a caja; sin encaje en el norte, el riesgo es ALTO.
   */
  _juicioDeterminista(informe, encaje) {
    const demanda = String((informe && informe.demanda_1er_orden) || '').trim().toLowerCase();
    const demandaConcreta = !!demanda
      && !/^(no determinada|desconocida|ninguna|sin datos)$/.test(demanda);

    let precioConocido = false;
    const disposicion = informe && informe.disposicion_a_pagar;
    if (disposicion && typeof disposicion === 'object') {
      precioConocido = Object.keys(disposicion).length > 0;
    } else if (disposicion) {
      precioConocido = !/^(desconocida|abierto|sin datos|no determinada)$/
        .test(String(disposicion).trim().toLowerCase());
    }

    const hayEncaje = encaje.length > 0;
    const atajoExiste = demandaConcreta && precioConocido && hayEncaje;

    return {
      riesgo: (atajoExiste || hayEncaje) ? 'BAJO' : 'ALTO',
      atajo: {
        existe: atajoExiste,
        detalle: 'juicio determinista (sin LLM)'
      },
      razon: atajoExiste
        ? 'demanda de primer orden concreta + precio conocido + capacidad del norte que sirve'
        : 'faltan los números que abren el atajo a caja (demanda de primer orden y/o disposición a pagar)',
      fuente: 'determinista'
    };
  }

  // =============================================================
  // LLM — el juicio fuzzy vía ai-gateway (mismo patrón que veredicto-viabilidad)
  // =============================================================
  async _pedirAlLLM(input, encaje, capacidades, projectId) {
    let resp;
    try {
      resp = await this._rpc('llm.complete.request', {
        project_id: projectId,
        messages: [
          { role: 'system', content: PROMPT_SISTEMA },
          { role: 'user', content: this._contextoJuicio(input, encaje, capacidades) }
        ],
        options: { temperature: 0.1, max_tokens: 200 }
      }, { timeout_ms: 20000 });
    } catch (_) {
      return null;
    }

    const contenido = String((resp && (resp.content || resp.text)) || '').trim();
    if (!contenido) return null;

    try {
      const p = JSON.parse(contenido);
      return { atajo_existe: p.atajo_existe, riesgo: p.riesgo, razon: p.razon };
    } catch (_) {
      // El LLM a veces envuelve el JSON: se rescata el riesgo y el atajo del texto.
      const riesgo = RIESGOS.find(r => new RegExp(`"riesgo"\\s*:\\s*"${r}"`).test(contenido))
        || RIESGOS.find(r => contenido.toUpperCase().includes(r))
        || null;
      let atajo;
      if (/"atajo_existe"\s*:\s*true/i.test(contenido)) atajo = true;
      else if (/"atajo_existe"\s*:\s*false/i.test(contenido)) atajo = false;
      if (riesgo === null && typeof atajo !== 'boolean') return null;
      return { atajo_existe: atajo, riesgo, razon: contenido.slice(0, 300) };
    }
  }

  _contextoJuicio(input, encaje, capacidades) {
    const informe = input.informe || {};
    const norte = (capacidades || []).map(c => ({
      id: c.id,
      dominio: (c.meta && c.meta.dominio) || null,
      descripcion: c.descripcion || null,
      etiquetas: (c.meta && c.meta.etiquetas) || []
    }));
    return [
      'INFORME DE DEMANDA DEL NICHO:',
      JSON.stringify(informe, null, 2),
      '',
      `ID DEL NICHO: ${informe.id_nicho || input.id_nicho || 'sin-id'}`,
      '',
      'VEREDICTO DE VIABILIDAD:',
      JSON.stringify(input.veredicto || {}, null, 2),
      '',
      'CATÁLOGO COMPLETO — LO QUE EL OPERADOR YA SABE HACER:',
      JSON.stringify(norte, null, 2),
      '',
      'CRUCE PREVIO nicho ↔ catálogo (aciertos de palabras; puede equivocarse, es solo una pista):',
      encaje.length
        ? JSON.stringify(encaje, null, 2)
        : '(ninguna capacidad cruza con este nicho)'
    ].join('\n');
  }

  // =============================================================
  // ENCAJE nicho ↔ norte (determinista) — qué capacidad SIRVE a este nicho
  // =============================================================
  /**
   * La v0.1.0 contaba TODO el catálogo y lo llamaba "cobertura" (3 capacidades / 1
   * requisito inexistente = TOTAL). Aquí se cruza de verdad: se tokeniza el texto
   * del nicho (id, demanda, razón del veredicto) contra dominio + etiquetas +
   * semillas + descripción de cada capacidad, y solo sobrevive lo que supera
   * UMBRAL_ENCAJE (un acierto suelto es ruido: «taller» cruza con crochet y con
   * impresión 3D por igual).
   */
  _evaluarEncaje(capacidades, input) {
    if (!Array.isArray(capacidades) || capacidades.length === 0) return [];

    const texto = [
      input.id_nicho,
      input.informe && input.informe.id_nicho,
      input.informe && input.informe.demanda_1er_orden,
      input.informe && input.informe.disposicion_a_pagar,
      input.veredicto && input.veredicto.razon
    ].filter(Boolean).join(' ');

    const tokens = this._tokens(texto);
    if (tokens.size === 0) return [];

    return capacidades
      .map(c => {
        const meta = c.meta || {};
        const heno = this._tokens([
          c.id,
          c.descripcion,
          meta.dominio,
          ...(Array.isArray(meta.etiquetas) ? meta.etiquetas : []),
          ...(Array.isArray(meta.semillas) ? meta.semillas : [])
        ].filter(Boolean).join(' '));

        let aciertos = 0;
        for (const t of tokens) if (heno.has(t)) aciertos++;
        return { capacidad: c, aciertos };
      })
      .filter(x => x.aciertos >= UMBRAL_ENCAJE)
      .sort((a, b) => b.aciertos - a.aciertos)
      .map(x => ({
        id: x.capacidad.id,
        descripcion: x.capacidad.descripcion || null,
        dominio: (x.capacidad.meta && x.capacidad.meta.dominio) || null,
        aciertos: x.aciertos
      }));
  }

  _tokens(texto) {
    const set = new Set();
    String(texto || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // sin acentos
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 4 && !VACIAS.has(t))
      .forEach(t => set.add(t));
    return set;
  }
}

module.exports = CaminoEncontrarConstruir;
