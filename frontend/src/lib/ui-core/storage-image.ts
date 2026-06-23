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
 * Las urls http(s)/data/blob se devuelven tal cual (no son de storage). Cachea por path+proyecto.
 * project: el proyecto DUEÑO de la imagen (multi-tenant) — sin él, el servidor usa el activo.
 */
export async function storageImageSrc(path: string, project?: string): Promise<string> {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  const key = (project ? project + '::' : '') + path;
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = (async () => {
    const payload: Record<string, unknown> = project ? { path, project_id: project } : { path };
    const res = await mqttRequest<{ content: string; encoding: string }>('fs', 'read', payload);
    const content = res?.data?.content;
    if (!content) throw new Error('imagen sin contenido');
    const src = res.data.encoding === 'base64'
      ? `data:${mimeOf(path)};base64,${content}`
      : path;
    cache.set(key, src);
    return src;
  })();
  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

/** URL HTTP que sirve el fichero del storage del proyecto (cacheable por el navegador). */
function httpUrl(path: string, project?: string): string {
  return '/modules/filesystem/file?path=' + encodeURIComponent(path) +
    (project ? '&project=' + encodeURIComponent(project) : '');
}

type StorageImgParam = string | { path?: string | null; project?: string | null };
function normParam(param: StorageImgParam): { path: string; project?: string } {
  if (typeof param === 'string') return { path: param };
  return { path: param?.path || '', project: param?.project || undefined };
}

/**
 * Acción Svelte: <img use:storageImg={{ path, project }} alt=... class=...>. Muestra una imagen que
 * vive en el storage del proyecto DUEÑO (multi-tenant). Acepta también una string (solo path) →
 * el servidor cae al proyecto activo. Estrategia robusta al rollout:
 *   1) src = ruta HTTP servida por filesystem (cacheable, ligera) con ?project=<id>.
 *   2) si esa ruta falla (core sin el endpoint todavía), onerror → data: URI vía fs.read (MQTT).
 * Reacciona a cambios de path o de proyecto.
 */
export function storageImg(node: HTMLImageElement, param: StorageImgParam) {
  let curPath = '';
  let curProj: string | undefined;
  const apply = (p: string, proj?: string) => {
    curPath = p;
    curProj = proj;
    node.onerror = null;
    if (!p) { node.removeAttribute('src'); return; }
    if (/^(https?:|data:|blob:)/.test(p)) { node.src = p; return; }
    let triedFallback = false;
    node.onerror = () => {
      if (triedFallback || curPath !== p || curProj !== proj) return;
      triedFallback = true;
      storageImageSrc(p, proj)
        .then((src) => { if (curPath === p && curProj === proj && src) node.src = src; })
        .catch(() => { /* sin imagen: queda el alt/placeholder */ });
    };
    node.src = httpUrl(p, proj);
  };
  const init = normParam(param);
  apply(init.path, init.project);
  return {
    update(np: StorageImgParam) {
      const { path, project } = normParam(np);
      if (path !== curPath || project !== curProj) apply(path, project);
    },
    destroy() { curPath = ''; node.onerror = null; }
  };
}
