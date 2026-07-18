/**
 * pizza-a-universal — banco PURO: traduce un producto pizza-shaped (el que produce
 * la cara de chat de pizzepos: carta-manager/menu-generator) al ProductoUniversal
 * de prisma (5 huecos), determinista y sin dependencias.
 *
 * ES LA PIEZA QUE CARGA EL PESO de la convergencia (a): "cara pizzepos, cerebro
 * prisma". Cada página de chat pizzepos que se repunte a catalogo.* pasa su producto
 * por aquí ANTES de escribir — porque catalogo.add_product exige arquetipo + los 5
 * huecos, y un producto pizza plano (nombre/precio/ingredientes) no los trae.
 *
 * FIDELIDAD: preserva lo que la fuente trae; NO inventa. Lo que no viene queda en su
 * default sano (borrador legítimo — Prisma marca, no fabrica). Céntimos: pizzepos habla
 * en euros, prisma en céntimos enteros (coherente con opciones/coste/tasador).
 *
 * NO ata receta_ref: eso lo hace el órgano recetario por nombre (idempotente) — aquí
 * el arco queda por atar, no forzado.
 */

'use strict';

const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const eurACentimos = (e) => (typeof e === 'number' && Number.isFinite(e)) ? Math.round(e * 100) : 0;

// una lista de ingredientes pizza {id,nombre,familia,precio_extra} → valores de opción universal.
function _valores(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.filter(i => i && i.nombre).map(i => ({
    id: i.id || slug(i.nombre),
    etiqueta: String(i.nombre),
    delta_precio: eurACentimos(i.precio_extra),   // € → céntimos (0 si no trae)
    disponible: true
  }));
}

/**
 * pizzaAUniversal(p) → ProductoUniversal válido (pasa el freno de producto-manager).
 * p: producto pizza-shaped { nombre, precio, categoria_id, descripcion?, alergenos?,
 *    ingredientes?, ingredientes_base?, variaciones?, disponible?, etiquetas? }
 */
function pizzaAUniversal(p) {
  if (!p || typeof p !== 'object') return null;
  const nombre = String(p.nombre || '').trim();
  if (!nombre) return null;

  // hueco 3 — CONTRATO.opciones: QUITAR (los ingredientes propios) + ELEGIR_VARIOS (extras).
  const opciones = [];
  const quitables = _valores(p.ingredientes);
  if (quitables.length) opciones.push({ id: 'quitar', etiqueta: 'Quitar', sub_forma: 'modificacion', modo: 'QUITAR', valores: quitables });
  const extras = _valores(p.ingredientes_base);
  if (extras.length) opciones.push({ id: 'extras', etiqueta: 'Extras', sub_forma: 'añadido', modo: 'ELEGIR_VARIOS', valores: extras });

  // hueco 2 — RESTRICCIONES: los alérgenos son verdad_obligatoria (universal, Reg. UE 1169/2011).
  const restricciones = (Array.isArray(p.alergenos) ? p.alergenos : [])
    .filter(Boolean)
    .map(a => ({ tipo: 'verdad_obligatoria', regla: `alérgeno: ${a}`, no_negociable: true }));

  const precio_base_centimos = eurACentimos(p.precio);

  const out = {
    id: p.id || (p.categoria_id ? slug(p.categoria_id) + '_' : '') + slug(nombre),
    nombre,
    arquetipo: 'comestible',                       // una pizza SIEMPRE es comestible
    identidad: {
      que_es: String(p.descripcion || nombre),
      trabajo_que_resuelve: ''
    },
    restricciones,
    contrato: { atributos_saber: [], opciones, estados: [] },
    ejes: { tiempo: 'ninguno', estado_de_partida: false, ciclo: 'de_ida' },
    naturalezas: { stock: 'ingredientes', precio: 'por_unidad' },   // la forma que clasifica 'comestible'
    no_objetivos: [],
    // el coste es pregunta abierta hasta que escandallo→recetario lo resuelva (madurez sube sola).
    preguntas_abiertas: (precio_base_centimos > 0) ? [] : [{ campo: 'coste', para: 'comerciante', porque: 'no_computable', respondida: false }],
    madurez: (precio_base_centimos > 0) ? 'listo' : 'necesita_aclaracion_comerciante'
  };
  if (p.categoria_id) out.categoria_id = p.categoria_id;
  if (precio_base_centimos > 0) out.precio_base_centimos = precio_base_centimos;
  return out;
}

module.exports = { pizzaAUniversal };
