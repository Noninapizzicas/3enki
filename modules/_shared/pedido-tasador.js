'use strict';

/**
 * pedido-tasador — RE-TASADO server-side de un pedido de autoservicio (seguridad anti-manipulación).
 *
 * El cliente (PWA) manda su pedido CODIFICADO POR IDS (producto_id + ingredientes_id), NUNCA por
 * precio. Quien recibe (el bot de WhatsApp) RE-CALCULA cada línea contra la carta REAL del canal,
 * con la MISMA política que el comandero del POS. Así da igual que el mensaje de WhatsApp sea texto
 * editable: los precios del cliente se ignoran; manda el del servidor.
 *
 * Función PURA: entra { items estructurados, carta }, sale { items tasados (céntimos), total, ok }.
 * Sin efectos, sin red — la carta se la trae el llamante (el bot, por RPC del bus).
 *
 * POLÍTICA (idéntica a MitadMitadPanel / AlGustoPanel / VariacionesPanel del frontend):
 *   normal      → precio del producto + Σ extras_añadidos          (quitar es gratis)
 *   al_gusto    → precio de la base elegida + Σ extras_añadidos
 *   mitad_mitad → max(precio_izq, precio_der) + Σ extras_izq + Σ extras_der   (extras completos)
 *
 * Dinero en CÉNTIMOS (enteros) de punta a punta (igual que el contrato pedido.crear-tienda).
 */

const TIPOS = new Set(['normal', 'al_gusto', 'mitad_mitad']);

