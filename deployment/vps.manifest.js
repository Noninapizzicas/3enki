'use strict';
/**
 * vps.manifest.js — EL ESTADO DESEADO de un VPS Enki funcional, como DATO.
 *
 * Fuente única de verdad de "qué ES un VPS que sirve tiendas bien". El
 * reconciliador (reconcile.js) lee esto y hace que la realidad coincida.
 * Añadir una pieza futura (un dir nuevo, un bloque Caddy, una unidad) = editar
 * ESTE archivo, no esparcir `mkdir` por cinco scripts de bash.
 *
 * La ÚNICA variable por-VPS es el dominio. Todo lo demás es idéntico en las 20
 * máquinas. Por eso el Caddyfile y las unidades systemd se RENDERIZAN de
 * plantillas sustituyendo el dominio; `git pull` trae plantilla nueva → el
 * reconciliador re-renderiza con el dominio local → converge.
 *
 * NOTA de alcance: esto NO reemplaza el deployment canónico del sistema
 * (`npm start` en un dispositivo, ver deployment.contract.json). Es el PERFIL
 * DE PRODUCCIÓN VPS — un Linux con dominio público que sirve /shop/<proyecto>.
 */

const path = require('path');
const fs = require('fs');
const { publicNs, publicDir } = require('../lib/public-ns.js');

const DEPLOYMENT_DIR = __dirname;

// Hermes es CONDICIONAL: el reconciliador lo converge y lo EXIGE solo donde el
// órgano está instalado (deployment/hermes/setup-hermes.sh, vía vps-setup.sh o
// standalone). Un VPS sin Hermes (--sin-hermes) sigue verde — degradación
// honesta, no drift fantasma.
const HERMES_INSTALADO = (() => {
  try { fs.accessSync('/home/hermes/.local/bin/hermes'); return true; } catch (_) { return false; }
})();
const NS      = publicNs();       // el prefijo público global (ej. 'a')
const NS_DIR  = publicDir();      // /opt/enki/public/<ns>

const MANIFIESTO = {
  esquema: 'vps-enki-v1',

  // Convención canónica: TODOS los VPS aquí. Un solo sitio, un solo nombre.
  install_dir: '/opt/enki',
  usuario: 'www-data',

  // Prefijo público global (namespace de superficies) y su dir. Caddy sirve
  // `handle_path /<ns>/*` desde aquí; project-manager crea los symlinks de cada
  // proyecto debajo. Cambiar el prefijo = config.json `web.public_ns` (un botón).
  public_ns: NS,
  public_dir: NS_DIR,

  // Dirs que el reconciliador ASEGURA (existen + owner). Idempotente.
  dirs: [
    { path: NS_DIR, owner: 'www-data' },   // /opt/enki/public/<ns> (namespace de superficies)
    { path: '/var/log/caddy', owner: 'caddy' }
  ],

  // Unidades systemd renderizadas de plantilla. {{VAR}} → valor.
  servicios: {
    enki: {
      unit: 'enki.service',
      plantilla: path.join(DEPLOYMENT_DIR, 'systemd', 'enki.service.tmpl'),
      destino: '/etc/systemd/system/enki.service',
      vars: {}, // enki no depende del dominio
      health: 'http://localhost:3000/health'
    },
    'enki-frontend': {
      unit: 'enki-frontend.service',
      plantilla: path.join(DEPLOYMENT_DIR, 'systemd', 'enki-frontend.service.tmpl'),
      destino: '/etc/systemd/system/enki-frontend.service',
      // ORIGIN = https://<dominio> (SvelteKit adapter-node lo exige para CSRF).
      vars: { ORIGIN: 'https://{{DOMAIN}}' }
    },
    // Hermes — el agente trabajador de Enki (solo donde está instalado). La unit
    // no depende del dominio; git pull trae unit nueva → el reconciliador converge.
    ...(HERMES_INSTALADO ? {
      'hermes-gateway': {
        unit: 'hermes-gateway.service',
        plantilla: path.join(DEPLOYMENT_DIR, 'hermes', 'hermes-gateway.service'),
        destino: '/etc/systemd/system/hermes-gateway.service',
        vars: {}
      }
    } : {})
  },

  // Caddy: plantilla con dominio hardcoded (pizzepos.es) que se sustituye por
  // el dominio vivo de cada VPS. El log sigue el mismo patrón.
  caddy: {
    plantilla: path.join(DEPLOYMENT_DIR, 'caddy', 'Caddyfile.vps'),
    destino: '/etc/caddy/Caddyfile',
    dominio_placeholder: 'pizzepos.es',
    log_placeholder: 'pizzepos.log'
  },

  // Layout LEGACY (Gen-1) que el reconciliador detecta y MIGRA a canónico.
  // En un VPS ya canónico esto no dispara nada (idempotente).
  gen1: {
    install_dir: '/srv/event-core',
    unit: 'event-core.service'
  },

  // Self-check tras reconciliar. Si algo falla → error ruidoso, exit≠0.
  // No-silent-drift: o el VPS quedó funcional, o se ve el fallo.
  verificacion: {
    // El Caddyfile vivo DEBE contener estos bloques (el drift clásico: falta el namespace).
    caddy_debe_contener: [`handle_path /${NS}/*`, 'handle /tienda/*'],
    dirs_escribibles: [NS_DIR],
    servicios_activos: ['enki', 'enki-frontend', 'caddy', ...(HERMES_INSTALADO ? ['hermes-gateway'] : [])],
    http_health: 'http://localhost:3000/health'
  }
};

module.exports = { MANIFIESTO };
