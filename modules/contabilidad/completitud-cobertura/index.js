/**
 * contabilidad/completitud-cobertura — REFLEJO STATELESS (A12, hoja del plan).
 *
 * EL UNICO CALCULADOR DE COBERTURA (conflicto 2 resuelto): esperados /
 * recibidos / huecos / tasa. Mide qué llego y qué NO llego a la entrada. Q3
 * (sello de cobertura), P4 (tasa del proceso) y C6 (aviso al cierre) son
 * VISTAS de ESTA metrica; NUNCA la recalculan en cada sitio — leen este único
 * resultado. Calculo determinista: mismas entradas → misma cobertura (un test
 * lo afirma). Si no habia nada esperado, la tasa es 0 y el sistema NO finge un
 * cuadre: o dice "sin actividad" o avisa si esperaba hechos.
 *
 * REFLEJO (patron real, stateless): sin PosPersistencia ni project.activated —
 * los conjuntos de esperados/recibidos viven en memoria del propio reflejo,
 * alimentados por EVENTO (`contabilidad.anclaje_declarado` de
 * anclaje-cierre-vertical y `contabilidad.hecho_admitido` de
 * puerto-evento-vertical), NUNCA por require cruzado. La dependencia con
 * clave-natural (M3) es por EVENTO cuando hay que derivar la clave de un hecho
 * que no la trae (contrato TOLERANTE: si no responde, se publica el fallo).
 * Emisor/par de fallo: exito publica contabilidad.cobertura_calculada; error su
 * par determinista. NO REUTILIZA: la metrica de cobertura de la ENTRADA es el
 * corazon del cuello; no existe equivalente en el inventario.
 *
 * Ver hoja A12 del diseno-oop y bloque `completitud-cobertura` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class CompletitudCobertura extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'completitud-cobertura';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: conjuntos en memoria, alimentados por evento.
    this._esperados = new Map();   // project_id -> Set<ClaveHecho>
    this._recibidos = new Map();   // project_id -> Set<ClaveHecho>
    this._verticales = new Map();  // project_id -> Set<Vertical> (fuentes que declaran cierre)
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'contabilidad.cobertura.calcular.response', async (d) => {
      const res = this._calcular(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.cobertura_calculada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.cobertura.calcular.failed', res);
      }
      return res;
    });
  }

  // Fire-and-forget: anclaje-cierre-vertical (A14) declaro una fuente/unidad de cierre
  // → esa fuente pasa a ser ESPERADA (se espera que publique sus hechos).
  onAnclajeDeclarado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const pid = d.project_id;
    const vertical = d.vertical || (d.definicion && d.definicion.tipo) || null;
    if (!vertical) return null;

    if (!this._verticales.has(pid)) this._verticales.set(pid, new Set());
    this._verticales.get(pid).add(String(vertical));

    const esperados = this._set(this._esperados, pid);
    const clave = this._claveDeCierre(pid, vertical, d.definicion || d);
    esperados.add(clave);

    this.logger?.info(`${this.name}.esperado_anclado`, { vertical });
    return { status: 200, data: { project_id: pid, vertical, esperado: clave, n_esperados: esperados.size } };
  }

  // Fire-and-forget: puerto-evento-vertical (A1) admitio un hecho → RECIBIDO.
  onHechoAdmitido(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const pid = d.project_id;
    const vertical = d.vertical || (d.hecho && d.hecho.vertical) || null;
    if (!vertical) return null;

    const recibidos = this._set(this._recibidos, pid);
    const clave = this._claveDeHecho(pid, vertical, d);
    recibidos.add(clave);

    return { status: 200, data: { project_id: pid, vertical, recibido: clave, n_recibidos: recibidos.size } };
  }

  // ── proyecciones puras (deterministas) ──
  _set(mapa, pid) {
    let s = mapa.get(pid);
    if (!s) { s = new Set(); mapa.set(pid, s); }
    return s;
  }

  _claveDeCierre(pid, vertical, def) {
    const unidad = (def && (def.unidad_cierre || def.identificador || def.tipo)) || 'cierre';
    return `${pid}:${vertical}:${unidad}`;
  }

  _claveDeHecho(pid, vertical, d) {
    const clave = (d && d.clave_natural) || (d.hecho && d.hecho.clave_natural) || null;
    if (clave) return String(clave);
    const doc = (d.hecho && (d.hecho.documento_origen || d.hecho.documento)) || d.documento_origen || null;
    return doc ? `${pid}:${vertical}:${doc}` : `${pid}:${vertical}:${d.timestamp || 'sin-clave'}`;
  }

  // calcular(periodo) -> Cobertura {esperados, recibidos, huecos, tasa}
  // LA METRICA UNICA. Q3/P4/C6 son VISTAS de esto, no lo recalculan.
  _calcular(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const esperadosSet = this._set(this._esperados, pid);
    const recibidosSet = this._set(this._recibidos, pid);

    // Entradas explicitas (por si el calculo las trae ya resueltas o ampliadas).
    for (const c of (Array.isArray(input.esperados) ? input.esperados : [])) esperadosSet.add(String(c));
    for (const c of (Array.isArray(input.recibidos) ? input.recibidos : [])) recibidosSet.add(String(c));

    const esperados = [...esperadosSet];
    const recibidos = [...recibidosSet];
    const huecos = esperados.filter((c) => !recibidosSet.has(c));

    const nEsperados = esperados.length;
    const nRecibidos = recibidos.length;
    // tasa = recibidos / esperados (0 si no habia nada esperado: sin actividad).
    const tasa = nEsperados > 0 ? this._round(Math.min(nRecibidos / nEsperados, 1), 4) : 0;

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo: (input && input.periodo) || null,
        esperados: nEsperados,
        recibidos: nRecibidos,
        huecos: huecos.length,
        tasa,
        detalle: { esperados, recibidos, huecos },
        verticales_esperadas: this._verticales.get(pid) ? [...this._verticales.get(pid)] : [],
        sin_actividad: nEsperados === 0,
        senal: nEsperados === 0 ? 'SIN_ACTIVIDAD' : (huecos.length > 0 ? 'HUECOS' : 'COMPLETA'),
        es_metrica_unica: true,
        nota: 'Q3, P4 y C6 son VISTAS de esta metrica unica; no la recalculan'
      }
    };
  }

  // huecos() -> Set<ClaveHecho> — alimenta A15, C6, Q3, P4 (no recalcula: lee la metrica).
  _huecos(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const calc = this._calcular(input);
    return {
      status: 200,
      data: {
        project_id: pid,
        huecos: calc.data.detalle.huecos,
        n_huecos: calc.data.huecos,
        tasa: calc.data.tasa,
        senal: calc.data.senal
      }
    };
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
  toolHuecos(params) { return this._huecos(params); }
}

module.exports = CompletitudCobertura;
