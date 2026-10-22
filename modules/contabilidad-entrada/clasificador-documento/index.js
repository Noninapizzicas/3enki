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
 * PLANTILLAS POR PROVEEDOR (dato, no código): el esquema genérico de arriba está pensado
 * para tickets LINEALES. Una factura maquetada en columnas (lo que sale de
 * `pdftotext -layout`) rompe esos patrones por dos motivos medidos en producción: los
 * valores caen en OTRA línea a 40+ espacios, y la cabecera del emisor convive con un
 * bloque `CLIENTE` cuyo NIF se cuela antes que el del emisor. Por eso cada proveedor
 * puede declarar su propia LEY DE LECTURA en `plantillas/<id>.json` (mismo formato
 * `{campo:{regex,flags}}`), SIN tocar este fichero y SIN dependencias nuevas.
 *   · Detección: por `documento.remitente` (el canal Gmail lo deja ahí: email o dominio)
 *     y, si no casa, por las señales de TEXTO que declare la plantilla.
 *   · La `clase` de la plantilla MANDA sobre la detectada por pesos (el proveedor ya
 *     dijo qué papel emite), y `origen_esquema` dice de dónde salió la ley de lectura:
 *     `plantilla:<id>` o `generico`. Sin plantilla que case, el esquema genérico sigue
 *     siendo el de siempre: añadir proveedores no cambia nada de lo que ya funcionaba.
 *
 * Forma: REFLEJO → STATELESS (sin PosPersistencia, sin estado en disco). RPC `clasificar`
 * es CLASE PREGUNTA → va por el bus, SIN ui_handler. Publica el HECHO
 * `contabilidad.documento_clasificado` (R2: anuncia la decisión de dominio) y su par
 * `.failed` para el fallo determinista.
 */

'use strict';

const fs = require('fs');
const path = require('path');

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

// ── PLANTILLAS POR PROVEEDOR: se LEEN del disco, no se cablean ───────────────────────
// Una plantilla es DATO: añadir un proveedor = soltar un JSON en `plantillas/`. Se cargan
// UNA vez al requerir el módulo (determinista: orden alfabético de fichero, que fija la
// precedencia entre plantillas que casen por texto). Un JSON roto NO tumba el
// clasificador: se ignora y ese proveedor vuelve al esquema genérico.
const DIR_PLANTILLAS = path.join(__dirname, 'plantillas');

function cargarPlantillas() {
  let ficheros;
  try {
    ficheros = fs.readdirSync(DIR_PLANTILLAS).filter((f) => f.endsWith('.json')).sort();
  } catch (_) {
    return []; // sin carpeta de plantillas → solo esquema genérico (nada se rompe)
  }
  const plantillas = [];
  for (const fichero of ficheros) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(DIR_PLANTILLAS, fichero), 'utf8'));
      if (!p || !p.id || !p.campos || typeof p.campos !== 'object') continue;
      plantillas.push(p);
    } catch (_) { /* plantilla ilegible: se ignora (el genérico sigue disponible) */ }
  }
  return plantillas;
}

