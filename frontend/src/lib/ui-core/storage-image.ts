/**
 * storage-image — muestra imágenes que viven en el STORAGE del proyecto (p.ej. las de
 * contenido: /pizzepos/contenido/imagenes/<pid>__<hash>.jpg) sin una ruta HTTP dedicada.
 *
 * El problema: esos paths son de storage de proyecto, NO URLs servidas por Caddy/gateway →
 * un <img src="/pizzepos/contenido/imagenes/..."> da 404 en toda la app Enki. El patrón del
 * repo para binarios en el frontend es leerlos por fs (base64) y mostrarlos como data: URI
 * (igual que los paneles OCR/pdf2img). Aquí se encapsula con caché + acción Svelte.
 */
import { mqttRequest } from './mqtt-request';

const cache = new Map<string, string>();              // path → data URI (o url tal cual)
const inflight = new Map<string, Promise<string>>();

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp'
};

function mimeOf(path: string): string {
  const ext = (path.split('.').pop() || '').toLowerCase();
  return MIME[ext] || 'image/jpeg';
}

/**
 * Resuelve una ruta de storage de proyecto a un src mostrable (data: URI vía fs.read base64).
 * Las urls http(s)/data/blob se devuelven tal cual (no son de storage). Cachea por path.
 */
export async function storageImageSrc(path: string): Promise<string> {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  const hit = cache.get(path);
  if (hit) return hit;
  const pending = inflight.get(path);
  if (pending) return pending;
  const job = (async () => {
    const res = await mqttRequest<{ content: string; encoding: string }>('fs', 'read', { path });
    const content = res?.data?.content;
    if (!content) throw new Error('imagen sin contenido');
    const src = res.data.encoding === 'base64'
      ? `data:${mimeOf(path)};base64,${content}`
      : path;
    cache.set(path, src);
    return src;
  })();
  inflight.set(path, job);
  try {
    return await job;
  } finally {
    inflight.delete(path);
  }
}

/** URL HTTP que sirve el fichero del storage del proyecto activo (cacheable por el navegador). */
function httpUrl(path: string): string {
  return '/modules/filesystem/file?path=' + encodeURIComponent(path);
}

/**
 * Acción Svelte: <img use:storageImg={path} alt=... class=...>. Muestra una imagen que vive en el
 * storage del proyecto. Estrategia robusta al rollout:
 *   1) src = ruta HTTP servida por filesystem (cacheable, ligera).
 *   2) si esa ruta falla (core sin el endpoint todavía), onerror → data: URI vía fs.read (MQTT).
 * Las urls http/data/blob se usan tal cual. Reacciona a cambios de path.
 */
export function storageImg(node: HTMLImageElement, path: string) {
  let current = '';
  const apply = (p: string) => {
    current = p;
    node.onerror = null;
    if (!p) { node.removeAttribute('src'); return; }
    if (/^(https?:|data:|blob:)/.test(p)) { node.src = p; return; }
    let triedFallback = false;
    node.onerror = () => {
      if (triedFallback || current !== p) return;
      triedFallback = true;
      storageImageSrc(p)
        .then((src) => { if (current === p && src) node.src = src; })
        .catch(() => { /* sin imagen: queda el alt/placeholder */ });
    };
    node.src = httpUrl(p);
  };
  apply(path);
  return {
    update(p: string) { if (p !== current) apply(p); },
    destroy() { current = ''; node.onerror = null; }
  };
}
