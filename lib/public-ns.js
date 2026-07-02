'use strict';
/**
 * public-ns.js — EL BOTÓN ÚNICO del prefijo público (namespace de superficies).
 *
 * Las URLs públicas de los proyectos viven bajo UN prefijo global del VPS:
 *   dominio/<public_ns>/<superficie>/<proyecto>   (ej. dominio/a/shop/vapers)
 *
 * Ese prefijo se cambia en UN sitio y todo lo demás lo sigue: Caddy (bloque),
 * project-manager (symlink), y la app (base_href/pwa_url). Todos leen de aquí.
 *
 * Fuente (en orden): env PUBLIC_NS > config.json `web.public_ns` > 'a'.
 * Global por VPS (no por proyecto): es un bloque Caddy único. La identidad de
 * cada proyecto va DEBAJO del prefijo (la subcarpeta), no en el prefijo.
 *
 * Para cambiar /a/ → /es/: edita config.json `web.public_ns` y vuelve a desplegar
 * (el reconciliador regenera el bloque Caddy con el nuevo valor).
 */

const fs   = require('fs');
const path = require('path');

let _cached;

/** Limpia barras de los bordes: '/a/' → 'a'. */
function _limpiar(v) {
  return String(v == null ? '' : v).replace(/^\/+|\/+$/g, '').trim();
}

/** El prefijo público global (sin barras). Cacheado — cambiarlo requiere reinicio. */
function publicNs() {
  if (_cached !== undefined) return _cached;

  if (process.env.PUBLIC_NS) {
    const ns = _limpiar(process.env.PUBLIC_NS);
    _cached = ns || 'a';
    return _cached;
  }

  try {
    // __dirname = <repo>/lib → ../config.json es robusto sin depender del cwd.
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf-8'));
    const ns = _limpiar(cfg && cfg.web && cfg.web.public_ns);
    _cached = ns || 'a';
  } catch (_) {
    _cached = 'a';
  }
  return _cached;
}

/** El dir público del namespace en el VPS: /opt/enki/public/<ns>. */
function publicDir(root = '/opt/enki/public') {
  return `${root}/${publicNs()}`;
}

module.exports = { publicNs, publicDir };
