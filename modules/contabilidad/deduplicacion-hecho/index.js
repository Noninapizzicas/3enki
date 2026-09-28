/**
 * contabilidad/deduplicacion-hecho — REFLEJO STATELESS (A7, hoja del plan).
 *
 * ANTI-BUCLE: aplica la clave natural del hecho/documento (M3). Reprocesar NO
 * duplica (idempotencia): si la clave ya se proceso, el hecho es DUPLICADO y no
 * vuelve a asentarse. Si el hecho es RECTIFICATIVO (A13), su clave apunta al
 * ORIGINAL y NO se considera duplicado — corregir no es repetir. Determinista:
 * mismas entradas → misma salida (un test unitario lo afirma).
 *
 * REFLEJO (patron real, stateless): sin PosPersistencia ni project.activated —
 * el registro de claves ya procesadas vive en memoria del propio reflejo (es el
 * cache de idempotencia, no una parcela que persistir). La dependencia con
 * clave-natural (M3) es por EVENTO (`contabilidad.clave.calcular.request` via
 * _rpc), NUNCA por require cruzado; si ese RPC no responde, se publica el par
 * de fallo y NUNCA se asienta basura (contrato TOLERANTE). Emisor/par de fallo:
 * exito publica contabilidad.hecho_nuevo o contabilidad.hecho_duplicado; error
 * su par determinista. NO REUTILIZA: la idempotencia por clave natural es el
 * cerrojo 3 del dominio; ningun modulo del inventario lo aplica.
 *
 * Ver hoja A7 del diseno-oop y bloque `deduplicacion-hecho` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Clase de hecho RECTIFICATIVO: su clave apunta al original — no es duplicado.
const CLASE_RECTIFICATIVO = 'RECTIFICATIVO';

class DeduplicacionHecho extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'deduplicacion-hecho';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: cache de idempotencia en memoria (claves ya procesadas).
    this._procesadas = new Map();   // project_id -> Set<ClaveNatural>
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC ──
  onVerificarRequest(e) {
    return this._atender(e, 'verificar', 'contabilidad.duplicado.verificar.response', async (d) => {
      const res = await this._verificar(d);
      if (res.status !== 200) {
        this.eventBus?.publish('contabilidad.duplicado.verificar.failed', res);
        return res;
      }
      if (res.data.duplicado) {
        this.eventBus?.publish('contabilidad.hecho_duplicado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.hecho_nuevo', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      }
      return res;
    });
  }

  // Fire-and-forget: normalizador-hecho (A2) dejo el hecho en forma asentable.
  onHechoNormalizado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    return (async () => {
      const res = await this._verificar({
        project_id: d.project_id,
        hecho: d.hecho || d,
        vertical: d.vertical,
        clave: d.clave_natural,
        correlation_id: d.correlation_id
      });
      if (res.status !== 200) {
        this.eventBus?.publish('contabilidad.duplicado.verificar.failed', res);
        return res;
      }
      const evento = res.data.duplicado ? 'contabilidad.hecho_duplicado' : 'contabilidad.hecho_nuevo';
      this.eventBus?.publish(evento, { ...res.data, correlation_id: d.correlation_id });
      return res;
    })();
  }

  // ── proyecciones puras (deterministas) ──
  // esDuplicado(hecho) -> Duplicado | Nuevo — aplica la clave natural (M3).
  async _verificar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const hecho = (input && (input.hecho || input.documento)) || null;
    if (!hecho || typeof hecho !== 'object') return this._invalid('hecho');

    const vertical = hecho.vertical || (input && input.vertical) || null;
    if (!vertical) return this._invalid('hecho.vertical');

    // La clave natural: viene en el payload (via evento) o se pide a clave-natural
    // (M3) por EVENTO. Sin clave NO se asume nada → par de fallo (contrato tolerante).
    let clave = (input && input.clave) || hecho.clave_natural || null;
    if (!clave) {
      const resp = await this._rpc('contabilidad.clave.calcular.request', {
        project_id: pid,
        hecho,
        unidad_de_cierre: (input && input.unidad_de_cierre) || hecho.unidad_cierre || null
      }, { timeout_ms: 4000 });
      clave = (resp && resp.status === 200 && resp.data && resp.data.clave_natural) || null;
      if (!clave) {
        return this._errorResponse(503, 'UPSTREAM_UNREACHABLE',
          'clave-natural (M3) no devolvio la clave: no se asume, no se asienta', {
            vertical, dependencia: 'clave-natural', accion: 'NO_ASENTAR_PUBLICAR_FALLO'
          });
      }
    }

    return this._esDuplicado(pid, hecho, vertical, clave);
  }

  // esDuplicado determinista sobre la clave ya resuelta.
  _esDuplicado(pid, hecho, vertical, clave) {
    const esRectificativo = this._esRectificativo(hecho, vertical);
    const procesadas = this._procesadas.get(pid) || new Set();
    const yaVisto = procesadas.has(clave);

    // Un rectificativo NO es duplicado: su clave apunta al original.
    const duplicado = yaVisto && !esRectificativo;

    // Si es NUEVO (o rectificativo), se marca procesado.
    if (!duplicado) {
      if (!this._procesadas.has(pid)) this._procesadas.set(pid, new Set());
      this._procesadas.get(pid).add(clave);
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        vertical,
        clave_natural: clave,
        duplicado,
        estado: duplicado ? 'DUPLICADO' : 'NUEVO',
        es_rectificativo: esRectificativo,
        ya_visto: yaVisto,
        procesadas: this._procesadas.get(pid) ? this._procesadas.get(pid).size : 0,
        nota: duplicado
          ? 'reprocesar NO duplica: la clave natural ya se asento'
          : (esRectificativo ? 'rectificativo: casa con su original, no es duplicado' : 'hecho nuevo')
      }
    };
  }

  _esRectificativo(hecho, vertical) {
    const clase = String(hecho.clase_hecho || hecho.clase || '').toUpperCase();
    return clase === CLASE_RECTIFICATIVO
      || String(vertical).toUpperCase() === CLASE_RECTIFICATIVO
      || hecho.rectificativo === true
      || !!hecho.hecho_original;
  }

  // marcarProcesado(clave) -> ok — idempotencia (no muta la clave, marca el cache).
  _marcarProcesado(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const clave = input && input.clave;
    if (!clave) return this._invalid('clave');

    if (!this._procesadas.has(pid)) this._procesadas.set(pid, new Set());
    this._procesadas.get(pid).add(clave);

    return {
      status: 200,
      data: { project_id: pid, clave_natural: clave, marcado: true, procesadas: this._procesadas.get(pid).size }
    };
  }

  // ── Tools ──
  toolVerificar(params) { return this._verificar(params); }
  toolEsDuplicado(params) {
    const hecho = (params && params.hecho) || {};
    const vertical = hecho.vertical || (params && params.vertical) || '';
    const clave = (params && params.clave) || hecho.clave_natural || null;
    if (!clave) return this._invalid('clave');
    return this._esDuplicado((params && params.project_id) || null, hecho, vertical, clave);
  }
  toolMarcarProcesado(params) { return this._marcarProcesado(params); }
}

module.exports = DeduplicacionHecho;
