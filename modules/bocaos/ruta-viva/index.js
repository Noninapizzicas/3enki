'use strict';

/**
 * ruta-viva · CUSTODIO · PLAZA — B01 (PosiciónRider) · B02 (ParadasPendientes) ·
 * B03 (PromesaPorParada) · B04 (OrdenDeParadas) · B05 (CapacidadDeclarada) · B06 (FinDeTrayecto).
 *
 * EL TRAYECTO QUE EL RIDER YA LLEVA ENCIMA: el último punto con su frescura, las paradas que sus
 * contratos vivos le imponen, la promesa de cada parada y cuánto le cabe. Por plaza: un rider en
 * dos plazas tiene dos trayectorias y una sola espalda (§7.9).
 *
 * Cuatro reglas que son el módulo:
 *
 *   1. SE GUARDA EL ÚLTIMO PUNTO, NO UNA TRAZA. Un hecho, no un chorro. Y un punto VIEJO no es un
 *      punto: pasado el horizonte de frescura (declarado en config-mercado) la posición es
 *      NO_CONSTA y quien la lea lo verá como hueco, no como «está a 400 m».
 *   2. LAS PARADAS SE DERIVAN de los contratos vivos. No hay lista guardada: si un contrato se
 *      cierra, su parada desaparece sola. Una lista guardada se queda vieja y miente.
 *   3. LA PROMESA SÓLO SE PUEDE MEJORAR. Empeorarla por debajo del umbral de retraso es
 *      PROMESA_ROTA (A31): hay un cliente que no participó en la decisión del enlace.
 *   4. EL ORDEN ES DE UNA RUTA Y SÓLO DE UNA. Vecino más cercano desde el último punto, con
 *      desempate declarado (pedido_id). La misma ruta da siempre el mismo orden: si el desempate
 *      fuera aleatorio, la reproducción de una decisión (A29) fallaría y nadie sabría por qué.
 *
 * La capacidad (B05) se declara, no se estima, y se difunde como HECHO: estado-parte la refleja
 * para el censo sin volver a escribirla. Nadie más la escribe aquí.
 *
 * Isla: no lee el almacén de nadie. La frescura, la velocidad y el umbral de retraso se PREGUNTAN
 * al bus (config-mercado); lo que no contesta cae al default de la F0, y se dice.
 */

const ModuloBocaos = require('../_bocaos');

const RUTA_DEFAULT = {
  frescura_s: 90,
  velocidad_kmh: 18,
  factor_calle: 1.35,
  // Lo que cuesta meter UNA parada más: minutos de ventana y metros de desvío. Son números
  // DECLARADOS (config-mercado), no constantes escondidas en esta isla.
  coste_parada_min: 3,
  desvio_por_parada_m: 400
};
const RETRASO_DEFAULT = 6;
const TIERRA_M = 6371000;

const rad = (g) => (g * Math.PI) / 180;

