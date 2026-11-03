'use strict';

/**
 * cola-sala · CUSTODIO · PLAZA — P01 (ColaSala) · O03 (ColaRevisiónHumana) · P02 (VistaParte).
 *
 * UNA SOLA COLA. Una incidencia, una disputa, un alta incompleta y un pedido sin rider son el mismo
 * tipo de cosa: algo que se ha atascado y necesita a alguien. No tres bandejas.
 *
 *   1. PRIORIDAD POR HECHOS: tiempo esperando y pedidos afectados. No por quién llama más. Y el
 *      número va acompañado de sus componentes, para que nadie tenga que creerse la fórmula.
 *   2. VENCER NO RESUELVE. Un caso con el plazo vencido SUBE de prioridad y sigue vivo: no se cierra
 *      solo ni «se resuelve» por defecto (Q40 [ABIERTO]).
 *   3. UN CASO SALE CON UN HECHO QUE LO CIERRA (dictamen, cargo, alta completada, resuelto), no
 *      porque alguien lo borre. Sin hecho de cierre no hay cierre: 409.
 *   4. LA REVISIÓN ES DE ESTA PLAZA (O03): el nacional no dictamina sobre una propuesta que no
 *      tiene. Y la vista de una parte no muestra a la otra (P02).
 *
 * Single-writer: nadie más escribe este hecho. Store `/bocaos/cola-sala.json` por proyecto.
 * Isla: cero require a otra isla.
 */

const crypto = require('crypto');
const ModuloBocaos = require('../_bocaos');

// P01 · los tipos de cosa que se atascan. Cerrada: si no está aquí, no es un caso de esta cola.
const TIPOS = ['incidencia', 'disputa', 'alta_incompleta', 'pedido_sin_rider', 'hueco', 'revision', 'fallo'];

// P01 · un caso sale con un hecho que lo cierra, con nombre.
const CIERRES = ['dictamen', 'cargo', 'alta_completada', 'resuelto'];

const MAX_HUECOS = 500;

