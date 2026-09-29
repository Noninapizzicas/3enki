/**
 * contabilidad-analitica/puente-lenguaje-dueno — MICRO-AGENTE HIBRIDO (Q2, hoja del plan).
 *
 * El TRADUCTOR BIDIRECCIONAL entre el dueno y la contabilidad:
 *   a_consulta(pregunta:Lenguaje) → Consulta   su pregunta → consulta contable (para Q1).
 *   a_cifra(d:Derivado)           → Lenguaje   el calculo → cifra en SU idioma (caja, deuda,
 *                                              resultado, "¿puedo pagar X?").
 * Traducir lenguaje es JUICIO.
 *
 * ATRIBUTOS del diseno: `mapa_lenguaje:ParametroDeclarable`.
 *   REGLA: traductor BIDIRECCIONAL. Lenguaje → juicio.
 *
 * ⚠️ TRADUCE, NO INVENTA CIFRAS: el mapa lenguaje↔consulta es DECLARABLE, y la CIFRA la produce
 * su dueno (mayor-balanza, cuenta-resultados, saldo-tesoreria...) POR EVENTO. Este puente jamas
 * fabrica un numero: si falta el dato, devuelve `[ABIERTO]`.
 *
 * HIBRIDO (patron etiquetado-analitico):
 *   _aConsultaReflejo / _aCifraReflejo — REFLEJO determinista: aplican el MAPA declarado (el
 *                    termino del dueno → tema contable; el tema → su termino). Una sola respuesta.
 *   _concluir        — FUZZY: cuando el mapa no cubre, 1 llamada llm.complete.request que
 *                    PROPONE la traduccion (a consulta) o la frase (a cifra). Si falla o no cumple
 *                    el contrato → NO se inventa: `[ABIERTO]`.
 *
 * Invariantes:
 *  - LA CIFRA NO SE INVENTA: en `a_cifra` el valor llega declarado o de su dueno POR EVENTO; si
 *    falta, se declara `[ABIERTO]` con lo que falta. Jamas un numero aproximado.
 *  - El mapa es DECLARABLE: sin mapa ni juicio resoluble NO se traduce → `[ABIERTO]`.
 *  - DETERMINISTA en el reflejo; el juicio va declarado como tal (origen:'juicio').
 *  - NO escribe, NO persiste, NO decide: traduce. El sistema no decide por el dueno.
 *
 * Forma: MICRO-AGENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja Q2 del plan-construccion y diseno-oop.md (CLASE PuenteLenguajeDueno).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// ── guiones-prompt del micro-agente (self-contained) ──
const GUION_A_CONSULTA =
  'Eres el TRADUCTOR de lenguaje del DUEÑO a consulta contable. Recibes una PREGUNTA en lenguaje ' +
  'llano (por ejemplo "¿cuánto le debo al del papel?", "¿puedo pagar la nómina?", "¿me queda ' +
  'caja?") y los TERMINOS DECLARADOS del mapa (lenguaje del dueño → tema contable). Traduce la ' +
  'pregunta al TEMA contable declarado y a los parametros (cuenta, periodo). NO inventes terminos ' +
  'ni cifras: usa solo lo declarado. Si no puedes traducir con honestidad, devuelve puede=false. ' +
  'Responde SOLO JSON: {"puede":<true|false>,"tema":"<tema declarado o null>","cuenta":null,' +
  '"periodo":null,"confianza":<0-1>,"motivo":"<frase breve>"}.';

const GUION_A_CIFRA =
  'Eres el TRADUCTOR de cifras contables al LENGUAJE del DUEÑO. Recibes un DERIVADO (una cifra ya ' +
  'calculada, con su contexto: periodo, unidad) y devuelves la MISMA cifra en lenguaje llano, ' +
  'claro y simple (caja, deuda, resultado, "¿puedo pagar X?"). REGLA DE HIERRO: NO inventes ni ' +
  'estimes cifras — usa EXCLUSIVAMENTE el valor que te dan. Si el valor falta (null), NO lo ' +
  'rellenes: devuelve puede=false y declara que no hay dato. Responde SOLO JSON: ' +
  '{"puede":<true|false>,"frase":"<la cifra en lenguaje llano>","valor":<numero o null>,' +
  '"unidad":"<unidad o null>","confianza":<0-1>,"motivo":"<frase breve>"}.';

class PuenteLenguajeDueno extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puente-lenguaje-dueno';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC a_consulta (una linea, delega a _atender) ──
  onAConsultaRequest(e) {
    return this._atender(e, 'a_consulta', 'puente-lenguaje-dueno.a_consulta.response', async (d) => {
      const res = await this._a_consulta(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.consulta_traducida', {
          project_id: res.data.project_id,
          direccion: 'a_consulta',
          traduccion: res.data.consulta,
          origen: res.data.origen,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('puente-lenguaje-dueno.a_consulta.failed', res);
      }
      return res;
    });
  }

  // ── handler RPC a_cifra (una linea, delega a _atender) ──
  onACifraRequest(e) {
    return this._atender(e, 'a_cifra', 'puente-lenguaje-dueno.a_cifra.response', async (d) => {
      const res = await this._a_cifra(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.consulta_traducida', {
          project_id: res.data.project_id,
          direccion: 'a_cifra',
          traduccion: res.data.traduccion,
          origen: res.data.origen,
          cifra_disponible: res.data.cifra_disponible,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('puente-lenguaje-dueno.a_cifra.failed', res);
      }
      return res;
    });
  }

  // ── Fire-and-forget: una respuesta de consulta (Q1) llega para traducirse a lenguaje del dueno ──
  onRespuestaConsulta(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    return this._a_cifra({
      project_id: d.project_id,
      derivado: { cifra: d.respuesta, tema: d.pregunta && d.pregunta.tema, fuente: d.fuente },
      termino: d.pregunta && d.pregunta.tema,
      correlation_id: d.correlation_id
    });
  }

  // ── proyeccion determinista: a_consulta(pregunta:Lenguaje) → Consulta ──
  async _a_consulta(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const texto = input.pregunta != null ? String(input.pregunta) : (input.texto != null ? String(input.texto) : null);
    if (texto === null) return this._invalid('pregunta');

    // 1) REFLEJO: el MAPA declarado (lenguaje → tema). Cero semantica cableada.
    const mapa = this._mapa(input);
    const porMapa = this._aConsultaReflejo(texto, mapa);
    if (porMapa) {
      return this._consulta(pid, texto, porMapa, 'mapa', { mapa_disponible: true });
    }

    // 2) FUZZY: el mapa no cubre → el juicio PROPONE la traduccion (sin inventar terminos).
    const asistido = await this._concluir(GUION_A_CONSULTA, { pregunta: texto, mapa_lenguaje: mapa });
    const propuesta = this._consultaDe(asistido, mapa);
    if (propuesta) {
      return this._consulta(pid, texto, propuesta, 'juicio', { mapa_disponible: mapa.length > 0 });
    }

    // 3) Ni mapa ni juicio resoluble → [ABIERTO]. No se adivina que pregunta el dueno.
    return {
      status: 200,
      data: {
        project_id: pid,
        pregunta: texto,
        consulta: null,
        origen: null,
        mapa_disponible: mapa.length > 0,
        abierto: true,
        faltan: ['traduccion'],
        motivo: 'no se traduce la pregunta: no hay termino en el mapa declarado ni juicio resoluble — el puente no inventa que pregunta el dueno'
      }
    };
  }

  // ── proyeccion determinista: a_cifra(d:Derivado) → Lenguaje ──
  async _a_cifra(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // La CIFRA: llega declarada en el derivado o se PIDE a su dueno POR EVENTO. ⚠️ No se inventa.
    const { derivado, cifra, fuente, disponible } = await this._cifra(pid, input);

    // Sin cifra NO se traduce un numero: se declara [ABIERTO] (traducir, no inventar).
    if (!disponible) {
      return {
        status: 200,
        data: {
          project_id: pid,
          derivado,
          traduccion: null,
          cifra: null,
          cifra_disponible: false,
          origen: null,
          abierto: true,
          faltan: ['cifra'],
          motivo: 'no hay cifra que traducir (ni declarada ni de su fuente): el puente TRADUCE, no inventa cifras'
        }
      };
    }

    // La FRASE en lenguaje llano: por el reflejo (termino declarado en el mapa) o por juicio.
    const mapa = this._mapa(input);
    const termino = this._termino(input, derivado);

    // El REFLEJO solo puede componer una frase SI el termino esta declarado; si no, el juicio
    // la redacta — pero SIEMPRE sobre la cifra real (jamas sobre un valor estimado).
    const porMapa = termino ? this._fraseReflejo(termino, cifra) : null;
    if (porMapa) {
      return this._traduccion(pid, derivado, cifra, fuente, { ...porMapa, origen: 'mapa' }, { mapa_disponible: mapa.length > 0 });
    }

    const asistido = await this._concluir(GUION_A_CIFRA, {
      derivado, cifra, termino: termino, mapa_lenguaje: mapa
    });
    const propuesta = this._fraseDe(asistido, cifra);
    if (propuesta) {
      return this._traduccion(pid, derivado, cifra, fuente, { ...propuesta, origen: 'juicio' }, { mapa_disponible: mapa.length > 0 });
    }

    // El juicio no supo traducir → se declara [ABIERTO]; la cifra NO se retoca.
    return {
      status: 200,
      data: {
        project_id: pid,
        derivado,
        traduccion: null,
        cifra,
        cifra_disponible: true,
        origen: null,
        mapa_disponible: mapa.length > 0,
        abierto: true,
        faltan: ['traduccion'],
        motivo: 'la cifra existe pero el juicio no supo traducirla con honestidad: se declara el hueco (la cifra no se retoca)'
      }
    };
  }

  // ── REFLEJO a_consulta: aplica el MAPA declarado (termino → tema) ──
  _aConsultaReflejo(texto, mapa = []) {
    const t = String(texto).toLowerCase();
    for (const m of mapa) {
      if (!m || typeof m !== 'object') continue;
      const termino = m.termino != null ? String(m.termino).toLowerCase() : null;
      if (!termino) continue;
      if (!t.includes(termino) && termino !== t) continue;
      const tema = m.tema != null ? String(m.tema) : null;
      if (!tema) continue;
      return { tema, cuenta: m.cuenta != null ? String(m.cuenta) : null, periodo: m.periodo != null ? String(m.periodo) : null, termino_declarado: termino };
    }
    return null;
  }

  // ── REFLEJO a_cifra: compone la frase desde el termino declarado + la cifra REAL ──
  _fraseReflejo(termino, cifra) {
    const valor = this._num(cifra.valor);
    if (valor === null) return null;
    const unidad = cifra.unidad != null ? String(cifra.unidad) : 'EUR';
    return {
      termino,
      frase: `${termino}: ${this._round(valor, 2)} ${unidad}`,
      valor,
      unidad
    };
  }

  _consulta(pid, texto, c, origen, { mapa_disponible }) {
    return {
      status: 200,
      data: {
        project_id: pid,
        pregunta: texto,
        consulta: { tema: c.tema, cuenta: c.cuenta, periodo: c.periodo },
        termino_declarado: c.termino_declarado || null,
        origen,
        confianza: c.confianza != null ? c.confianza : (origen === 'mapa' ? 1 : null),
        mapa_disponible,
        // Traduce, no decide: la puerta que la ejecuta es Q1; aqui solo se traduce la pregunta.
        decide: false,
        abierto: { consulta: null }
      }
    };
  }

  _traduccion(pid, derivado, cifra, fuente, t, { mapa_disponible }) {
    return {
      status: 200,
      data: {
        project_id: pid,
        derivado,
        traduccion: { frase: t.frase, valor: t.valor, unidad: t.unidad, termino: t.termino || null },
        cifra,
        cifra_disponible: true,
        fuente_cifra: fuente,
        origen: t.origen,
        confianza: t.confianza != null ? t.confianza : (t.origen === 'mapa' ? 1 : null),
        mapa_disponible,
        // TRADUCE, no inventa: el valor de la frase ES el valor de la cifra real.
        inventa_cifra: false,
        decide: false,
        abierto: { traduccion: null }
      }
    };
  }

  // La CIFRA: declarada en el derivado, o su valor pedido a su dueno POR EVENTO. Nunca inventada.
  async _cifra(pid, input = {}) {
    const d = input.derivado || input.d;
    if (d && typeof d === 'object') {
      const valor = this._num(d.valor != null ? d.valor : (d.cifra != null ? d.cifra : d.importe));
      if (valor !== null) {
        return { derivado: d, cifra: { valor, unidad: d.unidad != null ? String(d.unidad) : null, periodo: d.periodo != null ? String(d.periodo) : null, tema: d.tema != null ? String(d.tema) : null }, fuente: input.origen != null ? String(input.origen) : 'declarado', disponible: true };
      }
    }
    if (input.valor !== undefined && input.valor !== null) {
      const valor = this._num(input.valor);
      return { derivado: { valor }, cifra: { valor, unidad: input.unidad != null ? String(input.unidad) : null, periodo: input.periodo != null ? String(input.periodo) : null }, fuente: 'declarado', disponible: valor !== null };
    }
    // Sin valor declarado: se pide a la fuente de su tema POR EVENTO (mayor-balanza / cuenta-resultados / saldo-tesoreria).
    const fuente = this._fuenteDe(input);
    if (!fuente) return { derivado: d || null, cifra: null, fuente: null, disponible: false };
    const r = await this._rpc(fuente.evento, { project_id: pid, periodo: input.periodo, ejercicio: input.ejercicio != null ? input.ejercicio : input.periodo, cuenta: input.cuenta }, { timeout_ms: 4000 }).catch(() => null);
    const data = r && r.data ? r.data : null;
    if (!data) return { derivado: d || null, cifra: null, fuente: fuente.dueno, disponible: false };
    const valor = this._num(data[fuente.campo]);
    if (valor === null) return { derivado: d || null, cifra: null, fuente: fuente.dueno, disponible: false };
    return { derivado: data, cifra: { valor, unidad: input.unidad != null ? String(input.unidad) : null, periodo: input.periodo != null ? String(input.periodo) : null, tema: fuente.tema }, fuente: fuente.dueno, disponible: true };
  }

  // De donde sale una cifra por TEMA — declarable. Solo fija la identidad, no criterio de negocio.
  _fuenteDe(input = {}) {
    const tema = input.tema != null ? String(input.tema).toLowerCase()
      : (input.termino != null ? String(input.termino).toLowerCase() : null);
    const FUENTES = {
      caja: { evento: 'saldo-tesoreria.calcular.request', dueno: 'saldo-tesoreria', campo: 'saldo_total', tema: 'caja' },
      saldo: { evento: 'mayor-balanza.saldos.request', dueno: 'mayor-balanza', campo: 'saldos', tema: 'saldo' },
      resultado: { evento: 'cuenta-resultados.calcular.request', dueno: 'cuenta-resultados', campo: 'resultado', tema: 'resultado' }
    };
    return tema && FUENTES[tema] ? FUENTES[tema] : null;
  }

  _mapa(input = {}) {
    const m = input.mapa_lenguaje || (input.mapa) || (input.criterio && input.criterio.mapa_lenguaje);
    return Array.isArray(m) ? m : [];
  }

  _termino(input = {}, derivado = {}) {
    const t = input.termino != null ? input.termino : (derivado && derivado.tema != null ? derivado.tema : null);
    return t != null && String(t).trim() !== '' ? String(t).trim() : null;
  }

  async _concluir(system, payload) {
    const resp = await this._rpc('llm.complete.request', {
      system,
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
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

  // Valida el juicio a_consulta: solo acepta temas/terminos DECLARADOS (no inventa).
  _consultaDe(a, mapa = []) {
    if (!a || a.puede !== true) return null;
    const tema = a.tema != null ? String(a.tema) : null;
    if (!tema) return null;
    // Si el mapa declara temas, la propuesta debe pertenecer a ellos (no inventa tema).
    const temas = this._temas(mapa);
    if (temas.size > 0 && !temas.has(tema)) return null;
    const confianza = typeof a.confianza === 'number' && a.confianza >= 0 && a.confianza <= 1 ? a.confianza : null;
    return { tema, cuenta: a.cuenta != null ? String(a.cuenta) : null, periodo: a.periodo != null ? String(a.periodo) : null, confianza };
  }

  // Valida el juicio a_cifra: el VALOR debe ser el de la cifra real (no una cifra inventada).
  _fraseDe(a, cifra) {
    if (!a || a.puede !== true) return null;
    const frase = a.frase != null ? String(a.frase).trim() : '';
    if (!frase) return null;
    const real = this._num(cifra.valor);
    const devuelto = this._num(a.valor);
    // La frase NO puede inventar un valor: si el LLM devuelve un valor, debe coincidir con el real.
    if (devuelto !== null && real !== null && devuelto !== real) return null;
    const confianza = typeof a.confianza === 'number' && a.confianza >= 0 && a.confianza <= 1 ? a.confianza : null;
    return { frase, valor: real, unidad: cifra.unidad != null ? String(cifra.unidad) : (a.unidad != null ? String(a.unidad) : null), termino: null, confianza };
  }

  _temas(mapa = []) {
    const s = new Set();
    for (const m of mapa) if (m && m.tema != null) s.add(String(m.tema));
    return s;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolAConsulta(params) { return this._a_consulta(params); }
  toolACifra(params) { return this._a_cifra(params); }
}

module.exports = PuenteLenguajeDueno;
