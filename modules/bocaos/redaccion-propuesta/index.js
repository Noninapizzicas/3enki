'use strict';

/**
 * redaccion-propuesta · MICRO-AGENTE · PLAZA — A18 (la frase que ve el rider).
 *
 * Traduce los números que YA están calculados a la frase que el rider lee en el móvil.
 * No decide nada: no elige rider, no mueve el precio, no abre ni cierra ventanas. Si aquí se
 * calculara algo, el número que ve el rider dejaría de ser el que se midió en el enlace.
 *
 *   escucha  bocaos.propuesta_emitida → emite bocaos.propuesta_redactada { propuesta_id, frase }
 *
 * LA REGLA (A18): PLANTILLA DETERMINISTA primero.
 *
 *   «Recoge en {tienda}, {desvío} m de más. Ganas {margen} € netos. Tienes {segundos} s.»
 *
 * Un LLM OPCIONAL puede adornarla (`this.llm`, inyectado). Si falla, tarda más de
 * `llm_timeout_ms`, devuelve algo que no es texto o INVENTA UNA CIFRA que no está en el evento,
 * se descarta y sale la plantilla. SIEMPRE hay frase: el rider nunca se queda mirando un hueco.
 *
 * El VALIDADOR es lo que hace honesta la mitad fuzzy: toda cifra de la frase tiene que estar en
 * el evento (medidas, ventana). Se compara por valor, no por formato: 4,5 € y 4.50 € son la
 * misma cifra; 4,6 € es una cifra inventada.
 *
 * Isla: el nombre del local se PIDE al bus (hecho-listo.de) y, si no contesta, se dice «el local».
 * No lee el almacén de nadie y no guarda estado.
 */

const ModuloBocaos = require('../_bocaos');

const DECISION_S = 10;           // Q42, cerrado: 10 s para decidir tras el acuse
const LLM_TIMEOUT_MS = 800;      // si el adorno tarda más, la plantilla ya está lista
const TIEMPO_BUS_MS = 400;       // el nombre del local no puede retrasar la entrega

const NUMERO = /-?\d+(?:[.,]\d+)?/g;