function _centimos(euros) {
  const n = Number(euros);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

// Índices por id para O(1): productos (precio) e ingredientes-catálogo (precio_extra + nombre).
function _indexar(carta) {
  const prod = new Map();
  for (const p of (Array.isArray(carta?.productos) ? carta.productos : [])) {
    if (p && p.id != null) prod.set(String(p.id), p);
  }
  const ing = new Map();
  const cat = Array.isArray(carta?.ingredientes_catalogo) ? carta.ingredientes_catalogo
            : Array.isArray(carta?.ingredientes) ? carta.ingredientes : [];
  for (const i of cat) {
    if (i && i.id != null) ing.set(String(i.id), i);
  }
  return { prod, ing };
}

// Suma de extras (céntimos) + sus nombres (para la descripción humana). Un id desconocido
// NO se cobra (no se puede tasar lo que no está en la carta) y se reporta como aviso.
function _extras(anadirIds, ing, avisos) {
  let centimos = 0;
  const nombres = [];
  for (const raw of (Array.isArray(anadirIds) ? anadirIds : [])) {
    const id = String(typeof raw === 'object' && raw ? raw.id : raw);
    const e = ing.get(id);
    if (!e) { avisos.push({ code: 'EXTRA_DESCONOCIDO', id }); continue; }
    centimos += _centimos(e.precio_extra);
    nombres.push(e.nombre || id);
  }
  return { centimos, nombres };
}

// Ingredientes base del producto, como NOMBRES (strings) — lo que cocina (ItemLine) pinta para
// que el cocinero sepa qué lleva el plato. La carta los trae bajo ingredientes_base o ingredientes,
// y cada uno puede ser string u objeto {nombre}. Normaliza a strings; vacío si no hay.
function _nombresBase(p) {
  const arr = (Array.isArray(p?.ingredientes_base) && p.ingredientes_base.length) ? p.ingredientes_base
            : (Array.isArray(p?.ingredientes) ? p.ingredientes : []);
  return arr.map(x => (typeof x === 'string' ? x : (x && x.nombre) || '')).filter(Boolean);
}

function _quitarNombres(quitar) {
  return (Array.isArray(quitar) ? quitar : [])
    .map(q => (typeof q === 'object' && q ? (q.nombre || q.id) : q))
    .filter(Boolean)
    .map(String);
}

function _modsTxt(quitarNombres, anadirNombres) {
  const mods = [];
  for (const n of quitarNombres) mods.push('sin ' + n);
  for (const n of anadirNombres) mods.push('+ ' + n);
  return mods.length ? ' (' + mods.join(', ') + ')' : '';
}

/**
 * @param {Array} items  items estructurados (por ids) — ver shape en el doc de cabecera
 * @param {Object} carta { productos:[{id,nombre,precio}], ingredientes_catalogo:[{id,nombre,precio_extra}] }
 * @returns {{ ok:boolean, items:Array, total_centimos:number, errores:Array, avisos:Array }}
 *   ok=false si alguna línea referencia un producto inexistente (no_silent_failures: el bot
 *   se lo dice al cliente). Los extras desconocidos NO tumban el pedido: se omiten y se avisan.
 */
function tasarPedido(items, carta) {
  const { prod, ing } = _indexar(carta);
  const errores = [];
  const avisos = [];
  const tasados = [];
  let total = 0;

  const lista = Array.isArray(items) ? items : [];
  if (lista.length === 0) {
    return { ok: false, items: [], total_centimos: 0, errores: [{ code: 'SIN_ITEMS' }], avisos };
  }

  for (let idx = 0; idx < lista.length; idx++) {
    const it = lista[idx] || {};
    const cantidad = Number.isInteger(it.cantidad) && it.cantidad > 0 ? it.cantidad : 1;
    const tipo = TIPOS.has(it.tipo) ? it.tipo : 'normal';
    const linea = { _idx: idx, cantidad, tipo };

    if (tipo === 'mitad_mitad') {
      const izq = prod.get(String(it.pizza_izquierda?.id));
      const der = prod.get(String(it.pizza_derecha?.id));
      if (!izq || !der) {
        errores.push({ code: 'PRODUCTO_DESCONOCIDO', idx, ids: [it.pizza_izquierda?.id, it.pizza_derecha?.id] });
        continue;
      }
      const exIzq = _extras(it.pizza_izquierda?.anadir, ing, avisos);
      const exDer = _extras(it.pizza_derecha?.anadir, ing, avisos);
      const base = Math.max(_centimos(izq.precio), _centimos(der.precio));
      const unit = base + exIzq.centimos + exDer.centimos;
      const qIzq = _quitarNombres(it.pizza_izquierda?.quitar);
      const qDer = _quitarNombres(it.pizza_derecha?.quitar);
      linea.producto_id = `mitad_${izq.id}_${der.id}`;
      linea.nombre = `½ ${izq.nombre} + ½ ${der.nombre}`;
      linea.descripcion = `½ ${izq.nombre}${_modsTxt(qIzq, exIzq.nombres)} + ½ ${der.nombre}${_modsTxt(qDer, exDer.nombres)}`;
      const baseIzq = _nombresBase(izq);
      const baseDer = _nombresBase(der);
      linea.pizza_izquierda = { id: String(izq.id), nombre: izq.nombre, ...(baseIzq.length ? { ingredientes_base: baseIzq } : {}), quitar: qIzq, anadir: exIzq.nombres };
      linea.pizza_derecha = { id: String(der.id), nombre: der.nombre, ...(baseDer.length ? { ingredientes_base: baseDer } : {}), quitar: qDer, anadir: exDer.nombres };
      linea.precio_unitario_centimos = unit;
    } else {
      // normal | al_gusto — base = el producto elegido (al_gusto puede traer base_id explícito)
      const baseId = String(tipo === 'al_gusto' && it.base_id != null ? it.base_id : it.producto_id);
      const p = prod.get(baseId);
      if (!p) { errores.push({ code: 'PRODUCTO_DESCONOCIDO', idx, id: baseId }); continue; }
      const ex = _extras(it.anadir, ing, avisos);
      const q = _quitarNombres(it.quitar);
      const unit = _centimos(p.precio) + ex.centimos;
      linea.producto_id = String(p.id);
      linea.nombre = tipo === 'al_gusto' ? `${p.nombre} al gusto` : p.nombre;
      linea.descripcion = linea.nombre + _modsTxt(q, ex.nombres);
      linea.variaciones = { ingredientes_quitar: q, ingredientes_anadir: ex.nombres };
      const base = _nombresBase(p);
      if (base.length) linea.ingredientes_base = base;   // cocina pinta los ingredientes del plato
      linea.precio_unitario_centimos = unit;
    }

    linea.precio_total_centimos = linea.precio_unitario_centimos * cantidad;
    total += linea.precio_total_centimos;
    delete linea._idx;
    tasados.push(linea);
  }

  return {
    ok: errores.length === 0,
    items: tasados,
    total_centimos: total,
    errores,
    avisos
  };
}

module.exports = { tasarPedido };
