'use strict';

/**
 * estado-parte · CUSTODIO · PLAZA — I03 (EstadoTienda) + I04 (EstadoRider).
 *
 * QUIÉN EXISTE PARA EL MERCADO Y EN QUÉ ESTADO. El censo operativo de la plaza y su estado vivo:
 * tiendas abierta / cerrada / saturada; riders disponible / ocupado / en pausa.
 *
 * Las dos guardas que son el módulo:
 *
 *   · LA PAUSA SÓLO LA DECLARA ÉL. Ni la sala, ni la tienda, ni la plaza, ni el sistema pueden
 *     poner a un rider en pausa ni levantarle una: eso sería disponer de su tiempo, que es
 *     exactamente lo que un autónomo no acepta (403 PAUSA_NO_ES_SUYA).
 *   · «OCUPADO» NO LO PONE NADIE A MANO: lo pone el contrato vivo (bocaos.contrato_creado) y lo
 *     quita su cierre. Un estado «ocupado» declarado a dedo es una sala administrando el mercado.
 *
 * Y una tercera, que es la que hace verdad el censo: sin alta no hay estado (I01/I02). El
 * registro no inventa partes; un contrato de un rider que no está en el censo no lo mete dentro.
 *
 * «Saturada» la declara la tienda, y sólo ella: la sala no puede saturar un negocio para que el
 * mercado «respire mejor».
 *
 * Isla: no lee el almacén de nadie. El coste del rider se resuelve preguntando a config-mercado
 * por el bus (Q57) y la capacidad vigente le llega como HECHO desde ruta-viva (B05), que es su
 * único escritor. Este módulo no estima ni deduce nada.
 */

const ModuloBocaos = require('../_bocaos');

const ESTADOS = {
  rider: ['disponible', 'ocupado', 'en_pausa', 'suspendido'],
  tienda: ['abierta', 'cerrada', 'saturada']
};
const VEHICULOS = ['moto', 'coche', 'bici'];

