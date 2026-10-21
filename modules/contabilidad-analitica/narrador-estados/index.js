/**
 * contabilidad-analitica/narrador-estados — MICRO-AGENTE (R3, hoja del plan).
 *
 * TRADUCE balance/resultado al LENGUAJE DEL NEGOCIO CLIENTE. Lenguaje → juicio.
 *
 * El JUICIO linguistico (elegir QUE contar y como, segun el negocio) es la mitad FUZZY del
 * hibrido y vive en el blueprint del modulo. Esta mitad REFLEJA es la parte DETERMINISTA y
 * HONESTA: compone la narracion con las PLANTILLAS y el VOCABULARIO **DECLARADOS** por el
 * sitio, y cita SOLO las cifras reales que recibe — NUNCA inventa un numero, ni un juicio
 * de valor que no venga de una plantilla declarada.
 *
 * No calcula el balance ni el resultado por su cuenta: SUBE por EVENTO a
 * `balance-situacion.calcular.request` (C1) y `cuenta-resultados.calcular.request` (C2).
 *
 * Honestidad (invariante 13): un dato ausente NO se narra (0 no es "no hay"): queda en
 * `abierto`. Sin plantillas declaradas se usa la estructura por defecto (que solo cita
 * cifras reales); lo que no tiene cifra no se rellena con una frase inventada.
 *
 * ESCUCHA (R3): el plan declara la escucha de `contabilidad.ejercicio_cerrado`; su emisor
 * (`cierre-ejercicio`, C4) aun NO existe: no se declara. Se declarara cuando exista.
 *
 * Forma: MICRO-AGENTE (mitad refleja) → STATELESS. Sin PosPersistencia, sin onProjectActivated. PREGUNTA (narrar) → sin ui_handler.
 * Ver hoja R3 del plan-construccion y diseno-oop.md (CLASE NarradorEstados).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class NarradorEstados extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'narrador-estados';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onNarrarRequest(e) {
    return this._atender(e, 'narrar', 'narrador-estados.narrar.response', async (d) => {
      const res = await this._narrar(d);
      // Reflejo: narra; no escribe → no hay hecho de dominio que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('narrador-estados.narrar.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // narrar(estados) → balance/resultado en el lenguaje del negocio
  // ══════════════════════════════════════════════════════════════════════
  async _narrar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const { balance, resultado, fuente } = await this._estadosDe(input);

    const cifras = {
      activo: this._num(balance && balance.activo),
      pasivo: this._num(balance && balance.pasivo),
      patrimonio: this._num(balance && (balance.patrimonio_total != null ? balance.patrimonio_total : balance.patrimonio)),
      ingreso: this._num(resultado && resultado.ingreso),
      gasto: this._num(resultado && resultado.gasto),
      resultado: this._num(resultado && (resultado.resultado != null ? resultado.resultado : (balance && balance.resultado)))
    };

    const ausentes = Object.entries(cifras).filter(([, v]) => v == null).map(([k]) => k);
    if (Object.values(cifras).every((v) => v == null)) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'narrador-estados',
          frases: [],
          cifras,
          narrado: false,
          abierto: { estados: 'no se recibieron balance ni resultado (ni declarados ni de C1/C2): no hay nada que narrar' }
        }
      };
    }

    const negocio = input.negocio != null ? String(input.negocio) : (input.cliente != null ? String(input.cliente) : null);
    const frases = this._componer(cifras, input.plantillas || input.vocabulario || null, negocio);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'narrador-estados',
        negocio,
        tono: input.tono != null ? String(input.tono) : 'llano',
        frases,
        texto: frases.join(' '),
        cifras,
        fuente: fuente || null,
        narrado: true,
        determinista: true,
        abierto: {
          cifras_ausentes: ausentes.length ? `${ausentes.join(', ')} sin dato: no se narran (0 no es "no hay")` : null,
          plantillas: (input.plantillas || input.vocabulario) ? null : 'sin plantillas/vocabulario declarados: se usa la estructura por defecto (solo cita cifras reales)'
        }
      }
    };
  }

  // Compone la narracion. Si hay plantillas DECLARADAS se aplican; si no, estructura por
  // defecto. En NINGUN caso se inventa una cifra ni un juicio: solo se citan datos reales.
  _componer(cifras, plantillas, negocio) {
    const frases = [];
    const money = (v) => (v == null ? null : this._round(v, 2).toFixed(2));

    const plantilla = (clave) => {
      if (!plantillas || typeof plantillas !== 'object') return null;
      const p = plantillas[clave];
      return (typeof p === 'string' && p.trim()) ? p : null;
    };

    const sustituir = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : '—'));

    const vars = {
      negocio: negocio || '',
      activo: money(cifras.activo),
      pasivo: money(cifras.pasivo),
      patrimonio: money(cifras.patrimonio),
      ingreso: money(cifras.ingreso),
      gasto: money(cifras.gasto),
      resultado: money(cifras.resultado)
    };

    const cabecera = plantilla('cabecera');
    if (cabecera) frases.push(sustituir(cabecera, vars));
    else if (negocio) frases.push(`Situacion de ${negocio}:`);

    if (cifras.activo != null || cifras.pasivo != null || cifras.patrimonio != null) {
      const t = plantilla('situacion');
      if (t) frases.push(sustituir(t, vars));
      else {
        const partes = [];
        if (cifras.activo != null) partes.push(`activo ${money(cifras.activo)}`);
        if (cifras.pasivo != null) partes.push(`pasivo ${money(cifras.pasivo)}`);
        if (cifras.patrimonio != null) partes.push(`patrimonio ${money(cifras.patrimonio)}`);
        frases.push(`En el balance: ${partes.join(', ')}.`);
      }
    }

    if (cifras.ingreso != null || cifras.gasto != null || cifras.resultado != null) {
      const t = plantilla('resultado');
      if (t) frases.push(sustituir(t, vars));
      else {
        const partes = [];
        if (cifras.ingreso != null) partes.push(`ingresos ${money(cifras.ingreso)}`);
        if (cifras.gasto != null) partes.push(`gastos ${money(cifras.gasto)}`);
        if (cifras.resultado != null) {
          const signo = cifras.resultado >= 0 ? 'beneficio' : 'perdida';
          partes.push(`${signo} de ${money(Math.abs(cifras.resultado))}`);
        }
        frases.push(`En el resultado: ${partes.join(', ')}.`);
      }
    }

    return frases;
  }

  async _estadosDe(input) {
    if (input.balance || input.resultado) {
      return { balance: input.balance || null, resultado: input.resultado || null, fuente: 'declarado' };
    }
    const pid = input.project_id || this.project_id;
    const b = await this._rpc('balance-situacion.calcular.request', { project_id: pid, saldos: input.saldos, ejercicio: input.ejercicio }, { timeout_ms: 3000 });
    const r = await this._rpc('cuenta-resultados.calcular.request', { project_id: pid, saldos: input.saldos, ejercicio: input.ejercicio }, { timeout_ms: 3000 });
    return {
      balance: b && (b.data || b),
      resultado: r && (r.data || r),
      fuente: (b || r) ? 'balance-situacion+cuenta-resultados' : null
    };
  }

  _num(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolNarrar(params) { return this._narrar(params); }
}

module.exports = NarradorEstados;
