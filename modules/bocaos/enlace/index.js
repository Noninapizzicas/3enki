'use strict';

/**
 * enlace · MICRO-AGENTE (ORQUESTADOR, cero IA) · PLAZA — A05…A23, A25, A28, A30, A31, A34, A35.
 *
 * EL CUELLO. Entra un hecho de «listo»; sale una propuesta a UN rider o un hueco con nombre.
 * Cuatro comparaciones en AND sobre una foto CONGELADA y una política con dos capas. Cero IA:
 * si aquí hubiera un modelo, la explicación dejaría de ser reproducible.
 *
 * Veinte clases del diseño en una sola hoja, y no por comodidad: son siete medidas y una regla
 * que tienen que decidir sobre LA MISMA foto. Como módulos, cada una haría un salto de bus en
 * una ventana de 20 s y la foto cambiaría entre salto y salto — justo lo que A03 prohíbe.
 *
 * Sin estado propio: la propuesta la guarda `propuesta`, la foto la congela `foto-mercado`,
 * el hecho lo anota `hecho-listo`. Aquí sólo se mide, se compara y se pide.
 */

const ModuloBocaos = require('../_bocaos');

const HORIZONTE_S = 20;   // F0 §6

class Enlace extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'enlace';
    this.version = 'reflejo-0.1.0';
  }

  // ================= RPC del bus =================
  onEjecutarRequest(e) { return this.servir(e, 'ejecutar', 'enlace.ejecutar', (d) => this._ejecutar(d)); }

  // ================= hechos que escucha =================
  async onPedidoListo(e) { await this._disparar(e, 'pedido_listo'); }
  async onHechoDesmentido(e) { await this._disparar(e, 'hecho_desmentido'); }

  async onPropuestaRechazada(e) {
    const d = (e && e.data) || e || {};
    return this._disparar(e, 'propuesta_rechazada', [d.rider_id].filter(Boolean));
  }

  async onPropuestaCaducadaSinRespuesta(e) {
    const d = (e && e.data) || e || {};
    return this._disparar(e, 'propuesta_caducada', [d.rider_id].filter(Boolean));
  }

  async onEscaladaReintentar(e) { return this._disparar(e, 'escalada_reintentar'); }

  async _disparar(e, causa, excluir = []) {
    const d = this.datos(e);
    if (!d.project_id) return null;

    let datos = { ...d, excluir };
    if (!datos.pedido && !datos.hora_listo && datos.pedido_id) {
      // El hecho del rechazo no lleva el pedido entero: se PIDE AL BUS el hecho vigente.
      // Es una pregunta, no una lectura del almacén de otro (la regla de las islas).
      const h = await this._rpc('hecho-listo.de.request', { project_id: d.project_id, pedido_id: d.pedido_id }, { timeout_ms: 1500 });
      const hecho = h?.data?.hecho;
      if (!hecho) {
        this.logger?.warn('enlace.sin_hecho', { causa, pedido_id: d.pedido_id });
        return null;
      }
      datos = { ...datos, ...hecho, pedido_id: hecho.pedido_id || d.pedido_id };
    }

    const r = await this._ejecutar(datos);
    if (r.status >= 400) {
      this.logger?.warn('enlace.no_ejecutado', { causa, pedido_id: d.pedido_id, code: r.error?.code });
    }
    return r;
  }

  // ================= el cuello =================
  async _ejecutar(d) {
    if (!d.project_id) return this._invalid('project_id');

    // A28 · GuardaSinOptimizador: la entrada es UN hecho y UNA foto, nunca una lista de pedidos.
    if (Array.isArray(d.pedidos) || Array.isArray(d.cola)) {
      return this._errorResponse(422, 'SIN_OPTIMIZADOR', 'el enlace no barre pedidos: entra un hecho listo, no una cola (A28)', { field: 'pedidos' });
    }

    const pedido = this._pedidoDe(d);
    if (!pedido.pedido_id) return this._invalid('pedido_id');
    if (!pedido.plaza_id) return this._invalid('plaza_id');
    if (!pedido.hora_listo) {
      return this._errorResponse(409, 'HUECO', 'sin hora de listo no hay a quién proponer: hueco nombrado', { field: 'hora_listo', hueco: 'sin hora de listo' });
    }
    if (!pedido.precio_congelado || !Number.isInteger(pedido.precio_congelado.reparto_cents)) {
      return this._errorResponse(409, 'HUECO', 'sin precio de reparto compuesto no se propone: hueco nombrado', { field: 'precio_congelado.reparto_cents', hueco: 'sin precio compuesto' });
    }

    const excluir = new Set((d.excluir || []).filter(Boolean));

    // 1 · la foto congelada (A02/A03): se pide, no se lee el mundo dos veces.
    const respFoto = await this._rpc('foto-mercado.componer.request', {
      project_id: d.project_id, plaza_id: pedido.plaza_id, pedido, instante: d.instante
    }, { timeout_ms: 3000 });
    const foto = respFoto?.data?.foto;
    if (!foto) {
      const hueco = 'sin foto del mercado';
      this.hecho('bocaos.hueco_nombrado', { pedido_id: pedido.pedido_id, rider_id: null, hueco });
      return this._agotar(pedido, [], [hueco]);
    }

    // 2 · los candidatos que pasan el censo (A04). El orden es el DECLARADO, no el conveniente.
    const respEleg = await this._rpc('foto-mercado.elegibles.request', { project_id: d.project_id, foto }, { timeout_ms: 2000 });
    const candidatos = respEleg?.data?.candidatos || [];
    const umbrales = foto.politica?.umbrales || {};
    const razones = [];
    const huecos = [...(foto.huecos || [])];

    for (const c of candidatos) {
      if (excluir.has(c.rider_id)) { razones.push({ rider_id: c.rider_id, razon: 'ya intentado' }); continue; }
      // A35 · GuardaEnlaceIntraPlaza: pedido, rider y paradas, todos de la misma plaza.
      if (c.plaza_id && c.plaza_id !== pedido.plaza_id) {
        razones.push({ rider_id: c.rider_id, razon: 'otra plaza' });
        continue;
      }

      const { medidas, bloqueantes } = await this._medir(c, foto, pedido, d.project_id, d.oferta_cents);
      if (bloqueantes.length > 0) {
        for (const hueco of bloqueantes) {
          this.hecho('bocaos.hueco_nombrado', { pedido_id: pedido.pedido_id, rider_id: c.rider_id, hueco });
        }
        huecos.push(...bloqueantes);
        razones.push({ rider_id: c.rider_id, razon: `hueco:${bloqueantes.join('|')}` });
        continue;
      }

      // A12 · ReglaDeEnlace: cuatro comparaciones en AND, devuelve EL TEST QUE FALLÓ.
      const juicio = this._pasa(medidas, umbrales);
      this.hecho('bocaos.medidas_calculadas', {
        pedido_id: pedido.pedido_id,
        rider_id: c.rider_id,
        medidas,
        umbrales,
        pasa: juicio.pasa,
        fallo: juicio.fallo,
        huella: foto.huella
      });

      if (!juicio.pasa) { razones.push({ rider_id: c.rider_id, razon: `no pasa:${juicio.fallo}`, medidas }); continue; }

      // 3 · se emite por el bus. El número ya está calculado aquí: `propuesta` no recalcula (A11).
      const respProp = await this._rpc('propuesta.emitir.request', {
        project_id: d.project_id,
        plaza_id: pedido.plaza_id,
        pedido_id: pedido.pedido_id,
        rider_id: c.rider_id,
        medidas,
        huella: foto.huella,
        politica: foto.politica,
        ventana_s: foto.politica?.ventana_s
      }, { timeout_ms: 3000 });

      if (!respProp || respProp.status >= 400 || !respProp.data?.propuesta) {
        razones.push({ rider_id: c.rider_id, razon: `no emitida:${respProp?.error?.code || 'SIN_RESPUESTA'}` });
        continue;
      }

      const propuesta = respProp.data.propuesta;
      this.hecho('bocaos.enlace_completado', {
        pedido_id: pedido.pedido_id,
        propuesta_id: propuesta.propuesta_id,
        rider_id: c.rider_id,
        medidas,
        huella: foto.huella,
        vista: propuesta.vista
      });
      return { status: 201, data: { propuesta, medidas, foto: foto.foto_id, razones: [] } };
    }

    return this._agotar(pedido, razones, [...new Set(huecos)]);
  }

  // ================= las medidas (A05…A11) =================
  // `oferta_cents` sólo llega de la escalada (Q43): el precio congelado del cliente NO se toca,
  // se mide con la oferta vigente que el cliente ya autorizó. Sin escalada, es el congelado.
  async _medir(c, foto, pedido, project_id, oferta_cents) {
    const instante = Date.parse(foto.instante);
    const bloqueantes = [];
    const politica = foto.politica || {};

    // A05/A06/A07 · desvío. El puerto de ruta es el único que miente si se cambia sin decirlo.
    const respRuta = await this._rpc('ruta.desvio.request', {
      project_id,
      plaza_id: pedido.plaza_id,
      rider_id: c.rider_id,
      desde: c.posicion,
      tienda: pedido.punto,
      destino: pedido.destino
    }, { timeout_ms: 1500 });
    let desvio_m = Number.isFinite(respRuta?.data?.metros) ? respRuta.data.metros : null;
    if (desvio_m === null) bloqueantes.push('sin ruta');
    if (desvio_m !== null && desvio_m < 0) {
      // Insertar una parada NUNCA acorta la ruta base: si la acorta, el puerto miente.
      return { medidas: null, bloqueantes: ['ruta imposible (desvío negativo)'] };
    }

    // A08 · espera: minutos que esperaría si llega antes de que esté listo. Si llega después, 0.
    let espera_min = null;
    if (!Number.isFinite(c.eta_tienda_min)) {
      bloqueantes.push('sin posición fresca');
    } else {
      const llegada = instante + c.eta_tienda_min * 60000;
      espera_min = this._round(Math.max(0, (Date.parse(pedido.hora_listo) - llegada) / 60000), 2);
    }

    // A09/A10 · retraso: el PEOR de los que ya lleva, no la suma ni la media.
    let retraso_min = 0;
    for (const parada of c.paradas || []) {
      const promesa = parada.promesa || c.promesas?.[parada.pedido_id];
      const eta = Number.isFinite(parada.eta_min) ? parada.eta_min : null;
      if (!promesa || eta === null) { bloqueantes.push('sin promesa de la parada'); continue; }
      const llegada = instante + eta * 60000;
      const r = Math.max(0, (llegada - Date.parse(promesa)) / 60000);
      retraso_min = Math.max(retraso_min, r);
    }
    retraso_min = this._round(retraso_min, 2);

    // A11 · cobra: `paga` siempre consta (E03 ya compuesto); `neto` exige coste declarado.
    const paga_cents = Number.isInteger(oferta_cents) && oferta_cents >= 0
      ? oferta_cents
      : pedido.precio_congelado.reparto_cents;
    const campo = politica.campo_cobra === 'neto' ? 'neto' : 'paga';
    let neto_cents = null;
    let cobra_cents = paga_cents;
    if (campo === 'neto') {
      if (!c.coste || !Number.isFinite(c.coste.eur_km) || !Number.isFinite(c.coste.eur_min)) {
        bloqueantes.push('sin coste del rider');
        cobra_cents = null;
      } else if (desvio_m !== null && espera_min !== null) {
        const gasto = (desvio_m / 1000) * c.coste.eur_km * 100 + espera_min * c.coste.eur_min * 100;
        neto_cents = Math.round(paga_cents - gasto);
        cobra_cents = neto_cents;
      }
    }

    return {
      medidas: {
        desvio_m: desvio_m === null ? null : this._round(desvio_m, 0),
        espera_min,
        retraso_min,
        cobra_cents,
        paga_cents,
        neto_cents,
        campo_cobra: campo
      },
      bloqueantes: [...new Set(bloqueantes)]
    };
  }

  // ================= A12 · cuatro comparaciones, cero pesos =================
  _pasa(m, u) {
    const desvio_max = Number.isFinite(u.desvio_m) ? u.desvio_m : 800;
    const espera_max = Number.isFinite(u.espera_min) ? u.espera_min : 4;
    const retraso_max = Number.isFinite(u.retraso_min) ? u.retraso_min : 6;
    const cobra_min = Number.isFinite(u.cobra_min_cents) ? u.cobra_min_cents : 0;

    if (!(m.desvio_m < desvio_max)) return { pasa: false, fallo: 'desvio' };
    if (!(m.espera_min < espera_max)) return { pasa: false, fallo: 'espera' };
    if (!(m.retraso_min < retraso_max)) return { pasa: false, fallo: 'retraso' };
    if (!(m.cobra_cents > cobra_min)) return { pasa: false, fallo: 'cobra' };
    return { pasa: true, fallo: null };
  }

  _agotar(pedido, razones, huecos) {
    this.hecho('bocaos.enlace_agotado', {
      pedido_id: pedido.pedido_id,
      plaza_id: pedido.plaza_id,
      razones,
      huecos,
      horizonte_s: HORIZONTE_S
    });
    return { status: 200, data: { agotado: true, propuesta: null, razones, huecos } };
  }

  _pedidoDe(d) {
    const p = d.pedido && typeof d.pedido === 'object' ? d.pedido : d;
    return {
      pedido_id: p.pedido_id || null,
      plaza_id: p.plaza_id || null,
      tienda_id: p.tienda_id || null,
      punto: p.punto || null,
      destino: p.destino || null,
      zona: p.zona || null,
      hora_listo: this._iso(p.hora_listo),
      precio_congelado: p.precio_congelado || null
    };
  }
}

module.exports = Enlace;
