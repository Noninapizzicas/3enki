/**
 * contabilidad/puerto-extracto — CONVERSOR STATELESS (E2, hoja del plan).
 *
 * Frontera del CANAL/FORMATO del extracto bancario: un adaptador por fuente,
 * puesto en el sitio de despliegue, reemplazable. Si falta una fuente → SE CREA
 * (invariante de puerto abierto); las credenciales del canal se piden a
 * `credential-manager` por EVENTO (credential.resolve.request), NUNCA por
 * require cruzado. Devuelve MOVIMIENTOS BANCARIOS ya en forma
 * (MovimientoBancario del diseno-oop): idMovimiento, cuentaBancaria, fecha,
 * importe con signo, moneda, descripcion, contrapartida.
 *
 * CONVERSOR (patron real, stateless): sin PosPersistencia ni project.activated
 * para los movimientos — entra objeto, sale objeto. El CATALOGO de adaptadores
 * declarados vive en memoria del propio puerto (el contrato del canal es
 * configuracion del adaptador, no parcela persistente). Emisor/par de fallo:
 * exito publica contabilidad.extracto_leido; error su par determinista. NO
 * REUTILIZA: ningun modulo del inventario lee extractos bancarios (conciliacion
 * = 0 modulos en el inventario).
 *
 * Ver hoja E2 del diseno-oop y bloque `puerto-extracto` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Canales de extracto que el puerto SABE interpretar de fabrica. Un canal nuevo
// se registra con _registrarAdaptador (invariante de puerto abierto).
const CANALES_BASE = new Set(['FICHERO_NORMALIZADO', 'API_BANCARIA', 'CSV_MANUAL']);

class PuertoExtracto extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-extracto';
    this.version = 'reflejo-0.1.0';
    // Puente/conversor stateless: catalogo de adaptadores en memoria, por canal.
    this._adaptadores = new Map();   // canal -> { canal, credencial, formato, registrado_en }
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC ──
  onLeerRequest(e) {
    return this._atender(e, 'leer', 'contabilidad.extracto.leer.response', async (d) => {
      const res = await this._leer(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.extracto_leido', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.extracto.leer.failed', res);
      }
      return res;
    });
  }

  onRegistrarFormaRequest(e) {
    return this._atender(e, 'registrar_forma', 'contabilidad.extracto.registrar_forma.response', async (d) => {
      const res = this._registrarAdaptador(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.extracto.registrar_forma.failed', res);
      return res;
    });
  }

  // ── proyecciones puras (deterministas sobre el contenido que entrega la fuente) ──
  // leer(canal) -> List<MovimientoBancario>  (si falta adaptador → se declara, no se inventa).
  async _leer(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const canal = String((input && input.canal) || '').toUpperCase();
    if (!canal) return this._invalid('canal');

    const adaptador = this._adaptadores.get(canal);
    const conocido = !!adaptador || CANALES_BASE.has(canal);
    if (!conocido) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `no hay adaptador para el canal ${canal}`, {
        canal, accion: 'REGISTRAR_ADAPTADOR', invariante: 'puerto_abierto_se_crea'
      });
    }

    // Credenciales del canal: se piden a credential-manager por EVENTO (no require).
    let credencial = (adaptador && adaptador.credencial) || null;
    if (!credencial && adaptador && adaptador.credencial_ref) {
      const resp = await this._rpc('credential.resolve.request', {
        project_id: pid,
        key: adaptador.credencial_ref
      }, { timeout_ms: 4000 });
      credencial = (resp && (resp.value || resp.credential)) || null;
      if (!credencial) {
        return this._errorResponse(502, 'AUTHENTICATION_REQUIRED', 'credential-manager no resolvio la credencial del canal', {
          canal, credencial_ref: adaptador.credencial_ref
        });
      }
    }

    // Materializa la forma MovimientoBancario del diseno-oop sobre el contenido
    // que la fuente pone en payload.movimientos. Sin contenido → lista vacia (honesto).
    const crudos = Array.isArray(input && input.movimientos) ? input.movimientos : [];
    const movimientos = crudos.map((m, i) => this._aMovimiento(pid, canal, m, i));

    return {
      status: 200,
      data: {
        project_id: pid,
        canal,
        moneda_base: (adaptador && adaptador.moneda) || (input && input.moneda) || null,
        movimientos,
        n: movimientos.length,
        adaptador_conocido: conocido
      }
    };
  }

  // Forma canonica MovimientoBancario (signo en el importe; contrapartida NINGUNA si no hay).
  _aMovimiento(pid, canal, m, i) {
    const importe = Number(m && (m.importe ?? m.amount));
    return {
      id_movimiento: (m && (m.id_movimiento || m.id)) || `${pid}-${canal}-m${i + 1}`,
      cuenta_bancaria: (m && (m.cuenta_bancaria || m.cuenta || m.iban)) || null,
      fecha: (m && (m.fecha || m.date)) || null,
      importe: Number.isFinite(importe) ? this._round(importe, 2) : null,
      moneda: (m && m.moneda) || (m && m.currency) || null,
      descripcion: (m && (m.descripcion || m.concepto || m.description)) || null,
      contrapartida: (m && m.contrapartida) || 'NINGUNA'
    };
  }

  // registrarAdaptador(canal) — catalogo DECLARABLE; si falta una fuente, SE CREA.
  _registrarAdaptador(input) {
    const canal = String((input && input.canal) || '').toUpperCase();
    if (!canal) return this._invalid('canal');

    const adaptador = {
      canal,
      formato: (input && input.formato) || null,
      credencial_ref: (input && input.credencial_ref) || null,
      moneda: (input && input.moneda) || null,
      registrado_en: new Date().toISOString(),
      registrado_por: String((input && input.rol) || 'DUENO').toUpperCase()
    };
    this._adaptadores.set(canal, adaptador);
    this.logger?.info(`${this.name}.adaptador_registrado`, { canal });
    return { status: 200, data: { canal, adaptador, creado: true } };
  }

  // ── Tools ──
  toolLeer(params) { return this._leer(params); }
  toolRegistrarAdaptador(params) { return this._registrarAdaptador(params); }
}

module.exports = PuertoExtracto;
