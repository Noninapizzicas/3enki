'use strict';

/**
 * cargo-fallo · CUSTODIO · PLAZA — G04 (CargoFallo).
 *
 * EL CARGO POR FALLO COMO DEUDA CON NOMBRE Y EVIDENCIA. Tres reglas que son el módulo:
 *
 *   1. SIN EVIDENCIA NO HAY CARGO. Si la adjudicación no trae hechos enumerables con hora, la deuda
 *      NO nace y se publica el INTENTO (`bocaos.cargo_sin_evidencia`): un rechazo silencioso es
 *      indistinguible de un fallo del sistema, y aquí se tiene que poder mirar.
 *   2. NACE COMO DEUDA ENTRE DOS PARTES, NO COMO DESCUENTO. La plaza no retiene (H06), así que no
 *      puede descontar de un dinero que no tiene. Una deuda no se compensa con un devengo: se anota,
 *      se ve en la cuenta de las dos partes, y cómo se hace efectivo es Q29 [ABIERTO].
 *   3. SIN IMPORTE TAMBIÉN ES UNA DEUDA. La tabla de G03 devuelve quién, no cuánto (Q28): el cargo
 *      nace con `importe_centimos: null` y `importe_estado: 'NO_CONSTA'` en vez de con un número
 *      inventado. Un cero sería una deuda saldada sin que nadie pagara.
 *
 * Single-writer: nadie más escribe este hecho. Store `/bocaos/cargo-fallo.json` por proyecto.
 *
 * El estado de un cargo vive en el MISMO hecho (`bocaos.cargo_anotado` con `estado`), porque el plano
 * le da un solo nombre al hecho de este agregado: `anotado` al nacer y `anulado` al anularse son dos
 * transiciones de la misma deuda (medido → anotado → cobrado · anulado), no dos hechos distintos.
 *
 * Isla: cero require a otra isla.
 */

const crypto = require('crypto');
const ModuloBocaos = require('../_bocaos');

const ESTADOS_CARGO = ['ANOTADO', 'COBRADO', 'ANULADO'];

