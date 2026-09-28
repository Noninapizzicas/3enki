/**
 * contabilidad/rectificacion-declaracion — CUSTODIO (D14, hoja del plan).
 *
 * EL PLANO 4 DE LA CORRECCION: la correccion POSTERIOR A LA PRESENTACION. Tres
 * planos ya existen y NINGUNO es este:
 *   · B5 asiento-ajuste   corrige el LIBRO (el ajuste SUMA sobre el asiento).
 *   · O2 rectificativa    corrige la FACTURA (comercial).
 *   · D13 acuse           liga el justificante.
 * Aqui se corrige la DECLARACION YA PRESENTADA: complementaria (anade lo que
 * faltaba) o sustitutiva (reemplaza lo presentado). NO se confunden.
 *
 * LA MISMA LEY DEL ASIENTO: el original NO SE BORRA. La rectificacion SUMA una
 * declaracion nueva que QUEDA ENLAZADA a la original (enlaza_original:true,
 * borra_original:false) y TRAZADA en el historial. El original sigue siendo el
 * original: lo que cambia es lo que se declara DESDE EL.
 *
 * Y NO SE RECTIFICA LO QUE NO SE PRESENTO: la rectificacion es posterior a la
 * presentacion, asi que se LEE el estado de la obligacion en
 * estado-presentacion-fiscal (D12) por EVENTO (contrato TOLERANTE). Si D12 no
 * responde, NO se afirma nada: se declara que no consta que este presentada; si
 * consta que NO esta presentada, se rechaza con ERROR_NO_PRESENTADA (lo que
 * procede entonces es corregir el borrador, no rectificar).
 *
 * CUSTODIO (patron real): store en memoria (rectificaciones por id + enlaces
 * original→rectificaciones + secuencia append-only); PosPersistencia (storage
 * /contabilidad/rectificacion-declaracion/*.json); restaura en
 * project.activated; flush en onUnload. GUARD de un solo escritor: solo el
 * ASESOR rectifica — cualquier otro se rechaza con ERROR_DOS_ESCRITORES.
 * Emisor/par de fallo: exito publica contabilidad.declaracion_rectificada; error
 * su par determinista. La dependencia con escritor-diario (B2) es por EVENTO
 * (aqui no se escribe el libro).
 * NO REUTILIZA: la rectificacion fiscal posterior a la presentacion no existe en
 * el inventario.
 *
 * Ver hoja D14 del diseno-oop y bloque `rectificacion-declaracion` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Un solo escritor de la rectificacion (D14): el ASESOR presenta, el ASESOR rectifica.
const ROL_ESCRITOR = 'ASESOR';

// Codigos simbolicos deterministas de los cerrojos (clase D14).
const CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES';
const CODE_NO_PRESENTADA = 'ERROR_NO_PRESENTADA';
const CODE_DUPLICADA = 'ERROR_DUPLICADO';

// Los DOS tipos de rectificacion: complementaria (anade) | sustitutiva (reemplaza).
const TIPOS = ['COMPLEMENTARIA', 'SUSTITUTIVA'];

class RectificacionDeclaracion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'rectificacion-declaracion';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, rectificaciones:{}, enlaces:{}, secuencia:[] }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'rectificacion-declaracion.json',
      dir: '/contabilidad/rectificacion-declaracion',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.rectificaciones) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura las rectificaciones y sus enlaces del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onRectificarRequest(e) {
    return this._atender(e, 'rectificar', 'contabilidad.declaracion.rectificar.response', async (d) => {
      const res = await this._rectificarConEstado(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.declaracion_rectificada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.declaracion.rectificar.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = {
        esquema: 'contabilidad-rectificacion-declaracion-v1',
        rectificaciones: {},
        enlaces: {},
        secuencia: [],
        escritor: ROL_ESCRITOR
      };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // GUARD de un solo escritor (D14): solo el ASESOR rectifica.
  _verificarEscritorUnico(rol) {
    const r = String(rol || '').toUpperCase();
    if (r !== ROL_ESCRITOR) {
      return this._errorResponse(409, CODE_DOS_ESCRITORES,
        'la rectificacion de una declaracion tiene UN escritor: solo el ASESOR rectifica', {
          escritor_vigente: ROL_ESCRITOR,
          rol_intentado: r || null,
          simbolico: CODE_DOS_ESCRITORES
        });
    }
    return null;
  }

  // claveDe(declaracion) -> identidad de la declaracion original.
  _claveDe(decl) {
    if (!decl) return null;
    if (typeof decl === 'string') return decl;
    return decl.id_declaracion || decl.clave_natural || decl.id_obligacion || decl.obligacion || null;
  }

  // rectificar(declaracionOriginal, tipo) -> Rectificacion. Un solo escritor (ASESOR).
  // El original NO se borra: la rectificacion SUMA y queda enlazada y trazada.
  _rectificar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const guard = this._verificarEscritorUnico(input && input.rol);
    if (guard) return guard;

    const declOriginal = (input && (input.declaracion_original || input.declaracion || input.original)) || null;
    const claveOriginal = this._claveDe(declOriginal) || (input && input.id_declaracion) || null;
    if (!claveOriginal) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'la rectificacion no declara la declaracion original a la que apunta: se declara, no se asume', {
          senal: 'ORIGINAL_NO_DECLARADO', asumido: false
        });
    }

    const tipo = String((input && (input.tipo || input.tipo_rectificacion)) || '').toUpperCase();
    if (!tipo) return this._invalid('tipo');
    if (!TIPOS.includes(tipo)) {
      return this._errorResponse(422, 'TIPO_NO_VALIDO',
        `tipo de rectificacion ${tipo} fuera del catalogo (COMPLEMENTARIA | SUSTITUTIVA)`, {
          tipos_posibles: TIPOS, nota: 'la rectificacion es POSTERIOR a la presentacion; no es el ajuste contable (B5)'
        });
    }

    // El tipo declarado define si AN ACE o si REEMPLAZA: se declara, no se infiere.
    const suma = tipo === 'COMPLEMENTARIA';
    const reemplaza = tipo === 'SUSTITUTIVA';

    const importesNuevos = (input && input.importes) || null;
    const rectificacion = {
      id_rectificacion: (input && input.id_rectificacion)
        || `${pid}-R${this._obtenerOCrear(pid).secuencia.length + 1}`,
      clave_original: String(claveOriginal),
      tipo,
      // Plano 4 de los 4 planos de correccion: NO se confunde con los otros.
      plano: 4,
      no_es_ajuste_contable: true,
      no_es_rectificativa_comercial: true,
      modelo: (input && input.modelo) || (declOriginal && declOriginal.modelo) || null,
      periodo: (input && input.periodo) || (declOriginal && declOriginal.periodo) || null,
      ejercicio: (input && input.ejercicio) || (declOriginal && declOriginal.ejercicio) || null,
      importes: importesNuevos,
      importes_originales: (declOriginal && declOriginal.importes) || (input && input.importes_originales) || null,
      motivo: (input && input.motivo) || null,
      // LA MISMA LEY DEL ASIENTO: el original no se borra.
      suma,
      reemplaza,
      borra_original: false,
      original_intacto: true,
      // Queda ENLAZADA a la original y TRAZADA en la secuencia.
      enlaza_original: true,
      rectificado_por: ROL_ESCRITOR,
      rectificado_en: new Date().toISOString(),
      borrable: false
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        rectificacion,
        clave_original: String(claveOriginal),
        tipo,
        borra_original: false,
        original_intacto: true,
        suma,
        reemplaza,
        plano: 4,
        regla: 'el original NO se borra: la rectificacion SUMA y queda trazada'
      }
    };
  }

  // enlazar(original, rectificacion) -> ok. La rectificacion queda enlazada y
  // TRAZADA; el original se conserva tal cual.
  _enlazar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rectificacion = (input && input.rectificacion) || null;
    if (!rectificacion || typeof rectificacion !== 'object') return this._invalid('rectificacion');

    const claveOriginal = rectificacion.clave_original
      || this._claveDe(input && input.original)
      || null;
    if (!claveOriginal) return this._invalid('clave_original');

    const d = this._obtenerOCrear(pid);
    const id = rectificacion.id_rectificacion;
    if (d.rectificaciones[id]) {
      return this._errorResponse(409, CODE_DUPLICADA,
        `la rectificacion ${id} ya esta enlazada: el original no se reescribe`, {
          id_rectificacion: id, clave_original: String(claveOriginal), simbolico: CODE_DUPLICADA
        });
    }

    d.rectificaciones[id] = rectificacion;
    if (!d.enlaces[claveOriginal]) {
      d.enlaces[claveOriginal] = {
        clave_original: String(claveOriginal),
        original: (input && input.original) || null,
        rectificaciones: [],
        // El original NO se borra ni se reemplaza en la traza.
        original_conservado: true,
        borrado: false
      };
    }
    d.enlaces[claveOriginal].rectificaciones.push(id);
    d.secuencia.push({
      id_rectificacion: id,
      clave_original: String(claveOriginal),
      tipo: rectificacion.tipo,
      suma: !!rectificacion.suma,
      reemplaza: !!rectificacion.reemplaza,
      borra_original: false,
      enlazada_en: new Date().toISOString()
    });
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        id_rectificacion: id,
        clave_original: String(claveOriginal),
        enlace: d.enlaces[claveOriginal],
        n_rectificaciones: d.enlaces[claveOriginal].rectificaciones.length,
        original_intacto: true,
        borra_original: false,
        trazada: true
      }
    };
  }

  // rectificar + verificacion del estado de presentacion (D12) por EVENTO.
  // NO se rectifica lo que NO se presento: la rectificacion es POSTERIOR.
  async _rectificarConEstado(d) {
    const res = this._rectificar(d);
    if (res.status !== 200) return res;

    const consta = await this._constaPresentada(d.project_id, res.data.clave_original, d);
    if (!consta.ok) {
      // D12 no responde: NO se afirma que este presentada. Se declara y NO se
      // inventa el permiso de rectificar.
      if (consta.motivo === 'SIN_RESPUESTA') {
        // contrato TOLERANTE: se declara la dependencia, no se asume.
        this.eventBus?.publish('contabilidad.declaracion_rectificar.failed', {
          status: 503,
          error: {
            code: 'DEPENDENCIA_NO_DISPONIBLE',
            message: 'estado-presentacion-fiscal (D12) no respondio: NO consta que la declaracion este presentada',
            details: { dependencia: 'estado-presentacion-fiscal', clave_original: res.data.clave_original }
          },
          correlation_id: d && d.correlation_id
        });
        return res;
      }
      // Consta que NO esta presentada: lo que procede es corregir el borrador.
      return this._errorResponse(409, CODE_NO_PRESENTADA,
        `la declaracion ${res.data.clave_original} no consta presentada: la rectificacion es POSTERIOR a la presentacion`, {
          clave_original: res.data.clave_original,
          estado: consta.estado || null,
          simbolico: CODE_NO_PRESENTADA,
          accion: 'CORREGIR_EL_BORRADOR (no rectificar)',
          rectificable: false
        });
    }

    const enlace = this._enlazar({ project_id: d.project_id, rectificacion: res.data.rectificacion, original: d.declaracion_original });
    if (enlace.status !== 200) return enlace;
    res.data.enlace = enlace.data.enlace;
    res.data.estado_original = consta.estado;
    res.data.presentada_verificada = true;
    return res;
  }

  // constaPresentada(clave) -> {ok, estado?, motivo?}. LEE D12 por EVENTO.
  async _constaPresentada(pid, clave, d) {
    const resp = await this._rpc('contabilidad.obligacion.estado.request', {
      project_id: pid,
      obligacion: clave
    }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200) return { ok: false, motivo: 'SIN_RESPUESTA' };

    const data = resp.data || {};
    const estado = String(data.estado || '').toUpperCase();
    // Rectificable si ya se presento (PRESENTADA o JUSTIFICADA); ATRASADA no.
    if (estado === 'PRESENTADA' || estado === 'JUSTIFICADA') return { ok: true, estado };
    return { ok: false, motivo: 'NO_PRESENTADA', estado: estado || null };
  }

  // ── Tools ──
  toolRectificar(params) { return this._rectificar(params); }
  toolEnlazar(params) { return this._enlazar(params); }
}

module.exports = RectificacionDeclaracion;
