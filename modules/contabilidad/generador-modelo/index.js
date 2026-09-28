/**
 * contabilidad/generador-modelo — PUENTE STATELESS (D7, hoja del plan).
 *
 * EL SISTEMA PREPARA; EL ASESOR PRESENTA. Aqui se GENERA el documento del modelo
 * fiscal (303/130/111/190...) a partir de las fuentes declarables
 * (`liquidacion-iva` D1/D2/D3, `retenciones-is-irpf` D4/D5) y se ENTREGA al
 * programa del asesor por PUERTO de formato ABIERTO y DECLARABLE. Termina aqui
 * la responsabilidad del sistema: NO presenta, NO firma, NO envia a ninguna
 * administracion — eso es del asesor (declarable). Si no hay puerto declarado,
 * se responde NO_DECLARADO, jamas se finge una presentacion.
 *
 * EL MODELO Y EL EJERCICIO SON DECLARABLES: el numero de modelo, el ejercicio y
 * el periodo son PARAMETROS (dato), no constantes cableadas. Los valores del
 * modelo se DERIVAN de las fuentes por EVENTO/payload; contrato TOLERANTE: si la
 * fuente no responde, se DECLARA y NUNCA se emite un modelo con cifras inventadas.
 *
 * PUENTE (patron real, stateless): sin PosPersistencia ni project.activated EN EL
 * CODIGO. Cada op entra objeto, sale objeto. El catalogo de puertos de salida
 * vive SOLO en memoria del proceso (registro de programas/formatos puestos en el
 * sitio), no en disco. Emisor/par de fallo: exito publica
 * contabilidad.modelo_generado y contabilidad.modelo_entregado; error su par
 * determinista. NO REUTILIZA: la generacion de modelos fiscales con puerto
 * abierto no existe; hay que construirlo.
 *
 * Ver hoja D7 del diseno-oop y bloque `generador-modelo` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Fuentes declarables por tipo de modelo (la LISTA orienta; el modelo es dato).
const FUENTES = {
  LIQUIDACION_IVA: ['303', '390', '390S'],
  RETENCIONES: ['111', '190', '115', '180'],
  RESUMEN: ['100', '200', '130', '131', '347']
};

class GeneradorModelo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'generador-modelo';
    this.version = 'reflejo-0.1.0';
    // Catalogo DECLARABLE de puertos de salida al programa del asesor: solo memoria.
    // nombre_puerto -> { formato, programa, adaptador }.
    this._puertos = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC ──
  onGenerarRequest(e) {
    return this._atender(e, 'generar', 'contabilidad.modelo.generar.response', async (d) => {
      const res = await this._generar(d);
      if (res.status !== 200) {
        this.eventBus?.publish('contabilidad.modelo.generar.failed', res);
        return res;
      }
      // El documento se GENERO: el sistema PREPARA. Publica el hecho de dominio.
      this.eventBus?.publish('contabilidad.modelo_generado', {
        ...res.data,
        correlation_id: d.correlation_id
      });
      // Y se ENTREGA al programa del asesor por PUERTO (formato declarable).
      const entrega = this._entregar({ ...d, documento: res.data.documento });
      if (entrega.status === 200) {
        this.eventBus?.publish('contabilidad.modelo_entregado', {
          ...entrega.data,
          correlation_id: d.correlation_id
        });
      } else if (entrega.error && entrega.error.code === 'NO_DECLARADO') {
        // Sin puerto declarado NO se finge la entrega: se declara y se avisa.
        this.eventBus?.publish('contabilidad.modelo_entregado.failed', entrega);
      } else {
        this.eventBus?.publish('contabilidad.modelo_entregado.failed', entrega);
      }
      return { ...res, data: { ...res.data, entrega: entrega.status === 200 ? entrega.data : null, entrega_declarada: entrega.status === 200 } };
    });
  }

  // ── proyecciones puras (deterministas) ──

  // generar(modelo) -> DocumentoModelo. Modelo y ejercicio DECLARABLES; los
  // valores se DERIVAN de las fuentes (nunca se inventan).
  async _generar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const modelo = String((input && (input.modelo || input.numero_modelo)) || '').trim();
    if (!modelo) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'el modelo no esta declarado: numero de modelo y ejercicio entran como DATO', {
          modelos_conocidos: { ...FUENTES }, no_declarado: true
        });
    }
    const ejercicio = (input && (input.ejercicio || input.periodo)) || null;
    if (!ejercicio) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'el ejercicio no esta declarado: el modelo se genera por periodo declarado', { no_declarado: true });
    }

    // Valores del modelo: en el payload (declarados/derivados) o LEIDOS de la
    // fuente por EVENTO. Sin fuente ni valores -> se declara, no se inventa.
    const valores = await this._valoresDe(pid, modelo, input);
    if (valores === null) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        `no hay valores para el modelo ${modelo}: la fuente (liquidacion-iva / retenciones-is-irpf) no respondio`, {
          modelo, dependencia: 'liquidacion-iva|retenciones-is-irpf', accion: 'NO_GENERAR_PUBLICAR_FALLO'
        });
    }

    const documento = {
      modelo,
      ejercicio,
      periodo: (input && input.periodo) || null,
      nif: (input && input.nif) || null,
      sociedad: (input && (input.sociedad || input.id_sociedad)) || null,
      casillas: valores.casillas,
      resumen: valores.resumen,
      formato: (input && input.formato) || 'ABIERTO',
      generado_en: new Date().toISOString(),
      preparado_por_el_sistema: true,
      presentado: false,
      firmado: false
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        modelo,
        ejercicio,
        documento,
        fuente: valores.fuente,
        prepara_no_presenta: true,
        determinista: true
      }
    };
  }

  // entregar(documento) -> ok | NO_DECLARADO (presentar es declarable; D34).
  _entregar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const documento = input && input.documento;
    if (!documento || typeof documento !== 'object') return this._invalid('documento');

    const nombrePuerto = (input && (input.puerto || input.programa)) || null;
    const puerto = nombrePuerto
      ? this._puertos.get(nombrePuerto)
      : (this._puertos.size === 1 ? [...this._puertos.values()][0] : null);

    if (!puerto) {
      return {
        status: 200,
        data: {
          project_id: pid,
          modelo: documento.modelo,
          entregado: false,
          no_declarado: true,
          simbolico: 'NO_DECLARADO',
          puertos_disponibles: [...this._puertos.keys()],
          prepara_no_presenta: true,
          nota: 'puerto de salida NO declarado: el sistema solo PREPARA; se declara el hueco, no se finge la presentacion'
        }
      };
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        modelo: documento.modelo,
        ejercicio: documento.ejercicio,
        entregado: true,
        puerto: nombrePuerto || puerto.nombre,
        formato: puerto.formato,
        programa: puerto.programa || null,
        prepara_no_presenta: true,
        presentado: false,
        firmado: false,
        entregado_en: new Date().toISOString()
      }
    };
  }

  // registrarPuerto(puerto) -> ok — el puerto de salida es DECLARABLE y abierto.
  _registrarPuerto(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const nombre = (input && (input.puerto || input.nombre)) || null;
    const formato = (input && input.formato) || null;
    if (!nombre) return this._invalid('puerto');
    if (!formato) return this._invalid('formato');
    const puerto = { nombre, formato, programa: (input && input.programa) || null, adaptador: (input && input.adaptador) || null };
    this._puertos.set(nombre, puerto);
    return { status: 200, data: { project_id: pid, puerto, registrado: true, puerto_abierto: true } };
  }

  // ── helpers internos ──

  // Casillas del modelo: payload `casillas`/`valores` o fuente por EVENTO. Nunca inventadas.
  async _valoresDe(pid, modelo, input) {
    const directas = input && (input.casillas || input.valores);
    if (directas && typeof directas === 'object') {
      return { casillas: directas, resumen: (input && input.resumen) || null, fuente: 'DECLARADAS' };
    }

    // Fuente por modelo: derivada de las hojas fiscales por EVENTO.
    if (FUENTES.LIQUIDACION_IVA.includes(modelo)) {
      const resp = await this._rpc('contabilidad.iva.liquidar.request', { project_id: pid, periodo: input && input.periodo }, { timeout_ms: 4000 });
      if (resp && resp.status === 200) {
        return { casillas: this._casillasDesdeLiquidacion(resp.data), resumen: resp.data, fuente: 'liquidacion-iva' };
      }
      return null;
    }
    if (FUENTES.RETENCIONES.includes(modelo)) {
      const resp = await this._rpc('contabilidad.retenciones.calcular.request', { project_id: pid, periodo: input && input.periodo }, { timeout_ms: 4000 });
      if (resp && resp.status === 200) {
        return { casillas: this._casillasDesdeRetenciones(resp.data), resumen: resp.data, fuente: 'retenciones-is-irpf' };
      }
      return null;
    }
    // Modelo de resumen: la base la aporta el resultado (C2).
    const resp = await this._rpc('contabilidad.estado.resultado.request', { project_id: pid, periodo: input && input.periodo }, { timeout_ms: 4000 });
    if (resp && resp.status === 200) {
      const r = resp.data && (resp.data.resultado || resp.data);
      return { casillas: { resultado: (r && (r.resultado ?? r.total)) ?? null }, resumen: r, fuente: 'estados-contables' };
    }
    return null;
  }

  _casillasDesdeLiquidacion(d) {
    const l = d && (d.liquidacion || d);
    return {
      iva_devengado: (l && l.devengado) ?? null,
      iva_deducible: (l && l.deducible) ?? null,
      resultado_liquidacion: (l && l.resultado) ?? null
    };
  }

  _casillasDesdeRetenciones(d) {
    return {
      retenciones_practicadas: (d && d.total_practicadas) ?? null,
      retenciones_soportadas: (d && d.total_soportadas) ?? null,
      neto: (d && d.neto) ?? null
    };
  }

  // ── Tools ──
  toolGenerar(params) { return this._generar(params); }
  toolEntregar(params) { return this._entregar(params); }
  toolRegistrarPuerto(params) { return this._registrarPuerto(params); }
}

module.exports = GeneradorModelo;