class CargoFallo extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'cargo-fallo';
    this.version = 'custodio-0.1.0';
    this._path = '/bocaos/cargo-fallo.json';
  }

  // ================= RPC del bus =================
  onAnularRequest(e) { return this.servir(e, 'anular', 'cargo-fallo.anular', (d) => this._anular(d)); }
  onDeRequest(e) { return this.servir(e, 'de', 'cargo-fallo.de', (d) => this._de(d)); }

  // ================= hechos que escucha =================
  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (d.project_id) await this.estado(d.project_id);
  }

  // G04 · la adjudicación llega de `regla-fallo`. Aquí se decide si nace deuda, y con qué.
  async onFalloMedido(e) {
    const d = this.datos(e);
    const plaza_id = this.plaza_id || d.plaza_id || d.project_id;
    if (!plaza_id || !d.pedido_id) return null;

    const filas = Array.isArray(d.filas) ? d.filas : [];
    const evidencia = Array.isArray(d.evidencia) ? d.evidencia : [];
    const anotables = filas.filter((f) => f.excedido === true && f.deudor && f.acreedor);

    if (anotables.length === 0) {
      // No hay fila con dos partes: no hay deuda. No es un error, es que el fallo no se adjudicó.
      this.logger?.warn('cargo-fallo.sin_fila_adjudicada', { pedido_id: d.pedido_id });
      return null;
    }
    if (evidencia.length === 0) {
      // G04/G06: sin evidencia NO nace. Se publica el intento.
      this.hecho('bocaos.cargo_sin_evidencia', {
        pedido_id: d.pedido_id,
        plaza_id,
        tienda_id: d.tienda_id || null,
        contrato_id: d.contrato_id || null,
        filas: anotables.map((f) => f.fila),
        motivo: 'la adjudicación no trae hechos con hora: sin evidencia no hay cargo (G04/G06)',
        deuda: false
      });
      return null;
    }
    if (d.traza_estado && d.traza_estado !== 'CONFORME') {
      this.hecho('bocaos.cargo_sin_evidencia', {
        pedido_id: d.pedido_id,
        plaza_id,
        contrato_id: d.contrato_id || null,
        filas: anotables.map((f) => f.fila),
        motivo: `la traza no sostiene el cargo (${d.traza_estado}): no nace deuda (G06)`,
        deuda: false
      });
      return null;
    }

    for (const fila of anotables) await this._anotar({ ...d, plaza_id }, fila, evidencia);
    return null;
  }

  // ================= G04 · anotar =================
  async _anotar(d, fila, evidencia) {
    const est = await this.estado(d.project_id || d.plaza_id);
    est.cargos = est.cargos || {};

    // Una deuda por (pedido, fila): el mismo fallo medido dos veces no debe dos veces.
    const ya = Object.values(est.cargos).find((c) => c.pedido_id === d.pedido_id && c.fila === fila.fila && c.estado !== 'ANULADO');
    if (ya) return ya;

    const cargo = {
      cargo_id: `cg-${crypto.randomUUID().slice(0, 8)}`,
      pedido_id: d.pedido_id,
      plaza_id: d.plaza_id,
      tienda_id: d.tienda_id || null,
      contrato_id: d.contrato_id || null,
      fila: fila.fila,
      // Las dos partes, con nombre. Sin ellas no hay deuda: hay una queja.
      deudor: { rol: fila.deudor.rol, parte_id: fila.deudor.parte_id },
      acreedor: { rol: fila.acreedor.rol, parte_id: fila.acreedor.parte_id },
      // Q28: la tabla no tiene importes. El cargo nace sin número, no con un cero.
      importe_centimos: null,
      importe_estado: 'NO_CONSTA',
      motivo_importe: 'la tabla de importes por fallo está [ABIERTO] (Q28): nace la deuda, no el número',
      minutos: Number.isFinite(fila.min) ? fila.min : null,
      // G06 · la evidencia enumerable, con hora: es lo que separa un cargo de un abuso.
      evidencia,
      regla: fila.regla || null,
      estado: 'ANOTADO',
      anotado_en: this.ahora(),
      anulado_en: null,
      anulado_por: null,
      motivo_anulacion: null,
      // H06 · la plaza no retiene y no descuenta: la deuda se ve, no se cobra sola.
      cobrado: false,
      descontado: false,
      retenido: false,
      como_se_hace_efectivo: 'Q29 [ABIERTO]: compensación, pago directo o fianza — se acumula y se ve'
    };

    est.cargos[cargo.cargo_id] = cargo;
    await this.guardar(d.project_id || d.plaza_id);

    this._publicar(cargo, { transicion: 'anotado' });
    return cargo;
  }

  // ================= G04 · anular (ORDEN) =================
  async _anular(d) {
    const project_id = d.project_id || this.plaza_id;
    if (!project_id) return this._invalid('project_id');
    if (!d.cargo_id) return this._invalid('cargo_id');

    // H06 · ni anular ni nada sirve para descontar un devengo: la plaza no retiene.
    const prohibido = ['descontar', 'compensar', 'retener', 'retener_de_devengo'].find((k) => d[k] === true);
    if (prohibido) {
      return this._errorResponse(409, 'NO_DESCUENTO',
        'la plaza no retiene: una deuda no se compensa con un devengo (H06)',
        { field: prohibido, hueco: 'no se descuenta' });
    }

    const est = await this.estado(project_id);
    const cargo = est.cargos?.[d.cargo_id];
    if (!cargo) {
      return this._errorResponse(404, 'NO_CONSTA', 'no hay cargo con ese id en esta plaza',
        { field: 'cargo_id', hueco: 'cargo inexistente' });
    }
    if (cargo.estado === 'ANULADO') {
      return { status: 200, data: { cargo, idempotente: true } };
    }
    if (cargo.estado === 'COBRADO') {
      return this._errorResponse(409, 'YA_COBRADO',
        'un cargo cobrado no se anula: se abre otro documento con su hora, nunca se edita el pasado (H02)',
        { field: 'cargo_id' });
    }

    const autor = this._autor(d.autor);
    if (!autor) {
      return this._errorResponse(400, 'INVALID_INPUT',
        'anular exige autor y motivo: una deuda no desaparece porque sí (G04)', { field: 'autor' });
    }
    const motivo = typeof d.motivo === 'string' ? d.motivo.trim() : '';
    if (!motivo) {
      return this._errorResponse(400, 'INVALID_INPUT', 'anular exige motivo', { field: 'motivo' });
    }

    cargo.estado = 'ANULADO';
    cargo.anulado_en = this._iso(d.hora) || this.ahora();
    cargo.anulado_por = autor;
    cargo.motivo_anulacion = motivo;
    await this.guardar(project_id);

    this._publicar(cargo, { transicion: 'anulado' });
    return { status: 200, data: { cargo } };
  }

  // ================= G04 · de (PREGUNTA) =================
  async _de(d) {
    const project_id = d.project_id || this.plaza_id;
    if (!project_id) return this._invalid('project_id');
    const est = await this.estado(project_id);
    const todos = Object.values(est.cargos || {});

    if (d.cargo_id) {
      const c = est.cargos?.[d.cargo_id];
      if (!c) return this._errorResponse(404, 'NO_CONSTA', 'no hay cargo con ese id', { field: 'cargo_id' });
      return { status: 200, data: { cargo: c, saldo: this._saldo([c]) } };
    }
    if (!d.pedido_id && !d.parte_id) {
      return this._invalid('pedido_id');
    }

    const cargos = todos.filter((c) =>
      (!d.pedido_id || c.pedido_id === d.pedido_id) &&
      (!d.parte_id || c.deudor.parte_id === d.parte_id || c.acreedor.parte_id === d.parte_id));

    return { status: 200, data: { cargos, saldo: this._saldo(cargos) } };
  }

  // El saldo se dice con lo que se tiene: los cargos, sus partes y que el importe no consta.
  _saldo(cargos) {
    const vivos = cargos.filter((c) => c.estado !== 'ANULADO');
    const sinImporte = vivos.filter((c) => c.importe_centimos === null).length;
    return {
      cargos: cargos.length,
      vivos: vivos.length,
      anulados: cargos.length - vivos.length,
      // Ni 0 ni una suma de nulls: se dice que no consta.
      total_centimos: vivos.every((c) => Number.isInteger(c.importe_centimos))
        ? vivos.reduce((s, c) => s + c.importe_centimos, 0)
        : null,
      total_estado: sinImporte > 0 ? 'NO_CONSTA' : 'SUMA',
      motivo: sinImporte > 0 ? `${sinImporte} de ${vivos.length} cargos sin importe (Q28)` : null
    };
  }

  _publicar(cargo, { transicion }) {
    this.hecho('bocaos.cargo_anotado', {
      cargo_id: cargo.cargo_id,
      pedido_id: cargo.pedido_id,
      plaza_id: cargo.plaza_id,
      tienda_id: cargo.tienda_id,
      contrato_id: cargo.contrato_id,
      fila: cargo.fila,
      deudor: cargo.deudor,
      acreedor: cargo.acreedor,
      importe_centimos: cargo.importe_centimos,
      importe_estado: cargo.importe_estado,
      minutos: cargo.minutos,
      evidencia: cargo.evidencia,
      // El estado viaja en el hecho: `anotado` y `anulado` son transiciones de la MISMA deuda.
      estado: cargo.estado,
      transicion,
      anotado_en: cargo.anotado_en,
      anulado_en: cargo.anulado_en,
      anulado_por: cargo.anulado_por,
      motivo_anulacion: cargo.motivo_anulacion,
      cobrado: cargo.cobrado,
      descontado: cargo.descontado,
      retenido: cargo.retenido
    });
  }

  _autor(a) {
    if (typeof a === 'string' && a.trim()) return a.trim();
    if (a && typeof a === 'object') return a.id || a.parte_id || a.rol || a.nombre || null;
    return null;
  }
}

module.exports = CargoFallo;
module.exports.ESTADOS_CARGO = ESTADOS_CARGO;
