/**
 * contabilidad-fiscal/generador-modelo — PUENTE STATELESS (D7, hoja del plan).
 *
 * SALIDA al programa del ASESOR: toma el modelo ya construido (modelo-303 D2, modelo-390 D3)
 * y lo EXPORTA en el formato que el programa del asesor consuma. Es un puente: cruza la
 * frontera hacia fuera; no decide el contenido del modelo ni lo presenta.
 *
 * EL SISTEMA **PREPARA** EL MODELO; EL **ASESOR PRESENTA Y FIRMA**. Este modulo NO presenta,
 * NO firma y NO envia a ninguna administracion: solo deja el modelo exportado en el formato
 * declarado para que el asesor lo meta en su programa.
 *
 * LA LEY ENTRA COMO DATO (invariante 5): el `destino` y el `formato` son DECLARABLES
 * (`ParametroDeclarable`) — ABIERTO en el diseño (formato no declarado aun). NO hay ninguna
 * codificacion cableada (ni XML, ni BOE, ni CSV de un programa concreto): sin `formato`
 * declarado NO se exporta — se declara `exportado:false` con su motivo. El `mapeo`
 * (campo canonico → clave externa) tambien entra como DATO, igual que en puerto-plan-contable.
 *
 * El modelo llega por DOS vias, ninguna es un `require` cruzado:
 *   - declarado en la peticion (`modelo`),
 *   - pedido POR EVENTO a modelo-303 / modelo-390 (RPC). Si no hay ninguno, se declara.
 * Sin modelo NO se exporta un fichero vacio ni inventado.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja D7 del plan-construccion y diseno-oop.md (CLASE GeneradorModelo).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Campos canonicos de la exportacion. Su clave externa es declarable (mapeo).
const CAMPOS_EXPORT = ['modelo', 'ejercicio', 'periodo', 'nif', 'casillas', 'datos'];

class GeneradorModelo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'generador-modelo';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onExportarRequest(e) {
    return this._atender(e, 'exportar', 'generador-modelo.exportar.response', async (d) => {
      const res = await this._exportar(d);
      if (res.status === 200 && res.data.exportado) {
        // Exito → evento de dominio: el modelo quedo exportado hacia el asesor.
        this.eventBus?.publish('contabilidad.modelo_exportado', {
          project_id: res.data.project_id,
          modelo: res.data.modelo_slug,
          destino: res.data.destino,
          formato: res.data.formato,
          // El sistema PREPARA; el asesor presenta y firma. Se declara aqui.
          presentado: false,
          firmado: false,
          correlation_id: d.correlation_id
        });
      } else if (res.status !== 200) {
        this.eventBus?.publish('generador-modelo.exportar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion: modelo → fichero externo del programa del asesor ──
  async _exportar(input = {}) {
    const pid = input.project_id || this.project_id || null;

    // El destino y el formato son DECLARABLES (ABIERTO en el diseño). Sin formato NO se
    // exporta: jamas se adivina la codificacion del programa del asesor (invariante 5).
    const formato = input.formato != null ? String(input.formato) : null;
    const destino = input.destino != null ? String(input.destino) : null;
    if (!formato) {
      return this._errorResponse(400, 'FORMATO_NO_DECLARADO',
        'hay que declarar el formato de salida (el del programa del asesor); esta ABIERTO como ParametroDeclarable',
        { destino });
    }

    // El modelo: declarado o pedido POR EVENTO a modelo-303 / modelo-390. Nunca inventado.
    const m = await this._modelo(pid, input);
    if (!m.modelo) {
      return {
        status: 200,
        data: {
          project_id: pid,
          destino,
          formato,
          exportado: false,
          fichero: null,
          motivo: 'no hay modelo disponible: no se exporta un fichero vacio ni inventado',
          // El sistema NO presenta ni firma: lo declara, no lo asume.
          presentado: false,
          firmado: false,
          preparado_para_asesor: true
        }
      };
    }

    const modelo = m.modelo;
    const mapeo = this._mapeoDe(input, formato);

    // El fichero externo se compone desde los campos canonicos con el mapeo DECLARADO.
    // Sin mapeo, el formato canonico usa los nombres canonicos tal cual.
    const fichero = this._componer(modelo, mapeo);

    return {
      status: 200,
      data: {
        project_id: pid,
        modelo_slug: modelo.modelo != null ? String(modelo.modelo) : null,
        origen_modelo: m.origen,
        destino,
        formato,
        adaptador_declarado: Boolean(input.mapeo),
        exportado: true,
        fichero,
        // El sistema PREPARA el modelo; el ASESOR presenta y firma.
        presentado: false,
        firmado: false,
        preparado_para_asesor: true
      }
    };
  }

  // El modelo: declarado en la peticion o pedido POR EVENTO a modelo-303 / modelo-390.
  async _modelo(pid, input = {}) {
    if (input.modelo && typeof input.modelo === 'object') {
      return { modelo: input.modelo, origen: 'declarado_en_peticion' };
    }

    const slug = input.modelo_slug != null ? String(input.modelo_slug) : null;
    const candidatos = slug ? [slug] : ['modelo-303', 'modelo-390'];

    for (const candidato of candidatos) {
      const r = await this._rpc(`${candidato}.construir.request`, {
        project_id: pid,
        ejercicio: input.ejercicio ?? null,
        periodo: input.periodo ?? null,
        regimen: input.regimen ?? null,
        territorio: input.territorio ?? null,
        estructura: input.estructura ?? null,
        formato: null
      }, { timeout_ms: 5000 });
      const data = r && r.status === 200 ? r.data : null;
      if (data && data.modelo) return { modelo: data.modelo, origen: candidato };
    }
    return { modelo: null, origen: null };
  }

  // Compone el fichero externo: campo canonico → clave externa (mapeo DECLARADO).
  _componer(modelo, mapeo) {
    const out = {};
    for (const campo of CAMPOS_EXPORT) {
      out[campo] = modelo?.[campo] ?? null;   // ausente → null, no se estima
    }
    if (!mapeo) return out;
    const mapeado = {};
    for (const campo of CAMPOS_EXPORT) {
      const clave = mapeo[campo] != null ? String(mapeo[campo]) : campo;
      mapeado[clave] = out[campo];
    }
    return mapeado;
  }

  // Resuelve el mapeo declarado. Sin mapeo, solo el formato canonico declarado.
  _mapeoDe(input, formato) {
    if (input.mapeo && typeof input.mapeo === 'object') return input.mapeo;
    if (formato === 'canonico' || formato === 'enki') {
      const identidad = {};
      for (const c of CAMPOS_EXPORT) identidad[c] = c;
      return identidad;
    }
    return null;
  }

  // ── Tools ──
  toolExportar(params) { return this._exportar(params); }
}

module.exports = GeneradorModelo;
