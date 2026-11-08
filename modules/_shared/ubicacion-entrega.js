/**
 * ubicacion-entrega — el PUNTO donde el cliente quiere recibir y el enlace que
 * lleva al repartidor hasta allí.
 *
 * Tres estados, un solo contrato (y ninguno inventa un mapa):
 *   · con punto     → las coordenadas mandan; la dirección sigue viajando como
 *                     referencia humana (la calle escrita no siempre basta).
 *   · sin punto     → manda la dirección escrita: el enlace se compone del texto.
 *   · ni punto ni texto con forma → null. El que llama decide si eso frena algo.
 *
 * El punto NUNCA es obligatorio: negar el permiso del móvil no puede dejar al
 * cliente sin pedido. Sirve para que el repartidor llegue, no para verificar
 * quién es (el cliente puede falsearlo; la verdad del pedido es el teléfono).
 */
'use strict';

const MAPA_BASE = 'https://www.google.com/maps/search/?api=1&query=';

function _numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// normalizarUbicacion(raw) → { lat, lng } | null
// Acepta {lat,lng}, {lat,lon}, {latitude,longitude} — el navegador y los mapas
// no se ponen de acuerdo en el nombre, y el dato es el mismo.
function normalizarUbicacion(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const lat = _numero(raw.lat !== undefined ? raw.lat : raw.latitude);
  const lng = _numero(raw.lng !== undefined ? raw.lng
    : (raw.lon !== undefined ? raw.lon : raw.longitude));
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  // (0,0) es el "null island": el GPS del móvil sin fix, no un reparto.
  if (lat === 0 && lng === 0) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

// enlaceMapa({ direccion, ciudad, ubicacion }) → url | null
// Con punto, el mapa abre el punto exacto; sin punto, busca la dirección escrita.
function enlaceMapa({ direccion, ciudad, ubicacion } = {}) {
  const u = normalizarUbicacion(ubicacion);
  if (u) return MAPA_BASE + u.lat + ',' + u.lng;
  const texto = [direccion, ciudad]
    .filter(s => typeof s === 'string' && s.trim())
    .map(s => s.trim())
    .join(', ');
  if (texto.length < 6) return null;
  return MAPA_BASE + encodeURIComponent(texto);
}

// esEnlaceMapa(url) — lo que sale hacia el cliente/móvil del repartidor es http(s).
function esEnlaceMapa(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
}

module.exports = { normalizarUbicacion, enlaceMapa, esEnlaceMapa, MAPA_BASE };
