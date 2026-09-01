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
const { publicNs, publicDir } = require('../lib/public-ns.js');

const DEPLOYMENT_DIR = __dirname;
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
    // El Hermes TRABAJADOR de Enki (fusión 2026-08): api_server en :8642.
    // Unit estática (sin vars de dominio) — el reconciliador la copia si difiere.
    'hermes-gateway': {
      unit: 'hermes-gateway.service',
      plantilla: path.join(DEPLOYMENT_DIR, 'systemd', 'hermes-gateway.service'),
      destino: '/etc/systemd/system/hermes-gateway.service',
      vars: {}, // no depende del dominio
      health: null // health se verifica por el API server con Bearer (ver reconcile)
    }
  },

  // Perfil del Hermes trabajador (/home/hermes/.hermes) — reconciliado desde el repo.
  // config.yaml se RENDERIZA de plantilla preservando la key del API server;
  // las skills de Enki se sincronizan desde .hermes/skills/enki del repo.
  hermes_worker: {
    home: '/home/hermes/.hermes',
    usuario: 'hermes',
    config_plantilla: path.join(DEPLOYMENT_DIR, 'hermes-worker', 'config.yaml.tmpl'),
    config_destino: '/home/hermes/.hermes/config.yaml',
    skills_origen: path.join(__dirname, '..', '.hermes', 'skills', 'enki'),
    skills_destino: '/home/hermes/.hermes/skills/enki'
  },

  // Perfil del Hermes ADMIN (el agente conversacional, usuario admin) — clon
  // céntrico-en-repo para VPS2 (identidad nueva). El binario se instala aparte
  // (vps-setup.sh); aquí SOLO se reconcilian las skills/agentes desde el repo.
  // NO se crea el usuario (admin ya existe); NO se copia config/auth/memoria
  // de otro VPS (identidad independiente). La MEMORIA se siembra una vez como
  // semilla desde el repo (.hermes/memory) y luego cada VPS la evoluciona solo.
  hermes_admin: {
    home: '/home/admin/.hermes',
    usuario: 'admin',
    // config de PROVIDERS compartida por el repo (provider custom → ollama/v1,
    // deepseek-v4-flash). La key se sustituye en reconcile desde el .env vivo de
    // Enki (NUNCA versionada; misma key que el worker). SOLO se escribe la PRIMERA
    // vez (config destino inexistente); después cada VPS evoluciona su config.
    config_plantilla: path.join(DEPLOYMENT_DIR, 'hermes-admin', 'config.yaml.tmpl'),
    config_destino: '/home/admin/.hermes/config.yaml',
    // Skills de Enki (mismas 13 que el worker) + cantera de módulos (278) + agentes.
    skills_enki_origen: path.join(__dirname, '..', '.hermes', 'skills', 'enki'),
    skills_enki_destino: '/home/admin/.hermes/skills/enki',
    cantera_origen: path.join(__dirname, '..', 'modules', 'cosecha', 'cantera', 'enki'),
    cantera_destino: '/home/admin/.hermes/skills/enki-cantera',
    // Memoria-semilla (una vez): SIEMBRA el contexto aprendido en VPS2; luego
    // cada VPS la evoluciona de forma independiente (no se re-siembra).
    memoria_origen: path.join(__dirname, '..', '.hermes', 'memories'),
    memoria_destino: '/home/admin/.hermes/memories'
  },

  // Caddy: plantilla con dominio hardcoded (pizzepos.es) que se sustituye por
  // el dominio vivo de cada VPS. El log sigue el mismo patrón.
  caddy: {
    plantilla: path.join(DEPLOYMENT_DIR, 'caddy', 'Caddyfile.vps'),
    destino: '/etc/caddy/Caddyfile',
    dominio_placeholder: 'pizzepos.es',
    log_placeholder: 'pizzepos.log',
    // Override systemd: Caddy lee el .env PERSISTENTE (data/.env, excluido del
    // rsync del deploy) para ENKI_MCP_TOKEN y demás. El .env de la raíz
    // (/opt/enki/.env) NO sobrevive al deploy (rsync --delete lo borra).
    override_plantilla: path.join(DEPLOYMENT_DIR, 'caddy', 'caddy.override.conf.tmpl'),
    override_destino: '/etc/systemd/system/caddy.service.d/override.conf'
  },

  // Snippets Caddy condicionales — bloques extra que el reconciliador CONCATENA
  // al Caddyfile renderizado SOLO si el VPS declara la feature: bien por `env_flag`
  // en su .env, bien por `dominios` (el dominio del VPS está en esta lista — vía
  // determinista, sin tocar .env a mano). Opción A: `env_flag: 'ENABLE_OPENSCAD'`.
  // Opción B (determinista por dominio): `dominios: ['enki-ai.online']`. Ambas
  // coexisten: se activa si cualquiera se cumple.
  caddy_snippets: [
    {
      id: 'openscad-mcp',
      plantilla: path.join(DEPLOYMENT_DIR, 'caddy', 'Caddyfile.openscad.snippet'),
      env_flag: 'ENABLE_OPENSCAD',
      dominios: ['enki-ai.online']
    }
  ],

  // Docker Compose services condicionales — contenedores que el reconciliador
  // LEVANTA solo en VPS que declaran la feature (igual criterio que caddy_snippets:
  // env_flag O dominio listado). En VPS sin la feature, el contenedor no se toca.
  docker_services: [
    {
      id: 'openscad-mcp',
      compose_dir: path.join(DEPLOYMENT_DIR, 'openscad-mcp'),
      env_flag: 'ENABLE_OPENSCAD',
      dominios: ['enki-ai.online'],
      container: 'openscad-mcp'
    }
  ],

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
    servicios_activos: ['enki', 'enki-frontend', 'caddy', 'hermes-gateway'],
    http_health: 'http://localhost:3000/health'
  }
};

module.exports = { MANIFIESTO };
