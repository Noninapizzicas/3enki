/**
 * contabilidad/vista-revisable — REFLEJO STATELESS (L2 + L8, hoja del plan).
 *
 * TODO ASIENTO/CALCULO EXPLICADO: cifra, base, origen, estado. NO caja negra.
 * Es la composicion determinista de la traza (B4, traza-asiento) y la prueba
 * conservada (L7, expediente-documental) sobre el asiento/calculo. Y el
 * CONTROL DE CALIDAD POR MUESTREO (L8): seleccion por excepcion y MUESTRA — no
 * revisar todo. Los criterios son SENALES DURAS DECLARADAS (alto importe, sin
 * regla, contrapartida nueva, cuadre dudoso): seleccion determinista (un test la
 * afirma). Que exige ojo humano lo fija el umbral declarado, no la intuicion.
 *
 * REFLEJO (patron real, stateless): sin PosPersistencia ni project.activated.
 * Cada op entra objeto, sale objeto. La traza la da traza-asiento (B4) por
 * EVENTO; la prueba la da expediente-documental (L7) por EVENTO; el mayor lo da
 * mayor-balanza (B3) por EVENTO (contrato TOLERANTE: lo que no responde SE
 * DECLARA en la vista, nunca se inventa la explicacion ni la prueba).
 * Emisor/par de fallo: exito publica contabilidad.vista_explicada /
 * contabilidad.muestra_seleccionada; error su par determinista.
 * NO REUTILIZA: la explicabilidad de cada cifra es requisito de la medida
 * maestra (que el asesor la acepte); no existe en el inventario.
 *
 * Ver hojas L2/L8 del diseno-oop y bloque `vista-revisable` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Senales DURAS por defecto del muestreo (L8): declarables; ninguna es intuicion.
const SENALES_POR_DEFECTO = ['ALTO_IMPORTE', 'SIN_REGLA', 'CONTRAPARTIDA_NUEVA', 'CUADRE_DUDOSO'];

class VistaRevisable extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'vista-revisable';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: sin store que persistir.
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC ──
  onExplicarRequest(e) {
    return this._atender(e, 'explicar', 'contabilidad.asiento.explicar.response', async (d) => {
      const res = await this._explicar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.vista_explicada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.asiento.explicar.failed', res);
      }
      return res;
    });
  }

  onSeleccionarRequest(e) {
    return this._atender(e, 'seleccionar', 'contabilidad.muestra.seleccionar.response', async (d) => {
      const res = this._seleccionarMuestra(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.muestra_seleccionada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.muestra.seleccionar.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras (deterministas) ──

  _apunteImporte(a) {
    const debe = Number(a && a.debe) || 0;
    const haber = Number(a && a.haber) || 0;
    return this._round(debe - haber, 2);
  }

  // explicar(asientoOCalculo) -> Vista {cifra, base, origen, estado} (L2).
  // Composicion determinista de la traza (B4) y de la prueba (L7).
  async _explicar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const asientoOCalculo = (input && (input.asiento || input.calculo || input.objeto)) || null;
    if (!asientoOCalculo || typeof asientoOCalculo !== 'object') return this._invalid('asiento');

    const clave = asientoOCalculo.clave_natural || (input && input.clave_natural) || null;
    const noDisponibles = [];

    // Traza (B4) por EVENTO: QUIEN y CUANDO creo el asiento (registro inmutable).
    let traza = null;
    if (clave) {
      const resp = await this._rpc('contabilidad.traza.consultar.request',
        { project_id: pid, clave_natural: clave }, { timeout_ms: 4000 });
      if (resp && resp.status === 200 && resp.data && resp.data.hallada) {
        traza = resp.data.entrada || null;
      } else {
        noDisponibles.push('traza-asiento');
      }
    } else {
      noDisponibles.push('traza-asiento');
    }

    // Prueba (L7) por EVENTO: el documento origen archivado y enlazado a la cifra.
    let documento = null;
    const cifra = (input && input.cifra) || clave;
    if (cifra) {
      const resp = await this._rpc('contabilidad.expediente.recuperar.request',
        { project_id: pid, cifra }, { timeout_ms: 4000 });
      if (resp && resp.status === 200 && resp.data) {
        documento = resp.data.documento || resp.data.id_documento || null;
      } else {
        noDisponibles.push('expediente-documental');
      }
    } else {
      noDisponibles.push('expediente-documental');
    }

    const apuntes = Array.isArray(asientoOCalculo.apuntes) ? asientoOCalculo.apuntes
      : (Array.isArray(asientoOCalculo.lineas) ? asientoOCalculo.lineas : []);
    const debe = this._round(apuntes.reduce((t, a) => t + (Number(a && a.debe) || 0), 0), 2);
    const haber = this._round(apuntes.reduce((t, a) => t + (Number(a && a.haber) || 0), 0), 2);
    const cuadra = Math.abs(debe - haber) < 0.005;

    const vista = {
      cifra: {
        id: asientoOCalculo.id || null,
        clave_natural: clave,
        tipo: asientoOCalculo.tipo || null,
        debe,
        haber,
        total: this._round(Number(asientoOCalculo.total !== undefined ? asientoOCalculo.total : debe) || 0, 2)
      },
      base: {
        hechos: (asientoOCalculo.hecho && [asientoOCalculo.hecho]) || [],
        apuntes: apuntes.map((a) => ({ cuenta: a && a.cuenta, debe: this._round(Number(a && a.debe) || 0, 2), haber: this._round(Number(a && a.haber) || 0, 2) })),
        documento_origen: documento,
        prueba_disponible: !!documento
      },
      origen: {
        modulo: asientoOCalculo.origen || 'escritor-diario',
        regla: asientoOCalculo.regla || null,
        contrapartida: asientoOCalculo.contrapartida || null,
        asentado_por: (traza && traza.quien) || asientoOCalculo.asentado_por || null,
        asentado_en: (traza && traza.cuando) || asientoOCalculo.asentado_en || null,
        traza_inmutable: !!traza,
        secuencia_traza: (traza && traza.secuencia) || null
      },
      estado: {
        asentado: true,
        explicado: true,
        cuadra,
        prueba_disponible: !!documento,
        dependencias_no_disponibles: noDisponibles
      }
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        vista,
        caja_negra: false,
        determinista: true,
        dependencias_no_disponibles: noDisponibles,
        nota: 'TODO asiento/calculo EXPLICADO (cifra, base, origen, estado): no caja negra; el sistema DECLARA lo que no pudo probar'
      }
    };
  }

  // seleccionarMuestra(conjuntoAsientos) -> Muestra por senales DURAS DECLARADAS (L8).
  _seleccionarMuestra(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const asientos = (input && (input.asientos || input.conjunto || input.conjunto_asientos)) || [];
    if (!Array.isArray(asientos)) return this._invalid('asientos');

    const senalesDeclaradas = (input && input.senales) || {};
    const activas = Array.isArray(input && input.senales_activas) && input.senales_activas.length > 0
      ? input.senales_activas
      : SENALES_POR_DEFECTO;

    const umbral = (senalesDeclaradas.umbral_alto_importe !== undefined)
      ? Number(senalesDeclaradas.umbral_alto_importe)
      : (input && input.umbral_alto_importe !== undefined ? Number(input.umbral_alto_importe) : NaN);

    const muestra = [];
    for (const a of asientos) {
      const motivos = [];
      const apuntes = Array.isArray(a && a.apuntes) ? a.apuntes : [];
      let importe = 0;
      for (const ap of apuntes) {
        importe = Math.max(importe, Math.abs(this._apunteImporte(ap)));
      }

      if (activas.includes('ALTO_IMPORTE') && Number.isFinite(umbral) && importe >= umbral) motivos.push('ALTO_IMPORTE');
      if (activas.includes('SIN_REGLA') && (a && (a.sin_regla === true || a.regla === null || a.tiene_regla === false))) motivos.push('SIN_REGLA');
      if (activas.includes('CONTRAPARTIDA_NUEVA') && (a && a.contrapartida_nueva === true)) motivos.push('CONTRAPARTIDA_NUEVA');
      if (activas.includes('CUADRE_DUDOSO') && (a && (a.cuadre_dudoso === true || a.cuadra === false))) motivos.push('CUADRE_DUDOSO');

      if (motivos.length > 0) {
        muestra.push({
          id: (a && a.id) || null,
          clave_natural: (a && a.clave_natural) || null,
          tipo: (a && a.tipo) || null,
          importe,
          motivos
        });
      }
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        muestra,
        n: muestra.length,
        n_conjunto: asientos.length,
        tasa_muestra: asientos.length > 0 ? this._round(muestra.length / asientos.length, 4) : 0,
        criterios: {
          senales_activas: activas,
          umbral_alto_importe: Number.isFinite(umbral) ? umbral : null,
          umbral_declarado: Number.isFinite(umbral)
        },
        determinista: true,
        nota: 'seleccion por EXCEPCION y MUESTRA (no revisar todo): las senales son DURAS y DECLARADAS, nunca intuicion'
      }
    };
  }

  async _seleccionarMuestraEntrada(input) {
    return this._seleccionarMuestra(input);
  }

  // ── Tools ──
  toolExplicar(params) { return this._explicar(params); }
  toolSeleccionarMuestra(params) { return this._seleccionarMuestra(params); }
}

module.exports = VistaRevisable;
