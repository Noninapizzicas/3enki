/**
 * contabilidad-libro/puerto-plan-contable — CONVERSOR STATELESS (B6, hoja del plan).
 *
 * LA FRONTERA DE CODIFICACION del plan contable (import/export). Cruza FORMATOS: traduce el
 * plan declarado entre la codificacion EXTERNA (el fichero del asesor: columnas, codigos de
 * otro programa, CSV, etc.) y la representacion CANONICA del dominio (la que usa catalogo-cuentas
 * B1). Cruza FORMATO, no decide CONTENIDO: no da de alta cuentas, no las persiste.
 *
 * 🔴 ES UN CONVERSOR: TRADUCE Y DEVUELVE. No escribe. Quien da de alta en el plan es
 * `catalogo-cuentas.anadir` (B1); esta hoja solo entrega el plan ya traducido para que el
 * custodio lo escriba.
 *
 * LA LEY ENTRA COMO DATO: el `formato` y el `mapeo` (campo canonico → clave externa) son
 * DECLARABLES y entran como DATO. Sin `formato` declarado NO se convierte; si el formato no
 * tiene `mapeo` declarado y no es el canonico, se rechaza (422 FORMATO_NO_DECLARABLE).
 *
 * Invariante: dato ausente = desconocido. Un campo que no venga del exterior queda `null`
 * y se declara en `abierto` (jamas se estima ni se completa).
 *
 *   · entrar — externo (plan del asesor) → plan canonico
 *   · salir  — plan canonico → externo (formato declarado)
 *
 * Forma: CONVERSOR → STATELESS. Sin PosPersistencia, sin onProjectActivated. RPC PREGUNTA → sin ui_handler.
 * Ver hoja B6 del plan-construccion y diseno-oop.md (CLASE PuertoPlanContable).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Campos canonicos de una cuenta del plan. Su ORIGEN externo es declarable (mapeo).
const CAMPOS_CUENTA = ['codigo', 'nombre', 'tipo', 'naturaleza', 'padre'];

class PuertoPlanContable extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-plan-contable';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC PREGUNTA (sin ui_handler: su cara es el bus) ──
  onEntrarRequest(e) {
    return this._atender(e, 'entrar', 'puerto-plan-contable.entrar.response', async (d) => {
      const res = this._entrar(d);
      // Conversor puro: no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('puerto-plan-contable.entrar.failed', res);
      return res;
    });
  }

  onSalirRequest(e) {
    return this._atender(e, 'salir', 'puerto-plan-contable.salir.response', async (d) => {
      const res = this._salir(d);
      if (res.status !== 200) this.eventBus?.publish('puerto-plan-contable.salir.failed', res);
      return res;
    });
  }

  // ── entrar: externo (formato estructurado) → plan canonico ──
  async _entrar(input = {}) {
    const formato = this._formato(input);
    if (!formato) {
      return this._errorResponse(400, 'FORMATO_NO_DECLARADO',
        'hay que declarar el formato estructurado de entrada', { esquemas_declarables: this._esquemas(input) });
    }

    const externo = input.externo;
    if (!externo || typeof externo !== 'object') return this._invalid('externo');

    const mapeo = this._mapeoDe(input, formato, this._esquemas(input));
    if (!mapeo) {
      return this._errorResponse(422, 'FORMATO_NO_DECLARABLE',
        'formato no declarable: declara `mapeo` (campo canonico → clave externa) o un `esquema` declarado',
        { formato, esquemas_declarables: this._esquemas(input) });
    }

    const cuentasExternas = this._cuentasDe(externo);
    const cuentas = [];
    const abierto = [];
    for (const cu of cuentasExternas) {
      const { value, faltantes } = this._aCuenta(cu, mapeo);
      cuentas.push(value);
      if (faltantes.length) abierto.push({ codigo: value.codigo, faltantes });
    }

    // SUBE el plan declarado a catalogo-cuentas (B1) por EVENTO — best-effort, nunca import.
    // Sirve para contrastar lo traducido con el plan que el custodio ya tiene; no escribe nada.
    const pid = input.project_id || this.project_id || null;
    const contraste = pid ? await this._contrastar(pid, cuentas) : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        formato,
        direccion: 'entrar',
        plan: cuentas,
        total: cuentas.length,
        adaptador_declarado: Boolean(input.mapeo),
        // Cruza FORMATO, no decide CONTENIDO: no da de alta en el plan (eso es catalogo-cuentas.anadir B1).
        escrito: false,
        contraste_plan: contraste,
        abierto
      }
    };
  }

  // ── salir: plan canonico → externo (formato declarado) ──
  _salir(input = {}) {
    const formato = this._formato(input);
    if (!formato) {
      return this._errorResponse(400, 'FORMATO_NO_DECLARADO',
        'hay que declarar el formato estructurado de salida', { esquemas_declarables: this._esquemas(input) });
    }

    const plan = input.plan !== undefined ? input.plan
      : (Array.isArray(input.cuentas) ? input.cuentas : null);
    if (!plan || typeof plan !== 'object') return this._invalid('plan');

    const mapeo = this._mapeoDe(input, formato, this._esquemas(input));
    if (!mapeo) {
      return this._errorResponse(422, 'FORMATO_NO_DECLARABLE',
        'formato no declarable: declara `mapeo` (campo canonico → clave externa) o un `esquema` declarado',
        { formato, esquemas_declarables: this._esquemas(input) });
    }

    const cuentas = this._cuentasDe(plan);
    const externo = cuentas.map((cu) => {
      const out = {};
      for (const campo of CAMPOS_CUENTA) {
        const clave = mapeo[campo] != null ? String(mapeo[campo]) : campo;
        out[clave] = cu?.[campo] ?? null;   // ausente → null, no se estima
      }
      return out;
    });

    return {
      status: 200,
      data: {
        project_id: input.project_id || this.project_id || null,
        formato,
        direccion: 'salir',
        externo,
        total: externo.length,
        adaptador_declarado: Boolean(input.mapeo),
        // Cruza FORMATO: no da de alta ni presenta (eso es del asesor).
        escrito: false
      }
    };
  }

  // Traduce una cuenta externa a la cuenta canonica del plan.
  _aCuenta(cu, mapeo) {
    const value = {};
    const faltantes = [];
    for (const campo of CAMPOS_CUENTA) {
      const clave = mapeo[campo] != null ? String(mapeo[campo]) : campo;
      const raw = cu ? cu[clave] : undefined;
      if (raw === undefined || raw === null || raw === '') {
        value[campo] = null;              // desconocido — NO se estima
        faltantes.push(campo);
      } else {
        value[campo] = raw;
      }
    }
    // Los campos extra del exterior se conservan bajo `metadatos` (no se pierde nada).
    const conocidas = new Set(CAMPOS_CUENTA.map((c) => (mapeo[c] != null ? String(mapeo[c]) : c)));
    const metadatos = {};
    for (const [k, v] of Object.entries(cu || {})) if (!conocidas.has(k)) metadatos[k] = v;
    value.metadatos = metadatos;
    return { value, faltantes };
  }

  // El contenedor de cuentas del plan: un array directo o {cuentas:[...]}/{plan:[...]}.
  _cuentasDe(obj) {
    if (Array.isArray(obj)) return obj;
    if (obj && Array.isArray(obj.cuentas)) return obj.cuentas;
    if (obj && Array.isArray(obj.plan)) return obj.plan;
    return [];
  }

  // SUBE a catalogo-cuentas (B1) por EVENTO: contrasta las cuentas traducidas con el plan
  // declarado. Best-effort (si el custodio no esta vivo, el puerto no cuelga ni inventa).
  async _contrastar(pid, cuentas) {
    try {
      const resp = await this._rpc('catalogo-cuentas.buscar.request', { project_id: pid }, { timeout_ms: 2000 });
      if (!resp || resp.status !== 200 || !resp.data) return null;
      const declaradas = new Set((resp.data.encontradas || []).map((c) => String(c.codigo)));
      const nuevas = cuentas.filter((c) => c.codigo != null && !declaradas.has(String(c.codigo))).map((c) => c.codigo);
      return { total_plan: resp.data.total_plan || 0, nuevas };
    } catch (_) {
      return null;   // best-effort: el conversor no cuelga si el bus no esta
    }
  }

  // El formato es DECLARABLE: entra como dato; sin el, no se adivina la codificacion.
  _formato(input = {}) {
    const f = input.formato != null ? String(input.formato).trim() : '';
    return f || null;
  }

  // Los esquemas declarables los declara el sitio; el modulo NO conoce ninguno de memoria.
  _esquemas(input = {}) {
    return Array.isArray(input.esquemas_declarables)
      ? input.esquemas_declarables.map((f) => String(f)).filter(Boolean)
      : [];
  }

  // Resuelve el mapeo declarado. Sin mapeo, solo el formato canonico declarado o un esquema declarado.
  _mapeoDe(input, formato, esquemas) {
    if (input.mapeo && typeof input.mapeo === 'object') return input.mapeo;
    const canonico = formato === 'canonico' || formato === 'enki';
    if (canonico || esquemas.includes(formato)) {
      const identidad = {};
      for (const c of CAMPOS_CUENTA) identidad[c] = c;
      return identidad;
    }
    return null;
  }

  // ── Tools ──
  toolEntrar(params) { return this._entrar(params); }
  toolSalir(params) { return this._salir(params); }
}

module.exports = PuertoPlanContable;