const PLANTILLAS = cargarPlantillas();

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

    // PLANTILLA DEL PROVEEDOR: si casa (por remitente o por señales del texto) manda su
    // clase y su ley de lectura. Sin plantilla, el comportamiento es el de siempre.
    const hallada = this._plantilla(input, texto);
    const clase = hallada ? String(hallada.plantilla.clase || juicio.clase) : juicio.clase;
    const esquema = hallada
      ? this._esquemaPlantilla(hallada.plantilla)
      : (clase === 'otro' ? {} : this._esquema(clase));
    const obligatorios = hallada
      ? this._obligatoriosPlantilla(hallada.plantilla, esquema, clase)
      : OBLIGATORIOS[clase].slice();

    // `motivos` se deja reproducible: los del contrato y, al final, de dónde salió el atajo.
    const motivos = juicio.motivos.slice();
    if (hallada) motivos.push(`plantilla:${hallada.plantilla.id} (${hallada.motivo})`);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'clasificador-documento',
        clase,
        // Con plantilla la identificación es determinista (el proveedor está declarado),
        // así que la confianza es 1 aunque el OCR no puntúe ninguna señal de texto.
        confianza: clase === 'otro' ? 0 : (hallada ? 1 : this._round(Math.min(1, juicio.peso_ganador / PESO_MAXIMO), 2)),
        motivos,
        senales: juicio.senales,
        esquema,
        obligatorios,
        // De dónde salió la LEY DE LECTURA: auditable en la propia respuesta.
        origen_esquema: hallada ? `plantilla:${hallada.plantilla.id}` : 'generico',
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

  // ── PLANTILLAS: detección y esquema ────────────────────────────────────────────────

  /**
   * Plantilla que casa con el documento, o null. Precedencia declarada y determinista:
   *   1. REMITENTE (`documento.remitente` o `remitente`): email o dominio del canal; basta
   *      que CONTENGA el dominio declarado (`Facturas <facturas@ionos.es>` vale).
   *   2. Señales del TEXTO, en orden alfabético de fichero de plantilla.
   * Se prueba el remitente primero porque el canal sabe quién manda el papel y el texto
   * puede venir de un OCR que se coma la cabecera.
   */
  _plantilla(input, texto) {
    const remitente = this._remitente(input).toLowerCase();
    if (remitente) {
      for (const p of PLANTILLAS) {
        for (const dominio of this._lista(p.detectar && p.detectar.dominio)) {
          const d = String(dominio).toLowerCase();
          if (d && remitente.includes(d)) return { plantilla: p, motivo: `dominio:${dominio}` };
        }
      }
    }
    for (const p of PLANTILLAS) {
      for (const patron of this._lista(p.detectar && p.detectar.texto)) {
        let rx;
        try { rx = new RegExp(String(patron), 'i'); } catch (_) { continue; } // patrón roto: se ignora
        if (rx.test(texto)) return { plantilla: p, motivo: `texto:${patron}` };
      }
    }
    return null;
  }

  // La ley de lectura de la plantilla, ya en la forma {campo:{regex,flags}} de _extraer.
  // Solo `regex`/`flags`: nada inventado, la plantilla es DATO y se copia tal cual.
  _esquemaPlantilla(plantilla) {
    const esquema = {};
    const campos = plantilla.campos || {};
    for (const campo of Object.keys(campos)) {
      const regla = campos[campo];
      if (!regla) continue;
      if (typeof regla === 'string') { esquema[campo] = { regex: regla, flags: 'i' }; continue; }
      if (regla.regex == null && regla.path == null) continue;
      esquema[campo] = {
        regex: regla.regex != null ? String(regla.regex) : null,
        flags: regla.flags != null ? String(regla.flags) : 'i'
      };
      if (regla.path != null) esquema[campo].path = String(regla.path);
    }
    return esquema;
  }

  // Obligatorios de la plantilla, SIEMPRE subconjunto de los campos declarados: un
  // obligatorio sin patrón solo serviría para encolar documentos que sí se leen.
  _obligatoriosPlantilla(plantilla, esquema, clase) {
    const declarados = Object.keys(esquema);
    const pedidos = Array.isArray(plantilla.obligatorios) ? plantilla.obligatorios.map(String) : OBLIGATORIOS[clase] || [];
    return pedidos.filter((c) => declarados.includes(c));
  }

  // De quién viene el papel: el canal (Gmail/Telegram) lo deja en `documento.remitente`.
  _remitente(input = {}) {
    const doc = this._documento(input);
    if (doc.remitente != null) return String(doc.remitente);
    if (input.remitente != null) return String(input.remitente);
    if (doc.from != null) return String(doc.from);
    return '';
  }

  _lista(valor) {
    if (Array.isArray(valor)) return valor.filter((v) => v != null && String(v).length > 0);
    if (valor != null && String(valor).length > 0) return [valor];
    return [];
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
        origen_esquema: data.origen_esquema,
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
