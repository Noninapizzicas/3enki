/**
 * contabilidad-entrada/cruce-factura-recepcion — REFLEJO STATELESS (N5, hoja del plan).
 *
 * **EL COTEJO PEDIDO ↔ RECEPCION ↔ FACTURA, ANTES DE ASENTAR. (3-way match.)**
 *
 * Determinista: se comparan los TRES documentos del hecho de compra por sus LINEAS, y la salida
 * dice, linea a linea, si cuadran y en que NO cuadran.
 *
 * 🔴 **LAS DIFERENCIAS SE DECLARAN, NO SE AJUSTAN SOLAS.** Lo que no cuadra va a la cola de
 * excepciones como DIFERENCIA DECLARADA; este reflejo NO modifica la factura, NO modifica la
 * recepcion y NO asienta nada. Resolver la diferencia es un acto humano/asesor.
 *
 * 🔴 **LAS TOLERANCIAS Y LOS CRITERIOS SON DECLARABLES, NO CABLEADOS.** No hay ninguna tolerancia
 * escrita aqui (ni 0, ni un %, ni céntimos): si el negocio declara `tolerancias` (por importe,
 * por cantidad o por linea), se aplican; si NO las declara, la igualdad es EXACTA y se declara
 * que no hay tolerancia (`tolerancias:null`). Una tolerancia inventada dejaria pasar diferencias
 * que el negocio no autorizo.
 *
 * 🔴 **SI UNO DE LOS TRES LADOS NO LLEGA, NO SE ASUME.** Las tres vias son DECLARADAS; las que
 * falten se declaran en `lados_faltantes` y el cotejo queda `completo:false` — no se rellena la
 * recepcion con el pedido ni la factura con la recepcion. El 3-way match sin tres lados no es match.
 *
 * ATRIBUTOS del diseno: `pedido`, `recepcion`, `factura`.
 * METODOS: `cotejar():Resultado`.
 *
 * Invariantes:
 *  - DETERMINISTA: mismos tres documentos + mismas tolerancias → mismo resultado (una sola respuesta).
 *  - Dato ausente = desconocido: sin lineas que comparar no se coteja; un lado ausente se declara.
 *  - NO escribe, NO persiste, NO muta y NO decide: declara el cotejo; no corrige ni aprueba.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja N5 del plan-construccion y diseno-oop.md (CLASE CruceFacturaRecepcion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class CruceFacturaRecepcion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cruce-factura-recepcion';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onCotejarRequest(e) {
    return this._atender(e, 'cotejar', 'cruce-factura-recepcion.cotejar.response', async (d) => {
      const res = this._cotejar(d);
      if (res.status === 200) {
        // Exito → el cotejo quedo hecho. Si hay diferencias, se DECLARAN y van a cola
        // (no se ajustan solas): el asesor las resuelve.
        if (res.data.cuadra === false || res.data.completo === false) {
          this.eventBus?.publish('contabilidad.cruce_descuadrado', {
            project_id: res.data.project_id,
            cuadra: res.data.cuadra,
            completo: res.data.completo,
            lados_faltantes: res.data.lados_faltantes,
            diferencias: res.data.diferencias,
            tolerancias: res.data.tolerancias,
            resuelve: res.data.resuelve,
            correlation_id: d.correlation_id
          });
        }
      } else {
        this.eventBus?.publish('cruce-factura-recepcion.cotejar.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // cotejar() → Resultado (3-way match determinista, diferencias declaradas)
  // ══════════════════════════════════════════════════════════════════════
  _cotejar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const pedido = this._doc(input.pedido !== undefined ? input.pedido : input.p);
    const recepcion = this._doc(input.recepcion !== undefined ? input.recepcion : input.recepcionado !== undefined ? input.recepcionado : input.r);
    const factura = this._doc(input.factura !== undefined ? input.factura : input.f);

    // 🔴 Las tres vias. Las que NO llegan se declaran: no se sustituyen unas por otras.
    const lados = { pedido: Boolean(pedido), recepcion: Boolean(recepcion), factura: Boolean(factura) };
    const lados_faltantes = Object.keys(lados).filter((k) => !lados[k]);

    // Las TOLERANCIAS: DECLARABLES. Sin declararlas, la igualdad es EXACTA (no hay tolerancia cableada).
    const tolerancias = this._tolerancias(input);

    // Con un lado ausente, el 3-way match NO se puede cerrar: se declara y no se asume nada.
    if (lados_faltantes.length > 0) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'cruce-factura-recepcion',
          // Sin los tres lados NO hay match: ni conforme ni descuadrado — NO SE SABE.
          cuadra: null,
          completo: false,
          lados,
          lados_faltantes,
          lineas: [],
          diferencias: [],
          num_lineas: 0,
          num_diferencias: 0,
          tolerancias,
          // 🔴 No se rellena el lado que falta con otro: se declara.
          se_asume_lado_faltante: false,
          resuelve: 'asesor (las diferencias se declaran; no se ajustan solas)',
          abierto: {
            lados: `faltan lados del 3-way match (${lados_faltantes.join(', ')}): el cotejo NO se cierra y NADA se asume en su lugar`,
            tolerancias: tolerancias === null ? 'no se declararon tolerancias: la igualdad es EXACTA (cero tolerancias cableadas)' : null
          }
        }
      };
    }

    // 1 · La MATERIA: los items de cada lado (DECLARADOS: items/lineas o un item unico).
    const items = {
      pedido: this._items(pedido),
      recepcion: this._items(recepcion),
      factura: this._items(factura)
    };

    // 2 · El emparejamiento de lineas por la CLAVE DECLARADA en cada item (o por indice). Determinista.
    const claves = this._claves(items);
    const porClave = {
      pedido: this._mapaPorClave(items.pedido),
      recepcion: this._mapaPorClave(items.recepcion),
      factura: this._mapaPorClave(items.factura)
    };
    const lineas = [];
    const diferencias = [];

    for (const clave of claves) {
      const a = porClave.pedido.get(clave) || null;
      const b = porClave.recepcion.get(clave) || null;
      const c = porClave.factura.get(clave) || null;

      const cantidades = {
        pedido: a ? this._cantidad(a) : null,
        recepcion: b ? this._cantidad(b) : null,
        factura: c ? this._cantidad(c) : null
      };
      const importes = {
        pedido: a ? this._importe(a) : null,
        recepcion: b ? this._importe(b) : null,
        factura: c ? this._importe(c) : null
      };

      // Las DIFERENCIAS de esta linea: se DECLARAN, no se corrigen.
      const dif = [];
      if (!a) dif.push({ campo: 'pedido', motivo: 'la linea existe en recepcion/factura pero NO en el pedido' });
      if (!b) dif.push({ campo: 'recepcion', motivo: 'la linea existe en pedido/factura pero NO se ha recibido' });
      if (!c) dif.push({ campo: 'factura', motivo: 'la linea existe en pedido/recepcion pero NO esta facturada' });
      if (a && b && !this._iguales(cantidades.pedido, cantidades.recepcion, tolerancias, 'cantidad')) {
        dif.push({ campo: 'cantidad', lados: ['pedido', 'recepcion'], pedido: cantidades.pedido, recepcion: cantidades.recepcion, motivo: 'la cantidad recibida no coincide con la pedida' });
      }
      if (b && c && !this._iguales(cantidades.recepcion, cantidades.factura, tolerancias, 'cantidad')) {
        dif.push({ campo: 'cantidad', lados: ['recepcion', 'factura'], recepcion: cantidades.recepcion, factura: cantidades.factura, motivo: 'la cantidad facturada no coincide con la recibida' });
      }
      if (c && a && !this._iguales(importes.factura, importes.pedido, tolerancias, 'importe')) {
        dif.push({ campo: 'importe', lados: ['pedido', 'factura'], pedido: importes.pedido, factura: importes.factura, motivo: 'el importe facturado no coincide con el pedido' });
      }
      if (a && b && c && !this._iguales(importes.factura, importes.recepcion, tolerancias, 'importe') &&
          this._iguales(importes.factura, importes.pedido, tolerancias, 'importe')) {
        dif.push({ campo: 'importe', lados: ['recepcion', 'factura'], recepcion: importes.recepcion, factura: importes.factura, motivo: 'el importe facturado coincide con el pedido pero no con lo recibido' });
      }

      lineas.push({ clave, pedido: a, recepcion: b, factura: c, cantidades, importes, cuadra: dif.length === 0, diferencias: dif });
      for (const d of dif) diferencias.push({ linea: clave, ...d });
    }

    // 3 · El veredicto del cotejo: cuadra SOLO si las tres vias concuerdan linea a linea.
    const cuadra = diferencias.length === 0;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'cruce-factura-recepcion',
        cuadra,
        completo: true,
        lados,
        lados_faltantes: [],
        // El cotejo linea a linea, con sus diferencias DECLARADAS a la vista.
        lineas,
        num_lineas: lineas.length,
        diferencias,
        num_diferencias: diferencias.length,
        tolerancias,
        // 🔴 Lo que no cuadra va a cola como DIFERENCIA DECLARADA: no se ajusta solo.
        diferencias_a_cola: !cuadra,
        se_ajusta_automaticamente: false,
        asentado: false,
        // Antes de asentar: este cotejo es el paso PREVIO (`antes_de_asentar:true`).
        antes_de_asentar: true,
        resuelve: 'asesor (las diferencias se declaran; no se ajustan solas)',
        abierto: {
          lados: null,
          tolerancias: tolerancias === null ? 'no se declararon tolerancias: la igualdad es EXACTA (cero tolerancias cableadas)' : null,
          diferencias: cuadra ? null : `hay ${diferencias.length} diferencia(s): se declaran y van a cola; el reflejo NO las corrige`
        }
      }
    };
  }

  _doc(v) {
    return v && typeof v === 'object' ? v : null;
  }

  _items(doc) {
    if (!doc) return [];
    if (Array.isArray(doc.items)) return doc.items;
    if (Array.isArray(doc.lineas)) return doc.lineas;
    if (Array.isArray(doc.líneas)) return doc.líneas;
    // Un documento sin lineas declaradas: se trata como un item unico (cotejo a nivel de documento).
    return [doc];
  }

  // Las claves de linea: la UNION determinista de las declaradas en los tres lados.
  _claves(items) {
    const set = [];
    const vistos = new Set();
    for (const lado of ['pedido', 'recepcion', 'factura']) {
      items[lado].forEach((x, i) => {
        const k = this._claveDe(x, i);
        if (!vistos.has(k)) { vistos.add(k); set.push(k); }
      });
    }
    return set;
  }

  // Indice determinista clave → item. Si una clave se repite en un lado, gana la PRIMERA
  // declarada (no se suman lineas por su cuenta: eso seria ajustar).
  _mapaPorClave(items) {
    const m = new Map();
    items.forEach((x, i) => {
      const k = this._claveDe(x, i);
      if (!m.has(k)) m.set(k, x);
    });
    return m;
  }

  // La clave declarada de un item: `clave`/`clave_natural`/`referencia`/`sku`/`codigo`; sin ninguna → por indice.
  _claveDe(x, indice) {
    if (x && typeof x === 'object') {
      const k = x.clave !== undefined ? x.clave
        : (x.clave_natural !== undefined ? x.clave_natural
          : (x.referencia !== undefined ? x.referencia
            : (x.sku !== undefined ? x.sku : (x.codigo !== undefined ? x.codigo : (x.articulo !== undefined ? x.articulo : null)))));
      if (k !== null) return String(k);
    }
    return `#${indice}`;
  }

  _cantidad(x) {
    if (!x || typeof x !== 'object') return null;
    const v = x.cantidad !== undefined ? x.cantidad
      : (x.qty !== undefined ? x.qty : (x.unidades !== undefined ? x.unidades : null));
    return this._num(v);
  }

  _importe(x) {
    if (!x || typeof x !== 'object') return null;
    return this._num(x.importe !== undefined ? x.importe
      : (x.total !== undefined ? x.total : (x.precio !== undefined ? x.precio : (x.pvp !== undefined ? x.pvp : null))));
  }

  // ¿Dos valores cuadran? Con la TOLERANCIA DECLARADA que les toque; sin tolerancia, igualdad EXACTA.
  _iguales(a, b, tolerancias, campo) {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    const tol = this._toleranciaPara(tolerancias, campo);
    if (tol === null) return this._round(a, 4) === this._round(b, 4);
    // Tolerancia declarada: se admite |a − b| <= tol. Cero tolerancias cableadas.
    return Math.abs(a - b) <= Math.abs(tol) + 1e-9;
  }

  // La tolerancia aplicable al campo: la especifica del campo, o la general declarada. Sin declarar → null.
  _toleranciaPara(tolerancias, campo) {
    if (!tolerancias) return null;
    if (tolerancias[campo] !== undefined && tolerancias[campo] !== null) return this._num(tolerancias[campo]);
    if (tolerancias.general !== undefined && tolerancias.general !== null) return this._num(tolerancias.general);
    return null;
  }

  // Las TOLERANCIAS: DECLARABLES ({cantidad?, importe?, general?}). Sin declarar → null (igualdad exacta).
  _tolerancias(input) {
    const raw = input.tolerancias !== undefined ? input.tolerancias
      : (input.tolerancia !== undefined ? input.tolerancia : null);
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') {
      const n = this._num(raw);
      return n === null ? null : { general: n };
    }
    if (typeof raw === 'object') {
      const out = {};
      for (const k of ['cantidad', 'importe', 'general', 'precio']) {
        const v = this._num(raw[k]);
        if (v !== null) out[k] = v;
      }
      return Object.keys(out).length > 0 ? out : null;
    }
    return null;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCotejar(params) { return this._cotejar(params); }
}

module.exports = CruceFacturaRecepcion;
