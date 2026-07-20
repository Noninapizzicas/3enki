/**
 * Prisma · UI-POS — tipos de la VISTA (lo que el proyector aplana del ProductoUniversal).
 *
 * La forma de la UI EMERGE de estos campos — no de "pizza". Un comestible, una pieza, un
 * servicio y un uso_temporal se pintan con los MISMOS componentes leyendo estos huecos.
 * Fuente: modules/prisma/proyector (_proyectarProducto) → vista.completa.
 */

export type ModoOpcion = 'ELEGIR_UNO' | 'ELEGIR_VARIOS' | 'QUITAR' | 'LIBRE';

export interface OpcionValor {
  id: string;
  etiqueta: string;
  delta_precio?: number;      // € (del molde)
  delta_centimos?: number;    // céntimos (si ya viene resuelto)
  disponible?: boolean;
}

export interface Opcion {
  id: string;
  etiqueta: string;
  sub_forma?: string;
  modo: ModoOpcion;
  valores?: OpcionValor[];
}

export interface VistaProducto {
  id: string;
  nombre: string;
  que_es: string;
  arquetipo: string | null;
  categoria_id: string | null;
  atributos: Array<{ nombre: string; valor?: any; eje?: string }>;
  opciones: Opcion[];
  estados: string[];
  verdades_obligatorias: string[];     // alérgenos / etiqueta / seguridad — se dicen fieles
  ejes: { tiempo: string; [k: string]: any };
  naturalezas: { origen?: string; precio?: string; [k: string]: any };
  madurez: string;
  listo_para_vender: boolean;
  requiere_tiempo: boolean;            // eje tiempo ≠ ninguno → necesita agenda (fuera del POS v1)
  precio_base_centimos?: number;
}

export interface VistaCategoria {
  id: string;
  nombre: string;
  orden?: number;
}

// ── helpers PUROS de proyección de precio (hint de UI; el backend es la verdad) ──

/** delta de un valor en céntimos (resuelto o desde delta_precio en €) */
export function deltaCentimos(v: OpcionValor): number {
  if (Number.isInteger(v.delta_centimos)) return v.delta_centimos as number;
  return Math.round((v.delta_precio || 0) * 100);
}

/** precio base del producto en céntimos, o null → "Consultar" (dato NOMBRADO, no inventado) */
export function precioCentimos(p: VistaProducto): number | null {
  if (Number.isInteger(p.precio_base_centimos)) return p.precio_base_centimos as number;
  const attr = (p.atributos || []).find(a => a && String(a.nombre).toLowerCase() === 'precio');
  if (attr && typeof attr.valor === 'number') return Math.round(attr.valor * 100);
  return null;
}

/** valores ofrecibles de una opción (disponible !== false) */
export function valoresDisponibles(o: Opcion): OpcionValor[] {
  return (Array.isArray(o.valores) ? o.valores : []).filter(v => v && v.disponible !== false);
}

/** ¿la opción es de texto libre? */
export function esLibre(o: Opcion): boolean {
  return o.modo === 'LIBRE' || o.sub_forma === 'personalizacion_libre';
}
