/**
 * contabilidad-libro/puerto-extracto — CONVERSOR STATELESS (E2, hoja del plan).
 *
 * FRONTERA DE CANAL/FORMATO DEL EXTRACTO BANCARIO: convierte el extracto EXTERNO (lo que cada
 * BANCO entregue: CSV, JSON, salida de un conector, un volcado del asesor) en el `Movimiento`
 * canonico NORMALIZADO del dominio. UN ADAPTADOR POR BANCO: el adaptador lo declara el sitio
 * con el `mapeo` (campo canonico → clave externa del banco) y el `canal`; si falta, se declara
 * que hay que crearlo — NO se adivina el formato de ningun banco.
 *
 * LA LEY ENTRA COMO DATO (invariante 5): el `formato`/`canal` y el `mapeo` son DECLARABLES y
 * entran como DATO. NO hay ninguna plantilla de banco cableada (ni cabeceras, ni separadores, ni
 * signos de abono/cargo, ni fechas de un formato concreto). Sin formato declarado NO se convierte;
 * un formato sin mapeo y sin ser canonico se rechaza (422 FORMATO_NO_DECLARABLE).
 *
 * Cruza FORMATO, no decide CONTENIDO: no interpreta partidas, no cruza con el libro (eso es
 * conciliacion-bancaria E1), no juzga lo que no casa. Solo normaliza el movimiento y lo emite.
 *
 * Invariante: dato ausente = desconocido. Un campo que no viene del exterior queda `null` y se
 * declara en `abierto` (jamas se estima ni se completa). Un movimiento sin importe no es un
 * movimiento: no se inventa.
 *
 * Forma: CONVERSOR → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja E2 del plan-construccion y diseno-oop.md (CLASE PuertoExtracto).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Campos canonicos del Movimiento bancario. Su ORIGEN externo es declarable (mapeo por banco).
const CAMPOS_MOVIMIENTO = ['fecha', 'importe', 'signo', 'concepto', 'referencia', 'saldo', 'cuenta', 'contraparte'];

class PuertoExtracto extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-extracto';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onEntrarRequest(e) {
    return this._atender(e, 'entrar', 'puerto-extracto.entrar.response', async (d) => {
      const res = this._entrar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: los movimientos normalizados entran al libro.
        // Lo consume cuadre-cobro-pago (E3).
        for (const movimiento of res.data.movimientos) {
          this.eventBus?.publish('contabilidad.movimiento_bancario', {
            project_id: res.data.project_id,
            banco: res.data.banco,
            canal: res.data.canal,
            movimiento,
            clave: movimiento.clave,
            correlation_id: d.correlation_id
          });
        }
      } else {
        this.eventBus?.publish('puerto-extracto.entrar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion: extracto externo → Flujo<Movimiento> normalizado ──
  _entrar(input = {}) {
    const pid = input.project_id || this.project_id || null;

    // El canal/formato es DECLARABLE: sin el no se adivina el formato de ningun banco.
    const canal = input.canal != null ? String(input.canal).trim()
      : (input.formato != null ? String(input.formato).trim() : '');
    if (!canal) {
      return this._errorResponse(400, 'CANAL_NO_DECLARADO',
        'hay que declarar el canal/formato del extracto (un adaptador por banco)',
        { canales_declarables: this._canales(input) });
    }

    const externo = input.extracto != null ? input.extracto : input.externo;
    if (externo === undefined || externo === null) return this._invalid('extracto');

    const banco = input.banco != null ? String(input.banco) : null;
    const mapeo = this._mapeoDe(input, canal);
    if (!mapeo) {
      return this._errorResponse(422, 'FORMATO_NO_DECLARABLE',
        'canal no declarable: declara `mapeo` (campo canonico → clave del banco) — un adaptador por banco',
        { canal, banco, canales_declarables: this._canales(input) });
    }

    // El extracto es una lista de movimientos (array o {movimientos:[...]}).
    const filas = Array.isArray(externo) ? externo
      : (Array.isArray(externo.movimientos) ? externo.movimientos
        : (Array.isArray(externo.apuntes) ? externo.apuntes : null));
    if (!filas) return this._invalid('extracto.movimientos');

    const movimientos = [];
    const abiertos = [];
    for (const fila of filas) {
      if (!fila || typeof fila !== 'object') continue;
      const m = this._aMovimiento(fila, mapeo, canal, banco);
      // Sin importe no hay movimiento: no se inventa.
      if (m.value.importe === null) { abiertos.push({ fila, faltantes: m.faltantes }); continue; }
      m.value.clave = this._clave(m.value);
      movimientos.push(m.value);
      if (m.faltantes.length) abiertos.push({ clave: m.value.clave, faltantes: m.faltantes });
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        banco,
        canal,
        adaptador_declarado: Boolean(input.mapeo),
        total: movimientos.length,
        abiertos,
        movimientos,
        // Cruza FORMATO, no decide CONTENIDO: no interpreta partidas ni cruza con el libro.
        conciliado: false
      }
    };
  }

  // Traduce una fila externa al Movimiento canonico con el mapeo DECLARADO del banco.
  _aMovimiento(fila, mapeo, canal, banco) {
    const value = { banco, canal };
    const faltantes = [];
    for (const campo of CAMPOS_MOVIMIENTO) {
      const clave = mapeo[campo] != null ? String(mapeo[campo]) : campo;
      const raw = fila[clave];
      if (raw === undefined || raw === null || raw === '') {
        value[campo] = null;              // desconocido — NO se estima
        faltantes.push(campo);
      } else {
        value[campo] = raw;
      }
    }
    // El importe se normaliza a numero sin signo; el SIGNO viaja aparte y declarado.
    const importe = Number(value.importe);
    value.importe = Number.isFinite(importe) ? Math.abs(importe) : null;
    value.signo = value.signo != null ? String(value.signo)
      : (Number.isFinite(importe) ? (importe < 0 ? 'cargo' : 'abono') : null);

    // Los campos extra del banco se conservan bajo `metadatos` (no se pierde nada).
    const conocidas = new Set(CAMPOS_MOVIMIENTO.map((c) => (mapeo[c] != null ? String(mapeo[c]) : c)));
    const metadatos = {};
    for (const [k, v] of Object.entries(fila)) if (!conocidas.has(k)) metadatos[k] = v;
    value.metadatos = metadatos;
    value.abierto = faltantes;
    return { value, faltantes };
  }

  // Clave natural del movimiento: fecha + importe + signo + referencia declarada (o concepto).
  _clave(m) {
    const partes = [m.fecha, m.importe, m.signo, (m.referencia != null ? m.referencia : m.concepto)];
    return partes.map(v => (v === null || v === undefined ? '-' : String(v))).join('|');
  }

  // Resuelve el mapeo declarado. Sin mapeo, solo el canal canonico declarado.
  _mapeoDe(input, canal) {
    if (input.mapeo && typeof input.mapeo === 'object') return input.mapeo;
    if (canal === 'canonico' || canal === 'enki') {
      const identidad = {};
      for (const c of CAMPOS_MOVIMIENTO) identidad[c] = c;
      return identidad;
    }
    return null;
  }

  // Los canales declarables los declara el sitio; el modulo NO conoce ningun banco de memoria.
  _canales(input = {}) {
    return Array.isArray(input.canales_declarables)
      ? input.canales_declarables.map((c) => String(c)).filter(Boolean)
      : [];
  }

  // ── Tools ──
  toolEntrar(params) { return this._entrar(params); }
}

module.exports = PuertoExtracto;
