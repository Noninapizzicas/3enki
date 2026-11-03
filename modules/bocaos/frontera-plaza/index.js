'use strict';

/**
 * frontera-plaza · REFLEJO · PLAZA — S01 (FronteraDePlaza) + S02 (FiltroPorCobertura).
 *
 * HASTA DÓNDE LLEGA LA PLAZA Y HASTA DÓNDE CADA TIENDA. Es la función que hace comprobable la
 * frase «no existe la tienda que no llega»: una dirección cae en una plaza, o no cae en ninguna,
 * o cae en dos y entonces NO HAY PEDIDO.
 *
 *   S01 · de(dirección)  → plaza_id | NO_CONSTA | AMBIGUA(plazas)
 *   S02 · filtrar(índice, dirección) → las tiendas que llegan · y a la inversa
 *
 * Tres reglas que son el módulo:
 *
 *   1. NO SE ADIVINA. Si la dirección no dice su zona, o la plaza no ha declarado cobertura
 *      (J03), la respuesta es NO_CONSTA con el hueco nombrado. Estimar a qué plaza pertenece una
 *      dirección es romper la promesa de entrega por el camino más corto.
 *   2. DOS COBERTURAS QUE SE SOLAPAN SIN DESEMPATE DECLARADO → AMBIGUA, y no hay pedido (Q52).
 *      El desempate no se inventa aquí: o viene declarado, o no hay mercado para esa dirección.
 *   3. FILTRAR NO ES ORDENAR. La intersección entre lo que la plaza cubre (J03) y lo que cada
 *      tienda declara (D06) dice quién LLEGA; nunca quién paga. Y lo que no se puede comprobar
 *      se dice: `llega: null` con su motivo, no un «sí» de cortesía.
 *
 * Sin store y sin PosPersistencia: no escribe nada. Todo lo que necesita lo pide al bus y el dato
 * vuelve en la response. Una lista guardada de coberturas sería una segunda verdad, y la vieja.
 *
 * Isla: cero require a otra isla.
 */

const ModuloBocaos = require('../_bocaos');