class ColaSala extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'cola-sala';
    this.version = 'custodio-0.1.0';
    this._path = '/bocaos/cola-sala.json';
  }

  // ================= RPC del bus (una línea por op) =================
  onEncolarRequest(e) { return this.servir(e, 'encolar', 'cola-sala.encolar', (d) => this._encolar(d)); }
  onTomarRequest(e) { return this.servir(e, 'tomar', 'cola-sala.tomar', (d) => this._tomar(d)); }
  onCerrarRequest(e) { return this.servir(e, 'cerrar', 'cola-sala.cerrar', (d) => this._cerrar(d)); }
  onListarRequest(e) { return this.servir(e, 'listar', 'cola-sala.listar', (d) => this._listar(d)); }

  // ================= hechos que escucha =================
  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (d.project_id) await this.estado(d.project_id);
  }

  // I07 · el aviso pide la cola por su nombre (`cola-sala.encolar.request`) y además anuncia el caso
  // aquí. Las dos puertas llevan a la MISMA fila: encolar es idempotente por `caso_id`.
  async onAvisoSalaCaso(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.caso_id) return null;
    await this._encolar({
      project_id: d.project_id,
      plaza_id: d.plaza_id,
      caso: d.caso,
      caso_id: d.caso_id,
      tipo: d.tipo,
      traza: d.traza,
      plazo: d.plazo,
      vencido: d.vencido === true,
      pedidos_afectados: d.pedidos_afectados,
      origen: d.origen || 'aviso-sala'
    });
    return null;
  }

  // A34 · un hueco nombrado es la explicación que la sala puede leer. NO crea un caso por sí solo
  // (un candidato saltado no es un caso); se guarda y se pega a la traza del caso de ese pedido
  // cuando exista. Sin caso, el hueco no se pierde: queda en el índice del pedido.
  async onHuecoNombrado(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id) return null;
    const est = await this.estado(d.project_id);
    est.huecos = est.huecos || {};
    const lista = (est.huecos[d.pedido_id] = est.huecos[d.pedido_id] || []);
    lista.push({
      hueco: d.hueco || null,
      motivo: d.motivo || null,
      via: d.via || null,
      hora: this.ahora()
    });
    if (lista.length > 20) lista.shift();
    if (Object.keys(est.huecos).length > MAX_HUECOS) {
      delete est.huecos[Object.keys(est.huecos)[0]];
    }
    // Si ya hay un caso de ese pedido, el hueco entra en su traza: el diagnóstico se puede leer.
    est.casos = est.casos || {};
    for (const caso of Object.values(est.casos)) {
      if (caso.pedido_id !== d.pedido_id || caso.estado !== 'ABIERTO') continue;
      caso.traza = { ...(caso.traza || {}), huecos: [...lista] };
      caso.huecos = [...lista];
    }
    await this.guardar(d.project_id);
    return null;
  }

  // F06 · una incidencia abierta ES un caso de esta cola (P01: una sola cola).
  async onIncidenciaAbierta(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id) return null;
    await this._encolar({
      project_id: d.project_id,
      plaza_id: d.plaza_id,
      caso_id: d.caso_id || `in-${d.pedido_id}`,
      tipo: 'incidencia',
      caso: {
        caso_id: d.caso_id || `in-${d.pedido_id}`,
        tipo: 'incidencia',
        titulo: `incidencia del pedido ${d.pedido_id}`,
        pedido_id: d.pedido_id,
        parte_id: d.autor || null
      },
      traza: {
        pedido_id: d.pedido_id,
        relato: d.relato || null,
        autor: d.autor || null,
        hora: this._iso(d.hora) || this.ahora(),
        tipo: d.tipo || null
      },
      plazo: d.plazo || null,
      pedidos_afectados: 1,
      origen: 'incidencia-reparto'
    });
    return null;
  }

  // O04 · el dictamen firmado CIERRA el caso que nombra: es el hecho que lo cierra (P01).
  async onDictamenFirmado(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.caso_id) return null;
    await this._cerrar({
      project_id: d.project_id,
      caso_id: d.caso_id,
      por: (d.firmante && (d.firmante.id || d.firmante.nombre)) || 'dictamen',
      por_que: `dictamen ${d.dictamen_id || ''}: ${d.motivo || ''}`.trim(),
      hecho_cierre: 'dictamen',
      dictamen_id: d.dictamen_id || null,
      hora: d.firmado_en || null
    });
    return null;
  }

  // ================= P01 · encolar (ORDEN) =================
  async _encolar(d) {
    const project_id = d.project_id || this.plaza_id;
    if (!project_id) return this._invalid('project_id');
    const casoEntrante = d.caso && typeof d.caso === 'object' ? d.caso : {};
    const caso_id = d.caso_id || casoEntrante.caso_id || `cs-${crypto.randomUUID().slice(0, 8)}`;

    const tipo = d.tipo || casoEntrante.tipo || null;
    if (!TIPOS.includes(tipo)) {
      return this._errorResponse(400, 'TIPO_NO_DECLARADO',
        `el tipo del caso es de la forma cerrada: ${TIPOS.join(' | ')}`, { field: 'tipo', tipos: TIPOS });
    }
    const traza = d.traza && typeof d.traza === 'object' ? d.traza : null;
    if (!traza) {
      // P01 · con su traza. Un caso sin traza es una queja sin nada que mirar.
      return this._errorResponse(409, 'SIN_TRAZA',
        'un caso entra con su traza: qué se intentó y por qué no pasó (P01/I07)', { field: 'traza' });
    }

    const est = await this.estado(project_id);
    est.casos = est.casos || {};
    est.huecos = est.huecos || {};

    const existente = est.casos[caso_id];
    if (existente && existente.estado === 'ABIERTO') {
      // La misma cosa dos veces es UN caso (las dos puertas del aviso llevan aquí).
      return { status: 200, data: { caso: this._vista(existente, { ahora: this.ahora() }), idempotente: true } };
    }
    if (existente && existente.estado === 'CERRADO' && d.hecho_nuevo !== true) {
      return this._errorResponse(409, 'CASO_CERRADO',
        'ese caso ya se cerró con su hecho: no se reabre sin un hecho nuevo (P01/G05)',
        { field: 'caso_id', cerrado_por: existente.cerrado_por });
    }
    if (existente && existente.estado === 'CERRADO' && d.hecho_nuevo === true) {
      // Un hecho nuevo sí abre otro caso, con su propia llave: el cerrado no se toca.
      return this._errorResponse(409, 'CASO_CERRADO',
        'un hecho nuevo abre un caso NUEVO (otro caso_id), no reabre el cerrado',
        { field: 'caso_id', hueco: 'otro caso_id' });
    }

    // O03 · la revisión es de ESTA plaza: el nacional no dictamina lo que no tiene.
    const origenPlaza = casoEntrante.plaza_id || d.plaza_id || project_id;
    if (origenPlaza !== project_id) {
      return this._errorResponse(409, 'CRUZA_DE_PLAZA',
        'ese caso es de otra plaza: la revisión es de la plaza donde se decidió (O03)',
        { field: 'plaza_id', caso_plaza: origenPlaza });
    }
    if (casoEntrante.ambito === 'nacional' || d.ambito === 'nacional') {
      return this._errorResponse(409, 'NO_ES_DE_ESTA_PLAZA',
        'el nacional no dictamina sobre una propuesta que no tiene: no entra en la cola de la plaza (O03)',
        { field: 'ambito' });
    }

    const now = this.ahora();
    const plazo = this._iso(d.plazo) || this._iso(casoEntrante.plazo) || null;
    const caso = {
      caso_id,
      tipo,
      titulo: casoEntrante.titulo || d.titulo || `${tipo} ${caso_id}`,
      ambito: 'plaza',
      plaza_id: project_id,
      parte_id: casoEntrante.parte_id || d.parte_id || null,
      partes: Array.isArray(casoEntrante.partes) ? casoEntrante.partes : (Array.isArray(d.partes) ? d.partes : []),
      pedido_id: casoEntrante.pedido_id || d.pedido_id || (traza && traza.pedido_id) || null,
      cargos: casoEntrante.cargo_id ? [casoEntrante.cargo_id] : [],
      traza,
      plazo,
      plazo_estado: plazo ? 'DECLARADO' : 'NO_CONSTA',
      pedidos_afectados: Number.isInteger(d.pedidos_afectados) ? d.pedidos_afectados
        : (d.pedido_id || (traza && traza.pedido_id) ? 1 : 0),
      encolado_en: now,
      origen: d.origen || casoEntrante.origen || null,
      estado: 'ABIERTO',
      dueno: null,
      tomado_en: null,
      vencido_alguna_vez: d.vencido === true,
      cerrado_en: null,
      cerrado_por: null,
      por_que: null,
      hecho_cierre: null,
      dictamen_id: null,
      // Los huecos de ese pedido, si los hay: la sala no tiene que buscarlos.
      huecos: (est.huecos[casoEntrante.pedido_id || d.pedido_id] || []).slice()
    };

    est.casos[caso_id] = caso;
    await this.guardar(project_id);

    this._publicar(caso, 'encolado');
    return { status: 201, data: { caso: this._vista(caso, { ahora: now }) } };
  }

  // ================= P01 · tomar (ORDEN) =================
  async _tomar(d) {
    const project_id = d.project_id || this.plaza_id;
    if (!project_id) return this._invalid('project_id');
    if (!d.caso_id) return this._invalid('caso_id');
    const por = this._autor(d.por || d.firmante || d.autor);
    if (!por) return this._invalid('por');

    const est = await this.estado(project_id);
    const caso = est.casos?.[d.caso_id];
    if (!caso) return this._errorResponse(404, 'NO_CONSTA', 'ese caso no está en la cola de esta plaza', { field: 'caso_id' });
    if (caso.estado === 'CERRADO') {
      return this._errorResponse(409, 'CASO_CERRADO', 'el caso ya se cerró con su hecho', { field: 'caso_id' });
    }
    if (caso.dueno && caso.dueno !== por) {
      return this._errorResponse(409, 'YA_TOMADO',
        `el caso lo tiene ${caso.dueno}: dos personas sobre un caso es una que se queda sin él`,
        { field: 'caso_id', dueno: caso.dueno });
    }
    if (caso.dueno === por) return { status: 200, data: { caso: this._vista(caso, { ahora: this.ahora() }), idempotente: true } };

    caso.dueno = por;
    caso.tomado_en = this.ahora();
    await this.guardar(project_id);
    return { status: 200, data: { caso: this._vista(caso, { ahora: this.ahora() }) } };
  }

  // ================= P01 · cerrar (ORDEN) =================
  async _cerrar(d) {
    const project_id = d.project_id || this.plaza_id;
    if (!project_id) return this._invalid('project_id');
    if (!d.caso_id) return this._invalid('caso_id');

    const est = await this.estado(project_id);
    const caso = est.casos?.[d.caso_id];
    if (!caso) return this._errorResponse(404, 'NO_CONSTA', 'ese caso no está en la cola de esta plaza', { field: 'caso_id' });
    if (caso.estado === 'CERRADO') {
      return { status: 200, data: { caso: this._vista(caso, { ahora: this.ahora() }), idempotente: true } };
    }

    const hecho = typeof d.hecho_cierre === 'string' ? d.hecho_cierre.trim() : '';
    if (!CIERRES.includes(hecho)) {
      // P01 · no se borra: sale con un hecho que lo cierra.
      return this._errorResponse(409, 'SIN_HECHO_DE_CIERRE',
        `un caso sale de la cola con un hecho que lo cierra (${CIERRES.join(' | ')}), no porque alguien lo borre`,
        { field: 'hecho_cierre', cierres: CIERRES });
    }
    const porQue = typeof d.por_que === 'string' ? d.por_que.trim() : (typeof d.motivo === 'string' ? d.motivo.trim() : '');
    if (!porQue) return this._errorResponse(400, 'INVALID_INPUT', 'cerrar exige decir por qué', { field: 'por_que' });

    caso.estado = 'CERRADO';
    caso.cerrado_en = this._iso(d.hora) || this.ahora();
    caso.cerrado_por = this._autor(d.por || d.firmante || d.autor) || 'sin declarar';
    caso.por_que = porQue;
    caso.hecho_cierre = hecho;
    caso.dictamen_id = d.dictamen_id || null;
    await this.guardar(project_id);

    this._publicar(caso, 'cerrado');
    return { status: 200, data: { caso: this._vista(caso, { ahora: this.ahora() }) } };
  }

  // ================= listar (PREGUNTA) · incluye la vista de la parte (P02) =================
  async _listar(d) {
    const project_id = d.project_id || this.plaza_id;
    if (!project_id) return this._invalid('project_id');
    const est = await this.estado(project_id);
    const ahora = this._iso(d.ahora) || this.ahora();
    const todos = Object.values(est.casos || {});

    const abiertos = todos.filter((c) => c.estado === 'ABIERTO');
    const conPrioridad = abiertos
      .map((c) => ({ caso: c, p: this._prioridad(c, ahora) }))
      .sort((a, b) => b.p.prioridad - a.p.prioridad);

    // P02 · la vista de una parte: sólo lo suyo, y sin los datos de la otra.
    if (d.parte_id) {
      const suyos = conPrioridad.filter(({ caso }) => this._esDeLaParte(caso, d.parte_id));
      return {
        status: 200,
        data: {
          parte_id: d.parte_id,
          ahora,
          casos: suyos.map(({ caso, p }) => this._vistaParte(caso, d.parte_id, p)),
          total: suyos.length,
          nota: 'la vista de una parte no muestra a la otra: ni sus datos, ni su traza (P02)'
        }
      };
    }

    return {
      status: 200,
      data: {
        ahora,
        abiertos: conPrioridad.length,
        casos: conPrioridad.map(({ caso, p }) => this._vista(caso, { ahora, prioridad: p })),
        cerrados: d.incluir_cerrados === true
          ? todos.filter((c) => c.estado === 'CERRADO').map((c) => this._vista(c, { ahora }))
          : [],
        // La prioridad no es un misterio: sus componentes van en cada caso.
        formula: 'horas esperando × 1 + pedidos afectados × 2 + 5 si está vencido (P01: por hechos, no por quién llama)',
        huecos_sin_caso: Object.keys(est.huecos || {}).length
      }
    };
  }

  // ================= prioridad y vistas =================
  _prioridad(caso, ahora) {
    const desde = Date.parse(caso.encolado_en);
    const horas = Number.isFinite(desde) ? Math.max(0, (Date.parse(ahora) - desde) / 3600000) : 0;
    const vencido = !!(caso.plazo && Date.parse(caso.plazo) < Date.parse(ahora));
    const pedidos = Number.isInteger(caso.pedidos_afectados) ? caso.pedidos_afectados : 0;
    // P01 · tiempo esperando y pedidos afectados. El vencimiento SUMA: vencer no resuelve, empuja.
    const prioridad = this._round(horas * 1 + pedidos * 2 + (vencido ? 5 : 0), 3);
    return {
      prioridad,
      horas_esperando: this._round(horas, 2),
      pedidos_afectados: pedidos,
      vencido
    };
  }

  _esDeLaParte(caso, parte_id) {
    if (caso.parte_id === parte_id) return true;
    return Array.isArray(caso.partes) && caso.partes.includes(parte_id);
  }

  _vista(caso, { ahora, prioridad = null } = {}) {
    const p = prioridad || this._prioridad(caso, ahora || this.ahora());
    return {
      ...caso,
      ...p,
      plazo_estado: caso.plazo ? 'DECLARADO' : 'NO_CONSTA',
      hora_de_entrada: caso.encolado_en
    };
  }

  // P02 · lo que la parte ve de su caso: su traza y su plazo, sin la otra parte.
  _vistaParte(caso, parte_id, p) {
    const otra = (caso.partes || []).filter((x) => x !== parte_id);
    const traza = { ...(caso.traza || {}) };
    for (const k of ['deudor', 'acreedor', 'contraparte', 'otra_parte', 'partes', 'autor']) {
      // Los datos de la otra parte no cruzan: ni su nombre, ni su parte en la traza.
      if (k in traza) delete traza[k];
    }
    return {
      caso_id: caso.caso_id,
      tipo: caso.tipo,
      titulo: caso.titulo,
      estado: caso.estado,
      tu_parte: parte_id,
      // Se dice que el caso tiene otra parte, pero no quién es.
      hay_otra_parte: otra.length > 0,
      traza,
      huecos: caso.huecos || [],
      plazo: caso.plazo,
      plazo_estado: caso.plazo ? 'DECLARADO' : 'NO_CONSTA',
      encolado_en: caso.encolado_en,
      horquilla: { horas_esperando: p.horas_esperando, vencido: p.vencido },
      // Lo que la parte NO ve, dicho: sin esto, la vista parece completa y no lo es.
      no_visible: 'los datos y la traza de la otra parte; y el nombre de quien lo está mirando'
    };
  }

  _publicar(caso, transicion) {
    const p = this._prioridad(caso, this.ahora());
    const carga = {
      caso_id: caso.caso_id,
      tipo: caso.tipo,
      titulo: caso.titulo,
      plaza_id: caso.plaza_id,
      ambito: caso.ambito,
      parte_id: caso.parte_id,
      partes: caso.partes,
      pedido_id: caso.pedido_id,
      traza: caso.traza,
      plazo: caso.plazo,
      plazo_estado: caso.plazo_estado,
      pedidos_afectados: caso.pedidos_afectados,
      estado: caso.estado,
      transicion,
      encolado_en: caso.encolado_en,
      prioridad: p.prioridad,
      vencido: p.vencido,
      // Y el cierre, cuando lo hay: con su hecho y su porqué (P01).
      cerrado_en: caso.cerrado_en,
      cerrado_por: caso.cerrado_por,
      por_que: caso.por_que,
      hecho_cierre: caso.hecho_cierre,
      dictamen_id: caso.dictamen_id
    };
    // Dos hechos, con su nombre: el que entra y el que se cierra. No se publica uno genérico.
    if (transicion === 'cerrado') this.hecho('bocaos.caso_cerrado', carga);
    else this.hecho('bocaos.caso_encolado', carga);
  }

  _autor(a) {
    if (typeof a === 'string' && a.trim()) return a.trim();
    if (a && typeof a === 'object') return a.id || a.parte_id || a.nombre || a.rol || null;
    return null;
  }
}

module.exports = ColaSala;
module.exports.TIPOS = TIPOS;
module.exports.CIERRES = CIERRES;
