import { mqttRequest } from './mqtt-request';

/**
 * D3 (subsistema-catalogo): resuelve el carta_id de la carta efectiva de un canal CON override.
 *
 * Vía `tarifas.get` (config canal→carta_id). Devuelve `null` para mesa/general, para canales sin
 * override, o ante cualquier fallo → el composer cae al catálogo activo (fallback seguro, y NO
 * marca `precio_canal_resuelto`, con lo que comandero re-resuelve como hasta ahora).
 *
 * Cuando devuelve un carta_id, el composer pide `productos.pizzas({ carta_id })` (precios del canal)
 * y tasa contra ellos → manda `precio_canal_resuelto: true` y comandero confía (un solo punto tasa).
 */
export async function resolverCartaIdCanal(
  projectId: string,
  canal?: string | null
): Promise<string | null> {
  if (!projectId || !canal || canal === 'mesa') return null;
  try {
    const res = (await mqttRequest('tarifas', 'get', { project_id: projectId })) as {
      data?: { canales?: Record<string, { carta_id?: string; es_override?: boolean }> };
    };
    const info = res?.data?.canales?.[canal];
    return info && info.es_override && info.carta_id ? info.carta_id : null;
  } catch {
    return null;
  }
}
