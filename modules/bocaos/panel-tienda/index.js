'use strict';

/**
 * panel-tienda · REFLEJO · TIENDA — L01 (PanelTienda).
 *
 * LO QUE LA TIENDA VE DE SU PROPIO MERCADO: espera medida · puntualidad · propuestas recibidas ·
 * pedidos sin repartidor · y QUÉ UMBRALES está aplicando ella misma.
 *
 * La regla que hace que este panel sirva para algo: ES LA MISMA INFORMACIÓN QUE VE EL RIDER antes de
 * aceptar, con la misma fuente y el mismo número. Si hubiera una versión para el que paga y otra para
 * el que sufre, el mercado dejaría de corregir y empezaría a negociar. Por eso el panel NO recalcula
 * nada: la puntualidad es la de `medida-cocina` (L03), los umbrales son los de `config-mercado` (J04,
 * con su capa y su autor) y la cobertura es la de `frontera-plaza` (S01). Un solo número, una sola
 * fuente, y se dice cuál es.
 *
 * Lo que el panel NO hace: no lee el almacén de la plaza. Las propuestas y los pedidos sin rider son
 * el SNAPSHOT que la plaza le entrega (el dato viaja en el evento); si no viene, el panel dice
 * «sin snapshot» en vez de un 0 tranquilizador. Un 0 y un «no lo sé» no son lo mismo cuando alguien
 * decide si subir el incentivo.
 *
 * Sin store y sin PosPersistencia: no escribe nada. Es una vista, no un registro.
 *
 * Isla: cero require a otra isla.
 */

const ModuloBocaos = require('../_bocaos');

const TIMEOUT_BUS_MS = 2500;
const MAX_LISTA = 50;

