/**
 * contabilidad-analitica/informe-accionable — MICRO-AGENTE HIBRIDO (R2, hoja del plan).
 *
 * TODO informe que recibe el cliente lleva QUE HACER con el. Toma el informe ya compuesto por
 * `informe-rico` (K3) y PROPONE una RECOMENDACION — la quita de adorno.
 *
 * ⚠️ EL SISTEMA NO DECIDE: PROPONE. **EL DUENO DECIDE.** Esta clase juzga (la recomendacion es
 * juicio) y devuelve una PROPUESTA con su base; jamas ejecuta, jamas escribe, jamas decide por el
 * dueno. Si NO hay base suficiente para recomendar con honestidad, LO DECLARA — no inventa.
 *
 * ATRIBUTOS del diseno: `informe:Informe`.
 *   METODOS: juzgar(i:Informe):Recomendacion.
 *   REGLA: todo informe que recibe el cliente lleva QUE HACER con el. La recomendacion es juicio.
 *          Refuerza K3 y lo quita de adorno.
 *
 * HIBRIDO (patron etiquetado-analitico):
 *   _juzgarReflejo — REFLEJO determinista: aplica las REGLAS DECLARADAS (informe → recomendacion);
 *                    la primera que coincide gana. Una sola respuesta correcta → no es juicio.
 *   _concluir      — FUZZY: cuando ninguna regla cubre, 1 llamada llm.complete.request PROPONE
 *                    QUE HACER sobre el informe. Si falla o no cumple el contrato → NO se inventa.
 *
 * Invariantes:
 *  - EL DUENO DECIDE: la salida es una PROPUESTA (`decide:false`, `decide_dueno:true`); no se ejecuta.
 *  - NUNCA INVENTA: sin informe o sin base declarada NO se fabrica una recomendacion — se declara
 *    `[ABIERTO]` con lo que falta.
 *  - La recomendacion va ANCORADA al informe (su cifra/contexto): si el informe no trae base,
 *    el juicio lo declara en vez de adivinar.
 *  - NO escribe, NO persiste: refuerza K3, no lo sustituye.
 *
 * Forma: MICRO-AGENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja R2 del plan-construccion y diseno-oop.md (CLASE InformeAccionable).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// ── guion-prompt del micro-agente (self-contained) ──
const GUION_INFORME =
  'Eres el ANALISTA que PROPONE QUE HACER con un informe contable. Recibes un INFORME ya compuesto ' +
  '(una cifra con su contexto: periodo, unidad, comparativa) y las REGLAS declaradas. Tu tarea es ' +
  'PROPONER una RECOMENDACION concreta y accionable ("que hacer con el"), con su MOTIVO. ' +
  'REGLAS DE HIERRO: (1) NO decides nada — PROPONES; la decision es del DUENO. ' +
  '(2) NO inventes cifras ni datos que no esten en el informe: usa EXCLUSIVAMENTE lo que te dan. ' +
  '(3) Si el informe no trae base suficiente para recomendar con honestidad, NO adivines: ' +
  'devuelve puede=false y declara que falta. Responde SOLO JSON: ' +
  '{"puede":<true|false>,"recomendacion":"<qué hacer, breve y accionable>","motivo":"<por qué>",' +
  '"base":"<de qué dato del informe sale>","prioridad":"alta|media|baja","confianza":<0-1>}.';

class InformeAccionable extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'informe-accionable';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onJuzgarRequest(e) {
    return this._atender(e, 'juzgar', 'informe-accionable.juzgar.response', async (d) => {
      const res = await this._juzgar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: hay una RECOMENDACION PROPUESTA (no decidida).
        this.eventBus?.publish('contabilidad.recomendacion', {
          project_id: res.data.project_id,
          informe_id: res.data.informe_id,
          recomendacion: res.data.recomendacion,
          origen: res.data.recomendacion ? res.data.recomendacion.origen : null,
          decide_dueno: true,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('informe-accionable.juzgar.failed', res);
      }
      return res;
    });
  }

  // ── el juicio: reglas declaradas (reflejo) + juicio fuzzy, con declaracion honesta si no hay base ──
  async _juzgar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // 1) EL INFORME: el declarado o, si no, el que COMPONE su dueno (informe-rico K3) POR EVENTO.
    const informe = await this._informe(pid, input);
    if (!informe) {
      // Sin informe NO se fabrica una recomendacion: se declara el hueco.
      return {
        status: 200,
        data: {
          project_id: pid,
          informe_id: null,
          informe: null,
          recomendacion: null,
          base_suficiente: false,
          decide: false,
          decide_dueno: true,
          escribe: false,
          abierto: true,
          faltan: ['informe'],
          motivo: 'no hay informe sobre el que recomendar (ni declarado ni compuesto por informe-rico K3): no se inventa una recomendacion'
        }
      };
    }

    const informe_id = informe.id != null ? String(informe.id) : (input.informe_id != null ? String(input.informe_id) : null);

    // 2) REFLEJO determinista: la PRIMERA regla declarada que coincide gana (una sola respuesta).
    const reglas = this._reglas(input);
    const porRegla = this._juzgarReflejo(informe, reglas);
    if (porRegla) {
      return this._proponer(pid, informe, informe_id, { ...porRegla, origen: 'regla', confianza: 1 });
    }

    // 3) FUZZY: ninguna regla cubre → el juicio PROPONE que hacer (ancorado al informe real).
    const asistido = await this._concluir(informe, reglas);
    const propuesta = this._recomendacionDe(asistido);
    if (propuesta) {
      return this._proponer(pid, informe, informe_id, { ...propuesta, origen: 'juicio' });
    }

    // 4) Sin base suficiente para recomendar con honestidad → SE DECLARA. Nunca se inventa.
    return {
      status: 200,
      data: {
        project_id: pid,
        informe_id,
        informe,
        recomendacion: null,
        base_suficiente: this._baseSuficiente(informe),
        decide: false,
        decide_dueno: true,
        escribe: false,
        abierto: true,
        faltan: ['base'],
        motivo: 'el informe no trae base suficiente para recomendar con honestidad: se declara el hueco en vez de inventar una recomendacion'
      }
    };
  }

  _proponer(pid, informe, informe_id, r) {
    return {
      status: 200,
      data: {
        project_id: pid,
        informe_id,
        informe,
        recomendacion: {
          que_hacer: r.que_hacer,
          motivo: r.motivo,
          base: r.base != null ? String(r.base) : null,
          prioridad: r.prioridad != null ? String(r.prioridad) : null,
          origen: r.origen,
          regla_id: r.regla_id != null ? r.regla_id : null,
          confianza: r.confianza != null ? r.confianza : null
        },
        base_suficiente: true,
        // ⚠️ EL SISTEMA NO DECIDE: PROPONE. **EL DUENO DECIDE.**
        decide: false,
        decide_dueno: true,
        escribe: false,
        ejecuta: false,
        abierto: { recomendacion: null }
      }
    };
  }

  // ── REFLEJO: aplica las reglas declaradas (condiciones sobre el informe) ──
  _juzgarReflejo(informe, reglas = []) {
    for (const r of reglas) {
      if (!r || typeof r !== 'object') continue;
      const cond = r.cuando || r.condicion || null;
      if (!cond || typeof cond !== 'object') continue;
      if (!this._coincide(informe, cond)) continue;
      const que_hacer = r.que_hacer != null ? String(r.que_hacer)
        : (r.recomendacion != null ? String(r.recomendacion) : null);
      if (!que_hacer) continue;
      return {
        que_hacer,
        motivo: r.motivo != null ? String(r.motivo) : null,
        base: r.base != null ? String(r.base) : null,
        prioridad: r.prioridad != null ? String(r.prioridad) : null,
        regla_id: r.id ?? r.regla_id ?? null
      };
    }
    return null;
  }

  // Evalua UNA condicion declarada contra el informe. Cero semantica cableada: el operador es dato.
  _coincide(informe, cond) {
    const campo = cond.campo != null ? String(cond.campo) : null;
    if (!campo) return false;
    const valor = this._campo(informe, campo);
    const op = String(cond.op || cond.operador || 'igual').toLowerCase();
    const esperado = cond.valor;
    switch (op) {
      case 'igual': return valor !== undefined && String(valor) === String(esperado);
      case 'contiene': return valor !== undefined && String(valor).includes(String(esperado));
      case 'en': return Array.isArray(esperado) && esperado.map(String).includes(String(valor));
      case 'rango': {
        if (!esperado || typeof esperado !== 'object') return false;
        const v = Number(valor);
        if (!Number.isFinite(v)) return false;
        const min = esperado.min != null ? Number(esperado.min) : -Infinity;
        const max = esperado.max != null ? Number(esperado.max) : Infinity;
        return v >= min && v <= max;
      }
      case 'existe': return valor !== undefined && valor !== null && valor !== '';
      default: return false;
    }
  }

  _campo(obj, ruta) {
    return String(ruta).split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
  }

  // ── FUZZY: 1 llamada llm.complete.request con el guion + el informe + las reglas ──
  async _concluir(informe, reglas) {
    const resp = await this._rpc('llm.complete.request', {
      system: GUION_INFORME,
      messages: [{ role: 'user', content: JSON.stringify({ informe, reglas_declaradas: reglas }) }],
      tools: [], settings: { temperature: 0.3 }
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

  // Valida la propuesta fuzzy: exige qué hacer; acepta prioridad declarada.
  _recomendacionDe(a) {
    if (!a || a.puede !== true) return null;
    const que_hacer = a.recomendacion != null ? String(a.recomendacion).trim() : '';
    if (!que_hacer) return null;
    const prioridad = a.prioridad != null ? String(a.prioridad).toLowerCase() : null;
    const confianza = typeof a.confianza === 'number' && a.confianza >= 0 && a.confianza <= 1 ? a.confianza : null;
    return {
      que_hacer,
      motivo: a.motivo != null ? String(a.motivo) : null,
      base: a.base != null ? String(a.base) : null,
      prioridad: ['alta', 'media', 'baja'].includes(prioridad) ? prioridad : null,
      confianza
    };
  }

  // El informe declarado o, si no, el que COMPONE informe-rico (K3) POR EVENTO. No se recalcula.
  async _informe(pid, input = {}) {
    const inf = input.informe || input.i;
    if (inf && typeof inf === 'object') return inf;
    const r = await this._rpc('informe-rico.componer.request', {
      project_id: pid,
      cifra: input.cifra,
      periodo: input.periodo,
      origen: input.origen,
      unidad: input.unidad,
      comparativa: input.comparativa,
      notas: input.notas
    }, { timeout_ms: 5000 }).catch(() => null);
    const data = r && r.data ? r.data : null;
    if (data && data.informe) return data.informe;
    return null;
  }

  // ¿El informe trae base sobre la que recomendar? Cifra + contexto, o al menos cifra.
  _baseSuficiente(informe) {
    if (!informe || typeof informe !== 'object') return false;
    if (informe.cifra !== undefined && informe.cifra !== null) return true;
    if (informe.contexto && typeof informe.contexto === 'object') return true;
    // Un informe con narracion/valores declarados tambien vale como base.
    return informe.valor !== undefined && informe.valor !== null;
  }

  _reglas(input = {}) {
    const r = input.reglas || (input.criterio && input.criterio.reglas);
    return Array.isArray(r) ? r : [];
  }

  // ── Tools ──
  toolJuzgar(params) { return this._juzgar(params); }
}

module.exports = InformeAccionable;
