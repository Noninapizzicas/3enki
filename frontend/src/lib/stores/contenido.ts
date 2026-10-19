/**
 * Contenido Store — subir/quitar imágenes de producto (pieza 4 del subsistema digital).
 *
 * El frontend entra por la puerta ui_handler de `contenido` (handlers JS deterministas).
 * El reflejo nombra el fichero canónico y guarda la referencia; aquí solo leemos el File,
 * lo pasamos a base64 y llamamos add_imagen / quitar_imagen.
 *
 * La LISTA de productos (a los que asignar imágenes) y sus imágenes actuales se leen de la
 * proyección de carta-digital (cartaPublica), que ya mezcla producto + contenido.
 */

import { writable, get } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';
import { activeProjectId } from './projects';

export const contenidoBusy = writable<string | null>(null);   // product_id en proceso
export const contenidoError = writable<string | null>(null);

const EXT_VALIDAS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];

function fileToBase64(file: File): Promise<{ content: string; ext: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const content = res.includes(',') ? res.split(',')[1] : res;   // quita 'data:...;base64,'
      let ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!EXT_VALIDAS.includes(ext)) ext = (file.type.split('/')[1] || 'jpg').toLowerCase();
      resolve({ content, ext });
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

/** Sube una imagen a un producto. principal=true la marca como la principal. */
export async function subirImagen(productId: string, file: File, principal = false): Promise<boolean> {
  const project_id = get(activeProjectId);
  if (!project_id) { contenidoError.set('Sin proyecto activo'); return false; }
  if (!file.type.startsWith('image/')) { contenidoError.set('El archivo no es una imagen'); return false; }
  if (file.size > 5 * 1024 * 1024) { contenidoError.set('La imagen supera 5 MB'); return false; }
  contenidoError.set(null);
  try {
    const { content, ext } = await fileToBase64(file);
    await mqttRequest('contenido', 'add_imagen', { project_id, product_id: productId, content, ext, principal });
    return true;
  } catch (err) {
    contenidoError.set(err instanceof Error ? err.message : 'No se pudo subir la imagen');
    return false;
  }
}

/** Quita una imagen de un producto. */
export async function quitarImagen(productId: string, imagenId: string): Promise<boolean> {
  const project_id = get(activeProjectId);
  if (!project_id) { contenidoError.set('Sin proyecto activo'); return false; }
  contenidoError.set(null);
  try {
    await mqttRequest('contenido', 'quitar_imagen', { project_id, product_id: productId, imagen_id: imagenId });
    return true;
  } catch (err) {
    contenidoError.set(err instanceof Error ? err.message : 'No se pudo quitar la imagen');
    return false;
  }
}
