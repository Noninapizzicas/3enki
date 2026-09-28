/**
 * contabilidad/inmovilizado — CUSTODIO (F1·F2·F3·F4, hoja del plan).
 *
 * EL BIEN DURADERO Y SU AMORTIZACION. Cuatro clases en una parcela:
 *   F1 AltaActivo        el alta se DECLARA, no se estima (un solo escritor).
 *   F2 PlanAmortizacion  la cuota se genera CUANDO TOCA (dispara en el cierre C4).
 *   F3 BajaActivo        la baja calcula el resultado y lo imputa: NO borra la
 *                        historia del bien, SUMA un asiento (espejo de B5).
 *   F4 ValorNetoContable coste − amortizacion acumulada, al balance (C1).
 *
 * LA LEY ENTRA COMO DATO: el metodo, el coeficiente, los anios y — sobre todo —
 * la TABLA DE AMORTIZACION son DECLARABLES. Ningun coeficiente esta cableado en
 * la logica: si no hay tabla ni parametros declarados, la cuota NO SE INVENTA
 * (NADA, con su motivo). Eso es la invariante de esta hoja: la amortizacion
 * DECLARABLE, jamas una constante de memoria.
 *
 * CUSTODIO (patron real): store en memoria (activos por id + secuencia de
 * cuotas/bajas append-only); PosPersistencia (storage
 * /contabilidad/inmovilizado/*.json); restaura en project.activated; flush en
 * onUnload. GUARD de un solo escritor: solo DUENO/ASESOR dan de alta el bien —
 * cualquier otro rol se rechaza con ERROR_DOS_ESCRITORES. Fire-and-forget:
 * contabilidad.cierre_realizado (C4) → dispara la cuota del periodo (solo en el
 * cierre de NIVEL 2, el mes del asesor) — la cuota se genera CUANDO TOCA.
 * Emisor/par de fallo: exito publica contabilidad.activo_dado_de_alta ·
 * contabilidad.amortizacion_generada · contabilidad.activo_dado_de_baja; error
 * su par determinista. La dependencia con escritor-diario (B2), mayor-balanza
 * (B3) y cola-declaraciones-criterio (K9) es por EVENTO, NUNCA por require
 * cruzado.
 * NO REUTILIZA: el inmovilizado y la amortizacion no existen en el inventario
 * (0 modulos); la amortizacion es un hecho que produce el TIEMPO y aqui se
 * genera en el cierre.
 *
 * Ver hoja F1-F4 del diseno-oop y bloque `inmovilizado` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Un solo escritor de la parcela del inmovilizado (F1): DUENO o ASESOR.
const ROLES_AUTORIZADOS = new Set(['DUENO', 'ASESOR']);

// Codigo simbolico determinista del cerrojo de escritor unico.
const CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES';

// Metodos de amortizacion posibles: catalogo DECLARABLE (no la ley cableada).
const METODOS = ['LINEAL', 'DEGRESIVA', 'FISCAL', 'PERSONALIZADA'];

// Marca de lo NO declarado: no se rellena, no se estima.
const MARCA_ABIERTO = 'ABIERTO';

// Rol unico del diario (B2) al enviar el asiento de amortizacion/baja.
const ROL_ESCRITOR_DIARIO = 'ADMISION';

// Tolerancia de centimos.
const EPS = 0.005;

class Inmovilizado extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'inmovilizado';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, activos:{}, cuotas:[], bajas:[] }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'inmovilizado.json',
      dir: '/contabilidad/inmovilizado',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.activos) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la parcela del inmovilizado del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onAltaRequest(e) {
    return this._atender(e, 'alta', 'contabilidad.activo.alta.response', async (d) => {
      const res = this._registrar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.activo_dado_de_alta', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.activo.alta.failed', res);
      }
      return res;
    });
  }

  onGenerarRequest(e) {
    return this._atender(e, 'generar', 'contabilidad.amortizacion.generar.response', async (d) => {
      const res = this._generarCuotaDePayload(d);
      if (res.status === 200 && res.data && res.data.generada) {
        const senal = await this._senalarAlDiario(d, res.data);
        if (senal.ok) {
          this.eventBus?.publish('contabilidad.amortizacion_generada', {
            ...res.data,
            senal_libro: senal.data || null,
            correlation_id: d.correlation_id
          });
        } else {
          this.eventBus?.publish('contabilidad.amortizacion_generada.failed', {
            status: senal.status || 503,
            error: senal.error || { code: 'DEPENDENCIA_NO_DISPONIBLE', message: 'escritor-diario (B2) no confirmo la cuota' },
            detalle: res.data
          });
        }
      } else if (res.status !== 200) {
        this.eventBus?.publish('contabilidad.amortizacion.generar.failed', res);
      }
      return res;
    });
  }

  onBajaRequest(e) {
    return this._atender(e, 'baja', 'contabilidad.activo.baja.response', async (d) => {
      const res = this._darDeBaja(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.activo_dado_de_baja', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.activo.baja.failed', res);
      }
      return res;
    });
  }

  onValor_netoRequest(e) {
    return this._atender(e, 'valor_neto', 'contabilidad.activo.valor_neto.response', async (d) => {
      const res = this._valorNetoDePayload(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.activo.valor_neto.failed', res);
      return res;
    });
  }

  // Fire-and-forget: cierre-ejercicio (C4) cerro un periodo → se dispara la
  // cuota de amortizacion del periodo. La cuota se genera CUANDO TOCA: solo en
  // el cierre de NIVEL 2 (el mes del asesor); el cierre de jornada (nivel 1) no
  // devenga amortizacion.
  onCierreRealizado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    if (Number(d.nivel || 0) === 1) {
      return { status: 200, data: { project_id: d.project_id, nivel: 1, amortiza: false, motivo: 'el cierre de jornada no devenga amortizacion' } };
    }
    return (async () => this._dispararEnCierre(d))();
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-inmovilizado-v1', activos: {}, cuotas: [], bajas: [], escritor: [...ROLES_AUTORIZADOS] };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // GUARD de un solo escritor (F1): solo DUENO/ASESOR dan de alta el bien.
  _verificarEscritorUnico(rol) {
    const r = String(rol || '').toUpperCase();
    if (!ROLES_AUTORIZADOS.has(r)) {
      return this._errorResponse(409, CODE_DOS_ESCRITORES,
        'la parcela del inmovilizado tiene UN escritor: solo DUENO/ASESOR dan de alta', {
          escritor_vigente: [...ROLES_AUTORIZADOS],
          rol_intentado: r || null,
          simbolico: CODE_DOS_ESCRITORES
        });
    }
    return null;
  }

  // registrar(rol, activo) -> ok (F1). El alta se DECLARA, no se estima.
  _registrar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const guard = this._verificarEscritorUnico(input && input.rol);
    if (guard) return guard;

    const activoIn = (input && (input.activo || input.bien)) || null;
    if (!activoIn || typeof activoIn !== 'object') return this._invalid('activo');

    const id = activoIn.id_activo || activoIn.id || activoIn.identificador || null;
    if (!id) return this._invalid('activo.id_activo');

    const valoracion = this._valorarAlta(activoIn);
    if (valoracion.status !== 200) return valoracion;

    const d = this._obtenerOCrear(pid);
    if (d.activos[id]) {
      return this._errorResponse(409, 'ERROR_DUPLICADO',
        `el activo ${id} ya esta dado de alta en la parcela: el alta se declara UNA vez`, {
          id_activo: id, simbolico: 'ERROR_DUPLICADO'
        });
    }

    const activo = {
      id_activo: String(id),
      descripcion: activoIn.descripcion || null,
      coste: valoracion.data.coste,
      gastos_activables: valoracion.data.gastos_activables,
      importe_alta: valoracion.data.importe_alta,
      valor_residual: valoracion.data.valor_residual,
      fecha_alta: activoIn.fecha_alta || null,
      cuenta: activoIn.cuenta || null,
      cuenta_amortizacion: activoIn.cuenta_amortizacion || null,
      // ── PARAMETROS DECLARABLES (la ley entra como DATO) ──
      metodo: activoIn.metodo ? String(activoIn.metodo).toUpperCase() : null,
      coeficiente: this._num(activoIn.coeficiente),
      anios: this._num(activoIn.anios),
      periodos_por_anio: this._num(activoIn.periodos_por_anio),
      tabla_amortizacion: Array.isArray(activoIn.tabla_amortizacion) ? activoIn.tabla_amortizacion : null,
      // ── estado derivado ──
      amortizacion_acumulada: 0,
      periodos_amortizados: [],
      baja: null,
      declarado_por: String((input && input.rol) || '').toUpperCase(),
      declarado_en: new Date().toISOString(),
      ley_cableada: false,
      borrable: false
    };
    if (activo.metodo && !METODOS.includes(activo.metodo)) {
      return this._errorResponse(422, 'METODO_NO_VALIDO',
        `metodo de amortizacion ${activo.metodo} fuera del catalogo declarable`, {
          metodos_posibles: METODOS, nota: 'el metodo es DECLARABLE; no hay ninguno cableado'
        });
    }
    d.activos[activo.id_activo] = activo;
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        activo,
        id_activo: activo.id_activo,
        importe_alta: activo.importe_alta,
        valor_neto: activo.importe_alta,
        tabla_declarada: !!activo.tabla_amortizacion,
        ley_cableada: false
      }
    };
  }

  // valorarAlta(activo) -> Importe (F1, reflejo hidratador). El alta no se
  // "estima": se DECLARA (coste + gastos activables declarados).
  _valorarAlta(input) {
    const activo = (input && (input.activo || input)) || {};
    const coste = this._num(activo.coste !== undefined ? activo.coste : activo.valor_adquisicion);
    if (coste === null || coste <= 0) return this._invalid('activo.coste');
    const gastos = this._num(activo.gastos_activables) || 0;
    const residual = this._num(activo.valor_residual) || 0;
    const importe = this._round(coste + gastos, 2);
    if (residual > importe) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'el valor residual declarado supera el importe del alta', { importe_alta: importe, valor_residual: residual });
    }
    return {
      status: 200,
      data: {
        coste: this._round(coste, 2),
        gastos_activables: this._round(gastos, 2),
        importe_alta: importe,
        valor_residual: this._round(residual, 2),
        base_amortizable: this._round(importe - residual, 2),
        estimada: false,
        declarada: true
      }
    };
  }

  // generarCuota(activo, periodo) -> AsientoAmortizacion | NADA (F2).
  // La tabla/coeficiente/anios son DECLARABLES: sin declaracion NO se inventa
  // la cuota (NADA, con su motivo).
  _generarCuota(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const id = input && (input.id_activo || input.activo_id || (input.activo && (input.activo.id_activo || input.activo.id)));
    if (!id) return this._invalid('id_activo');
    const periodo = (input && input.periodo) || null;

    const d = this._obtenerOCrear(pid);
    const activo = d.activos[id];
    if (!activo) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `el activo ${id} no esta en la parcela del inmovilizado`, { id_activo: id });
    }
    if (activo.baja) {
      return { status: 200, data: { project_id: pid, id_activo: id, periodo, generada: false, motivo: 'BIEN_DADO_DE_BAJA', nada: true } };
    }
    if (!periodo) return this._invalid('periodo');
    if (activo.periodos_amortizados.includes(String(periodo))) {
      return { status: 200, data: { project_id: pid, id_activo: id, periodo, generada: false, motivo: 'PERIODO_YA_AMORTIZADO', nada: true, idempotente: true } };
    }

    const base = this._round(activo.importe_alta - activo.valor_residual, 2);
    const pendiente = this._round(base - activo.amortizacion_acumulada, 2);
    if (pendiente <= EPS) {
      return { status: 200, data: { project_id: pid, id_activo: id, periodo, generada: false, motivo: 'BIEN_AMORTIZADO_DEL_TODO', nada: true } };
    }

    const cuota = this._cuotaDeclarada(activo, periodo, base);
    if (!cuota.declarada) {
      // Invariante: NINGUNA constante legal en la logica. Sin tabla ni
      // parametros declarados, la cuota NO se inventa.
      return {
        status: 200,
        data: {
          project_id: pid,
          id_activo: id,
          periodo,
          generada: false,
          nada: true,
          motivo: 'TABLA_NO_DECLARADA',
          parametros_declarables: ['tabla_amortizacion', 'metodo+coeficiente', 'metodo+anios'],
          ley_cableada: false
        }
      };
    }

    const importe = Math.min(cuota.importe, pendiente);
    return {
      status: 200,
      data: {
        project_id: pid,
        id_activo: id,
        periodo,
        generada: true,
        nada: false,
        importe: this._round(importe, 2),
        metodo: cuota.metodo,
        origen_cuota: cuota.origen,
        base_amortizable: base,
        amortizacion_acumulada_previa: activo.amortizacion_acumulada,
        amortizacion_acumulada: this._round(activo.amortizacion_acumulada + importe, 2),
        asiento: this._asientoAmortizacion(activo, importe, periodo),
        ley_cableada: false
      }
    };
  }

  // La cuota DECLARADA (tabla explicita o parametros declarados). Determinista.
  _cuotaDeclarada(activo, periodo, base) {
    const tabla = Array.isArray(activo.tabla_amortizacion) ? activo.tabla_amortizacion : null;
    if (tabla) {
      const fila = tabla.find((f) => f && String(f.periodo) === String(periodo));
      if (fila) {
        const imp = this._num(fila.cuota !== undefined ? fila.cuota : fila.importe);
        if (imp !== null) return { declarada: true, importe: this._round(imp, 2), metodo: 'TABLA_DECLARADA', origen: 'tabla_amortizacion' };
      }
      // Tabla declarada pero SIN fila para ese periodo: no se extrapola.
      return { declarada: false };
    }

    const metodo = activo.metodo;
    if (!metodo) return { declarada: false };

    let anual = null;
    if (activo.anios !== null && activo.anios > 0) anual = base / activo.anios;
    else if (activo.coeficiente !== null && activo.coeficiente > 0) anual = base * (activo.coeficiente / 100);
    if (anual === null) return { declarada: false };

    // El reparto por periodo es DECLARABLE: sin periodos_por_anio declarado,
    // el periodo devengado ES el anual (no se asume un numero de periodos).
    const pxa = activo.periodos_por_anio !== null && activo.periodos_por_anio > 0 ? activo.periodos_por_anio : 1;
    return {
      declarada: true,
      importe: this._round(anual / pxa, 2),
      metodo,
      origen: activo.anios !== null && activo.anios > 0 ? 'metodo+anios' : 'metodo+coeficiente'
    };
  }

  // asientoAmortizacion: debe = cuenta de amortizacion acumulada; haber = gasto.
  _asientoAmortizacion(activo, importe, periodo) {
    const cuentaGasto = activo.cuenta_amortizacion || activo.cuenta || null;
    const cuentaAcumulada = activo.cuenta_amortizacion_acumulada || `AMORTIZACION_ACUMULADA:${activo.id_activo}`;
    return {
      tipo: 'AMORTIZACION',
      origen: 'F2_INMOVILIZADO',
      periodo: periodo || null,
      id_activo: activo.id_activo,
      apuntes: [
        { cuenta: cuentaGasto, debe: this._round(importe, 2), haber: 0 },
        { cuenta: cuentaAcumulada, debe: 0, haber: this._round(importe, 2) }
      ],
      debe: this._round(importe, 2),
      haber: this._round(importe, 2),
      borra_historia: false,
      suma: true
    };
  }

  // dispararEnCierre(cierre) -> ok (F2: la cuota se genera CUANDO TOCA).
  async _dispararEnCierre(cierre) {
    const pid = cierre && cierre.project_id;
    if (!pid) return this._invalid('project_id');
    const periodo = (cierre && (cierre.clave_natural || cierre.periodo)) || null;
    const d = this._obtenerOCrear(pid);
    const resultados = [];

    for (const activo of Object.values(d.activos)) {
      const res = this._generarCuota({ project_id: pid, id_activo: activo.id_activo, periodo });
      if (res.status !== 200) {
        this.eventBus?.publish('contabilidad.amortizacion_generada.failed', { ...res, id_activo: activo.id_activo });
        resultados.push({ id_activo: activo.id_activo, generada: false, motivo: 'ERROR' });
        continue;
      }
      if (!res.data.generada) {
        resultados.push({ id_activo: activo.id_activo, generada: false, motivo: res.data.motivo });
        continue;
      }
      const senal = await this._senalarAlDiario({ project_id: pid, correlation_id: cierre.correlation_id }, res.data);
      if (senal.ok) {
        this._anotarCuota(pid, d, res.data);
        this.eventBus?.publish('contabilidad.amortizacion_generada', {
          ...res.data,
          senal_libro: senal.data || null,
          correlation_id: cierre.correlation_id
        });
        resultados.push({ id_activo: activo.id_activo, generada: true, importe: res.data.importe });
      } else {
        this.eventBus?.publish('contabilidad.amortizacion_generada.failed', {
          status: senal.status || 503,
          error: senal.error || { code: 'DEPENDENCIA_NO_DISPONIBLE', message: 'escritor-diario (B2) no confirmo la cuota' },
          detalle: { ...res.data, id_activo: activo.id_activo }
        });
        resultados.push({ id_activo: activo.id_activo, generada: false, motivo: 'LIBRO_NO_CONFIRMA' });
      }
    }
    return { status: 200, data: { project_id: pid, periodo, disparadas: resultados.filter((r) => r.generada).length, resultados } };
  }

  // anota la cuota en la secuencia append-only de la parcela (nunca se borra).
  _anotarCuota(pid, d, data) {
    const activo = d.activos[data.id_activo];
    if (!activo) return null;
    activo.amortizacion_acumulada = data.amortizacion_acumulada;
    activo.periodos_amortizados.push(String(data.periodo));
    const cuota = {
      id_activo: data.id_activo,
      periodo: data.periodo,
      importe: data.importe,
      metodo: data.metodo,
      origen_cuota: data.origen_cuota,
      amortizacion_acumulada: data.amortizacion_acumulada,
      asiento: data.asiento,
      anotada_en: new Date().toISOString(),
      borrable: false
    };
    d.cuotas.push(cuota);
    d.updated_at = cuota.anotada_en;
    this._persist.marcarDirty(pid);
    return cuota;
  }

  // calcularResultadoBaja(activo) -> Perdida | Beneficio (F3). Determinista.
  _calcularResultadoBaja(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const id = input && (input.id_activo || (input.activo && (input.activo.id_activo || input.activo.id)));
    if (!id) return this._invalid('id_activo');

    const d = this._obtenerOCrear(pid);
    const activo = d.activos[id];
    if (!activo) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `el activo ${id} no esta en la parcela del inmovilizado`, { id_activo: id });
    }

    const vnc = this._round(activo.importe_alta - activo.amortizacion_acumulada, 2);
    const recuperado = this._num(input && input.valor_recuperado) !== null
      ? this._num(input.valor_recuperado)
      : (activo.valor_recuperado !== undefined && activo.valor_recuperado !== null ? this._num(activo.valor_recuperado) : null);

    // [ABIERTO]: si no se declara lo recuperado, NO se asume cero.
    if (recuperado === null) {
      return {
        status: 200,
        data: {
          project_id: pid,
          id_activo: id,
          valor_neto_contable: vnc,
          valor_recuperado: null,
          valor_recuperado_marca: MARCA_ABIERTO,
          resultado: null,
          clase: null,
          calculable: false,
          motivo: 'VALOR_RECUPERADO_NO_DECLARADO',
          nota: 'lo no declarado NO se asume cero'
        }
      };
    }

    const resultado = this._round(recuperado - vnc, 2);
    return {
      status: 200,
      data: {
        project_id: pid,
        id_activo: id,
        valor_neto_contable: vnc,
        valor_recuperado: this._round(recuperado, 2),
        resultado,
        // >0 = beneficio; <0 = perdida; ==0 = sin resultado.
        clase: resultado > EPS ? 'BENEFICIO' : (resultado < -EPS ? 'PERDIDA' : 'SIN_RESULTADO'),
        calculable: true,
        borra_historia: false,
        determinista: true
      }
    };
  }

  // imputar(resultado) -> Asiento (F3). La baja NO borra la historia del bien:
  // SUMA un asiento (espejo de B5).
  _imputar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const resultado = (input && input.resultado) || {};
    const id = resultado.id_activo || (input && input.id_activo);
    if (!id) return this._invalid('id_activo');

    const d = this._obtenerOCrear(pid);
    const activo = d.activos[id];
    if (!activo) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `el activo ${id} no esta en la parcela del inmovilizado`, { id_activo: id });
    }
    if (!resultado.calculable) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'no se imputa una baja cuyo resultado no es calculable (valor recuperado sin declarar)', {
          id_activo: id, marca: MARCA_ABIERTO
        });
    }

    const vnc = this._round(resultado.valor_neto_contable, 2);
    const recuperado = this._round(resultado.valor_recuperado, 2);
    const rdo = this._round(resultado.resultado, 2);
    const cuentaBien = input.cuenta_bien || activo.cuenta || null;
    const cuentaAcumulada = input.cuenta_amortizacion_acumulada || activo.cuenta_amortizacion_acumulada || `AMORTIZACION_ACUMULADA:${activo.id_activo}`;
    const cuentaResultado = input.cuenta_resultado || activo.cuenta_resultado || `RESULTADO_BAJA:${activo.id_activo}`;
    const cuentaCobro = input.cuenta_cobro || activo.cuenta_cobro || `TESORERIA:${activo.id_activo}`;

    // Reparto determinista: baja el bien por su importe, cancela la acumulada,
    // reconoce lo recuperado y lleva el resultado al rdo.
    const apuntes = [
      { cuenta: cuentaAcumulada, debe: this._round(activo.amortizacion_acumulada, 2), haber: 0 },
      { cuenta: cuentaCobro, debe: recuperado, haber: 0 },
      { cuenta: cuentaBien, debe: 0, haber: activo.importe_alta }
    ];
    if (rdo >= 0) apuntes.push({ cuenta: cuentaResultado, debe: 0, haber: rdo });
    else apuntes.push({ cuenta: cuentaResultado, debe: this._round(-rdo, 2), haber: 0 });

    const asiento = {
      tipo: 'BAJA_INMOVILIZADO',
      origen: 'F3_INMOVILIZADO',
      id_activo: activo.id_activo,
      apuntes,
      debe: this._round(apuntes.reduce((s, a) => s + (Number(a.debe) || 0), 0), 2),
      haber: this._round(apuntes.reduce((s, a) => s + (Number(a.haber) || 0), 0), 2),
      clave_original: `inmovilizado:${activo.id_activo}`,
      borra_historia: false,
      suma: true
    };
    const cuadra = Math.abs(asiento.debe - asiento.haber) <= EPS;

    return {
      status: 200,
      data: {
        project_id: pid,
        id_activo: activo.id_activo,
        asiento,
        cuadrado: cuadra,
        valor_neto_contable: vnc,
        valor_recuperado: recuperado,
        resultado: rdo,
        clase: resultado.clase,
        borra_historia: false,
        suma: true,
        nota: 'la baja no borra la historia del bien: suma un asiento'
      }
    };
  }

  // darDeBaja(rol, activo, valorRecuperado) -> ok (F3 + F4).
  _darDeBaja(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const guard = this._verificarEscritorUnico(input && input.rol);
    if (guard) return guard;

    const id = input && (input.id_activo || (input.activo && (input.activo.id_activo || input.activo.id)));
    if (!id) return this._invalid('id_activo');

    const d = this._obtenerOCrear(pid);
    const activo = d.activos[id];
    if (!activo) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `el activo ${id} no esta en la parcela del inmovilizado`, { id_activo: id });
    }
    if (activo.baja) {
      return this._errorResponse(409, 'ERROR_DUPLICADO',
        `el activo ${id} ya esta dado de baja: la historia del bien no se reescribe`, {
          id_activo: id, baja_existente: activo.baja, simbolico: 'ERROR_DUPLICADO'
        });
    }

    const calculo = this._calcularResultadoBaja({ project_id: pid, id_activo: id, valor_recuperado: input.valor_recuperado });
    const imputacion = this._imputar({
      project_id: pid,
      resultado: calculo.data,
      cuenta_resultado: input.cuenta_resultado,
      cuenta_cobro: input.cuenta_cobro,
      cuenta_bien: input.cuenta_bien
    });

    const baja = {
      id_activo: String(id),
      fecha_baja: input.fecha_baja || null,
      motivo: input.motivo || null,
      valor_neto_contable: calculo.data.valor_neto_contable,
      valor_recuperado: calculo.data.valor_recuperado,
      valor_recuperado_marca: calculo.data.valor_recuperado_marca || null,
      resultado: calculo.data.resultado,
      clase: calculo.data.clase,
      asiento: imputacion.status === 200 ? imputacion.data.asiento : null,
      imputado: imputacion.status === 200,
      declarado_por: String(input.rol || '').toUpperCase(),
      declarada_en: new Date().toISOString(),
      borra_historia: false,
      suma: true
    };
    activo.baja = baja;
    activo.de_baja = true;
    d.bajas.push(baja);
    d.updated_at = baja.declarada_en;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        id_activo: String(id),
        baja,
        asiento: baja.asiento,
        resultado: baja.resultado,
        clase: baja.clase,
        calculable: calculo.data.calculable,
        borra_historia: false,
        suma: true,
        historial_intacto: true
      }
    };
  }

  // calcular(activo) -> Importe (F4): coste − amortizacion acumulada (al balance C1).
  _calcularValorNeto(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const id = input && (input.id_activo || (input.activo && (input.activo.id_activo || input.activo.id)));
    if (!id) return this._invalid('id_activo');

    const d = this._obtenerOCrear(pid);
    const activo = d.activos[id];
    if (!activo) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `el activo ${id} no esta en la parcela del inmovilizado`, { id_activo: id });
    }

    const valorNeto = this._round(activo.importe_alta - activo.amortizacion_acumulada, 2);
    return {
      status: 200,
      data: {
        project_id: pid,
        id_activo: activo.id_activo,
        importe_alta: activo.importe_alta,
        amortizacion_acumulada: activo.amortizacion_acumulada,
        valor_neto_contable: valorNeto,
        de_baja: !!activo.baja,
        determinista: true,
        destino: 'estados-contables (C1)'
      }
    };
  }

  // ── resolucion de payload (id | activo inline) ──
  _generarCuotaDePayload(d) {
    const pid = d && d.project_id;
    if (!pid) return this._invalid('project_id');
    let id = d.id_activo || d.activo_id || (d.activo && (d.activo.id_activo || d.activo.id));
    if (!id && d.activo && d.activo.id_activo === undefined && d.activo.coste !== undefined) {
      // Alta + cuota en un paso: el bien declarado entra primero (un solo escritor).
      const alta = this._registrar({ project_id: pid, rol: d.rol, activo: d.activo });
      if (alta.status !== 200) return alta;
      id = alta.data.id_activo;
    }
    return this._generarCuota({ project_id: pid, id_activo: id, periodo: d.periodo });
  }

  _valorNetoDePayload(d) {
    const pid = d && d.project_id;
    if (!pid) return this._invalid('project_id');
    let id = d.id_activo || (d.activo && (d.activo.id_activo || d.activo.id));
    if (!id && d.activo && d.activo.coste !== undefined) {
      const alta = this._registrar({ project_id: pid, rol: d.rol, activo: d.activo });
      if (alta.status !== 200) return alta;
      id = alta.data.id_activo;
    }
    return this._calcularValorNeto({ project_id: pid, id_activo: id });
  }

  // señalAlDiario(asiento) -> se ENVIA a B2 por EVENTO (aqui no se escribe el libro).
  async _senalarAlDiario(d, data) {
    const pid = (d && d.project_id) || (data && data.project_id);
    if (!pid) return { ok: false, status: 400, error: { code: 'INVALID_INPUT', message: 'project_id requerido' } };
    const asiento = data && data.asiento;
    if (!asiento) return { ok: false, status: 422, error: { code: 'PRECONDITION_FAILED', message: 'no hay asiento que asentar' } };

    const resp = await this._rpc('contabilidad.asiento.asentar.request', {
      project_id: pid,
      rol: ROL_ESCRITOR_DIARIO,
      asiento,
      clave_natural: asiento.clave_natural || null
    }, { timeout_ms: 5000 });

    if (!resp || resp.status !== 200) {
      return {
        ok: false,
        status: (resp && resp.status) || 503,
        error: (resp && resp.error) || { code: 'DEPENDENCIA_NO_DISPONIBLE', message: 'escritor-diario (B2) no respondio' }
      };
    }
    return { ok: true, data: { asiento: (resp.data && resp.data.asiento) || null, clave_natural: (resp.data && resp.data.clave_natural) || null } };
  }

  _num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolRegistrar(params) { return this._registrar(params); }
  toolValorarAlta(params) { return this._valorarAlta(params); }
  toolGenerarCuota(params) { return this._generarCuota(params); }
  toolDispararEnCierre(params) { return this._dispararEnCierre(params); }
  toolCalcularResultadoBaja(params) { return this._calcularResultadoBaja(params); }
  toolImputar(params) { return this._imputar(params); }
  toolCalcularValorNeto(params) { return this._calcularValorNeto(params); }
}

module.exports = Inmovilizado;