class PanelTienda extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'panel-tienda';
    this.version = 'reflejo-0.1.0';
    this._path = null;
    this.tiempo_bus_ms = TIMEOUT_BUS_MS;
  }

  // ================= RPC del bus =================
  onVerRequest(e) { return this.servir(e, 'ver', 'panel-tienda.ver', (d) => this._ver(d)); }

  // ================= L01 · ver =================
  async _ver(d) {
    if (!d.project_id) return this._invalid('project_id');
    const tienda_id = d.tienda_id || d.project_id;
    const plaza_id = d.plaza_id || null;

    // Una tienda ve su panel; la plaza puede leer el de una tienda (es su plaza). Otra tienda, no.
    const quien = String(d.project_id);
    if (!/^plaza-/.test(quien) && d.tienda_id && quien !== tienda_id) {
      return this._errorResponse(403, 'TIENDA_AJENA',
        'el panel de una tienda no lo lee otra tienda: la propiedad del cliente es de cada una (L02)',
        { field: 'tienda_id', pedido: tienda_id, quien });
    }

    const periodo = this._periodo(d.periodo);
    const huecos = [];

    const [medida, politica, cobertura] = await Promise.all([
      this._puntualidad(d, tienda_id, plaza_id),
      this._umbrales(d, plaza_id, tienda_id),
      this._cobertura(d, plaza_id)
    ]);
    if (!medida) huecos.push('sin medida de la cocina (L03)');
    if (!politica) huecos.push('sin política viva que enseñar (J04)');
    if (!cobertura) huecos.push('sin cobertura declarada para esa zona (S01)');

    const plaza = this._plazaDe(d, huecos);

    return {
      status: 200,
      data: {
        panel: {
          tienda_id,
          plaza_id,
          periodo,
          // L01 · un solo número: el que también ve el rider antes de aceptar.
          espera_medida_min: medida ? medida.espera_medida_min : null,
          puntualidad: medida || { estado: 'NO_CONSTA', hueco: 'sin medida de la cocina (L03)' },
          umbrales: politica || { estado: 'NO_CONSTA', hueco: 'sin política viva (J04)' },
          cobertura: cobertura || { estado: 'NO_CONSTA', hueco: 'sin cobertura para esa zona (S01)' },
          propuestas: plaza.propuestas,
          pedidos_sin_repartidor: plaza.pedidos_sin_repartidor,
          huecos: [...new Set([...huecos, ...plaza.huecos])],
          // L01 · se dice en el propio panel: no hay versión amable.
          version_amable: false,
          audiencia: 'la misma para la tienda y para el rider: misma fuente, mismo número',
          nota: null
        }
      }
    };
  }

  // ================= las tres lecturas =================
  async _puntualidad(d, tienda_id, plaza_id) {
    try {
      const r = await this._rpc('medida-cocina.medir.request', {
        project_id: d.project_id, tienda_id, plaza_id,
        hechos: d.hechos || d.muestras || [],
        franja: d.franja || null,
        minimo_n: d.minimo_n
      }, { timeout_ms: this.tiempo_bus_ms });
      const m = r && r.status === 200 && r.data ? r.data.medida : null;
      if (!m) return null;
      // Se devuelve tal cual, SIN recomponer: si el panel recalculara, habría dos números.
      return m;
    } catch (_) {
      return null;
    }
  }

  // J04 · qué números rige, de qué capa y con qué autor. La tienda tiene que saber si los suyos están
  // vigentes o si está viviendo del default de la plaza (L01).
  async _umbrales(d, plaza_id, tienda_id) {
    if (!plaza_id) return null;
    try {
      const r = await this._rpc('config-mercado.politica.request', {
        project_id: plaza_id, plaza_id, tienda_id, instante: this._iso(d.instante) || this.ahora()
      }, { timeout_ms: this.tiempo_bus_ms });
      const p = r && r.status === 200 && r.data ? r.data.politica : null;
      if (!p) return null;
      return {
        estado: 'VIGENTE',
        capa: p.capa,
        es_suya: p.capa === 'tienda' && p.tienda_id === tienda_id,
        version: p.version,
        autor: p.autor,
        desde: p.desde,
        acta: p.acta,
        fuente: p.fuente,
        umbrales: p.umbrales,
        ventana_s: p.ventana_s,
        esperas: p.esperas,
        // Lo que la tienda NO ve: no se le enseña la política de nadie más.
        nota: p.capa === 'tienda'
          ? 'rige TU declaración: esto es lo que se te está aplicando'
          : 'rige el default de la plaza: no has declarado umbrales propios (o los tuyos no están vigentes)'
      };
    } catch (_) {
      return null;
    }
  }

  async _cobertura(d, plaza_id) {
    const zona = d.zona || (d.direccion && d.direccion.zona) || null;
    if (!zona || !plaza_id) return null;
    try {
      const r = await this._rpc('frontera-plaza.cubre.request', {
        project_id: plaza_id, plaza_id, direccion: { zona }
      }, { timeout_ms: this.tiempo_bus_ms });
      const c = r && r.data;
      if (!c) return null;
      return {
        estado: c.estado || (c.cubre === true ? 'PLAZA' : 'NO_CONSTA'),
        zona,
        cubre: c.cubre === undefined ? null : c.cubre,
        plaza_id: c.plaza_id || null,
        motivo: c.motivo || null,
        hueco: c.hueco || null
      };
    } catch (_) {
      return null;
    }
  }

  // ================= el snapshot de la plaza (viaja en la pregunta) =================
  _plazaDe(d, huecos) {
    const pedidos = Array.isArray(d.pedidos) ? d.pedidos : null;
    const propuestas = Array.isArray(d.propuestas) ? d.propuestas : null;

    if (!pedidos && !propuestas) {
      huecos.push('sin snapshot de la plaza: propuestas y pedidos sin rider no se pueden contar');
      return {
        propuestas: { estado: 'NO_CONSTA', hueco: 'sin snapshot', recibidas: null, desglose: null },
        pedidos_sin_repartidor: { estado: 'NO_CONSTA', hueco: 'sin snapshot', cuenta: null, pedidos: [] },
        huecos: []
      };
    }

    const desglose = {};
    for (const p of propuestas || []) {
      const e = p.estado || p.desglose || 'sin_estado';
      desglose[e] = (desglose[e] || 0) + 1;
    }
    const sinRider = (pedidos || []).filter((p) => !p.rider_id && !p.contrato_id);

    return {
      propuestas: {
        estado: propuestas ? 'CONTADA' : 'NO_CONSTA',
        recibidas: propuestas ? propuestas.length : null,
        desglose: propuestas ? desglose : null
      },
      pedidos_sin_repartidor: {
        estado: pedidos ? 'CONTADA' : 'NO_CONSTA',
        cuenta: pedidos ? sinRider.length : null,
        // Los suyos: la tienda reconoce sus pedidos por id, no por el nombre del cliente (L02).
        pedidos: sinRider.slice(0, MAX_LISTA).map((p) => p.pedido_id || null).filter(Boolean)
      },
      huecos: []
    };
  }

  _periodo(p) {
    if (!p || typeof p !== 'object') return null;
    return { desde: this._iso(p.desde), hasta: this._iso(p.hasta) };
  }
}

module.exports = PanelTienda;
module.exports.MAX_LISTA = MAX_LISTA;
