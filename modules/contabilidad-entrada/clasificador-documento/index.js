/**
 * contabilidad-entrada/clasificador-documento — REFLEJO STATELESS (B del contrato de
 * entrada documental).
 *
 * Recibe el TEXTO que ya sacó `lector-documento` y decide QUÉ documento es:
 * `factura` | `albaran` | `ticket` | `otro`. Determinista, cero LLM: solo cuenta
 * SEÑALES DECLARADAS con pesos fijos. No adivina: si ninguna señal pesa, la clase es
 * `otro` y se declara en `abierto.tipo`.
 *
 * POR QUÉ existe: `extraccion-dato` (A4.1) no busca patrones a ojo — exige que alguien
 * le DECLARE el esquema (`campo → {regex, flags}`) y los campos obligatorios. Ese alguien
 * es este módulo: su salida es el juicio MÍNIMO (qué es el papel) y la ley de lectura
 * (cómo extraerlo). Separar «qué es» de «cómo se lee» permite añadir tipos sin tocar el
 * extractor, y deja el esquema auditable (está en la respuesta, no escondido en código).
 *
 * Se ENCADENA SIEMPRE a `extraccion-dato.juzgar.request`, incluso con clase `otro` y
 * esquema vacío: `extraccion-dato` declarará el abierto y la cola de excepciones lo
 * recogerá. Nada se pierde en silencio — invariante de toda la vertical.
 *
 * Forma: REFLEJO → STATELESS (sin PosPersistencia, sin estado en disco). RPC `clasificar`
 * es CLASE PREGUNTA → va por el bus, SIN ui_handler. Publica el HECHO
 * `contabilidad.documento_clasificado` (R2: anuncia la decisión de dominio) y su par
 * `.failed` para el fallo determinista.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// ── Patrones de EXTRACCIÓN (formato exacto de extraccion-dato._extraer) ──────────────
// El valor que cuenta es el GRUPO 1. Todos tolerantes a OCR: espacios sueltos entre
// letras del NIF, 'º'/'°'/'O' por 'º', etc. Declarados aquí una sola vez y compartidos
// por los esquemas de los tipos que los usan.
const RX = {
  nif: '(?:NIF|CIF|C\\.I\\.F\\.|N\\.I\\.F\\.)[^\\nA-Z0-9]{0,15}([A-Z]\\s?-?\\s?\\d{7}\\s?-?\\s?[0-9A-J])',
  fecha: '(?:FECHA|EMISI[ÓO]N|F\\.?\\s*FACTURA)[^\\d]{0,15}(\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4})',
  numero_factura: '(?:FACTURA|ALBAR[ÁA]N|N[º°O]\\.?)[^\\n\\d]{0,25}(\\d[\\w\\-\\/]{2,})',
  numero_ticket: '(?:TICKET|TIQUE|N[º°O]\\.?)[^\\n\\d]{0,25}(\\d[\\w\\-\\/]{2,})',
  base: 'BASE\\s*IMPONIBLE[^\\d]{0,20}([\\d.,]+)',
  iva_pct: 'IVA[^\\d%]{0,10}(\\d{1,2})\\s*%',
  iva_importe: 'IVA\\s*\\d{1,2}\\s*%[^\\d]{0,15}([\\d.,]+)',
  total: 'TOTAL(?:\\s*A\\s*PAGAR)?[^\\d]{0,25}([\\d.,]+)',
  proveedor: '^([A-Z0-9][^\\n]{2,60}?(?:S\\.?L\\.?U?\\.?|S\\.?A\\.?|C\\.?B\\.?|S\\.?C\\.?O\\.?P\\.?))'
};

// Flags por patrón: 'i' porque un OCR mezcla mayúsculas/minúsculas; 'm' solo el
// proveedor, que se ancla al INICIO DE LÍNEA (`^`) de la cabecera del documento.
const FLAGS = { proveedor: 'im' };

// ── Señales de CLASIFICACIÓN (texto → tipo). Pesos del contrato, congelados ──────────
// `cumple` es una función pura (test sobre el texto) para poder expresar la señal
// COMPUESTA `base imponible` + `iva` sin inventar nada: solo suma si están las dos.
const SENALES = {
  factura: [
    { motivo: 'factura', peso: 3, cumple: (t) => /\bfactura\b/i.test(t) },
    { motivo: 'invoice', peso: 3, cumple: (t) => /\binvoice\b/i.test(t) },
    { motivo: 'factura simplificada', peso: 3, cumple: (t) => /\bfactura simplificada\b/i.test(t) },
    { motivo: 'base+iva', peso: 2, cumple: (t) => /base imponible/i.test(t) && /iva/i.test(t) },
    { motivo: 'nº factura', peso: 2, cumple: (t) => /\bn[º°o]\.?\s*(?:de\s*)?factura/i.test(t) }
  ],
  albaran: [
    { motivo: 'albaran', peso: 3, cumple: (t) => /\balbar[áa]n(?:es)?\b/i.test(t) },
    { motivo: 'nota de entrega', peso: 3, cumple: (t) => /\bnota de entrega\b/i.test(t) },
    { motivo: 'delivery note', peso: 3, cumple: (t) => /\bdelivery note\b/i.test(t) }
  ],
  ticket: [
    { motivo: 'ticket', peso: 3, cumple: (t) => /\bticket\b/i.test(t) },
    { motivo: 'tique', peso: 3, cumple: (t) => /\btique\b/i.test(t) },
    { motivo: 'simplificado', peso: 3, cumple: (t) => /\bsimplificad[oa]\b/i.test(t) },
    { motivo: 'gracias por su compra', peso: 3, cumple: (t) => /gracias por su compra/i.test(t) }
  ]
};

// NIF español: señal BOOLEANA de refuerzo (no suma peso de clase). Así el ejemplo del
// contrato cuadra: factura 3 + base+iva 2 = 5 → confianza 5/6 = 0.83, con `nif` aparte.
// Su peso 1 se declara en `motivos` y su fuerza se ejerce en el DESEMPATE (regla 2).
const RX_NIF_SUELTO = /[A-Z]\s?-?\s?\d{7}\s?-?\s?[0-9A-J]/i;

// ── Esquemas + obligatorios POR TIPO ────────────────────────────────────────────────
// `otro` no lleva esquema: sin esquema, extraccion-dato declara el abierto y encola.
const CAMPOS = {
  factura: { nif: RX.nif, fecha: RX.fecha, numero: RX.numero_factura, base: RX.base, iva_pct: RX.iva_pct, iva_importe: RX.iva_importe, total: RX.total, proveedor: RX.proveedor },
  albaran: { nif: RX.nif, fecha: RX.fecha, numero: RX.numero_factura, base: RX.base, iva_pct: RX.iva_pct, iva_importe: RX.iva_importe, total: RX.total, proveedor: RX.proveedor },
  ticket: { nif: RX.nif, fecha: RX.fecha, numero: RX.numero_ticket, base: RX.base, iva_pct: RX.iva_pct, iva_importe: RX.iva_importe, total: RX.total }
};

const OBLIGATORIOS = {
  factura: ['nif', 'fecha', 'total'],
  albaran: ['nif', 'fecha', 'total'],
  ticket: ['fecha', 'total'],
  otro: []
};

// Denominador del contrato: confianza = min(1, peso_ganador / 6).
const PESO_MAXIMO = 6;

class ClasificadorDocumento extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'clasificador-documento';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una línea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onClasificarRequest(e) {
    return this._atender(e, 'clasificar', 'clasificador-documento.clasificar.response', (d) => this._resolver(d));
  }

  // Atiende la op completa: clasifica, anuncia el HECHO y encadena SIEMPRE la extracción.
  _resolver(d = {}) {
    const res = this._clasificar(d);
    if (res.status !== 200) {
      // Par de fallo determinista (mismo patrón que el resto de la vertical).
      try { this.eventBus?.publish('clasificador-documento.clasificar.failed', { request_id: d.request_id, ...res }); } catch (_) { /* best-effort */ }
      return res;
    }
    this._anunciar(res.data, d);
    this._encadenar(res.data, d);
    return res;
  }

  // ══════════════════════════════════════════════════════════════════════
  // clasificar({project_id, texto, documento?, source_kind?})
  //   → { clase, confianza, motivos, senales, esquema, obligatorios, abierto }
  // ══════════════════════════════════════════════════════════════════════
  _clasificar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // Sin TEXTO no hay nada que clasificar: no se inventa un tipo a partir de una ruta.
    const texto = this._texto(input);
    if (texto.trim().length < 8) return this._invalid('texto');

    const juicio = this._juicio(texto);
    const clase = juicio.clase;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'clasificador-documento',
        clase,
        confianza: clase === 'otro' ? 0 : this._round(Math.min(1, juicio.peso_ganador / PESO_MAXIMO), 2),
        motivos: juicio.motivos,
        senales: juicio.senales,
        esquema: clase === 'otro' ? {} : this._esquema(clase),
        obligatorios: OBLIGATORIOS[clase].slice(),
        encadenado_a: 'extraccion-dato',
        abierto: {
          tipo: clase === 'otro'
            ? 'ninguna señal declarada pesa en el texto (factura/albaran/ticket): el tipo es desconocido, no se adivina — lo recoge la cola de excepciones'
            : null
        }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // juicio(texto) → { clase, peso_ganador, motivos, senales }
  // Determinista: pesos fijos del contrato + desempate documentado abajo.
  // ══════════════════════════════════════════════════════════════════════
  _juicio(texto) {
    const pesos = { factura: 0, albaran: 0, ticket: 0 };
    const motivos = [];

    // Orden FIJO de evaluación (factura → albaran → ticket) para que `motivos` sea
    // reproducible byte a byte entre ejecuciones.
    for (const tipo of ['factura', 'albaran', 'ticket']) {
      for (const senal of SENALES[tipo]) {
        if (!senal.cumple(texto)) continue;
        pesos[tipo] += senal.peso;
        motivos.push(`${senal.motivo} (${senal.peso})`);
      }
    }

    const nif = RX_NIF_SUELTO.test(texto);
    if (nif) motivos.push('nif (1)');

    const senales = { factura: pesos.factura, albaran: pesos.albaran, ticket: pesos.ticket, nif };
    const tipos = ['factura', 'albaran', 'ticket'];
    const peso_ganador = Math.max(pesos.factura, pesos.albaran, pesos.ticket);

    // Regla 3: ningún peso > 0 → OTRO (no se inventa el tipo).
    if (peso_ganador <= 0) return { clase: 'otro', peso_ganador: 0, motivos, senales };

    // Regla 1: gana el tipo con mayor peso. Regla 2: empate → desempate documentado.
    const empatados = tipos.filter((t) => pesos[t] === peso_ganador);
    const baseIva = /base imponible/i.test(texto) && /iva/i.test(texto);
    const clase = empatados.length === 1 ? empatados[0] : this._desempatar(texto, nif, baseIva);

    return { clase, peso_ganador, motivos, senales };
  }

  /**
   * DESEMPATE del contrato (regla 2), literal y determinista:
   *   · con NIF y desglose base+IVA → `factura`, salvo que además haya
   *     «entrega»/«pedido» (entonces es un `albaran` valorado).
   *   · cualquier otro empate → `ticket` (el papel más común que se confunde con
   *     factura: «factura simplificada»/«ticket» suelen venir juntos).
   * Si el tipo elegido no estaba empatado, la evidencia sigue siendo la misma: la
   * confianza sale del peso máximo (`peso_ganador`), no del nombre elegido.
   */
  _desempatar(texto, nif, baseIva) {
    if (nif && baseIva) return /\b(entrega|pedido)\b/i.test(texto) ? 'albaran' : 'factura';
    return 'ticket';
  }

  // Esquema en el formato EXACTO que consume extraccion-dato._extraer: {campo:{regex,flags}}.
  _esquema(clase) {
    const campos = CAMPOS[clase] || {};
    const esquema = {};
    for (const campo of Object.keys(campos)) {
      esquema[campo] = { regex: campos[campo], flags: FLAGS[campo] || 'i' };
    }
    return esquema;
  }

  // Texto a clasificar: `texto` del payload o, si el puente lo dejó dentro, `documento.texto`.
  _texto(input = {}) {
    if (input.texto != null) return String(input.texto);
    if (input.documento && typeof input.documento === 'object' && input.documento.texto != null) return String(input.documento.texto);
    return '';
  }

  _documento(input = {}) {
    return (input.documento && typeof input.documento === 'object') ? input.documento : {};
  }

  // ── HECHO de dominio: se clasificó un documento (R2) ────────────────────────────────
  _anunciar(data, d) {
    try {
      this.eventBus?.publish('contabilidad.documento_clasificado', {
        project_id: data.project_id,
        documento: this._documento(d),
        clase: data.clase,
        confianza: data.confianza,
        motivos: data.motivos,
        source_kind: d.source_kind != null ? String(d.source_kind) : null,
        correlation_id: d.correlation_id
      });
    } catch (_) { /* best-effort: el hecho no puede tumbar la respuesta */ }
  }

  // ── Encadena SIEMPRE a extraccion-dato, incluso con clase `otro` ────────────────────
  // Con `otro` el esquema va vacío: extraccion-dato declarará el abierto y encolará.
  _encadenar(data, d) {
    const texto = this._texto(d);
    const payload = {
      project_id: data.project_id,
      documento: { ...this._documento(d), texto },
      texto,
      esquema: data.esquema,
      obligatorios: data.obligatorios,
      // `clase` viaja SIEMPRE en el encadenado (el cableado aguas abajo decide por ella).
      clase: data.clase,
      correlation_id: d.correlation_id
    };
    try { this.eventBus?.publish('extraccion-dato.juzgar.request', payload); } catch (_) { /* best-effort */ }
  }

  // ── Tools ──
  toolClasificar(params) { return this._clasificar(params); }
}

module.exports = ClasificadorDocumento;
