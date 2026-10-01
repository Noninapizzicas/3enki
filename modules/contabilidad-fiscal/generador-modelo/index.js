/**
 * contabilidad-fiscal/generador-modelo — PUENTE STATELESS (D7, hoja del plan).
 *
 * La SALIDA AL PROGRAMA DEL ASESOR. Conecta por PUERTO y produce un artefacto en FORMATO
 * ABIERTO. Aqui PREPARA, NO presenta: monta el modelo exportable (modelo 303/390/… declarado)
 * con sus casillas/partidas DECLARADAS y lo deja listo para que el asesor lo use. La
 * PRESENTACION (avanzar el estado del modelo) es de estado-presentacion-fiscal (D12), a quien
 * se le SUBE por EVENTO.
 *
 * Es un PUENTE, no un custodio: NO guarda estado propio. RECOGE lo declarado, lo COMPONE en
 * forma exportable y SUBE `estado-presentacion-fiscal.avanzar.request`; anuncia el hecho
 * `contabilidad.modelo_exportado`.
 *
 * Invariante (13): sin CASILLAS/partidas DECLARADAS no se inventa una cifra — el modelo sale
 * con lo declarado y lo que falte queda `abierto`. Un modelo rellenado a ojo es una declaracion
 * fiscal falsa.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated. ORDEN → ui_handler.
 * Ver hoja D7 del plan-construccion y diseno-oop.md (CLASE GeneradorModelo).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const FORMATOS = ['json', 'csv', 'xml', 'txt'];

class GeneradorModelo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'generador-modelo';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE ORDEN → ui_handler ──
  onExportarRequest(e) {
    return this._atender(e, 'exportar', 'generador-modelo.exportar.response', async (d) => {
      const res = this._exportar(d);
      if (res.status === 200) {
        // R2 · el puente PREPARA y ANUNCIA que el modelo quedo exportado (artefacto listo).
        this.eventBus?.publish('contabilidad.modelo_exportado', {
          project_id: res.data.project_id,
          modelo: res.data.modelo,
          ejercicio: res.data.ejercicio,
          periodo: res.data.periodo,
          formato: res.data.formato,
          casillas: res.data.casillas.length,
          abierto: res.data.abierto,
          correlation_id: d.correlation_id
        });
        // SUBE por EVENTO a D12: el modelo exportado queda preparado → el estado avanza.
        this.eventBus?.publish('estado-presentacion-fiscal.avanzar.request', {
          project_id: res.data.project_id,
          modelo: res.data.modelo,
          ejercicio: res.data.ejercicio,
          periodo: res.data.periodo,
          preparado: true,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('generador-modelo.exportar.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _exportar(input) → { status, data }  ·  PREPARA el modelo (no lo presenta)
  // ══════════════════════════════════════════════════════════════════════
  _exportar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // El MODELO declarado (303/390/…). Sin modelo no se sabe que exportar.
    const modelo = input.modelo != null ? String(input.modelo)
      : (input.tipo_modelo != null ? String(input.tipo_modelo) : null);
    if (!modelo) return this._invalid('modelo');

    const formato = this._formato(input.formato);
    const ejercicio = input.ejercicio != null ? String(input.ejercicio) : null;
    const periodo = input.periodo != null ? String(input.periodo) : null;

    // Las CASILLAS/partidas: DECLARADAS. Ausente → [] y se declara (no se rellena).
    const casillas = this._casillas(input);

    // El cuerpo exportable: la forma ABIERTA que el asesor puede consumir.
    const contenido = {
      modelo, ejercicio, periodo, formato,
      casillas,
      generado_en: new Date().toISOString()
    };

    // La SERIALIZACION: ABIERTA (el puerto la conecta al programa del asesor).
    const serializado = this._serializar(contenido, formato);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'generador-modelo',
        modelo,
        ejercicio,
        periodo,
        formato,
        casillas,
        num_casillas: casillas.length,
        // El artefacto exportable (formato ABIERTO). Aqui PREPARA; la presentacion es D12.
        contenido: serializado,
        // El puente NO guarda estado: su cara es el bus.
        persistido: false,
        presentacion: 'estado-presentacion-fiscal (D12)',
        sube: ['estado-presentacion-fiscal.avanzar.request'],
        abierto: {
          casillas: casillas.length > 0 ? null : 'el modelo no declara casillas/partidas: se exporta vacio (no se inventan cifras fiscales)',
          huecos: casillas.some((c) => c.valor === null)
            ? 'hay casillas sin valor declarado: se exportan en null (no se rellenan a ojo)'
            : null
        }
      }
    };
  }

  // Casillas/partidas declaradas: cada una con su valor COPIADO (nunca calculado). Sin valor → null.
  _casillas(input) {
    const raw = Array.isArray(input.casillas) ? input.casillas
      : (Array.isArray(input.partidas) ? input.partidas
        : (Array.isArray(input.datos) ? input.datos : []));
    return raw.filter((c) => c && typeof c === 'object').map((c, i) => ({
      orden: i + 1,
      casilla: c.casilla != null ? String(c.casilla) : (c.clave != null ? String(c.clave) : null),
      concepto: c.concepto != null ? String(c.concepto) : null,
      // El valor es DECLARADO; ausente → null (no se estima).
      valor: (c.valor !== undefined && c.valor !== null) ? c.valor : null
    }));
  }

  _formato(v) {
    const f = v != null ? String(v).toLowerCase().trim() : 'json';
    return FORMATOS.includes(f) ? f : 'json';
  }

  // Serializa a un formato ABIERTO. Devuelve el artefacto como string + su mime declarado.
  _serializar(contenido, formato) {
    switch (formato) {
      case 'csv': {
        const filas = ['casilla,concepto,valor'];
        for (const c of contenido.casillas) {
          filas.push([c.casilla, c.concepto, c.valor].map((x) => (x == null ? '' : String(x))).join(','));
        }
        return { mime: 'text/csv', datos: filas.join('\n') };
      }
      case 'xml': {
        const esc = (s) => String(s == null ? '' : s).replace(/[<>&]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m]));
        const body = contenido.casillas
          .map((c) => `  <casilla numero="${esc(c.casilla)}" concepto="${esc(c.concepto)}">${esc(c.valor)}</casilla>`)
          .join('\n');
        return { mime: 'application/xml', datos: `<modelo tipo="${esc(contenido.modelo)}" ejercicio="${esc(contenido.ejercicio)}" periodo="${esc(contenido.periodo)}">\n${body}\n</modelo>` };
      }
      case 'txt': {
        const lineas = contenido.casillas.map((c) => `${c.casilla ?? ''}\t${c.concepto ?? ''}\t${c.valor ?? ''}`);
        return { mime: 'text/plain', datos: [`${contenido.modelo} ${contenido.ejercicio || ''} ${contenido.periodo || ''}`.trim(), ...lineas].join('\n') };
      }
      default:
        return { mime: 'application/json', datos: contenido };
    }
  }

  // ── Tools ──
  toolExportar(params) { return this._exportar(params); }
}

module.exports = GeneradorModelo;
