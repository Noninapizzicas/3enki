/**
 * contabilidad-analitica/narrador-estados — MICRO-AGENTE HIBRIDO (R3, hoja del plan).
 *
 * Traduce el BALANCE y el RESULTADO al LENGUAJE del negocio cliente: "esto es lo que te ha pasado
 * y lo que viene". Narrar en lenguaje natural es JUICIO.
 *
 * ATRIBUTOS del diseno: `balance:EstadoDerivado`, `resultado:EstadoDerivado`.
 *   METODOS: narrar(estados):Lenguaje.
 *   REGLA: traduce balance/resultado al LENGUAJE del negocio cliente. Lenguaje → juicio.
 *
 * ⚠️ NARRA LO QUE HAY: no estima ni adorna lo que falta. Los estados llegan declarados o los
 * calculan sus duenos (`balance-situacion` C1, `cuenta-resultados` C2) POR EVENTO. Si un estado
 * falta, la narracion LO DECLARA como hueco — jamas lo rellena con una cifra inventada.
 *
 * HIBRIDO (patron etiquetado-analitico):
 *   _narrarReflejo — REFLEJO determinista: compone la frase con las PLANTILLAS DECLARADAS
 *                    (estado → frase) sobre los estados reales. Una sola respuesta → no es juicio.
 *   _concluir      — FUZZY: cuando no hay plantilla que cubra, 1 llamada llm.complete.request
 *                    narra los estados en lenguaje llano. Si falla o no cumple el contrato → la
 *                    narracion se declara `[ABIERTO]`.
 *
 * Invariantes:
 *  - NARRA LO QUE HAY: cada cifra de la narracion sale de un estado REAL; lo que falta se declara.
 *  - NUNCA ESTIMA NI ADORNA: no se inventan valores ni se "colorean" los ausentes.
 *  - La narracion no decide: describe. El sistema no decide por el dueno.
 *  - NO escribe, NO persiste.
 *
 * Forma: MICRO-AGENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja R3 del plan-construccion y diseno-oop.md (CLASE NarradorEstados).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// ── guion-prompt del micro-agente (self-contained) ──
const GUION_NARRAR =
  'Eres el NARRADOR de estados contables de un negocio. Recibes el BALANCE (activo/pasivo/' +
  'patrimonio) y el RESULTADO (ingresos/gastos/resultado) ya calculados, con su periodo. Tu tarea ' +
  'es NARRAR en lenguaje llano, claro y simple "esto es lo que te ha pasado y lo que viene". ' +
  'REGLAS DE HIERRO: (1) NARRA SOLO LO QUE HAY — usa EXCLUSIVAMENTE las cifras que te dan; ' +
  '(2) NO estimes ni adornes lo que falta: si un estado viene null, dilo ("no consta"), NO lo ' +
  'rellenes; (3) NO decidas por el dueño — describes, no recomiendas acciones. ' +
  'Responde SOLO JSON: {"puede":<true|false>,"narracion":"<párrafo en lenguaje llano>",' +
  '"faltan":["<estado ausente>"],"confianza":<0-1>}.';

class NarradorEstados extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'narrador-estados';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onNarrarRequest(e) {
    return this._atender(e, 'narrar', 'narrador-estados.narrar.response', async (d) => {
      const res = await this._narrar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: los estados quedaron NARRADOS (narra lo que hay).
        this.eventBus?.publish('contabilidad.narracion', {
          project_id: res.data.project_id,
          narracion: res.data.narracion,
          origen: res.data.origen,
          estados_narrados: res.data.estados_narrados,
          faltan: res.data.faltan,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('narrador-estados.narrar.failed', res);
      }
      return res;
    });
  }

  // ── el juicio: plantillas declaradas (reflejo) + juicio fuzzy, narrando solo lo que hay ──
  async _narrar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // 1) Los ESTADOS: declarados o los que calculan sus duenos (C1 balance, C2 resultado) POR EVENTO.
    const balance = await this._balance(pid, input);
    const resultado = await this._resultado(pid, input);

    // Narra SOLO lo que hay: lo ausente se declara, no se rellena.
    const faltan = [];
    if (!balance) faltan.push('balance');
    if (!resultado) faltan.push('resultado');

    if (!balance && !resultado) {
      // Sin ningun estado NO se narra: no hay nada que contar (no se adorna el vacio).
      return {
        status: 200,
        data: {
          project_id: pid,
          narracion: null,
          estados_narrados: [],
          balance: null,
          resultado: null,
          faltan: ['balance', 'resultado'],
          abierto: true,
          decide: false,
          motivo: 'no hay estados que narrar (ni balance C1 ni resultado C2): el narrador narra lo que hay, no lo que falta'
        }
      };
    }

    const estados = { balance, resultado };

    // 2) REFLEJO determinista: compone con las PLANTILLAS DECLARADAS sobre los estados reales.
    const plantillas = this._plantillas(input);
    const porReflejo = this._narrarReflejo(estados, plantillas);
    if (porReflejo) {
      return this._salida(pid, estados, faltan, { ...porReflejo, origen: 'plantilla' });
    }

    // 3) FUZZY: ninguna plantilla cubre → el juicio narra (solo con las cifras reales).
    const asistido = await this._concluir(estados, plantillas);
    const narracion = this._narracionDe(asistido);
    if (narracion) {
      return this._salida(pid, estados, faltan, { texto: narracion, origen: 'juicio', confianza: asistido.confianza });
    }

    // 4) Ni plantilla ni juicio → la narracion se declara [ABIERTO] (no se adorna).
    return {
      status: 200,
      data: {
        project_id: pid,
        narracion: null,
        estados_narrados: this._narrados(estados),
        balance,
        resultado,
        faltan,
        abierto: true,
        decide: false,
        motivo: 'no se pudo narrar con honestidad (sin plantilla ni juicio valido): se declara el hueco en vez de adornar'
      }
    };
  }

  _salida(pid, estados, faltan, n) {
    return {
      status: 200,
      data: {
        project_id: pid,
        narracion: n.texto,
        estados_narrados: this._narrados(estados),
        balance: estados.balance,
        resultado: estados.resultado,
        // Narra LO QUE HAY: lo ausente se declara aqui, no se rellena.
        faltan,
        origen: n.origen,
        confianza: n.confianza != null ? n.confianza : (n.origen === 'plantilla' ? 1 : null),
        // Narra; no estima, no decide.
        estima: false,
        decide: false,
        abierto: {
          balance: estados.balance ? null : 'el balance (C1) no consta: se narra sin él, no se estima',
          resultado: estados.resultado ? null : 'el resultado (C2) no consta: se narra sin él, no se estima'
        }
      }
    };
  }

  // ── REFLEJO: compone la narracion con las PLANTILLAS declaradas (estado → frase) ──
  _narrarReflejo(estados, plantillas = []) {
    const partes = [];
    for (const p of plantillas) {
      if (!p || typeof p !== 'object') continue;
      const estado = p.estado != null ? String(p.estado).toLowerCase() : null;
      const frase = p.frase != null ? String(p.frase) : null;
      if (!estado || !frase) continue;
      const dato = estados[estado];
      // La plantilla SOLO se aplica si su estado existe: no se narra lo ausente con una frase.
      if (!dato) continue;
      partes.push(this._rellenar(frase, dato));
    }
    if (partes.length === 0) return null;
    return { texto: partes.join(' '), confianza: 1 };
  }

  // Rellena una plantilla declarada con los campos del estado ({{campo}}). No inventa: lo ausente
  // deja el marcador tal cual, para que se VEA que falta.
  _rellenar(frase, dato) {
    return String(frase).replace(/\{\{(\w+)\}\}/g, (m, k) => {
      const v = dato && dato[k] !== undefined && dato[k] !== null ? dato[k] : null;
      return v === null ? m : String(v);
    });
  }

  // ── FUZZY: 1 llamada llm.complete.request con el guion + los estados + las plantillas ──
  async _concluir(estados, plantillas) {
    const resp = await this._rpc('llm.complete.request', {
      system: GUION_NARRAR,
      messages: [{ role: 'user', content: JSON.stringify({ estados, plantillas_declaradas: plantillas }) }],
      tools: [], settings: { temperature: 0.4 }
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

  // Valida la narracion fuzzy: exige un parrafo; los estados ausentes los declara el propio juicio.
  _narracionDe(a) {
    if (!a || a.puede !== true) return null;
    const texto = a.narracion != null ? String(a.narracion).trim() : '';
    if (!texto) return null;
    const confianza = typeof a.confianza === 'number' && a.confianza >= 0 && a.confianza <= 1 ? a.confianza : null;
    return { texto, confianza };
  }

  // El BALANCE declarado o el que calcula su dueno (C1) POR EVENTO. No se recalcula.
  async _balance(pid, input = {}) {
    const b = input.balance;
    if (b && typeof b === 'object') return b;
    const r = await this._rpc('balance-situacion.calcular.request',
      { project_id: pid, periodo: input.periodo, ejercicio: input.ejercicio != null ? input.ejercicio : input.periodo }, { timeout_ms: 5000 }).catch(() => null);
    const data = r && r.data ? r.data : null;
    return data && (data.balance || data.balance_situacion) ? (data.balance || data.balance_situacion) : (data && data.activo !== undefined ? data : null);
  }

  // El RESULTADO declarado o el que calcula su dueno (C2) POR EVENTO. No se recalcula.
  async _resultado(pid, input = {}) {
    const res = input.resultado;
    if (res && typeof res === 'object') return res;
    const r = await this._rpc('cuenta-resultados.calcular.request',
      { project_id: pid, periodo: input.periodo, ejercicio: input.ejercicio != null ? input.ejercicio : input.periodo }, { timeout_ms: 5000 }).catch(() => null);
    const data = r && r.data ? r.data : null;
    return data && data.resultado !== undefined ? data : null;
  }

  _narrados(estados) {
    const out = [];
    if (estados.balance) out.push('balance');
    if (estados.resultado) out.push('resultado');
    return out;
  }

  _plantillas(input = {}) {
    const p = input.plantillas || input.narracion_plantillas || (input.criterio && input.criterio.plantillas);
    return Array.isArray(p) ? p : [];
  }

  // ── Tools ──
  toolNarrar(params) { return this._narrar(params); }
}

module.exports = NarradorEstados;
