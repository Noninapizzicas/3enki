/**
 * contabilidad/catalogo-cuentas — CUSTODIO (B1+B6 fusionados, hoja del plan).
 *
 * EL PLAN DE CUENTAS DEL NEGOCIO: DECLARABLE (lo aporta el negocio o el asesor)
 * e IMPORTABLE (B6 = frontera UNICA de codificacion del plan). Un solo escritor.
 * Se cierra con el criterio declarado (K9 cola-declaraciones-criterio): NO se
 * inventa un plan por defecto — sin plan declarado, una cuenta desconocida es
 * NO_EXISTE (nunca una cuenta fabricada).
 *
 * CUSTODIO (patron real): store en memoria (cuentas por codigo + escritor de la
 * parcela); PosPersistencia (storage /contabilidad/catalogo-cuentas/*.json);
 * restaura en project.activated; flush en onUnload. GUARD de un solo escritor:
 * la familia DUENO/ASESOR declara; un rol fuera de la familia (segundo escritor)
 * se rechaza con ERROR_DOS_ESCRITORES — dos escritores sobre el plan =
 * codificacion contradictoria = prohibido (invariante 8).
 *
 * Emisor/par de fallo: exito publica contabilidad.cuenta_declarada /
 * contabilidad.plan_importado / contabilidad.plan_exportado; error su par
 * determinista. Lo consume escritor-diario (B2) para codificar, y
 * resolucion-contrapartida (A6.1) para proponer cuenta.
 * NO REUTILIZA: no existe plan contable en el inventario; el formato declarable
 * del asesor es DATO (K9).
 *
 * Ver hoja B1/B6 del diseno-oop y bloque `catalogo-cuentas` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Familia de ESCRITURA del plan: el plan tiene UN escritor (DUENO/ASESOR).
const FAMILIA_ESCRITURA = new Set(['DUENO', 'ASESOR']);

// Codigo simbolico determinista del cerrojo (invariante 8: un solo escritor).
const CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES';

// Naturalezas contables canonicas (declarables por el asesor en el plan).
const NATURALEZAS = ['ACTIVO', 'PASIVO', 'PATRIMONIO_NETO', 'INGRESO', 'GASTO'];

// Formatos de importacion declarables (B6, unico cruce de formatos del plan).
const FORMATOS_PLAN = ['csv', 'tsv', 'txt'];

class CatalogoCuentas extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'catalogo-cuentas';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, cuentas: {}, escritor, formato }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'catalogo-cuentas.json',
      dir: '/contabilidad/catalogo-cuentas',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.cuentas) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el plan contable del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'contabilidad.cuenta.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.cuenta_declarada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.cuenta.declarar.failed', res);
      }
      return res;
    });
  }

  onResolverRequest(e) {
    return this._atender(e, 'resolver', 'contabilidad.cuenta.resolver.response', async (d) => {
      const res = this._resolver(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.cuenta.resolver.failed', res);
      return res;
    });
  }

  onImportarRequest(e) {
    return this._atender(e, 'importar', 'contabilidad.plan.importar.response', async (d) => {
      const res = this._importar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.plan_importado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.plan.importar.failed', res);
      }
      return res;
    });
  }

  onExportarRequest(e) {
    return this._atender(e, 'exportar', 'contabilidad.plan.exportar.response', async (d) => {
      const res = this._exportar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.plan_exportado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.plan.exportar.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-catalogo-cuentas-v1', cuentas: {}, escritor: null, formato: null };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // GUARD de un solo escritor: solo la familia DUENO/ASESOR toca el plan.
  // Un rol fuera de la familia (segundo escritor) → ERROR_DOS_ESCRITORES.
  _verificarEscritorUnico(d, rol) {
    if (!FAMILIA_ESCRITURA.has(rol)) {
      return this._errorResponse(409, CODE_DOS_ESCRITORES,
        'el plan contable tiene UN escritor: solo DUENO/ASESOR declara', {
          escritor_vigente: d.escritor || 'DUENO/ASESOR',
          rol_intentado: rol || null,
          simbolico: CODE_DOS_ESCRITORES
        });
    }
    if (!d.escritor) d.escritor = rol;
    return null;
  }

  _normCodigo(codigo) {
    return String(codigo || '').trim();
  }

  // declarar(rol, cuenta) — un solo escritor (B1). No se inventa plan por defecto.
  _declarar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rol = String((input && input.rol) || '').toUpperCase();
    const d = this._obtenerOCrear(pid);
    const guard = this._verificarEscritorUnico(d, rol);
    if (guard) return guard;

    const cuenta = input && input.cuenta;
    if (!cuenta || typeof cuenta !== 'object') return this._invalid('cuenta');
    const codigo = this._normCodigo(cuenta.codigo || cuenta.id_cuenta);
    if (!codigo) return this._invalid('cuenta.codigo');
    if (!cuenta.nombre) return this._invalid('cuenta.nombre');

    const naturaleza = cuenta.naturaleza ? String(cuenta.naturaleza).toUpperCase() : null;
    if (naturaleza && !NATURALEZAS.includes(naturaleza)) {
      return this._invalid('cuenta.naturaleza');
    }

    const asentada = {
      codigo,
      nombre: String(cuenta.nombre),
      naturaleza,
      tipo: cuenta.tipo || null,
      mayor: cuenta.mayor !== false,
      declarado_por: rol,
      declarado_en: new Date().toISOString()
    };
    d.cuentas[codigo] = asentada;
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        cuenta: asentada,
        n_cuentas: Object.keys(d.cuentas).length,
        escritor: d.escritor
      }
    };
  }

  // resolver(codigo) -> Cuenta | NO_EXISTE (proyeccion PURA: no muta, no inventa).
  _resolver(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const codigo = this._normCodigo(input && (input.codigo || input.id_cuenta));
    if (!codigo) return this._invalid('codigo');

    const d = this._obtenerOCrear(pid);
    const cuenta = d.cuentas[codigo] || null;
    // Sin plan declarado, una cuenta desconocida es NO_EXISTE: no se fabrica.
    return {
      status: 200,
      data: {
        project_id: pid,
        codigo,
        hallada: !!cuenta,
        resultado: cuenta ? 'CUENTA' : 'NO_EXISTE',
        cuenta,
        plan_declarado: Object.keys(d.cuentas).length > 0
      }
    };
  }

  // importar(origen) -> List<Cuenta> (B6: unico cruce de formatos del plan).
  _importar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rol = String((input && input.rol) || '').toUpperCase();
    const d = this._obtenerOCrear(pid);
    const guard = this._verificarEscritorUnico(d, rol);
    if (guard) return guard;

    const origen = (input && (input.origen || input.plan)) || null;
    if (!origen) return this._invalid('origen');
    const contenido = typeof origen === 'string' ? origen : (origen.contenido || null);
    if (!contenido) return this._invalid('origen.contenido');

    const formato = String((origen && origen.formato) || input.formato || 'csv').toLowerCase();
    if (!FORMATOS_PLAN.includes(formato)) return this._invalid('origen.formato');

    const cuentas = this._parsear(contenido, formato);
    if (cuentas.length === 0) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'el documento del plan no trae cuentas legibles: no se importa vacio',
        { formato, senal: 'PLAN_VACIO' });
    }
    if (cuentas.error) return cuentas.error;

    for (const c of cuentas) d.cuentas[c.codigo] = c;
    d.formato = formato;
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        formato,
        n_importadas: cuentas.length,
        cuentas,
        n_cuentas: Object.keys(d.cuentas).length
      }
    };
  }

  // exportar(catalogo) -> DocumentoPlan (B6: unico cruce de formatos del plan).
  _exportar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const d = this._obtenerOCrear(pid);
    const formato = String((input && input.formato) || d.formato || 'csv').toLowerCase();
    if (!FORMATOS_PLAN.includes(formato)) return this._invalid('formato');

    const sep = formato === 'tsv' ? '\t' : (formato === 'csv' ? ';' : ';');
    const cuentas = Object.values(d.cuentas);
    const contenido = cuentas.map((c) => [c.codigo, c.nombre, c.naturaleza || ''].join(sep)).join('\n');

    return {
      status: 200,
      data: {
        project_id: pid,
        formato,
        documento: { formato, contenido, n_cuentas: cuentas.length },
        n_cuentas: cuentas.length
      }
    };
  }

  // Parseo determinista del documento del plan (un solo cruce de formatos, B6).
  _parsear(contenido, formato) {
    const sep = formato === 'tsv' ? '\t' : (formato === 'csv' ? ';' : ';');
    const lineas = String(contenido).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const cuentas = [];
    for (const linea of lineas) {
      const partes = linea.split(sep).map((p) => p.trim());
      if (partes.length < 2) continue;
      const codigo = this._normCodigo(partes[0]);
      const nombre = partes[1];
      if (!codigo || !nombre) continue;
      if (!/^[0-9A-Za-z_.-]+$/.test(codigo)) {
        return {
          error: this._errorResponse(422, 'INVALID_INPUT',
            `codigo de cuenta ilegible en el documento del plan: ${codigo}`, { codigo, formato })
        };
      }
      const naturaleza = partes[2] ? String(partes[2]).toUpperCase() : null;
      cuentas.push({
        codigo,
        nombre,
        naturaleza: (naturaleza && NATURALEZAS.includes(naturaleza)) ? naturaleza : null,
        tipo: null,
        mayor: true,
        importado_de: formato
      });
    }
    return cuentas;
  }

  // ── Tools ──
  toolDeclarar(params) { return this._declarar(params); }
  toolResolver(params) { return this._resolver(params); }
  toolImportar(params) { return this._importar(params); }
  toolExportar(params) { return this._exportar(params); }
}

module.exports = CatalogoCuentas;