class FronteraPlaza extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'frontera-plaza';
    this.version = 'reflejo-0.1.0';
    this._path = null;   // no escribe: es un reflejo del censo y de la política
  }

  onCubreRequest(e) { return this.servir(e, 'cubre', 'frontera-plaza.cubre', (d) => this._cubre(d)); }
  onZonasRequest(e) { return this.servir(e, 'zonas', 'frontera-plaza.zonas', (d) => this._zonas(d)); }

  // ================= S01 · ¿de qué plaza es esta dirección? =================
  async _cubre(d) {
    if (!d.project_id) return this._invalid('project_id');
    const direccion = this._direccion(d);
    const plaza_id = d.plaza_id || this.plaza_id || d.project_id;

    // Sin zona no hay frontera: no se estima a qué plaza pertenece una dirección.
    if (!direccion.zona) {
      this._sinPlaza({ plaza_id, direccion, motivo: 'la dirección no declara zona: no se estima' });
      return {
        status: 200,
        data: {
          cubre: null,
          estado: 'NO_CONSTA',
          plaza_id: null,
          direccion,
          motivo: 'la dirección no declara zona y la frontera no adivina (S01)',
          hueco: 'sin zona declarada'
        }
      };
    }

    const plazas = await this._plazas(d, plaza_id);
    const cubren = plazas.filter((p) => (p.zonas || []).includes(direccion.zona));

    if (cubren.length === 0) {
      this._sinPlaza({ plaza_id, direccion, motivo: 'ninguna plaza declara cobertura para esa zona' });
      return {
        status: 200,
        data: {
          cubre: false,
          estado: 'NO_CONSTA',
          plaza_id: null,
          direccion,
          zona: direccion.zona,
          plazas_consultadas: plazas.map((p) => p.plaza_id),
          motivo: 'ninguna plaza declara cobertura para esa zona (J03)',
          hueco: 'zona sin cobertura'
        }
      };
    }

    // Q52: dos coberturas solapadas sin regla de desempate → AMBIGUA, y no hay pedido.
    if (cubren.length > 1) {
      const desempate = this._desempate(d, cubren);
      if (!desempate) {
        this.hecho('bocaos.frontera_ambigua', {
          plaza_id,
          direccion,
          zona: direccion.zona,
          plazas: cubren.map((p) => p.plaza_id),
          motivo: 'dos coberturas se solapan y no hay desempate declarado (Q52): no hay pedido'
        });
        return {
          status: 200,
          data: {
            cubre: null,
            estado: 'AMBIGUA',
            plaza_id: null,
            plazas: cubren.map((p) => p.plaza_id),
            direccion,
            zona: direccion.zona,
            motivo: 'AMBIGUA: dos coberturas se solapan y no hay desempate declarado (Q52)',
            hueco: 'desempate sin declarar'
          }
        };
      }
      return {
        status: 200,
        data: {
          cubre: true,
          estado: 'PLAZA',
          plaza_id: desempate.plaza_id,
          plazas: cubren.map((p) => p.plaza_id),
          direccion,
          zona: direccion.zona,
          desempate: desempate.regla
        }
      };
    }

    return {
      status: 200,
      data: {
        cubre: true,
        estado: 'PLAZA',
        plaza_id: cubren[0].plaza_id,
        plazas: [cubren[0].plaza_id],
        direccion,
        zona: direccion.zona,
        fuente_cobertura: cubren[0].fuente
      }
    };
  }

  // ================= S02 · quién llega a esta dirección =================
  async _zonas(d) {
    if (!d.project_id) return this._invalid('project_id');
    const direccion = this._direccion(d);
    const plaza_id = d.plaza_id || this.plaza_id || d.project_id;

    const [plazas, censo] = await Promise.all([
      this._plazas(d, plaza_id),
      this._rpc('censo-parte.de.request', { project_id: d.project_id, plaza_id }, { timeout_ms: 4000 })
    ]);

    const miPlaza = plazas.find((p) => p.plaza_id === plaza_id) || { plaza_id, zonas: [], fuente: 'sin declarar' };
    const tiendas = (censo && censo.data && Array.isArray(censo.data.tiendas)) ? censo.data.tiendas : [];
    const huecos = [];
    if (!censo || !censo.data) huecos.push('sin censo: no se sabe qué tiendas existen');

    // La cobertura de la plaza, en la dirección consultada: si la plaza no llega, no hay lista.
    const plazaLlega = direccion.zona ? miPlaza.zonas.includes(direccion.zona) : null;
    if (!direccion.zona) huecos.push('la dirección no declara zona: la cobertura de la plaza no se puede comprobar');
    if (miPlaza.zonas.length === 0) huecos.push('la plaza no ha declarado cobertura (J03)');

    const llegan = [];
    const noLlegan = [];
    for (const t of tiendas) {
      const tienda_id = t.tienda_id || t.parte_id;
      const zonasTienda = Array.isArray(t.zonas) ? t.zonas : null;
      let llega = null;
      let motivo = null;
      if (!direccion.zona) {
        motivo = 'la dirección no declara zona';
      } else if (!zonasTienda || zonasTienda.length === 0) {
        // No se rellena con un «sí» de cortesía: sin cobertura declarada no se puede comprobar.
        motivo = 'la tienda no ha declarado dónde reparte (D06)';
      } else if (plazaLlega === false) {
        motivo = 'la plaza no cubre esa zona (J03)';
      } else {
        llega = zonasTienda.includes(direccion.zona) && (plazaLlega === true);
        motivo = llega ? null : 'la tienda no reparte en esa zona';
      }
      const fila = {
        tienda_id,
        nombre: t.nombre || null,
        zonas: zonasTienda,
        llega,
        motivo,
        // El orden es el del censo: declarado, no puntuado (D08).
        orden: llegan.length + noLlegan.length
      };
      if (llega === true) llegan.push(fila); else noLlegan.push(fila);
    }

    return {
      status: 200,
      data: {
        plaza_id,
        direccion,
        zona: direccion.zona,
        plaza_llega: plazaLlega,
        cobertura_plaza: miPlaza.zonas,
        fuente_cobertura: miPlaza.fuente,
        tiendas_que_llegan: llegan,
        tiendas_que_no: noLlegan,
        n: llegan.length,
        // S02 también a la inversa: qué tiendas llegan aquí, para el escaparate.
        a_la_inversa: tiendas.map((t) => ({
          tienda_id: t.tienda_id || t.parte_id,
          zonas: Array.isArray(t.zonas) ? t.zonas : []
        })),
        huecos
      }
    };
  }

  // ================= piezas =================
  // La dirección se toma como viene: zona declarada (y, si algún día hay geocodificador, sus
  // coordenadas). Lo que no viene NO se inventa.
  _direccion(d) {
    const dir = (d.direccion && typeof d.direccion === 'object') ? d.direccion : {};
    return {
      zona: dir.zona || d.zona || null,
      cp: dir.cp || d.cp || null,
      texto: dir.texto || (typeof d.direccion === 'string' ? d.direccion : null),
      punto: dir.punto || d.punto || null
    };
  }

  // Las coberturas, por el bus: la de esta plaza sale de la política (J03) y las demás, si el
  // llamante las trae (federación). No hay tabla de plazas escondida aquí.
  async _plazas(d, plaza_id) {
    if (Array.isArray(d.plazas) && d.plazas.length > 0) {
      return d.plazas.map((p) => ({
        plaza_id: p.plaza_id,
        zonas: Array.isArray(p.zonas) ? p.zonas.map(String) : [],
        fuente: p.fuente || 'declarada por el llamante'
      }));
    }
    const config = await this._rpc('config-mercado.politica.request', {
      project_id: d.project_id, plaza_id, instante: this._iso(d.instante) || this.ahora()
    }, { timeout_ms: 4000 });
    const zonas = (config && config.data && config.data.politica && config.data.politica.cobertura
      && Array.isArray(config.data.politica.cobertura.zonas))
      ? config.data.politica.cobertura.zonas.map(String)
      : [];
    return [{
      plaza_id,
      zonas,
      fuente: zonas.length > 0 ? `política v${config.data.politica.version}` : 'sin declarar'
    }];
  }

  // El desempate sólo vale si viene DECLARADO: una zona exclusiva, o una plaza nombrada con su
  // regla. Elegir «la primera» sería decidir por el cliente.
  _desempate(d, cubren) {
    const regla = d.desempate;
    if (!regla) return null;
    if (regla.plaza_id && cubren.some((p) => p.plaza_id === regla.plaza_id)) {
      return { plaza_id: regla.plaza_id, regla: regla.motivo || regla.tipo || 'plaza declarada' };
    }
    if (regla.tipo === 'zona_exclusiva' && regla.plaza_id) {
      return cubren.some((p) => p.plaza_id === regla.plaza_id)
        ? { plaza_id: regla.plaza_id, regla: 'zona exclusiva declarada' }
        : null;
    }
    return null;
  }

  _sinPlaza({ plaza_id, direccion, motivo }) {
    this.hecho('bocaos.direccion_sin_plaza', { plaza_id, direccion, motivo, hay_pedido: false });
  }
}

module.exports = FronteraPlaza;
