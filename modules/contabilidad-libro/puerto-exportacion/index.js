/**
 * contabilidad-libro/puerto-exportacion — CONVERSOR STATELESS (L1, hoja del plan).
 *
 * **LA FRONTERA DE SALIDA HACIA EL ASESOR.** Convierte el libro/derivado canonico al FORMATO
 * ESTANDAR que el programa del asesor entiende (`salir`), y convierte de vuelta los AJUSTES
 * que el asesor devuelve (`entrar`) a asientos propuestos que el libro pueda admitir.
 *
 * Cruza FORMATO, NO DECIDE CONTENIDO: no reinterpreta cifras, no recalcula saldos, no juzga
 * si un ajuste es correcto ni valida su contrapartida (eso es del libro y de regla-contrapartida).
 * Solo serializa lo que le dan y deserializa lo que le llega; la DECISION sigue siendo del asesor.
 *
 * ATRIBUTOS del diseno: `formato:ParametroDeclarable`.
 * METODOS: `salir(libro):Externo`, `entrar(ajustes):Set<Asiento>`.
 *
 * LA LEY ENTRA COMO DATO (invariante 5): el `formato` (y su version, su juego de caracteres, su
 * separador decimal, su mapeo de campos) son DECLARABLES y entran como DATO. NO hay ningun
 * formato de asesor cableado. Sin formato declarado NO se convierte; un formato sin mapeo y sin
 * ser canonico se rechaza (422 FORMATO_NO_DECLARABLE).
 *
 * Invariante: dato ausente = desconocido. Un campo que no venga del origen queda `null` y se
 * declara en `abierto` (jamas se estima ni se completa por defecto).
 *
 * NOTA DE REUTILIZACION (documentada en el plan, §Reutilizacion): en el repo existe
 * `facturacion/asesoria` (v2.0.0), que empaqueta FACTURAS PROCESADAS en CSV+ZIP para el asesor
 * y publica `asesoria.paquete.generado`. Su contrato NO encaja con L1: no exporta el LIBRO ni
 * cruza formatos contables estandar, y su evento no es el de este puerto. Por eso L1 se CONSTRUYE
 * (reutilizando su PATRON de paquete/mapeo declarable), SIN adaptar ni tocar `facturacion/asesoria`.
 *
 * Forma: CONVERSOR → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja L1 del plan-construccion y diseno-oop.md (CLASE PuertoExportacion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Campos canonicos de un movimiento/asiento exportable. Su ORIGEN externo es declarable (mapeo).
const CAMPOS_ASIENTO = ['numero', 'fecha', 'clave_natural', 'sociedad', 'concepto', 'cuenta', 'debe', 'haber', 'importe', 'signo', 'descripcion', 'referencia'];

class PuertoExportacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-exportacion';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onSalirRequest(e) {
    return this._atender(e, 'salir', 'puerto-exportacion.salir.response', (d) => {
      const res = this._salir(d);
      if (res.status !== 200) this.eventBus?.publish('puerto-exportacion.salir.failed', res);
      return res;
    });
  }

  onEntrarRequest(e) {
    return this._atender(e, 'entrar', 'puerto-exportacion.entrar.response', (d) => {
      const res = this._entrar(d);
      if (res.status !== 200) this.eventBus?.publish('puerto-exportacion.entrar.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // SALIR: libro/derivado canonico → Externo (formato declarado del asesor)
  // ══════════════════════════════════════════════════════════════════════
  _salir(input = {}) {
    const pid = input.project_id || this.project_id || null;

    // El FORMATO es DECLARABLE: sin formato no se adivina el formato de ningun asesor.
    const formato = input.formato != null ? String(input.formato).trim()
      : (input.canal != null ? String(input.canal).trim() : '');
    if (!formato) {
      return this._errorResponse(400, 'FORMATO_NO_DECLARADO',
        'hay que declarar el formato de salida (el del programa del asesor)',
        { formatos_declarables: this._formatos(input) });
    }

    const formato_def = this._resolverFormato(input, formato);
    if (!formato_def) {
      return this._errorResponse(422, 'FORMATO_NO_DECLARABLE',
        'el formato declarado no tiene mapeo y no es un formato canonico',
        { formato, motivo: 'sin mapeo declarable' });
    }

    const origen = input.libro != null ? input.libro : (input.derivado != null ? input.derivado : input.datos);
    if (origen === undefined || origen === null) return this._invalid('libro');

    // Las FILAS: se aplana el origen (array de asientos, o {asientos:[...]}) sin reinterpretar.
    const filas = this._filas(origen);
    if (filas === null) {
      return this._errorResponse(422, 'FORMATO_NO_DECLARABLE',
        'el origen no es un libro serializable (array de asientos o {asientos:[...]})',
        { motivo: 'origen_no_serializable' });
    }

    // La conversion es PURA: cada fila se mapea con el `mapeo` declarado (campo canonico → clave
    // externa). Un campo que no venga del origen queda null y se declara en abiertos.
    // Un asiento con `apuntes` se APLANA a una fila por apunte (asi exporta un programa contable:
    // una linea por apunte, con los datos del asiento repetidos). No se reinterpreta nada.
    const mapeo = formato_def.mapeo;
    const externas = [];
    const abiertos = [];
    const planas = this._aplanar(filas);
    for (let i = 0; i < planas.length; i++) {
      const f = planas[i];
      const { fila, faltantes } = this._mapearFila(f, mapeo);
      externas.push(fila);
      if (faltantes.length > 0) abiertos.push({ indice: i, faltantes });
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'exportacion-contable',
        formato,
        formato_origen: formato_def.origen_declarado,
        formato_canonico: formato_def.canonico === true,
        adaptador_declarado: Boolean(formato_def.mapeo && Object.keys(formato_def.mapeo).length > 0),
        mapeo,
        cabecera: formato_def.cabecera || null,
        separador: formato_def.separador != null ? formato_def.separador : null,
        decimal: formato_def.decimal != null ? formato_def.decimal : null,
        encoding: formato_def.encoding != null ? formato_def.encoding : null,
        total: externas.length,
        filas: externas,
        abiertos,
        // Cruza FORMATO, no decide CONTENIDO: ni una cifra se recalcula aqui.
        recalculado: false,
        derivado_de: input.origen != null ? String(input.origen) : null
      }
    };
  }

  _mapearFila(f, mapeo) {
    const fila = {};
    const faltantes = [];
    for (const campo of CAMPOS_ASIENTO) {
      // La clave externa la declara el mapeo; si el mapeo es vacio/canonico, el nombre canonico.
      const clave = mapeo && mapeo[campo] != null ? String(mapeo[campo]) : campo;
      const v = f && typeof f === 'object' ? (f[campo] !== undefined ? f[campo] : null) : null;
      if (v === undefined || v === null) faltantes.push(campo);
      fila[clave] = v === undefined ? null : v;
    }
    return { fila, faltantes };
  }

  // ══════════════════════════════════════════════════════════════════════
  // ENTRAR: ajustes del asesor (formato externo) → Set<Asiento> PROPUESTO
  // ══════════════════════════════════════════════════════════════════════
  _entrar(input = {}) {
    const pid = input.project_id || this.project_id || null;

    const formato = input.formato != null ? String(input.formato).trim()
      : (input.canal != null ? String(input.canal).trim() : '');
    if (!formato) {
      return this._errorResponse(400, 'FORMATO_NO_DECLARADO',
        'hay que declarar el formato de los ajustes que devuelve el asesor',
        { formatos_declarables: this._formatos(input) });
    }

    const formato_def = this._resolverFormato(input, formato);
    if (!formato_def) {
      return this._errorResponse(422, 'FORMATO_NO_DECLARABLE',
        'el formato declarado no tiene mapeo y no es un formato canonico',
        { formato, motivo: 'sin mapeo declarable' });
    }

    const externos = input.ajustes != null ? input.ajustes : input.entrante;
    if (externos === undefined || externos === null) return this._invalid('ajustes');

    const filas = this._filas(externos);
    if (filas === null) {
      return this._errorResponse(422, 'FORMATO_NO_DECLARABLE',
        'los ajustes no son una lista de filas externas',
        { motivo: 'ajustes_no_serializables' });
    }

    const mapeo = formato_def.mapeo;
    const asientos = [];
    const descartados = [];
    for (let i = 0; i < filas.length; i++) {
      const { asiento, faltantes, motivo } = this._desmapearFila(filas[i], mapeo);
      if (!asiento) {
        // Una fila sin lo minimo para ser asiento NO se inventa: se DESCARTA y se declara.
        descartados.push({ indice: i, motivo, faltantes });
        continue;
      }
      asientos.push(asiento);
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'importacion-ajustes',
        formato,
        formato_origen: formato_def.origen_declarado,
        adaptador_declarado: Boolean(formato_def.mapeo && Object.keys(formato_def.mapeo).length > 0),
        total: asientos.length,
        total_externas: filas.length,
        // Los ajustes entran como ASIENTOS PROPUESTOS, no escritos: quien decide y quien escribe
        // es el libro (escritor-diario B2 / asiento-ajuste B5). Aqui solo se cruza el formato.
        asientos,
        propuestos: true,
        escritos_por_este_puerto: false,
        descartados,
        recalculado: false
      }
    };
  }

  _desmapearFila(f, mapeo) {
    const leer = (campo) => {
      const clave = mapeo && mapeo[campo] != null ? String(mapeo[campo]) : campo;
      const v = f && typeof f === 'object' ? f[clave] : undefined;
      return v === undefined ? null : v;
    };

    const faltantes = [];
    const cuenta = leer('cuenta') != null ? String(leer('cuenta')).trim() : '';
    if (!cuenta) faltantes.push('cuenta');

    // El importe puede venir como debe/haber o como importe+signo. Se normaliza sin interpretar.
    const debe = this._num(leer('debe'));
    const haber = this._num(leer('haber'));
    const importe = this._num(leer('importe'));
    if (debe === null && haber === null && importe === null) faltantes.push('importe');

    if (faltantes.length > 0) {
      return { asiento: null, faltantes, motivo: `la fila no trae ${faltantes.join('/')}: no se inventa un asiento` };
    }

    const signo = leer('signo') != null ? String(leer('signo')).trim().toUpperCase() : null;
    const apunte = {
      cuenta,
      debe: debe !== null ? debe : (importe !== null && signo !== 'HABER' ? Math.abs(importe) : 0),
      haber: haber !== null ? haber : (importe !== null && signo === 'HABER' ? Math.abs(importe) : 0)
    };

    return {
      asiento: {
        // Asiento PROPUESTO: con su fila de apunte y su origen declarado. Sin juicio de valor.
        clave_natural: leer('clave_natural') != null ? String(leer('clave_natural')) : null,
        fecha: leer('fecha') != null ? String(leer('fecha')) : null,
        sociedad: leer('sociedad') != null ? String(leer('sociedad')) : null,
        concepto: leer('concepto') != null ? String(leer('concepto')) : (leer('descripcion') != null ? String(leer('descripcion')) : null),
        referencia: leer('referencia') != null ? String(leer('referencia')) : null,
        apuntes: [apunte],
        origen: 'asesor',
        propuesto: true
      },
      faltantes: []
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════════════════════

  // El formato: con mapeo declarado, o canonico (sin mapeo → se usan nombres canonicos).
  _resolverFormato(input, formato) {
    const declarado = (input.formatos && input.formatos[formato]) || null;
    const mapeo = (input.mapeo && typeof input.mapeo === 'object') ? input.mapeo
      : (declarado && declarado.mapeo && typeof declarado.mapeo === 'object' ? declarado.mapeo : null);
    const cabecera = input.cabecera !== undefined ? input.cabecera
      : (declarado && declarado.cabecera !== undefined ? declarado.cabecera : null);

    if (mapeo && Object.keys(mapeo).length > 0) {
      return {
        mapeo,
        cabecera,
        separador: input.separador !== undefined ? input.separador : (declarado ? declarado.separador : null),
        decimal: input.decimal !== undefined ? input.decimal : (declarado ? declarado.decimal : null),
        encoding: input.encoding !== undefined ? input.encoding : (declarado ? declarado.encoding : null),
        origen_declarado: input.mapeo ? 'peticion' : 'formatos_declarables',
        canonico: false
      };
    }

    // Sin mapeo declarado: SOLO vale un formato canonico (se declara por bandera o por su nombre).
    const canonico = input.canonico === true || declarado === true || this._esCanonico(formato);
    if (!canonico) return null;
    return {
      mapeo: {},
      cabecera,
      separador: input.separador !== undefined ? input.separador : null,
      decimal: input.decimal !== undefined ? input.decimal : null,
      encoding: input.encoding !== undefined ? input.encoding : null,
      origen_declarado: 'canonico',
      canonico: true
    };
  }

  // El unico formato canonico del puerto es el propio (campos canonicos, sin mapeo externo).
  _esCanonico(formato) {
    return formato === 'canonico' || formato === 'canonical' || formato === 'json-contabilidad';
  }

  _formatos(input) {
    if (input && input.formatos && typeof input.formatos === 'object') return Object.keys(input.formatos);
    return [];
  }

  // Aplana el origen a una lista de filas. null si no es serializable.
  _filas(origen) {
    if (Array.isArray(origen)) return origen;
    if (origen && typeof origen === 'object') {
      if (Array.isArray(origen.asientos)) return origen.asientos;
      if (Array.isArray(origen.filas)) return origen.filas;
      if (Array.isArray(origen.apuntes)) return origen.apuntes;
    }
    return null;
  }

  // Aplana asientos → filas por APUNTE (los datos del asiento se repiten en cada apunte).
  // Los elementos que ya son filas simples (sin `apuntes`) pasan tal cual. No reinterpreta nada.
  _aplanar(filas) {
    const out = [];
    for (const f of filas) {
      if (f && typeof f === 'object' && Array.isArray(f.apuntes) && f.apuntes.length > 0) {
        for (const ap of f.apuntes) {
          out.push({
            numero: f.numero !== undefined ? f.numero : null,
            fecha: f.fecha !== undefined ? f.fecha : null,
            clave_natural: f.clave_natural !== undefined ? f.clave_natural : null,
            sociedad: f.sociedad !== undefined ? f.sociedad : null,
            concepto: f.concepto !== undefined ? f.concepto : null,
            cuenta: ap && ap.cuenta !== undefined ? ap.cuenta : null,
            debe: ap && ap.debe !== undefined ? ap.debe : null,
            haber: ap && ap.haber !== undefined ? ap.haber : null,
            importe: f.importe !== undefined ? f.importe : null,
            signo: f.signo !== undefined ? f.signo : null,
            descripcion: f.descripcion !== undefined ? f.descripcion : null,
            referencia: f.referencia !== undefined ? f.referencia : null
          });
        }
        continue;
      }
      out.push(f);
    }
    return out;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolSalir(params) { return this._salir(params); }
  toolEntrar(params) { return this._entrar(params); }
}

module.exports = PuertoExportacion;
