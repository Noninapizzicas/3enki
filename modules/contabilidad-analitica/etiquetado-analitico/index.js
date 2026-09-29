/**
 * contabilidad-analitica/etiquetado-analitico — MICRO-AGENTE HIBRIDO (J1, hoja del plan).
 *
 * ASIGNA CENTRO / LINEA / PRODUCTO (la DIMENSION analitica) a cada HECHO. La regla es
 * DECLARABLE: los criterios los declara el JEFE en `cola-declaraciones-criterio` (K9) y llegan
 * aqui por EVENTO o declarados en la peticion — el reflejo NUNCA cablea una regla de negocio.
 * Cuando la regla NO cubre el hecho, clasificar es JUICIO: el micro-agente PROPONE (juicio
 * fuzzy asistido) y lo que no puede resolver con honestidad va a COLA como `[ABIERTO]`.
 *
 * ATRIBUTOS del diseno: `reglas:ParametroDeclarable` y `dimensiones:Set<Dimension>`.
 *   METODOS: juzgar(h:Hecho):Propuesta<Dimension> — PROPONE; NO escribe.
 *
 * HIBRIDO (patron veredicto-viabilidad):
 *   _juzgarReflejo — REFLEJO determinista: aplica las REGLAS declaradas al hecho (la primera
 *                    que coincide gana). Una sola respuesta correcta por regla → no es juicio.
 *   _concluir      — FUZZY (juicio LLM): cuando ninguna regla cubre, 1 llamada
 *                    llm.complete.request con guion-prompt self-contained PROPONE una dimension.
 *                    Si el LLM falla o no cumple el contrato, NO se inventa: el hecho va a COLA.
 *
 * EL UNICO QUE PERSISTE EL JUICIO — y se JUSTIFICA: es la unica pieza cuya salida es
 * IRREDUCIBLE a aritmetica (una dimension propuesta no se computa, se JUZGA). Por eso conserva
 * en memoria (`this._juicios`) la MEMORIA DE LO APRENDIDO — cada juicio emitido, con su origen
 * (regla o juicio fuzzy) y su confianza — para no re-juzgar lo mismo dos veces y para que el
 * criterio declarado pueda crecer a partir de lo observado. Esa memoria es PROCESO, no parcela:
 * la persistencia DURADERA del juicio es el EVENTO de dominio que publica (contabilidad.dimension_propuesta),
 * que el resto de la vertical consume. La forma (MICRO-AGENTE) es STATELESS respecto de
 * PosPersistencia: sin store en disco, sin custodiar parcela ajena.
 *
 * NUNCA INVENTA: sin reglas declaradas → `[ABIERTO]` (no se elige una dimension por defecto);
 * sin cobertura de regla y sin juicio resoluble → el hecho va a COLA, con lo que falta declarado.
 * Si no puede resolver → `[ABIERTO]`/cola, jamas una dimension inventada.
 *
 * Forma: MICRO-AGENTE → STATELESS (sin PosPersistencia, sin onProjectActivated). Memoria de lo
 * aprendido en proceso; persistencia duradera via evento de dominio.
 * Ver hoja J1 del plan-construccion y diseno-oop.md (CLASE EtiquetadoAnalitico).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// ── guion-prompt del micro-agente (self-contained) ──
const GUION_ETIQUETADO =
  'Eres el ETIQUETADOR ANALITICO de un sistema de contabilidad. Recibes un HECHO (dato) y un ' +
  'conjunto de DIMENSIONES declaradas (centros de coste, lineas, productos) con sus descripciones. ' +
  'Tu tarea es PROPONER a que centro, linea y producto corresponde el hecho, para el analisis de ' +
  'margenes. Usa SOLO la informacion del hecho y las dimensiones que te dan; NO inventes centros, ' +
  'lineas ni productos que no esten en la lista declarada. Si la informacion no basta para proponer ' +
  'con honestidad, NO adivines: devuelve puede=false. Responde SOLO JSON: ' +
  '{"puede":<true|false>,"centro":"<id de la lista o null>","linea":"<id o null>","producto":"<id o null>",' +
  '"confianza":<0-1>,"motivo":"<frase breve en espanol>"}.';

class EtiquetadoAnalitico extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'etiquetado-analitico';
    this.version = 'reflejo-0.1.0';
    // MEMORIA DE LO APRENDIDO (en proceso): project_id → [Juicio] emitidos.
    // Es lo unico que este micro-agente conserva: el juicio ya hecho, para no repetirlo.
    this._juicios = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onJuzgarRequest(e) {
    return this._atender(e, 'juzgar', 'etiquetado-analitico.juzgar.response', async (d) => {
      const res = await this._juzgar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: la dimension PROPUESTA (nunca escrita) queda declarada.
        if (res.data.propuesta) {
          this.eventBus?.publish('contabilidad.dimension_propuesta', {
            project_id: res.data.project_id,
            hecho_id: res.data.hecho_id,
            propuesta: res.data.propuesta,
            origen: res.data.propuesta.origen,
            correlation_id: d.correlation_id
          });
        }
      } else {
        this.eventBus?.publish('etiquetado-analitico.juzgar.failed', res);
      }
      return res;
    });
  }

  // ── el juicio: reglas (reflejo) + juicio fuzzy con fallback a cola ──
  async _juzgar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const hecho = input.hecho && typeof input.hecho === 'object' ? input.hecho : null;
    if (!hecho) return this._invalid('hecho');
    const hecho_id = hecho.id_hecho != null ? hecho.id_hecho : (hecho.id ?? null);

    // 1) Las REGLAS: ParametroDeclarable del jefe (declaradas o traidas de la cola K9 POR EVENTO).
    const { reglas, dimensiones, fuente_reglas } = await this._criterio(pid, input);

    // Sin reglas declaradas NO se elige una dimension por defecto: [ABIERTO] y a cola.
    if (reglas.length === 0) {
      return this._acolar(pid, hecho, hecho_id, input, {
        fuente_reglas,
        motivo: 'no hay reglas de etiquetado declaradas: la clasificacion iria a cola (el jefe debe declarar el criterio)',
        faltan: ['reglas']
      });
    }

    // 2) REFLEJO determinista: la PRIMERA regla declarada que coincide gana (una sola respuesta).
    const porRegla = this._juzgarReflejo(hecho, reglas);
    if (porRegla) {
      return this._proponer(pid, hecho, hecho_id, {
        ...porRegla.dimension,
        origen: 'regla',
        regla_id: porRegla.regla_id,
        confianza: 1
      }, { fuente_reglas, motivo: null });
    }

    // 3) FUZZY: ninguna regla cubre → el juicio PROPONE (asistido por LLM, con las dimensiones declaradas).
    const asistido = await this._concluir(hecho, dimensiones, reglas);
    const dim = this._dimDe(asistido, dimensiones);
    if (dim) {
      return this._proponer(pid, hecho, hecho_id, {
        ...dim,
        origen: 'juicio',
        regla_id: null,
        confianza: asistido.confianza,
        motivo: asistido.motivo || null
      }, { fuente_reglas, motivo: null });
    }

    // 4) Ni regla ni juicio resoluble con honestidad → A COLA. Nunca se inventa una dimension.
    return this._acolar(pid, hecho, hecho_id, input, {
      fuente_reglas,
      motivo: 'ninguna regla cubre el hecho y el juicio no es resoluble con honestidad: va a cola',
      faltan: ['cobertura_regla_o_juicio']
    });
  }

  // ── REFLEJO: aplica las reglas declaradas (condiciones sobre campos del hecho) ──
  _juzgarReflejo(hecho, reglas = []) {
    for (const r of reglas) {
      if (!r || typeof r !== 'object') continue;
      const cond = r.cuando || r.condicion || null;
      if (!cond || typeof cond !== 'object') continue;
      if (!this._coincide(hecho, cond)) continue;
      const dim = r.dimension || r.propuesta || {};
      const centro = this._id(dim.centro != null ? dim.centro : r.centro);
      const linea = this._id(dim.linea != null ? dim.linea : r.linea);
      const producto = this._id(dim.producto != null ? dim.producto : r.producto);
      if (centro === null && linea === null && producto === null) continue; // regla sin dimension: no etiqueta
      return { dimension: { centro, linea, producto }, regla_id: r.id ?? r.regla_id ?? null };
    }
    return null;
  }

  // Evalua UNA condicion declarada contra el hecho. Cero semantica cableada: el operador es dato.
  _coincide(hecho, cond) {
    const campo = cond.campo != null ? String(cond.campo) : null;
    if (!campo) return false;
    const valorHecho = this._campo(hecho, campo);
    const op = String(cond.op || cond.operador || 'igual').toLowerCase();
    const esperado = cond.valor;

    switch (op) {
      case 'igual': return valorHecho !== undefined && String(valorHecho) === String(esperado);
      case 'prefijo': return valorHecho !== undefined && String(valorHecho).startsWith(String(esperado));
      case 'contiene': return valorHecho !== undefined && String(valorHecho).includes(String(esperado));
      case 'en': return Array.isArray(esperado) && esperado.map(String).includes(String(valorHecho));
      case 'rango': {
        if (!esperado || typeof esperado !== 'object') return false;
        const v = Number(valorHecho);
        if (!Number.isFinite(v)) return false;
        const min = esperado.min != null ? Number(esperado.min) : -Infinity;
        const max = esperado.max != null ? Number(esperado.max) : Infinity;
        return v >= min && v <= max;
      }
      case 'existe': return valorHecho !== undefined && valorHecho !== null && valorHecho !== '';
      default: return false; // operador no declarado: no coincide (no se adivina la intencion)
    }
  }

  // Acceso a un campo del hecho, con ruta por puntos (a.b.c) — solo lectura.
  _campo(hecho, ruta) {
    return String(ruta).split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), hecho);
  }

  // ── FUZZY: 1 llamada llm.complete.request con el guion + el hecho + las dimensiones declaradas ──
  async _concluir(hecho, dimensiones, reglas) {
    const resp = await this._rpc('llm.complete.request', {
      system: GUION_ETIQUETADO,
      messages: [{ role: 'user', content: JSON.stringify({ hecho, dimensiones_declaradas: dimensiones, reglas_no_cubren: reglas }) }],
      tools: [], settings: { temperature: 0.2 }
    }, { timeout_ms: 30000 }).catch(() => null);
    if (!resp || resp.status >= 400) return null;
    return this._parse(resp);
  }

  _parse(resp) {
    let c = resp?.data?.content ?? resp?.content ?? resp?.data?.text ?? resp?.text ?? '';
    if (c && typeof c === 'object') return c;
    if (typeof c !== 'string') return null;
    c = c.replace(/```json/gi, '').replace(/```/g, '').trim();
    const i = c.indexOf('{'), j = c.lastIndexOf('}');
    if (i < 0 || j < 0 || j < i) return null;
    try { return JSON.parse(c.slice(i, j + 1)); } catch { return null; }
  }

  // Valida el juicio fuzzy: solo propone ids de la lista DECLARADA (no inventa dimensiones).
  _dimDe(asistido, dimensiones = []) {
    if (!asistido || asistido.puede !== true) return null;
    if (typeof asistido.confianza !== 'number' || asistido.confianza < 0 || asistido.confianza > 1) return null;
    const ids = this._ids(dimensiones);
    const centro = this._idEn(asistido.centro, ids.centro);
    const linea = this._idEn(asistido.linea, ids.linea);
    const producto = this._idEn(asistido.producto, ids.producto);
    if (centro === null && linea === null && producto === null) return null;
    return { centro, linea, producto };
  }

  // Las dimensiones declaradas, normalizadas a ids por tipo (para validar la propuesta fuzzy).
  _ids(dimensiones = []) {
    const out = { centro: new Set(), linea: new Set(), producto: new Set() };
    for (const d of (Array.isArray(dimensiones) ? dimensiones : [])) {
      if (!d || typeof d !== 'object') continue;
      const tipo = String(d.tipo || '').toLowerCase();
      const id = this._id(d.id != null ? d.id : d.nombre);
      if (id === null) continue;
      if (out[tipo]) out[tipo].add(id);
      else { out.centro.add(id); out.linea.add(id); out.producto.add(id); } // sin tipo: vale para cualquiera
    }
    return out;
  }

  _idEn(v, conjunto) {
    const id = this._id(v);
    if (id === null) return null;
    return conjunto.has(id) ? id : null;
  }

  // El CRITERIO: reglas + dimensiones declaradas, o traidas de la cola K9 POR EVENTO.
  async _criterio(pid, input = {}) {
    const reglasDecl = input.reglas || (input.criterio && input.criterio.reglas);
    const dimsDecl = input.dimensiones || (input.criterio && input.criterio.dimensiones);
    if (Array.isArray(reglasDecl)) {
      return { reglas: reglasDecl, dimensiones: Array.isArray(dimsDecl) ? dimsDecl : [], fuente_reglas: 'declarado' };
    }
    // Sin criterio declarado, se PIDE a cola-declaraciones-criterio (K9) POR EVENTO (best-effort).
    const r = await this._rpc('cola-declaraciones-criterio.ratificar.request',
      { project_id: pid, clave: 'dimensiones' }, { timeout_ms: 4000 });
    const valor = r && r.data && r.data.criterio ? r.data.criterio.valor : null;
    if (valor && typeof valor === 'object') {
      return {
        reglas: Array.isArray(valor.reglas) ? valor.reglas : [],
        dimensiones: Array.isArray(valor.dimensiones) ? valor.dimensiones : [],
        fuente_reglas: 'cola-declaraciones-criterio'
      };
    }
    return { reglas: [], dimensiones: [], fuente_reglas: null };
  }

  // Emite la PROPUESTA (no escribe) y la recuerda en la memoria de lo aprendido.
  _proponer(pid, hecho, hecho_id, propuesta, { fuente_reglas, motivo }) {
    const juicio = {
      hecho_id,
      propuesta,
      origen: propuesta.origen,
      confianza: propuesta.confianza,
      en: new Date().toISOString()
    };
    this._recordar(pid, juicio);
    return {
      status: 200,
      data: {
        project_id: pid,
        hecho_id,
        hecho,
        fuente_reglas,
        propuesta,
        // PROPONE; no escribe. La imputacion la materializa quien consume el evento.
        escribe: false,
        en_cola: false,
        abierto: false,
        faltan: [],
        motivo
      }
    };
  }

  // No resoluble con honestidad: el hecho va a COLA como [ABIERTO]. NUNCA se inventa.
  _acolar(pid, hecho, hecho_id, input, { fuente_reglas, motivo, faltan }) {
    return {
      status: 200,
      data: {
        project_id: pid,
        hecho_id,
        hecho,
        fuente_reglas,
        propuesta: null,
        escribe: false,
        en_cola: true,
        // El jefe lo declarara en la cola de criterios (K9); aqui solo se encola lo dudoso.
        cola: 'cola-declaraciones-criterio',
        abierto: true,
        faltan,
        motivo
      }
    };
  }

  _recordar(pid, juicio) {
    const lista = this._juicios.get(pid) || [];
    lista.push(juicio);
    if (lista.length > 5000) lista.splice(0, lista.length - 5000); // cota honesta de la memoria
    this._juicios.set(pid, lista);
  }

  // Lectura de la memoria de lo aprendido (mismo proceso) — no muta.
  juiciosDe(pid) {
    return pid ? [...(this._juicios.get(pid) || [])] : [];
  }

  _id(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'object') return this._id(v.id ?? v.nombre);
    return String(v);
  }

  // ── Tools ──
  toolJuzgar(params) { return this._juzgar(params); }
}

module.exports = EtiquetadoAnalitico;