class RedaccionPropuesta extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'redaccion-propuesta';
    this.version = 'micro-agente-0.1.0';
    this._path = null;                 // sin estado: la frase es de esta propuesta y se va con ella

    this.llm = null;                   // inyectable: ({plantilla, datos, cifras}) → Promise<string>
    this.llm_timeout_ms = LLM_TIMEOUT_MS;
    this.tiempo_bus_ms = TIEMPO_BUS_MS;
  }

  // ================= hechos que escucha =================
  async onPropuestaEmitida(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.propuesta_id) return null;

    const cifras = this._cifras(d);
    const tienda = await this._nombreDelLocal(d);
    const extras = this._numeros(tienda);   // un local puede llamarse «Pizzería 24»

    const plantilla = this._plantilla(tienda, cifras);
    const redactada = { frase: plantilla, fuente: 'plantilla', descartes: [] };

    if (typeof this.llm === 'function') {
      const adornada = await this._adornar(plantilla, d, cifras, extras);
      if (adornada.frase) {
        redactada.frase = adornada.frase;
        redactada.fuente = 'llm';
      }
      redactada.descartes = adornada.descartes;
    }

    for (const descarte of redactada.descartes) {
      // El descarte se DICE: un adorno que inventa cifras no se tira en silencio.
      this.hecho('bocaos.propuesta_redaccion_descartada', {
        propuesta_id: d.propuesta_id,
        pedido_id: d.pedido_id || null,
        plaza_id: d.plaza_id || null,
        motivo: descarte.motivo,
        cifras_inventadas: descarte.cifras || [],
        frase_descartada: descarte.frase || null
      });
    }

    this.hecho('bocaos.propuesta_redactada', {
      propuesta_id: d.propuesta_id,
      pedido_id: d.pedido_id || null,
      rider_id: d.rider_id || null,
      plaza_id: d.plaza_id || null,
      frase: redactada.frase,
      fuente: redactada.fuente,
      plantilla,
      tienda,
      cifras,
      validador: {
        cifras_permitidas: this._permitidas(cifras),
        cifras_usadas: this._numeros(redactada.frase),
        ok: this._valida(redactada.frase, cifras, extras).ok
      }
    });

    return null;
  }

  // ================= A18 · la plantilla (siempre hay frase) =================
  _plantilla(tienda, c) {
    const partes = [`Recoge en ${tienda}`];
    if (Number.isFinite(c.desvio_m)) partes[0] += `, ${this._entero(c.desvio_m)} m de más`;
    partes[0] += '.';

    if (Number.isFinite(c.margen_cents)) {
      partes.push(`Ganas ${this._euros(c.margen_cents)} netos.`);
    }
    partes.push(`Tienes ${this._entero(c.segundos)} s.`);
    return partes.join(' ');
  }

  // Las cifras de la frase son las del evento. El margen es el NETO si el evento lo trae; si no,
  // lo que el rider cobra (cobra_cents), que es la cifra que la propuesta garantiza.
  _cifras(d) {
    const m = d.medidas || {};
    const cobra = Number.isFinite(m.cobra_cents) ? m.cobra_cents : null;
    const neto = Number.isFinite(m.neto_cents) ? m.neto_cents : null;
    const margen_cents = neto !== null ? neto : cobra;
    const segundos = Number.isFinite(d.decision_s) ? d.decision_s
      : (Number.isFinite(d.politica?.ventana?.decision_s) ? d.politica.ventana.decision_s : DECISION_S);
    return {
      desvio_m: Number.isFinite(m.desvio_m) ? m.desvio_m : null,
      espera_min: Number.isFinite(m.espera_min) ? m.espera_min : null,
      retraso_min: Number.isFinite(m.retraso_min) ? m.retraso_min : null,
      cobra_cents: cobra,
      neto_cents: neto,
      margen_cents,
      ventana_s: Number.isFinite(d.ventana_s) ? d.ventana_s : null,
      segundos
    };
  }

  // ================= A18 · el adorno opcional, con su validador =================
  async _adornar(plantilla, d, cifras, extras = []) {
    let timer = null;
    const timeout = new Promise((resolve) => {
      // Sin unref: el plazo es corto y el proceso tiene que poder esperarlo (si no, en un test
      // sin otros handles el turno se corta a medias y la frase no llega a publicarse).
      timer = setTimeout(() => resolve({ ok: false, motivo: 'tardó más de lo que hay para decidir' }), this.llm_timeout_ms);
    });

    let salida;
    try {
      salida = await Promise.race([
        Promise.resolve().then(() => this.llm({ plantilla, datos: d, cifras })),
        timeout
      ]);
    } catch (err) {
      if (timer) clearTimeout(timer);
      return { frase: null, descartes: [{ motivo: `el llm falló: ${err.message}` }] };
    }
    if (timer) clearTimeout(timer);

    if (salida && salida.ok === false) {
      return { frase: null, descartes: [{ motivo: salida.motivo || 'el llm no contestó a tiempo' }] };
    }
    if (typeof salida !== 'string' || !salida.trim()) {
      return { frase: null, descartes: [{ motivo: 'el llm no devolvió una frase' }] };
    }

    const frase = salida.trim().replace(/\s+/g, ' ');
    const juicio = this._valida(frase, cifras, extras);
    if (!juicio.ok) {
      return {
        frase: null,
        descartes: [{ motivo: juicio.motivo, cifras: juicio.inventadas, frase }]
      };
    }
    return { frase, descartes: [] };
  }

  // Toda cifra de la frase tiene que estar en el evento. Ni una más.
  _valida(frase, cifras, extras = []) {
    if (typeof frase !== 'string' || !frase.trim()) return { ok: false, motivo: 'frase vacía', inventadas: [] };
    if (frase.length > 400) return { ok: false, motivo: 'la frase no cabe en el móvil', inventadas: [] };

    const permitidas = [...new Set([...this._permitidas(cifras), ...extras.map((v) => this._redondea(v))])];
    const inventadas = this._numeros(frase).filter((n) => !permitidas.includes(n));
    if (inventadas.length > 0) {
      return { ok: false, motivo: 'inventa cifras que no están en el evento', inventadas };
    }
    return { ok: true, motivo: null, inventadas: [] };
  }

  _permitidas(cifras) {
    const base = Object.values(cifras).filter((v) => Number.isFinite(v));
    if (Number.isFinite(cifras.margen_cents)) base.push(cifras.margen_cents / 100);
    return [...new Set(base.map((v) => this._redondea(v)))];
  }

  _numeros(frase) {
    const salida = [];
    for (const m of String(frase).matchAll(NUMERO)) {
      salida.push(this._redondea(Number(m[0].replace(',', '.'))));
    }
    return salida;
  }

  _redondea(v) {
    return Math.round(v * 10000) / 10000;
  }

  // ================= el local, preguntado al bus =================
  async _nombreDelLocal(d) {
    if (typeof d.local === 'string' && d.local.trim()) return d.local.trim();
    if (typeof d.tienda === 'string' && d.tienda.trim()) return d.tienda.trim();
    if (d.pedido_id) {
      try {
        const r = await this._rpc('hecho-listo.de.request',
          { project_id: d.project_id, pedido_id: d.pedido_id }, { timeout_ms: this.tiempo_bus_ms });
        const local = r?.data?.hecho?.local;
        if (typeof local === 'string' && local.trim()) return local.trim();
      } catch (_) { /* sin local se dice «el local», no se inventa un nombre */ }
    }
    return 'el local';
  }

  _euros(cents) {
    return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
  }

  _entero(v) {
    return String(Math.round(v));
  }
}

module.exports = RedaccionPropuesta;
module.exports.DECISION_S = DECISION_S;
