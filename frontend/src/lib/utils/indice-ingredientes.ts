/**
 * Índice de secciones por INGREDIENTE PRINCIPAL — derivado, no almacenado.
 *
 * Una carta de pizzas tiene 25-40 ingredientes distintos. Hacer una sección por
 * ingrediente sería un desmadre (300 apartados). El eje útil es el ingrediente
 * PRINCIPAL: los 5-6 que más se repiten en el sector, que es como el camarero
 * oye el pedido ("dos de jamón") y como el cliente busca en la carta.
 *
 * REGLA DE ORO: esto NO toca el modelo de datos de la carta. Se calcula al leer,
 * desde los `ingredientes` que cada producto YA declara, así que nunca se queda
 * viejo y no hay que mantenerlo en cada alta. Una pizza con jamón Y bacon sale
 * en las dos secciones: eso es lo que lo hace útil, no un duplicado.
 *
 * Puro y sin dependencias de Svelte: se puede probar con node directamente.
 */

import type { Producto } from '$lib/stores/comandero';

export interface SeccionIngrediente {
  ingrediente_id: string;
  nombre:  string;
  emoji:   string;
  /** Las pizzas que llevan ese ingrediente, en el orden de la carta. */
  productos: Producto[];
}

/**
 * Los principales, por sector. Solo los que aguantan sección de verdad.
 * Los ids son los de la carta (los de `ingredientes[].id`), no etiquetas libres:
 * si la carta escribe 'jamon_de_york' y aquí pusiéramos 'jamon_york', la sección
 * se parte en dos mitades y no cuadra ninguna.
 */
export const PRINCIPALES_POR_SECTOR: Record<string, string[]> = {
  pizzas: ['jamon_de_york', 'bacon', 'ternera', 'pollo', 'anchoas', 'atun']
};

/** Categorías que se pintan con secciones de ingrediente (hoy, solo pizzas). */
export const CATEGORIAS_CON_SECCIONES = ['pizzas'];

/** id de un ingrediente, venga como objeto {id,nombre} o como string suelto. */
export function idDeIngrediente(ing: any): string | null {
  if (!ing) return null;
  if (typeof ing === 'string') return slug(ing);
  return ing.id || (ing.nombre ? slug(ing.nombre) : null);
}

function slug(txt: string): string {
  return String(txt)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** ¿Este producto lleva ese ingrediente? */
export function llevaIngrediente(producto: Producto, ingredienteId: string): boolean {
  const ings = (producto as any)?.ingredientes || (producto as any)?.ingredientes_base || [];
  return (ings as any[]).some(i => idDeIngrediente(i) === ingredienteId);
}

/**
 * Construye las secciones. Devuelve solo las que tienen al menos 1 producto,
 * ordenadas por número de pizzas (la más gorda primero) y, a igualdad, por el
 * orden declarado en PRINCIPALES_POR_SECTOR.
 */
export function construirSeccionesIngredientes(
  productos: Producto[],
  opciones: { principales?: Record<string, string[]>; categorias?: string[] } = {}
): SeccionIngrediente[] {
  const principales = opciones.principales || PRINCIPALES_POR_SECTOR;
  const categorias  = opciones.categorias  || CATEGORIAS_CON_SECCIONES;
  if (!Array.isArray(productos) || productos.length === 0) return [];

  const secciones: SeccionIngrediente[] = [];
  const orden: string[] = [];

  for (const categoria of categorias) {
    const lista = principales[categoria] || [];
    const delSector = productos.filter(
      p => (p.categoria_id === categoria || (p as any).categoria === categoria)
    );

    for (const ingredienteId of lista) {
      const productos_ = delSector.filter(p => llevaIngrediente(p, ingredienteId));
      if (productos_.length === 0) continue;

      // Nombre y emoji salen del propio dato: el de la primera pizza que lo declara.
      let nombre = ingredienteId.replace(/_/g, ' ');
      let emoji  = '';
      for (const p of productos_) {
        const ing = ((p as any).ingredientes || []).find(
          (i: any) => idDeIngrediente(i) === ingredienteId
        );
        if (ing && typeof ing === 'object') {
          nombre = ing.nombre || nombre;
          emoji  = ing.emoji || '';
          break;
        }
      }

      secciones.push({ ingrediente_id: ingredienteId, nombre, emoji, productos: productos_ });
      orden.push(`${categoria}:${ingredienteId}`);
    }
  }

  // Más grande primero; empate → orden declarado (índice en `orden`).
  return secciones
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.productos.length - a.s.productos.length || a.i - b.i)
    .map(x => x.s);
}
