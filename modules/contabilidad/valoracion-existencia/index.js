/**
 * contabilidad/valoracion-existencia — REFLEJO STATELESS (H1 + H3 + H4, hoja del plan).
 *
 * CAPA DE VALOR sobre el stock EXISTENTE: NO duplica el inventario. `inventario`
 * custodia el stock real (cantidad); aqui se le pone el VALOR: valoracion por
 * metodo DECLARABLE (FIFO/PMP permitidos; LIFO no), capa de valor, ajuste de
 * merma/rotura y variacion valorada (entrada por compra, salida por consumo).
 * El metodo de valoracion es un PARAMETRO declarable por negocio (la ley/la
 * politica entra como DATO) — ninguna constante de metodo cableada en la logica.
 *
 * REFLEJO (patron real, stateless): sin PosPersistencia ni project.activated EN
 * EL CODIGO. Cada op entra objeto, sale objeto. El stock real se LEE de
 * `inventario` por EVENTO (contrato TOLERANTE: si no responde, se DECLARA la
 * dependencia no disponible y NUNCA se valora un stock inventado). El coste de la
 * ficha cruza por frontera-ficha-producto (H2) por EVENTO, NUNCA require cruzado.
 *
 * Emisor/par de fallo: exito publica contabilidad.existencia_valorada (y
 * contabilidad.ajuste_inventario_calculado en el ajuste); error su par
 * determinista. NO REUTILIZA: `inventario` custodia el stock real; la VALORACION
 * contable (capa de valor, merma, coste del consumo) no existe en el inventario.
 *
 * Ver hojas H1/H3/H4 del diseno-oop y bloque `valoracion-existencia` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Metodos de valoracion PERMITIDOS (DECLARABLE; LIFO no). Nunca cableado: es dato.
const METODOS_PERMITIDOS = ['FIFO', 'PMP', 'COSTE_MEDIO', 'IDENTIFICACION_DIRECTA'];
const METODO_PROHIBIDO = ['LIFO'];

class ValoracionExistencia extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'valoracion-existencia';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: sin store que persistir. El stock llega por payload o por EVENTO.
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC ──
  onValorarRequest(e) {
    return this._atender(e, 'valorar', 'contabilidad.existencia.valorar.response', async (d) => {
      const res = this._valorar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.existencia_valorada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.existencia.valorar.failed', res);
      }
      return res;
    });
  }

  onAjusteRequest(e) {
    return this._atender(e, 'ajuste', 'contabilidad.inventario.ajuste.response', async (d) => {
      const res = await this._ajustarInventario(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.ajuste_inventario_calculado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.inventario.ajuste.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras (deterministas) ──

  // valorar(producto, cantidad, fecha) -> Importe (H1, metodo parametro DECLARABLE).
  _valorar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const metodo = this._metodoDe(input);
    if (metodo.error) return metodo.error;

    const capas = this._capasDe(input);
    if (capas === null) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'no hay stock/capas de valor: se declara la dependencia, no se valora un stock inventado', {
          dependencia: 'inventario', accion: 'NO_VALORAR_PUBLICAR_FALLO'
        });
    }

    const cantidad = Number(input && (input.cantidad ?? input.qty));
    if (!Number.isFinite(cantidad) || cantidad < 0) return this._invalid('cantidad');

    const valorado = this._consumirCapas(capas, cantidad, metodo.metodo);

    return {
      status: 200,
      data: {
        project_id: pid,
        producto: (input && (input.producto || input.codigo)) || null,
        cantidad: this._round(cantidad, 4),
        metodo: metodo.metodo,
        importe: this._round(valorado.importe, 4),
        coste_unitario: cantidad > 0 ? this._round(valorado.importe / cantidad, 4) : 0,
        capas_consumidas: valorado.capas,
        capas_restantes: valorado.restantes,
        fecha: (input && input.fecha) || null,
        determinista: true,
        fuente: 'CAPAS_VALOR'
      }
    };
  }

  // capaDeValor(inventarioExistente) -> Valoracion (H1: NO duplica el inventario).
  // Es una CAPA sobre el stock: se anota el valor por capa, sin recrear el stock.
  _capaDeValor(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const metodo = this._metodoDe(input);
    if (metodo.error) return metodo.error;

    const inventario = this._inventarioDe(input);
    if (inventario === null) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'inventario no respondio: no se compone una capa de valor sin stock real', {
          dependencia: 'inventario', accion: 'NO_COMPONER_PUBLICAR_FALLO'
        });
    }

    const lineas = (Array.isArray(inventario) ? inventario : (inventario.lineas || inventario.items || []))
      .map((p) => {
        const cantidad = Number(p && (p.cantidad ?? p.stock ?? p.qty)) || 0;
        const coste = this._costeDe(p);
        return {
          producto: (p && (p.codigo || p.id || p.producto)) || null,
          cantidad: this._round(cantidad, 4),
          coste_unitario: coste === null ? null : this._round(coste, 4),
          valor: coste === null ? null : this._round(cantidad * coste, 4),
          coste_ausente: coste === null
        };
      });

    const conCoste = lineas.filter((l) => !l.coste_ausente);
    return {
      status: 200,
      data: {
        project_id: pid,
        metodo: metodo.metodo,
        lineas,
        total_valor: this._round(conCoste.reduce((t, l) => t + l.valor, 0), 4),
        n_lineas: lineas.length,
        n_sin_coste: lineas.length - conCoste.length,
        no_duplica_inventario: true,
        nota: 'capa de VALOR sobre el stock existente: el stock real sigue siendo de `inventario`'
      }
    };
  }

  // calcularDiferencia() -> Importe (H3: merma / rotura).
  _calcularDiferencia(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const stockReal = Number(input && (input.stock_real ?? input.cantidad_real));
    const stockContable = Number(input && (input.stock_contable ?? input.cantidad_contable));
    if (!Number.isFinite(stockReal) || !Number.isFinite(stockContable)) {
      return this._invalid('stock_real/stock_contable');
    }

    const coste = this._costeDe(input);
    const diferenciaUnidades = this._round(stockReal - stockContable, 4);
    const diferenciaValor = coste === null ? null : this._round(diferenciaUnidades * coste, 4);

    return {
      status: 200,
      data: {
        project_id: pid,
        producto: (input && (input.producto || input.codigo)) || null,
        stock_real: this._round(stockReal, 4),
        stock_contable: this._round(stockContable, 4),
        diferencia_unidades: diferenciaUnidades,
        coste_unitario: coste === null ? null : this._round(coste, 4),
        diferencia_valor: diferenciaValor,
        coste_ausente: coste === null,
        clase: diferenciaUnidades < 0 ? 'MERMA' : (diferenciaUnidades > 0 ? 'SOBRANTE' : 'SIN_DIFERENCIA'),
        determinista: true
      }
    };
  }

  // regularizar(diferencia) -> Asiento + aviso (H3: el asiento SUMA).
  _regularizar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const dif = (input && input.diferencia) || input || {};
    const valor = Number(dif.diferencia_valor);
    if (!Number.isFinite(valor)) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'la diferencia no trae valor: sin coste no hay asiento de regularizacion (dato ausente = desconocido)', {
          coste_ausente: true
        });
    }

    const cuenta = (input && (input.cuenta || input.cuenta_gasto)) || null;
    // El asiento SUMA: se compone en partida doble con la cuenta DECLARADA (o [ABIERTO]).
    const asiento = {
      tipo: 'AJUSTE',
      motivo: 'REGULARIZACION_EXISTENCIA',
      borra_original: false,
      suma: true,
      apuntes: [
        {
          cuenta: cuenta || '[ABIERTO]',
          debe: valor < 0 ? this._round(-valor, 2) : 0,
          haber: valor > 0 ? this._round(valor, 2) : 0
        },
        {
          cuenta: (input && input.cuenta_existencia) || '[ABIERTO]',
          debe: valor > 0 ? this._round(valor, 2) : 0,
          haber: valor < 0 ? this._round(-valor, 2) : 0
        }
      ]
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        diferencia: { diferencia_unidades: dif.diferencia_unidades ?? null, diferencia_valor: this._round(valor, 4) },
        asiento,
        aviso: {
          senal: 'MERMA_REGULARIZADA',
          clase: dif.clase || null,
          destinatario: (input && input.destinatario) || 'ASESOR'
        },
        suma_al_libro: true,
        determinista: true
      }
    };
  }

  // valorarEntrada(compra) -> Importe (H4).
  _valorarEntrada(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const compra = (input && (input.compra || input.hecho)) || input || {};
    const cantidad = Number(compra.cantidad ?? compra.qty ?? 0);
    const coste = this._costeDe(compra);

    if (coste === null) {
      return {
        status: 200,
        data: {
          project_id: pid,
          producto: compra.producto || compra.codigo || null,
          sentido: 'ENTRADA',
          cantidad: this._round(Number.isFinite(cantidad) ? cantidad : 0, 4),
          importe: null,
          coste_ausente: true,
          no_inventa: true,
          nota: 'sin coste de ficha no se valora la entrada: se declara AUSENTE, nunca 0'
        }
      };
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        producto: compra.producto || compra.codigo || null,
        sentido: 'ENTRADA',
        cantidad: this._round(cantidad, 4),
        coste_unitario: this._round(coste, 4),
        importe: this._round(cantidad * coste, 4),
        coste_ausente: false,
        determinista: true
      }
    };
  }

  // valorarSalida(consumo) -> Importe (H4: el hecho de stock lo emite la fuente; contabilidad lo VALORA).
  _valorarSalida(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const consumo = (input && (input.consumo || input.hecho)) || input || {};
    const cantidad = Number(consumo.cantidad ?? consumo.qty ?? 0);
    const metodo = this._metodoDe(input);
    if (metodo.error) return metodo.error;

    const capas = this._capasDe(input);
    if (capas === null) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'no hay capas de valor para valorar la salida: se declara la dependencia, no se inventa un coste', {
          dependencia: 'inventario', accion: 'NO_VALORAR_PUBLICAR_FALLO'
        });
    }

    const valorado = this._consumirCapas(capas, Number.isFinite(cantidad) ? cantidad : 0, metodo.metodo);
    return {
      status: 200,
      data: {
        project_id: pid,
        producto: consumo.producto || consumo.codigo || null,
        sentido: 'SALIDA',
        cantidad: this._round(Number.isFinite(cantidad) ? cantidad : 0, 4),
        metodo: metodo.metodo,
        importe: this._round(valorado.importe, 4),
        capas_consumidas: valorado.capas,
        el_hecho_es_de_la_fuente: true,
        contabilidad_solo_valora: true,
        determinista: true
      }
    };
  }

  // ajuste(inventario) -> Diferencia valorada + asiento (H3): la unica op que compone el asiento.
  async _ajustarInventario(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const dif = this._calcularDiferencia(input);
    if (dif.status !== 200) return dif;

    const reg = this._regularizar({ ...input, diferencia: dif.data });
    if (reg.status !== 200) return reg;

    return {
      status: 200,
      data: {
        project_id: pid,
        diferencia: dif.data,
        asiento: reg.data.asiento,
        aviso: reg.data.aviso,
        suma_al_libro: true,
        determinista: true
      }
    };
  }

  // ── helpers internos ──

  // El metodo de valoracion es DECLARABLE (dato, nunca constante cableada).
  _metodoDe(input) {
    const m = String((input && (input.metodo || input.metodo_valoracion)) || '').toUpperCase();
    if (!m) {
      return { error: this._errorResponse(422, 'PRECONDITION_FAILED',
        'el metodo de valoracion no esta declarado: la politica de valoracion entra como DATO', {
          metodos_permitidos: METODOS_PERMITIDOS, no_declarado: true
        }) };
    }
    if (METODO_PROHIBIDO.includes(m)) {
      return { error: this._errorResponse(422, 'PRECONDITION_FAILED',
        `el metodo ${m} no esta permitido`, { metodos_permitidos: METODOS_PERMITIDOS }) };
    }
    if (!METODOS_PERMITIDOS.includes(m)) {
      return { error: this._errorResponse(422, 'PRECONDITION_FAILED',
        `el metodo ${m} no esta declarado en el catalogo permitido`, { metodos_permitidos: METODOS_PERMITIDOS }) };
    }
    return { metodo: m };
  }

  _costeDe(obj) {
    const v = obj && (obj.coste_unitario ?? obj.coste ?? obj.precio_coste);
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // Las capas de valor: en el payload o LEIDAS de `inventario` por EVENTO.
  _capasDe(input) {
    const enPayload = input && (input.capas || input.inventario);
    if (Array.isArray(enPayload)) return enPayload;
    if (enPayload && Array.isArray(enPayload.capas)) return enPayload.capas;
    return null;
  }

  _inventarioDe(input) {
    const enPayload = input && (input.inventario || input.stock);
    if (Array.isArray(enPayload)) return enPayload;
    if (enPayload && (Array.isArray(enPayload.lineas) || Array.isArray(enPayload.items))) return enPayload;
    return null;
  }

  // Consumo de capas por metodo declarado (FIFO/PMP): determinista.
  _consumirCapas(capas, cantidad, metodo) {
    const lista = capas.map((c, i) => ({
      producto: (c && (c.producto || c.codigo)) || null,
      cantidad: Number(c && (c.cantidad ?? c.stock ?? c.qty)) || 0,
      coste: Number(c && (c.coste_unitario ?? c.coste)) || 0,
      orden: Number(c && c.orden) || i,
      fecha: (c && c.fecha) || null
    }));

    if (metodo === 'PMP' || metodo === 'COSTE_MEDIO') {
      const totalCant = lista.reduce((t, c) => t + c.cantidad, 0);
      const totalVal = lista.reduce((t, c) => t + c.cantidad * c.coste, 0);
      const pmp = totalCant > 0 ? totalVal / totalCant : 0;
      return {
        importe: this._round(pmp * cantidad, 6),
        capas: [{ criterio: 'PMP', coste_unitario: this._round(pmp, 6), cantidad: this._round(cantidad, 4) }],
        restantes: lista.length
      };
    }

    // FIFO (e IDENTIFICACION_DIRECTA): la capa mas ANTIGUA primero.
    const ordenadas = [...lista].sort((a, b) => (a.fecha && b.fecha ? String(a.fecha).localeCompare(String(b.fecha)) : a.orden - b.orden));
    let porConsumir = cantidad;
    let importe = 0;
    const consumidas = [];
    for (const c of ordenadas) {
      if (porConsumir <= 0) break;
      const toma = Math.min(c.cantidad, porConsumir);
      importe += toma * c.coste;
      consumidas.push({ capa: c.producto, cantidad: this._round(toma, 4), coste_unitario: c.coste });
      porConsumir -= toma;
    }

    return {
      importe: this._round(importe, 6),
      capas: consumidas,
      restantes: Math.max(0, ordenadas.length - consumidas.length),
      faltante_sin_capa: this._round(Math.max(0, porConsumir), 4)
    };
  }

  // ── Tools ──
  toolValorar(params) { return this._valorar(params); }
  toolCapaDeValor(params) { return this._capaDeValor(params); }
  toolCalcularDiferencia(params) { return this._calcularDiferencia(params); }
  toolRegularizar(params) { return this._regularizar(params); }
  toolValorarEntrada(params) { return this._valorarEntrada(params); }
  toolValorarSalida(params) { return this._valorarSalida(params); }
}

module.exports = ValoracionExistencia;