// Distancia en línea recta (m). Determinista y sin puerto externo: la misma posición da el
// mismo número siempre, que es lo que A29 necesita para poder reproducir una decisión.
function haversine(a, b) {
  if (!a || !b) return null;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

class RutaViva extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'ruta-viva';
    this.version = 'custodio-0.1.0';
    this._path = '/bocaos/ruta-viva.json';
  }

  // ================= RPC del bus (una línea por op) =================
  onPosicionRequest(e) { return this.servir(e, 'posicion', 'ruta-viva.posicion', (d) => this._posicion(d)); }
  onParadasRequest(e) { return this.servir(e, 'paradas', 'ruta-viva.paradas', (d) => this._paradas(d)); }
  onPromesaRequest(e) { return this.servir(e, 'promesa', 'ruta-viva.promesa', (d) => this._promesa(d)); }
  onCapacidadRequest(e) { return this.servir(e, 'capacidad', 'ruta-viva.capacidad', (d) => this._capacidad(d)); }
  // La foto del mercado (A02) necesita la ruta ENTERA de la plaza de una vez: es la misma
  // pregunta que `paradas`, con todos los riders dentro y con el ETA a la tienda del pedido.
  onDeRequest(e) { return this.servir(e, 'de', 'ruta-viva.de', (d) => this._de(d)); }

  // ================= hechos que escucha =================
  async onContratoCreado(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.rider_id || !d.pedido_id) return null;
    const est = await this.estado(d.project_id);
    const r = this._rider(est, d.rider_id, d.plaza_id || d.project_id);
    r.contratos[d.pedido_id] = {
      contrato_id: d.contrato_id || `ct-${d.pedido_id}`,
      pedido_id: d.pedido_id,
      tienda_id: d.tienda_id || null,
      punto: d.punto || null,
      destino: d.destino || null,
      zona: d.zona || null,
      hora_contrato: this._iso(d.hora_contrato) || this.ahora(),
      hora_prometida: this._iso(d.hora_prometida) || null,
      precio_cents: Number.isInteger(d.precio_cents) ? d.precio_cents : null,
      recogida_en: null,
      entrega_en: null,
      cerrado_en: null
    };
    if (!r.trayecto.abierto_en) r.trayecto.abierto_en = this._iso(d.hora_contrato) || this.ahora();
    r.trayecto.cerrado_en = null;
    await this.guardar(d.project_id);
    return null;
  }

  // B02 + B06: la parada se DERIVA del contrato, así que cerrarlo la borra sin escribir nada.
  async onContratoCerrado(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.rider_id) return null;
    const est = await this.estado(d.project_id);
    const r = est.riders?.[d.rider_id];
    if (!r) return null;

    if (d.pedido_id && r.contratos[d.pedido_id]) {
      r.contratos[d.pedido_id].cerrado_en = this._iso(d.hora_cierre) || this.ahora();
      delete r.contratos[d.pedido_id];
    } else if (d.contrato_id) {
      for (const [pedido_id, c] of Object.entries(r.contratos)) {
        if (c.contrato_id === d.contrato_id) delete r.contratos[pedido_id];
      }
    }
    delete r.promesas[d.pedido_id];

    if (Object.keys(r.contratos).length === 0 && r.trayecto.abierto_en) {
      r.trayecto.cerrado_en = this._iso(d.hora_cierre) || this.ahora();
      r.trayecto.abierto_en = null;
      await this.guardar(d.project_id);
      // B06: cerrar no puntúa a nadie. Sólo deja de contar para la ruta viva.
      this.hecho('bocaos.trayecto_cerrado', {
        rider_id: r.rider_id,
        plaza_id: r.plaza_id,
        hora: r.trayecto.cerrado_en,
        motivo: d.motivo || 'última parada entregada',
        paradas_restantes: 0
      });
      return null;
    }
    await this.guardar(d.project_id);
    return null;
  }

  async onHechoRepartoAnotado(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id) return null;
    const est = await this.estado(d.project_id);
    for (const r of Object.values(est.riders || {})) {
      const c = r.contratos[d.pedido_id];
      if (!c) continue;
      const hora = this._iso(d.hora) || this.ahora();
      if (d.tipo === 'recogida') c.recogida_en = hora;
      if (d.tipo === 'entrega') c.entrega_en = hora;
      await this.guardar(d.project_id);
      return null;
    }
    return null;
  }

  // El contrato dice QUIÉN y CUÁNDO, pero no dónde: los puntos viajaron con el hecho de listo.
  // Se guardan aquí para que la parada derivada del contrato tenga su punto — y su ETA — sin
  // preguntar por el almacén de nadie.
  async onPedidoListo(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id) return null;
    const est = await this.estado(d.project_id);
    est.pedidos = est.pedidos || {};
    est.pedidos[d.pedido_id] = {
      punto: d.punto || null,
      destino: d.destino || null,
      zona: d.zona || null,
      tienda_id: d.tienda_id || null,
      hora_listo: this._iso(d.hora_listo) || null
    };
    await this.guardar(d.project_id);
    return null;
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (d.project_id) await this.estado(d.project_id);
  }

  // ================= B01 · anotar el último punto =================
  async _posicion(d) {
    if (!d.project_id) return this._invalid('project_id');
    const rider_id = d.rider_id || d.parte_id;
    if (!rider_id) return this._invalid('rider_id');
    const punto = this._punto(d.punto || d);
    if (!punto) {
      return this._errorResponse(400, 'INVALID_INPUT', 'el punto necesita lat y lng numéricos', { field: 'punto' });
    }
    const hora = this._iso(d.hora) || this.ahora();

    const est = await this.estado(d.project_id);
    const r = this._rider(est, rider_id, d.plaza_id || d.project_id);
    // Un punto, no un chorro: se pisa el anterior.
    r.posicion = { lat: punto.lat, lng: punto.lng, hora, fuente: d.fuente || 'rider' };
    if (!r.trayecto.abierto_en && !r.trayecto.cerrado_en) r.trayecto.abierto_en = hora;
    await this.guardar(d.project_id);

    this.hecho('bocaos.posicion_anotada', {
      rider_id,
      plaza_id: r.plaza_id,
      punto: { lat: punto.lat, lng: punto.lng },
      hora,
      fuente: r.posicion.fuente
    });

    return { status: 200, data: { rider_id, plaza_id: r.plaza_id, punto: { lat: punto.lat, lng: punto.lng }, hora } };
  }

  // ================= B02/B04 · las paradas, en su orden =================
  async _paradas(d) {
    if (!d.project_id) return this._invalid('project_id');
    const rider_id = d.rider_id || d.parte_id;
    if (!rider_id) return this._invalid('rider_id');
    const cfg = await this._cfg(d);
    const est = await this.estado(d.project_id);
    const r = est.riders?.[rider_id];
    if (!r) {
      return this._errorResponse(404, 'RUTA_NO_CONSTA', 'ese rider no tiene trayecto en esta plaza: no ha anotado punto ni tiene contrato', { field: 'rider_id' });
    }
    const vista = this._vista(r, this._iso(d.instante) || this.ahora(), cfg, d.tienda || d.punto || null, est.pedidos || {});
    return { status: 200, data: vista };
  }

  // ================= B03 · la promesa =================
  async _promesa(d) {
    if (!d.project_id) return this._invalid('project_id');
    const rider_id = d.rider_id || d.parte_id;
    if (!rider_id) return this._invalid('rider_id');
    if (!d.pedido_id) return this._invalid('pedido_id');
    const hora = this._iso(d.hora) || this._iso(d.hora_prometida);
    if (!hora) return this._invalid('hora');

    const est = await this.estado(d.project_id);
    const r = est.riders?.[rider_id];
    const contrato = r?.contratos?.[d.pedido_id];
    if (!contrato) {
      return this._errorResponse(404, 'PARADA_NO_CONSTA',
        'no se promete por una parada que no existe: el contrato vivo no está en esta ruta', { field: 'pedido_id' });
    }

    const previa = r.promesas[d.pedido_id] || (contrato.hora_prometida ? { hora: contrato.hora_prometida, version: 0 } : null);
    if (previa && Date.parse(hora) > Date.parse(previa.hora)) {
      const perdida_min = this._round((Date.parse(hora) - Date.parse(previa.hora)) / 60000, 2);
      const cfg = await this._cfg(d);
      if (perdida_min < cfg.retraso_min) {
        // A31 · GuardaEnlaceNoRompePromesa: el cliente no participó en esta decisión.
        return this._errorResponse(409, 'PROMESA_ROTA',
          `empeorar la promesa ${perdida_min} min no pasa el umbral de retraso (${cfg.retraso_min} min): la promesa no se rompe`,
          { field: 'hora', prometida: previa.hora, nueva: hora, perdida_min, umbral_min: cfg.retraso_min });
      }
    }

    const version = (previa?.version || 0) + 1;
    r.promesas[d.pedido_id] = { hora, version, guardada_en: this.ahora(), autor: d.autor || rider_id, motivo: d.motivo || null };
    if (!contrato.hora_prometida) contrato.hora_prometida = hora;
    await this.guardar(d.project_id);

    this.hecho('bocaos.promesa_guardada', {
      rider_id,
      plaza_id: r.plaza_id,
      pedido_id: d.pedido_id,
      contrato_id: contrato.contrato_id,
      hora,
      hora_anterior: previa ? previa.hora : null,
      version,
      mejora: previa ? Date.parse(hora) <= Date.parse(previa.hora) : null,
      motivo: d.motivo || null
    });

    return { status: 200, data: { pedido_id: d.pedido_id, rider_id, promesa: r.promesas[d.pedido_id] } };
  }

  // ================= B05 · la capacidad =================
  async _capacidad(d) {
    if (!d.project_id) return this._invalid('project_id');
    const rider_id = d.rider_id || d.parte_id;
    if (!rider_id) return this._invalid('rider_id');
    if (!Number.isInteger(d.capacidad) || d.capacidad < 0) {
      // B05: se declara, no se estima. El sistema no la deduce del historial.
      return this._errorResponse(400, 'INVALID_INPUT',
        'la capacidad se declara con un entero (0 o más): no se estima', { field: 'capacidad' });
    }
    const hora = this._iso(d.hora) || this.ahora();
    const est = await this.estado(d.project_id);
    const r = this._rider(est, rider_id, d.plaza_id || d.project_id);
    r.capacidad = d.capacidad;
    r.capacidad_hora = hora;
    await this.guardar(d.project_id);

    // El hecho viaja con el número: estado-parte lo refleja en el censo sin volver a escribirlo.
    this.hecho('bocaos.capacidad_declarada', {
      rider_id,
      plaza_id: r.plaza_id,
      capacidad: d.capacidad,
      hora,
      autor: d.autor || rider_id
    });

    return { status: 200, data: { rider_id, plaza_id: r.plaza_id, capacidad: d.capacidad, hora } };
  }

  // ================= A02 · la ruta viva de la plaza (pregunta de la foto) =================
  async _de(d) {
    if (!d.project_id) return this._invalid('project_id');
    const cfg = await this._cfg(d);
    const est = await this.estado(d.project_id);
    const instante = this._iso(d.instante) || this.ahora();
    const tienda = this._punto(d.tienda) || null;

    const todos = Object.values(est.riders || {});
    const elegidos = (d.rider_id || d.parte_id)
      ? todos.filter((r) => r.rider_id === (d.rider_id || d.parte_id))
      : todos;

    if ((d.rider_id || d.parte_id) && elegidos.length === 0) {
      return this._errorResponse(404, 'RUTA_NO_CONSTA', 'ese rider no tiene trayecto en esta plaza', { field: 'rider_id' });
    }

    const plaza_id = this.plaza_id || d.plaza_id || d.project_id;
    const rutas = elegidos
      .filter((r) => !r.plaza_id || r.plaza_id === plaza_id)   // A35: la otra plaza no ve este trayecto
      .map((r) => this._vista(r, instante, cfg, tienda, est.pedidos || {}));

    return { status: 200, data: { plaza_id, instante, frescura_s: cfg.frescura_s, rutas } };
  }

  // ================= la vista de UNA ruta =================
  _vista(r, instante, cfg, tienda, pedidos = {}) {
    const t = Date.parse(instante);
    const pos = r.posicion || null;
    const edad_s = pos ? Math.round((t - Date.parse(pos.hora)) / 1000) : null;
    const fresca = !!(pos && Number.isFinite(edad_s) && edad_s <= cfg.frescura_s);
    const posicion = fresca ? { lat: pos.lat, lng: pos.lng, hora: pos.hora } : null;

    const huecos = [];
    if (!pos) huecos.push('sin posición anotada');
    else if (!fresca) huecos.push(`posición vieja (${edad_s} s > ${cfg.frescura_s} s): NO_CONSTA`);

    const { paradas, sin_promesa } = this._paradasDe(r, posicion, cfg, pedidos);
    if (sin_promesa.length > 0) {
      huecos.push(`sin promesa de la parada (${sin_promesa.map((p) => p.pedido_id).join(',')}): sin promesa no hay retraso`);
    }

    // El ETA a la tienda del pedido: es lo que mide la espera (A08). Sin destino no hay ETA, y
    // sin ETA la espera no se mide — se nombra el hueco en vez de suponerla.
    const destino = tienda || (paradas[0] && paradas[0].punto) || null;
    let eta_tienda_min = null;
    if (posicion && destino) eta_tienda_min = this._eta(posicion, destino, cfg);

    const promesas = {};
    for (const p of paradas) if (p.promesa) promesas[p.pedido_id] = p.promesa;
    for (const p of sin_promesa) promesas[p.pedido_id] = null;

    // B05 · La capacidad que de verdad le queda es el MÍNIMO de tres techos: lo que cabe en la
    // mochila, lo que cabe en la ventana de viaje (sin romper la promesa más próxima) y lo que
    // cabe sin pasarse del desvío acumulado. Cualquier otra cosa es suponer «2–3».
    const cap = this._capacidadEfectiva(r, paradas, instante, cfg, posicion);

    return {
      rider_id: r.rider_id,
      plaza_id: r.plaza_id,
      posicion,
      frescura: fresca ? 'fresca' : 'NO_CONSTA',
      edad_s: Number.isFinite(edad_s) ? edad_s : null,
      frescura_s: cfg.frescura_s,
      capacidad: Number.isInteger(r.capacidad) ? r.capacidad : null,
      capacidad_efectiva: cap.efectiva,
      capacidad_limites: cap.limites,
      capacidad_desvio_gastado_m: cap.gastado_m,
      capacidad_motivo: cap.motivo,
      capacidad_hora: r.capacidad_hora || null,
      paradas,
      sin_promesa,
      promesas,
      eta_tienda_min,
      trayecto: {
        abierto_en: r.trayecto.abierto_en || null,
        cerrado_en: r.trayecto.cerrado_en || null,
        contratos_vivos: Object.keys(r.contratos || {}).length
      },
      huecos
    };
  }

  // B02: las paradas salen de los contratos vivos; sólo cuentan para el retraso las que tienen
  // promesa (B03: sin promesa no hay retraso). Las demás se nombran aparte, no se esconden.
  _paradasDe(r, posicion, cfg, pedidos = {}) {
    const conPromesa = [];
    const sinPromesa = [];
    for (const c of Object.values(r.contratos || {})) {
      if (c.cerrado_en || c.entrega_en) continue;
      const dato = pedidos[c.pedido_id] || {};
      const promesa = r.promesas?.[c.pedido_id]?.hora || c.hora_prometida || null;
      const parada = {
        contrato_id: c.contrato_id,
        pedido_id: c.pedido_id,
        tienda_id: c.tienda_id || dato.tienda_id || null,
        tipo: 'entrega',
        // El destino es la parada; el hecho de listo trae los puntos que el contrato no lleva.
        punto: c.destino || dato.destino || c.punto || dato.punto || null,
        zona: c.zona || null,
        promesa,
        recogida_pendiente: !c.recogida_en,
        eta_min: null
      };
      (promesa ? conPromesa : sinPromesa).push(parada);
    }
    return {
      paradas: this._ordenar(conPromesa, posicion, cfg),
      sin_promesa: this._ordenar(sinPromesa, posicion, cfg)
    };
  }

  _capacidadEfectiva(r, paradas, instante, cfg, posicion) {
    const volumen = Number.isInteger(r.capacidad) ? r.capacidad : null;

    // techo 1 · la ventana de viaje: cuántas paradas más caben antes de romper la promesa más
    // próxima. Sin promesas no hay ventana que proteger (null = no limita).
    let holgura = null;
    for (const p of paradas) {
      if (!p.promesa || !Number.isFinite(p.eta_min)) continue;
      const h = (Date.parse(p.promesa) - (Date.parse(instante) + p.eta_min * 60000)) / 60000;
      holgura = holgura === null ? h : Math.min(holgura, h);
    }
    const ventana = holgura === null ? null : Math.max(0, Math.floor(holgura / cfg.coste_parada_min));

    // techo 2 · el desvío acumulado: lo que la ruta ya se aparta de la línea recta que uniría el
    // punto con su última parada. Contra el umbral de desvío de la plaza, a tanto por parada.
    const ruta_m = paradas.reduce((s, p) => s + (Number.isFinite(p.distancia_m) ? p.distancia_m : 0), 0);
    const ultima = paradas[paradas.length - 1];
    const recto_m = posicion && ultima && ultima.punto
      ? (haversine(posicion, ultima.punto) || 0) * cfg.factor_calle
      : 0;
    const gastado_m = Math.max(0, ruta_m - recto_m);
    const desvio = Math.max(0, Math.floor((cfg.desvio_m - gastado_m) / cfg.desvio_por_parada_m));

    const limites = { volumen, ventana, desvio };
    const techos = Object.values(limites).filter((v) => Number.isInteger(v));
    const efectiva = techos.length > 0 ? Math.min(...techos) : null;
    let motivo = null;
    if (efectiva === null) motivo = 'sin capacidad declarada: no hay elegibilidad (Q33)';
    else if (efectiva === volumen) motivo = 'volumen declarado';
    else if (efectiva === ventana) motivo = 'ventana de viaje: la promesa más próxima no da para más';
    else motivo = 'desvío acumulado: el umbral de la plaza no da para más';

    return { efectiva, limites, motivo, gastado_m: this._round(gastado_m, 0) };
  }

  // B04 · vecino más cercano desde el último punto, con desempate DECLARADO. Una ruta, y sólo
  // dentro de ella: nunca entre riders, nunca entre plazas. Pura: la misma ruta, el mismo orden.
  _ordenar(paradas, desde, cfg) {
    const resto = [...paradas];
    const out = [];
    let actual = desde && Number.isFinite(desde.lat) && Number.isFinite(desde.lng) ? desde : null;
    let acumulado = 0;

    while (resto.length > 0) {
      let elegido = 0;
      let mejor = null;
      for (let i = 0; i < resto.length; i += 1) {
        const p = resto[i];
        const metros = actual && p.punto ? haversine(actual, p.punto) : 0;
        const clave = {
          metros: metros === null ? Number.POSITIVE_INFINITY : metros,
          pedido_id: String(p.pedido_id || ''),
          contrato_id: String(p.contrato_id || '')
        };
        if (mejor === null || this._antes(clave, mejor)) { mejor = clave; elegido = i; }
      }
      const p = resto.splice(elegido, 1)[0];
      const metros = actual && p.punto ? haversine(actual, p.punto) * cfg.factor_calle : null;
      if (metros !== null) {
        acumulado += (metros / 1000 / cfg.velocidad_kmh) * 60;
        actual = p.punto;
      }
      out.push({ ...p, orden: out.length, distancia_m: metros === null ? null : this._round(metros, 0), eta_min: metros === null ? null : this._round(acumulado, 2) });
    }
    return out;
  }

  _antes(a, b) {
    if (a.metros !== b.metros) return a.metros < b.metros;
    if (a.pedido_id !== b.pedido_id) return a.pedido_id < b.pedido_id;
    return a.contrato_id < b.contrato_id;
  }

  _eta(desde, hasta, cfg) {
    const metros = haversine(desde, hasta);
    if (!Number.isFinite(metros)) return null;
    return this._round((metros * cfg.factor_calle / 1000 / cfg.velocidad_kmh) * 60, 2);
  }

  // ================= utilidades =================
  _rider(est, rider_id, plaza_id) {
    est.riders = est.riders || {};
    if (!est.riders[rider_id]) {
      est.riders[rider_id] = {
        rider_id,
        plaza_id: plaza_id || this.plaza_id || null,
        posicion: null,
        capacidad: null,
        capacidad_hora: null,
        promesas: {},
        contratos: {},
        trayecto: { abierto_en: null, cerrado_en: null }
      };
    }
    const r = est.riders[rider_id];
    r.promesas = r.promesas || {};
    r.contratos = r.contratos || {};
    r.trayecto = r.trayecto || { abierto_en: null, cerrado_en: null };
    return r;
  }

  _punto(v) {
    if (!v || typeof v !== 'object') return null;
    const lat = Number(v.lat);
    const lng = Number(v.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  // Los números de la medida se PREGUNTAN: frescura, velocidad y factor de calle son política
  // declarada de la plaza, no constantes de esta isla.
  async _cfg(d) {
    const cfg = { ...RUTA_DEFAULT, retraso_min: RETRASO_DEFAULT, desvio_m: 800 };
    try {
      const r = await this._rpc('config-mercado.politica.request', {
        project_id: d.project_id, plaza_id: d.plaza_id || this.plaza_id || null, instante: d.instante || null
      }, { timeout_ms: 1500 });
      const pol = r?.data?.politica;
      if (pol?.ruta) {
        if (Number.isFinite(pol.ruta.frescura_s)) cfg.frescura_s = pol.ruta.frescura_s;
        if (Number.isFinite(pol.ruta.velocidad_kmh)) cfg.velocidad_kmh = pol.ruta.velocidad_kmh;
        if (Number.isFinite(pol.ruta.factor_calle)) cfg.factor_calle = pol.ruta.factor_calle;
      }
      if (Number.isFinite(pol?.umbrales?.retraso_min)) cfg.retraso_min = pol.umbrales.retraso_min;
      if (Number.isFinite(pol?.umbrales?.desvio_m)) cfg.desvio_m = pol.umbrales.desvio_m;
      if (Number.isFinite(pol?.ruta?.coste_parada_min)) cfg.coste_parada_min = pol.ruta.coste_parada_min;
      if (Number.isFinite(pol?.ruta?.desvio_por_parada_m)) cfg.desvio_por_parada_m = pol.ruta.desvio_por_parada_m;
    } catch (_) { /* sin política se mide con el default de la F0, y se dice en la respuesta */ }
    return cfg;
  }
}

module.exports = RutaViva;
module.exports.haversine = haversine;
module.exports.RUTA_DEFAULT = RUTA_DEFAULT;