class EstadoParte extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'estado-parte';
    this.version = 'custodio-0.1.0';
    this._path = '/bocaos/estado-parte.json';
  }

  // ================= RPC del bus (una línea por op) =================
  onAltaRequest(e) { return this.servir(e, 'alta', 'estado-parte.alta', (d) => this._alta(d)); }
  onDeclararRequest(e) { return this.servir(e, 'declarar', 'estado-parte.declarar', (d) => this._declarar(d)); }
  onDeRequest(e) { return this.servir(e, 'de', 'estado-parte.de', (d) => this._de(d)); }
  onVigentesRequest(e) { return this.servir(e, 'vigentes', 'estado-parte.vigentes', (d) => this._vigentes(d)); }

  // ================= hechos que escucha =================
  // I04: el contrato vivo es el ÚNICO que pone «ocupado». No es una declaración: es un hecho.
  async onContratoCreado(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.rider_id) return null;
    const est = await this.estado(d.project_id);
    const parte = est.partes?.[d.rider_id];
    if (!parte) return null;   // el censo no inventa: un contrato no da de alta a nadie
    parte.contratos_vivos = (parte.contratos_vivos || 0) + 1;
    if (parte.estado !== 'en_pausa' && parte.estado !== 'suspendido') {
      this._poner(parte, 'ocupado', `contrato:${d.contrato_id || d.pedido_id || '?'}`,
        this._iso(d.hora_contrato) || this.ahora(), 'contrato vivo');
    }
    await this.guardar(d.project_id);
    return null;
  }

  async onContratoCerrado(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.rider_id) return null;
    const est = await this.estado(d.project_id);
    const parte = est.partes?.[d.rider_id];
    if (!parte) return null;
    parte.contratos_vivos = Math.max(0, (parte.contratos_vivos || 0) - 1);
    if (parte.contratos_vivos === 0 && parte.estado === 'ocupado') {
      this._poner(parte, 'disponible', `contrato:${d.contrato_id || '?'}`,
        this._iso(d.hora_cierre) || this.ahora(), 'contrato cerrado');
    }
    await this.guardar(d.project_id);
    return null;
  }

  // P03: la única escritura de otro sobre este estado es la SUSPENSIÓN, con motivo y acta.
  async onParteSancionada(e) {
    const d = this.datos(e);
    const parte_id = d.parte_id || d.rider_id || d.tienda_id;
    if (!d.project_id || !parte_id) return null;
    const est = await this.estado(d.project_id);
    const parte = est.partes?.[parte_id];
    if (!parte) return null;
    if (!d.motivo || !d.acta) {
      this.logger?.warn('estado-parte.sancion_sin_acta', { parte_id, motivo: d.motivo || null });
      return null;   // sin motivo ni acta no hay suspensión: se ignora, no se inventa
    }
    this._poner(parte, 'suspendido', d.autor || 'sala', this._iso(d.hora) || this.ahora(), d.motivo);
    parte.sancion = { motivo: d.motivo, acta: String(d.acta), desde: parte.desde };
    await this.guardar(d.project_id);
    return null;
  }

  // B05: la capacidad la declara él y su escritor es ruta-viva. Aquí se guarda el HECHO, no se
  // estima: el censo muestra lo que el rider declaró, con su fuente.
  async onCapacidadDeclarada(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.rider_id) return null;
    const est = await this.estado(d.project_id);
    est.pendientes = est.pendientes || {};
    const parte = est.partes?.[d.rider_id];
    const capacidad = Number.isInteger(d.capacidad) ? d.capacidad : null;
    if (capacidad === null) return null;
    if (!parte) {
      // La parte aún no está en el censo: el hecho no se tira, se apunta para cuando entre.
      est.pendientes[d.rider_id] = { capacidad, hora: this._iso(d.hora) || this.ahora(), fuente: 'ruta-viva' };
    } else {
      parte.capacidad = capacidad;
      parte.capacidad_fuente = 'ruta-viva';
      parte.capacidad_hora = this._iso(d.hora) || this.ahora();
    }
    await this.guardar(d.project_id);
    return null;
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (d.project_id) await this.estado(d.project_id);
  }

  // ================= I01/I02 · el alta =================
  async _alta(d) {
    if (!d.project_id) return this._invalid('project_id');
    const tipo = d.tipo || (d.rider_id ? 'rider' : (d.tienda_id ? 'tienda' : null));
    if (!tipo || !ESTADOS[tipo]) {
      return this._errorResponse(400, 'INVALID_INPUT', 'tipo requerido: rider | tienda', { field: 'tipo' });
    }
    const parte_id = d.parte_id || (tipo === 'rider' ? d.rider_id : d.tienda_id);
    if (!parte_id) return this._invalid(tipo === 'rider' ? 'rider_id' : 'tienda_id');

    const est = await this.estado(d.project_id);
    est.partes = est.partes || {};
    const ya = est.partes[parte_id];
    if (ya) {
      return this._errorResponse(409, 'YA_EN_CENSO',
        'la parte ya está en el censo de esta plaza: su estado se declara, no se vuelve a dar de alta',
        { field: 'parte_id', estado: ya.estado, desde: ya.desde });
    }

    const zonas = d.zonas === undefined ? null : this._zonas(d.zonas);
    if (zonas === false) return this._errorResponse(400, 'INVALID_INPUT', 'zonas debe ser una lista de zonas con nombre', { field: 'zonas' });
    if (d.vehiculo !== undefined && !VEHICULOS.includes(d.vehiculo)) {
      return this._errorResponse(400, 'INVALID_INPUT', `vehiculo debe ser ${VEHICULOS.join(' | ')}`, { field: 'vehiculo' });
    }
    if (d.capacidad !== undefined && (!Number.isInteger(d.capacidad) || d.capacidad < 0)) {
      // B05: se declara, no se estima. Un «2–3» no es una capacidad.
      return this._errorResponse(400, 'INVALID_INPUT', 'la capacidad se declara con un entero: no se estima', { field: 'capacidad' });
    }

    const estado = d.estado || (tipo === 'rider' ? 'disponible' : 'abierta');
    if (!ESTADOS[tipo].includes(estado)) {
      return this._errorResponse(400, 'INVALID_INPUT', `${tipo} no tiene el estado ${estado}`, { field: 'estado', estados: ESTADOS[tipo] });
    }
    if (estado === 'en_pausa' && !this._pausaEsSuya(d, parte_id)) {
      return this._errorResponse(403, 'PAUSA_NO_ES_SUYA', 'la pausa sólo la declara él: en el alta también', { field: 'estado' });
    }
    if (estado === 'ocupado') {
      return this._errorResponse(409, 'OCUPADO_LO_PONE_EL_CONTRATO', '«ocupado» lo pone el contrato vivo, no el alta', { field: 'estado' });
    }
    if (estado === 'suspendido') {
      return this._errorResponse(409, 'SUSPENSION_CON_ACTA', 'una suspensión entra por bocaos.parte_sancionada, con motivo y acta', { field: 'estado' });
    }

    const hora = this._iso(d.hora) || this.ahora();
    const parte = {
      parte_id,
      rider_id: tipo === 'rider' ? parte_id : null,
      tienda_id: tipo === 'tienda' ? parte_id : null,
      tipo,
      plaza_id: this.plaza_id || d.plaza_id || d.project_id,
      estado,
      desde: hora,
      autor: d.autor || (d.rol ? `${d.rol}:${parte_id}` : parte_id),
      motivo: null,
      zonas: zonas || null,
      vehiculo: d.vehiculo || null,
      capacidad: Number.isInteger(d.capacidad) ? d.capacidad : null,
      capacidad_fuente: Number.isInteger(d.capacidad) ? 'alta' : null,
      capacidad_hora: Number.isInteger(d.capacidad) ? hora : null,
      coste: this._coste(d.coste),
      contratos_vivos: 0,
      alta_en: hora,
      historial: [{ estado, hora, autor: d.autor || parte_id, motivo: 'alta' }]
    };

    // Un hecho de capacidad que llegó antes que el alta no se pierde.
    const pend = est.pendientes?.[parte_id];
    if (pend) {
      parte.capacidad = pend.capacidad;
      parte.capacidad_fuente = pend.fuente;
      parte.capacidad_hora = pend.hora;
      delete est.pendientes[parte_id];
    }

    est.partes[parte_id] = parte;
    await this.guardar(d.project_id);
    const tabla = await this._costeDeLaPlaza(d.project_id, parte.plaza_id, hora);

    this.hecho('bocaos.estado_parte_declarado', {
      parte_id, rider_id: parte.rider_id, tienda_id: parte.tienda_id, tipo,
      plaza_id: parte.plaza_id, estado, hora, autor: parte.autor, motivo: 'alta',
      zonas: parte.zonas, vehiculo: parte.vehiculo, capacidad: parte.capacidad
    });

    return { status: 201, data: { parte: this._vista(parte, tabla) } };
  }

  // ================= I03/I04 · declarar estado =================
  async _declarar(d) {
    if (!d.project_id) return this._invalid('project_id');
    const parte_id = d.parte_id || d.rider_id || d.tienda_id;
    if (!parte_id) return this._invalid('parte_id');

    const est = await this.estado(d.project_id);
    const parte = est.partes?.[parte_id];
    if (!parte) {
      return this._errorResponse(404, 'PARTE_NO_CONSTA',
        'el censo no inventa: sin alta no hay estado (I01/I02)', { field: 'parte_id', hueco: 'parte sin alta' });
    }

    // Los atributos que son SUYOS (zonas, vehículo, capacidad, coste) los declara él, no la sala.
    const tocaAtributos = ['zonas', 'vehiculo', 'capacidad', 'coste'].some((k) => d[k] !== undefined);
    if (tocaAtributos && !this._esLaParte(d, parte)) {
      return this._errorResponse(403, 'FORMA_NO_ES_SUYA',
        'las zonas, el vehículo, la capacidad y el coste los declara la parte, no la sala',
        { field: 'rol', hueco: 'atributo declarado por otro' });
    }
    if (d.zonas !== undefined) {
      const zonas = this._zonas(d.zonas);
      if (zonas === false) return this._errorResponse(400, 'INVALID_INPUT', 'zonas debe ser una lista de zonas con nombre', { field: 'zonas' });
      parte.zonas = zonas;
    }
    if (d.vehiculo !== undefined) {
      if (!VEHICULOS.includes(d.vehiculo)) return this._errorResponse(400, 'INVALID_INPUT', `vehiculo debe ser ${VEHICULOS.join(' | ')}`, { field: 'vehiculo' });
      parte.vehiculo = d.vehiculo;
    }
    if (d.capacidad !== undefined) {
      if (!Number.isInteger(d.capacidad) || d.capacidad < 0) {
        return this._errorResponse(400, 'INVALID_INPUT', 'la capacidad se declara con un entero: no se estima', { field: 'capacidad' });
      }
      parte.capacidad = d.capacidad;
      parte.capacidad_fuente = 'estado-parte';
      parte.capacidad_hora = this._iso(d.hora) || this.ahora();
    }
    if (d.coste !== undefined) parte.coste = this._coste(d.coste);

    if (!d.estado) {
      await this.guardar(d.project_id);
      return { status: 200, data: { parte: this._vista(parte, null), estado: parte.estado } };
    }

    const destino = d.estado;
    if (!ESTADOS[parte.tipo].includes(destino)) {
      return this._errorResponse(400, 'INVALID_INPUT', `${parte.tipo} no tiene el estado ${destino}`, { field: 'estado', estados: ESTADOS[parte.tipo] });
    }
    if (destino === 'ocupado') {
      return this._errorResponse(409, 'OCUPADO_LO_PONE_EL_CONTRATO',
        '«ocupado» no lo pone la sala ni la tienda: lo pone el contrato vivo', { field: 'estado' });
    }
    if (destino === 'suspendido') {
      return this._errorResponse(409, 'SUSPENSION_CON_ACTA',
        'la suspensión entra por bocaos.parte_sancionada, con motivo y acta (P03)', { field: 'estado' });
    }
    if (parte.tipo === 'rider' && destino === 'en_pausa' && !this._pausaEsSuya(d, parte.parte_id)) {
      return this._errorResponse(403, 'PAUSA_NO_ES_SUYA',
        'la pausa la declara él, siempre: nadie más puede ponerlo en pausa', { field: 'estado', hueco: 'pausa por otro' });
    }
    if (parte.tipo === 'tienda' && !this._tiendaEsSuya(d, parte.parte_id)) {
      // I03: la sala no satura un negocio para que el mercado respire mejor.
      return this._errorResponse(403, 'ESTADO_NO_ES_SUYO',
        'el estado de una tienda lo declara la tienda', { field: 'estado' });
    }
    // Nadie levanta la pausa de otro ni la suspensión sin acta.
    if (parte.estado === 'en_pausa' && destino !== 'en_pausa' && !this._pausaEsSuya(d, parte.parte_id)) {
      return this._errorResponse(403, 'PAUSA_NO_ES_SUYA',
        'la pausa la levanta él y nadie más: su tiempo no se dispone desde fuera', { field: 'estado', hueco: 'levantar la pausa de otro' });
    }
    if (parte.estado === 'suspendido' && destino !== 'suspendido' && !d.acta) {
      return this._errorResponse(409, 'SUSPENSION_CON_ACTA',
        'levantar una suspensión exige acta, igual que ponerla (P03)', { field: 'acta' });
    }

    const hora = this._iso(d.hora) || this.ahora();
    this._poner(parte, destino, d.autor || (d.rol ? `${d.rol}:${parte_id}` : parte_id), hora, d.motivo || null);
    await this.guardar(d.project_id);

    this.hecho('bocaos.estado_parte_declarado', {
      parte_id: parte.parte_id, rider_id: parte.rider_id, tienda_id: parte.tienda_id, tipo: parte.tipo,
      plaza_id: parte.plaza_id, estado: destino, hora, autor: parte.autor,
      motivo: parte.motivo, hasta: d.hasta || null
    });

    return { status: 200, data: { parte: this._vista(parte, null), estado: destino } };
  }

  // ================= I03/I04 · preguntas =================
  async _de(d) {
    if (!d.project_id) return this._invalid('project_id');
    const est = await this.estado(d.project_id);
    const partes = est.partes || {};
    const tabla = await this._costeDeLaPlaza(d.project_id, d.plaza_id, d.instante);

    const parte_id = d.parte_id || d.rider_id || d.tienda_id || null;
    if (parte_id) {
      const parte = partes[parte_id];
      if (!parte) {
        return this._errorResponse(404, 'PARTE_NO_CONSTA', 'esa parte no está en el censo de esta plaza', { field: 'parte_id' });
      }
      return { status: 200, data: { parte: this._vista(parte, tabla) } };
    }

    const todas = Object.values(partes).map((p) => this._vista(p, tabla));
    const plaza_id = this.plaza_id || d.plaza_id || d.project_id;
    // `riders` es la forma que pide la foto del mercado (A02): estado · zonas · capacidad · coste.
    return {
      status: 200,
      data: {
        plaza_id,
        instante: this._iso(d.instante) || this.ahora(),
        partes: todas,
        riders: todas.filter((p) => p.tipo === 'rider' && (!p.plaza_id || p.plaza_id === plaza_id)),
        tiendas: todas.filter((p) => p.tipo === 'tienda')
      }
    };
  }

  // A02 · quién está disponible AHORA. El que está en pausa o suspendido no aparece, y el que
  // está ocupado tampoco: ocupado es estar en un reparto, no estar ofertable.
  async _vigentes(d) {
    if (!d.project_id) return this._invalid('project_id');
    const est = await this.estado(d.project_id);
    const tabla = await this._costeDeLaPlaza(d.project_id, d.plaza_id, d.instante);
    const zona = d.zona || null;
    const todas = Object.values(est.partes || {}).map((p) => this._vista(p, tabla));

    const riders = todas.filter((p) => p.tipo === 'rider'
      && p.estado === 'disponible'
      && (!zona || !Array.isArray(p.zonas) || p.zonas.includes(zona)));
    const tiendas = todas.filter((p) => p.tipo === 'tienda' && p.estado === 'abierta');

    return {
      status: 200,
      data: {
        instante: this._iso(d.instante) || this.ahora(),
        zona,
        riders,
        tiendas,
        // Lo que no aparece se dice: es la diferencia entre «no hay nadie» y «no lo estoy mirando».
        ocultos: todas.filter((p) => !riders.includes(p) && !tiendas.includes(p))
          .map((p) => ({ parte_id: p.parte_id, tipo: p.tipo, estado: p.estado }))
      }
    };
  }

  // ================= utilidades =================
  _poner(parte, estado, autor, hora, motivo) {
    parte.estado = estado;
    parte.desde = hora;
    parte.autor = autor;
    parte.motivo = motivo || null;
    parte.historial = parte.historial || [];
    parte.historial.push({ estado, hora, autor, motivo: motivo || null });
    return parte;
  }

  _esLaParte(d, parte) {
    const rol = d.rol || (d.autor && d.autor.rol) || null;
    const quien = d.autor && typeof d.autor === 'object'
      ? (d.autor.id || d.autor.parte_id || d.autor.rider_id || d.autor.tienda_id || null)
      : parte.parte_id;
    return rol === parte.tipo && (quien === null || quien === parte.parte_id);
  }

  _pausaEsSuya(d, parte_id) {
    const rol = d.rol || (d.autor && d.autor.rol) || null;
    const quien = d.autor && typeof d.autor === 'object'
      ? (d.autor.id || d.autor.rider_id || d.autor.parte_id || null)
      : (d.rider_id || d.parte_id || null);
    return rol === 'rider' && quien === parte_id;
  }

  _tiendaEsSuya(d, parte_id) {
    const rol = d.rol || (d.autor && d.autor.rol) || null;
    const quien = d.autor && typeof d.autor === 'object'
      ? (d.autor.id || d.autor.tienda_id || d.autor.parte_id || null)
      : (d.tienda_id || d.parte_id || null);
    return rol === 'tienda' && quien === parte_id;
  }

  _zonas(v) {
    if (v === null) return null;
    if (!Array.isArray(v)) return false;
    const zonas = v.map((z) => String(z).trim()).filter(Boolean);
    return zonas.length > 0 ? [...new Set(zonas)] : null;
  }

  _coste(v) {
    if (!v || typeof v !== 'object') return null;
    const eur_km = Number(v.eur_km);
    const eur_min = Number(v.eur_min);
    if (!Number.isFinite(eur_km) || !Number.isFinite(eur_min)) return null;
    if (eur_km < 0 || eur_min < 0) return null;
    return { eur_km, eur_min };
  }

  // Q57: el coste por vehículo es config de la plaza. Se PREGUNTA al bus; si no contesta, el
  // coste queda como hueco nombrado en vez de inventarse.
  async _costeDeLaPlaza(project_id, plaza_id, instante) {
    try {
      const r = await this._rpc('config-mercado.politica.request',
        { project_id, plaza_id: plaza_id || this.plaza_id || null, instante: instante || null }, { timeout_ms: 1500 });
      return r?.data?.politica?.coste_rider || null;
    } catch (_) {
      return null;
    }
  }

  _vista(parte, tabla) {
    const faltantes = [];
    let coste = parte.coste || null;
    let coste_fuente = coste ? 'declarado' : null;
    if (!coste && tabla && parte.vehiculo && Number.isFinite(tabla.vehiculos?.[parte.vehiculo])) {
      coste = { eur_km: tabla.vehiculos[parte.vehiculo], eur_min: tabla.eur_min };
      coste_fuente = 'config-mercado';
    }
    if (!coste) faltantes.push('sin coste del rider');
    if (parte.tipo === 'rider' && !Number.isInteger(parte.capacidad)) faltantes.push('sin capacidad declarada');
    if (parte.tipo === 'rider' && (!Array.isArray(parte.zonas) || parte.zonas.length === 0)) faltantes.push('sin zonas declaradas');

    return {
      parte_id: parte.parte_id,
      rider_id: parte.rider_id,
      tienda_id: parte.tienda_id,
      tipo: parte.tipo,
      plaza_id: parte.plaza_id,
      estado: parte.estado,
      desde: parte.desde,
      autor: parte.autor,
      motivo: parte.motivo,
      zonas: parte.zonas,
      vehiculo: parte.vehiculo,
      capacidad: Number.isInteger(parte.capacidad) ? parte.capacidad : null,
      capacidad_fuente: parte.capacidad_fuente || null,
      capacidad_hora: parte.capacidad_hora || null,
      coste,
      coste_fuente,
      contratos_vivos: parte.contratos_vivos || 0,
      sancion: parte.sancion || null,
      alta_en: parte.alta_en || null,
      faltantes
    };
  }
}

module.exports = EstadoParte;
module.exports.ESTADOS = ESTADOS;
