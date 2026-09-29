/**
 * contabilidad-entrada/desatasco-entrada — MICRO-AGENTE HIBRIDO (P3, hoja del plan).
 *
 * LA ACCION que completa A8: resuelve / reencola / descarta una EXCEPCION CON MOTIVO. A8.1
 * (`encolado-excepcion`) solo ENCOLA; aqui se decide QUE HACER con lo encolado, y el motivo es
 * obligatorio.
 *
 * ATRIBUTOS del diseno: `cola:EncoladoExcepcion`.
 *   METODOS: juzgar(e:Excepcion):Decision<resolver|reencolar|descartar>.
 *   REGLA: resolver/reencolar/descartar una excepcion CON motivo. Decidir la resolucion
 *          (contrapartida, importe) es juicio. Es la ACCION que completa A8 (que solo encola).
 *
 * ⚠️ LA REGLA CANDIDATA NO ACTUA HASTA QUE EL ASESOR LA RATIFICA:
 *   cuando el desatasco aprende algo de la resolucion, PROPONE una REGLA CANDIDATA
 *   (`regla_candidata`) y la publica — pero NO la aplica. La ratificacion es del ASESOR
 *   (`ratificacion-regla-aprendida`, L10). Mientras no se ratifique, la regla candidata NO ACTUA.
 *
 * HIBRIDO (patron etiquetado-analitico):
 *   _juzgarReflejo — REFLEJO determinista: aplica las REGLAS YA DECLARADAS (y ratificadas) al
 *                    caso; la primera que coincide gana. Una sola respuesta correcta → no es juicio.
 *   _concluir      — FUZZY: cuando ninguna regla cubre, 1 llamada llm.complete.request PROPONE la
 *                    accion (resolver|reencolar|descartar) con su motivo. Si el LLM falla o no
 *                    cumple el contrato, NO se inventa: la excepcion se REENCOLA (lo honesto).
 *
 * Invariantes:
 *  - NUNCA INVENTA: sin base para resolver → REENCOLA (no fabrica una contrapartida ni un importe).
 *  - CON MOTIVO: toda decision lleva su motivo; sin motivo no hay decision (se reencola).
 *  - LA REGLA CANDIDATA NO ACTUA: se propone y se declara que requiere ratificacion del ASESOR.
 *  - PROPONE; NO ESCRIBE: no toca la cola (A8.1) ni el libro; quien materializa es el custodio.
 *
 * Forma: MICRO-AGENTE → STATELESS (sin PosPersistencia, sin onProjectActivated). La memoria de lo
 * aprendido vive en proceso; la persistencia duradera es el EVENTO de dominio que publica.
 * Ver hoja P3 del plan-construccion y diseno-oop.md (CLASE DesatascoEntrada).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Las TRES acciones del contrato (el diseno las fija; no se amplian).
const ACCIONES = new Set(['resolver', 'reencolar', 'descartar']);

// El techo de la memoria de lo aprendido (proceso, no parcela).
const MAX_APRENDIDO = 2000;

// ── guion-prompt del micro-agente (self-contained) ──
const GUION_DESATASCO =
  'Eres el DESATASCADOR de la entrada contable. Recibes una EXCEPCION encolada (asunto, ' +
  'naturaleza, motivo, detalle) y las REGLAS ya declaradas. Tu tarea es PROPONER que hacer con ' +
  'ella: "resolver" (hay base suficiente para darle salida), "reencolar" (falta informacion y ' +
  'debe esperar) o "descartar" (no procede). Toda propuesta DEBE llevar un MOTIVO breve en ' +
  'espanol. NO inventes datos que no esten en la excepcion: si falta la base para resolver, NO ' +
  'adivines, propone "reencolar". Si al resolver ves un patron generalizable, puedes proponer ' +
  'una REGLA CANDIDATA (texto breve) — pero esa regla NO se aplica hasta que el asesor la ' +
  'ratifique. Responde SOLO JSON: ' +
  '{"puede":<true|false>,"accion":"resolver|reencolar|descartar","motivo":"<frase breve>",' +
  '"resolucion":{"contrapartida":"<cuenta o null>","importe":<numero o null>},' +
  '"regla_candidata":"<texto o null>","confianza":<0-1>}.';

class DesatascoEntrada extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'desatasco-entrada';
    this.version = 'reflejo-0.1.0';
    // MEMORIA DE LO APRENDIDO (en proceso): project_id → [ReglaCandidata]. NO actua: propone.
    this._aprendido = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onJuzgarRequest(e) {
    return this._atender(e, 'juzgar', 'desatasco-entrada.juzgar.response', async (d) => {
      const res = await this._juzgar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: la excepcion quedo DESATASCADA CON MOTIVO (propuesta, no escritura).
        this.eventBus?.publish('contabilidad.excepcion_desatascada', {
          project_id: res.data.project_id,
          excepcion_id: res.data.excepcion_id,
          accion: res.data.decision.accion,
          motivo: res.data.decision.motivo,
          escribe: false,
          regla_candidata: res.data.regla_candidata,
          requiere_ratificacion: res.data.regla_candidata !== null,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('desatasco-entrada.juzgar.failed', res);
      }
      return res;
    });
  }

  // ── el juicio: reglas declaradas (reflejo) + juicio fuzzy con fallback a reencolar ──
  async _juzgar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const ex = input.excepcion || input.ex;
    if (!ex || typeof ex !== 'object') return this._invalid('excepcion');

    const excepcion_id = this._idExcepcion(ex);
    const reglas = this._reglas(input);

    // 1) REFLEJO determinista: la PRIMERA regla declarada (y ratificada) que coincide gana.
    const porRegla = this._juzgarReflejo(ex, reglas);
    if (porRegla) {
      return this._decision(pid, ex, excepcion_id, {
        accion: porRegla.accion,
        motivo: porRegla.motivo,
        resolucion: porRegla.resolucion,
        origen: 'regla',
        regla_id: porRegla.regla_id,
        confianza: 1
      }, { regla_candidata: null, aprendido: null });
    }

    // 2) FUZZY: ninguna regla cubre → el juicio PROPONE con su motivo.
    const asistido = await this._concluir(ex, reglas);
    const propuesta = this._decisionDe(asistido);
    if (propuesta) {
      // Si el juicio deja ver un patron generalizable, se PROPONE como regla CANDIDATA.
      // ⚠️ NO ACTUA: requiere ratificacion del ASESOR (ratificacion-regla-aprendida, L10).
      const regla_candidata = propuesta.accion === 'resolver' && asistido.regla_candidata
        ? { texto: String(asistido.regla_candidata), origen: 'desatasco-entrada', actua: false, requiere_ratificacion: true }
        : null;
      const aprendido = regla_candidata ? this._recordar(pid, regla_candidata, excepcion_id) : null;
      return this._decision(pid, ex, excepcion_id, {
        accion: propuesta.accion,
        motivo: propuesta.motivo,
        resolucion: propuesta.resolucion,
        origen: 'juicio',
        regla_id: null,
        confianza: propuesta.confianza
      }, { regla_candidata, aprendido });
    }

    // 3) Ni regla ni juicio resoluble con honestidad → REENCOLAR (nunca se inventa una resolucion).
    return this._decision(pid, ex, excepcion_id, {
      accion: 'reencolar',
      motivo: 'ninguna regla cubre la excepcion y el juicio no es resoluble con honestidad: espera en cola',
      resolucion: null,
      origen: 'fallback',
      regla_id: null,
      confianza: null
    }, { regla_candidata: null, aprendido: null, faltan: ['cobertura_regla_o_juicio'] });
  }

  // ── REFLEJO: aplica las reglas declaradas (condiciones sobre campos de la excepcion) ──
  _juzgarReflejo(ex, reglas = []) {
    for (const r of reglas) {
      if (!r || typeof r !== 'object') continue;
      // Una regla CANDIDATA (no ratificada) NO ACTUA: se ignora para el corte.
      if (r.ratificada === false || r.actua === false) continue;
      const cond = r.cuando || r.condicion || null;
      if (!cond || typeof cond !== 'object') continue;
      if (!this._coincide(ex, cond)) continue;
      const accion = String(r.accion || '').toLowerCase();
      if (!ACCIONES.has(accion)) continue;
      const resolucion = accion === 'resolver'
        ? {
            contrapartida: r.contrapartida != null ? String(r.contrapartida) : null,
            importe: this._num(r.importe)
          }
        : null;
      return { accion, motivo: r.motivo != null ? String(r.motivo) : null, resolucion, regla_id: r.id ?? r.regla_id ?? null };
    }
    return null;
  }

  // Evalua UNA condicion declarada contra la excepcion. Cero semantica cableada: el operador es dato.
  _coincide(ex, cond) {
    const campo = cond.campo != null ? String(cond.campo) : null;
    if (!campo) return false;
    const valor = this._campo(ex, campo);
    const op = String(cond.op || cond.operador || 'igual').toLowerCase();
    const esperado = cond.valor;
    switch (op) {
      case 'igual': return valor !== undefined && String(valor) === String(esperado);
      case 'prefijo': return valor !== undefined && String(valor).startsWith(String(esperado));
      case 'contiene': return valor !== undefined && String(valor).includes(String(esperado));
      case 'en': return Array.isArray(esperado) && esperado.map(String).includes(String(valor));
      case 'existe': return valor !== undefined && valor !== null && valor !== '';
      default: return false;
    }
  }

  _campo(obj, ruta) {
    return String(ruta).split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
  }

  // ── FUZZY: 1 llamada llm.complete.request con el guion + la excepcion + las reglas ──
  async _concluir(ex, reglas) {
    const resp = await this._rpc('llm.complete.request', {
      system: GUION_DESATASCO,
      messages: [{ role: 'user', content: JSON.stringify({ excepcion: ex, reglas_declaradas: reglas }) }],
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

  // Valida la propuesta fuzzy: solo acepta las 3 acciones del contrato y exige un motivo.
  _decisionDe(a) {
    if (!a || a.puede !== true) return null;
    const accion = String(a.accion || '').toLowerCase();
    if (!ACCIONES.has(accion)) return null;
    const motivo = a.motivo != null ? String(a.motivo).trim() : '';
    if (!motivo) return null; // sin motivo no hay decision
    const confianza = typeof a.confianza === 'number' && a.confianza >= 0 && a.confianza <= 1 ? a.confianza : null;
    const resolucion = accion === 'resolver'
      ? {
          contrapartida: a.resolucion && a.resolucion.contrapartida != null ? String(a.resolucion.contrapartida) : null,
          importe: a.resolucion ? this._num(a.resolucion.importe) : null
        }
      : null;
    return { accion, motivo, resolucion, confianza };
  }

  _decision(pid, ex, excepcion_id, d, { regla_candidata, aprendido, faltan = [] }) {
    return {
      status: 200,
      data: {
        project_id: pid,
        excepcion_id,
        excepcion: ex,
        decision: {
          accion: d.accion,
          motivo: d.motivo,
          resolucion: d.resolucion,
          origen: d.origen,
          regla_id: d.regla_id,
          confianza: d.confianza
        },
        // ⚠️ LA REGLA CANDIDATA NO ACTUA: se propone y requiere ratificacion del ASESOR.
        regla_candidata,
        regla_candidata_actua: false,
        ratifica_por: 'ratificacion-regla-aprendida (L10, decisión del ASESOR)',
        aprendido,
        // PROPONE; no escribe. La cola (A8.1) y el libro los toca su custodio.
        escribe: false,
        abierto: {
          regla_candidata: regla_candidata
            ? 'la regla candidata queda PROPUESTA y NO ACTUA hasta que el asesor la ratifique (L10)'
            : null
        },
        faltan
      }
    };
  }

  _reglas(input = {}) {
    const r = input.reglas || (input.criterio && input.criterio.reglas);
    return Array.isArray(r) ? r : [];
  }

  _idExcepcion(ex) {
    return ex.id != null ? String(ex.id) : (ex.clave != null ? String(ex.clave) : null);
  }

  _recordar(pid, regla_candidata, excepcion_id) {
    const lista = this._aprendido.get(pid) || [];
    const item = { ...regla_candidata, excepcion_id, aprendido_en: new Date().toISOString() };
    lista.push(item);
    if (lista.length > MAX_APRENDIDO) lista.splice(0, lista.length - MAX_APRENDIDO);
    this._aprendido.set(pid, lista);
    return item;
  }

  // Lectura de lo aprendido (mismo proceso) — no muta. NO actua: solo declara lo propuesto.
  aprendidoDe(pid) {
    return pid ? [...(this._aprendido.get(pid) || [])] : [];
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolJuzgar(params) { return this._juzgar(params); }
}

module.exports = DesatascoEntrada;
