#!/usr/bin/env node
'use strict';
/**
 * reconcile.js — EL RECONCILIADOR. Hace que un VPS coincida con el estado
 * deseado (vps.manifest.js). Idempotente: córrelo mil veces, si ya está bien
 * no toca nada.
 *
 * UN SOLO CEREBRO para todos los caminos:
 *   - instalación nueva  → deployment/install.sh lo llama con --fresh --domain X
 *   - actualización      → deployment/deploy.sh lo llama (detecta el dominio solo)
 *   - reparación         → sudo node reconcile.js  (a mano, cuando haga falta)
 *
 * Qué asegura (el TERRENO del VPS):
 *   1. migra layout Gen-1 (/srv/event-core + event-core.service) → canónico
 *   2. dirs + owners (public/<ns>, log/caddy)
 *   3. unidades systemd renderizadas de plantilla (solo escribe si difieren)
 *   4. Caddyfile renderizado con el dominio local (solo si difiere)
 *   5. reinicia/recarga SOLO lo que cambió
 *   6. verifica (self-check ruidoso) → exit≠0 si hay drift
 *
 * Los SYMLINKS de cada tienda NO son cosa del reconciliador: los cura
 * project-manager en caliente al activar la feature (_ensureFeatureSymlinks).
 * Frontera limpia: infra = el terreno; app = los symlinks.
 *
 * Uso:
 *   sudo node deployment/reconcile.js                 # detecta dominio, aplica
 *   sudo node deployment/reconcile.js --domain X      # fuerza dominio
 *   node deployment/reconcile.js --dry-run            # SOLO muestra el plan, no toca nada
 *   sudo node deployment/reconcile.js --fresh --domain X  # 1ª instalación
 */

const fs   = require('fs');
const path = require('path');
const cp   = require('child_process');
const crypto = require('crypto');

const { MANIFIESTO } = require('./vps.manifest.js');

// Marcador en el Caddyfile.vps donde se inyecta el bloque del namespace público.
const MARCA_NAMESPACE = '# @@NAMESPACE@@';

// ============================================================================
// NÚCLEO PURO — sin efectos, testeable sin root ni filesystem real.
// ============================================================================

/**
 * Detecta el dominio del VPS. Prioridad: argumento explícito > Caddyfile vivo
 * (primer bloque `dominio {`) > variable DOMAIN= del .env. null si nada.
 */
function detectarDominio(argDominio, caddyfileText, envText) {
  if (argDominio && argDominio.trim()) return argDominio.trim();

  if (caddyfileText) {
    // Primer bloque de sitio: "  dominio.tld {"  (ignora ":80 {" del modo IP).
    const m = caddyfileText.match(/^([A-Za-z0-9.-]+\.[A-Za-z]{2,})\s*\{/m);
    if (m) return m[1];
  }

  if (envText) {
    const m = envText.match(/^\s*DOMAIN\s*=\s*(.+?)\s*$/m);
    if (m && m[1]) return m[1].replace(/^["']|["']$/g, '').trim();
  }

  return null;
}

/**
 * ¿El VPS está en layout Gen-1 (legacy)? true si existe el dir viejo O la
 * unidad vieja. Recibe sondas (booleans) para ser puro.
 */
function esGen1({ existeDirGen1, existeUnitGen1 }) {
  return Boolean(existeDirGen1 || existeUnitGen1);
}

/**
 * Extrae WorkingDirectory de un texto de unidad systemd. null si no hay.
 * Sirve para encontrar dónde vivía el install Gen-1 (y su data) sin asumir ruta.
 */
function parseWorkingDir(unitText) {
  if (!unitText) return null;
  const m = String(unitText).match(/^\s*WorkingDirectory\s*=\s*(.+?)\s*$/m);
  return m && m[1] ? m[1].trim() : null;
}

/** Renderiza una plantilla sustituyendo {{VAR}} por su valor. */
function renderPlantilla(texto, vars) {
  return String(texto).replace(/\{\{(\w+)\}\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m);
}

/**
 * Genera el bloque Caddy ÚNICO del namespace público global: sirve estáticos
 * desde /opt/enki/public/<ns> en el prefijo /<ns>/*. Todas las superficies
 * (shop, oraculo, …) viven como subcarpetas debajo → un solo bloque para todas.
 */
function renderBloqueNamespace(ns, publicDir) {
  return [
    `\t# Namespace público /${ns}/* — sirve todas las superficies (subcarpetas de ${publicDir}).`,
    '\t# Bloque GENERADO por reconcile.js desde config.json web.public_ns — no editar a mano.',
    `\thandle_path /${ns}/* {`,
    `\t\troot * ${publicDir}`,
    '\t\ttry_files {path} {path}/index.html /index.html',
    '\t\tfile_server',
    '\t}'
  ].join('\n');
}

/**
 * Renderiza el Caddyfile: (1) sustituye el dominio placeholder (y su .log),
 * (2) inyecta el bloque del namespace en el marcador @@NAMESPACE@@.
 * La plantilla trae pizzepos.es; cualquier VPS sale con el suyo.
 */
function renderCaddyfile(templateText, dominio, { dominio_placeholder, log_placeholder }, ns, publicDir) {
  const escLog = log_placeholder.replace(/\./g, '\\.');
  const escDom = dominio_placeholder.replace(/\./g, '\\.');
  let out = String(templateText)
    .replace(new RegExp(escLog, 'g'), `${dominio}.log`)   // primero el .log (más específico)
    .replace(new RegExp(escDom, 'g'), dominio);
  if (ns) {
    out = out.replace(MARCA_NAMESPACE, renderBloqueNamespace(ns, publicDir));
  }
  return out;
}

/** Normaliza y compara dos textos (trim de bordes + fin de línea). */
function difieren(a, b) {
  const norm = (s) => String(s == null ? '' : s).replace(/\r\n/g, '\n').replace(/\s+$/g, '');
  return norm(a) !== norm(b);
}

/**
 * Evalúa el self-check a partir de sondas ya recogidas. Puro: recibe hechos,
 * devuelve veredicto. { ok, fallos: [] }.
 */
function evaluarChecklist(sondas, manifiesto) {
  const fallos = [];
  const v = manifiesto.verificacion;

  for (const bloque of v.caddy_debe_contener) {
    if (!sondas.caddyfileText || !sondas.caddyfileText.includes(bloque)) {
      fallos.push(`Caddyfile no contiene el bloque "${bloque}"`);
    }
  }
  for (const dir of v.dirs_escribibles) {
    if (!sondas.dirsEscribibles || !sondas.dirsEscribibles[dir]) {
      fallos.push(`dir no escribible o ausente: ${dir}`);
    }
  }
  for (const svc of v.servicios_activos) {
    if (!sondas.serviciosActivos || !sondas.serviciosActivos[svc]) {
      fallos.push(`servicio no activo: ${svc}`);
    }
  }
  if (sondas.healthOk === false) {
    fallos.push(`health check falló: ${v.http_health}`);
  }

  return { ok: fallos.length === 0, fallos };
}

// Exporta el núcleo puro para los tests.
module.exports = {
  detectarDominio,
  esGen1,
  parseWorkingDir,
  renderPlantilla,
  renderBloqueNamespace,
  renderCaddyfile,
  difieren,
  evaluarChecklist,
  MARCA_NAMESPACE
};

// ============================================================================
// CAPA DE EFECTOS — solo corre cuando se ejecuta directamente (no en require).
// La invocación de main() vive al FINAL del archivo, tras declarar todo (evita
// el temporal-dead-zone de `let DRY_RUN`/`let cambios`).
// ============================================================================

// ---- helpers de efecto (finos, no unit-testeados aquí) ----

const GREEN = '\x1b[32m', YEL = '\x1b[33m', RED = '\x1b[31m', CYAN = '\x1b[36m', RST = '\x1b[0m';
let DRY_RUN = false;
let cambios = 0;

function log(msg)  { console.log(`${GREEN}[+]${RST} ${msg}`); }
function warn(msg) { console.log(`${YEL}[!]${RST} ${msg}`); }
function act(msg)  { console.log(`${CYAN}[~]${RST} ${DRY_RUN ? '(dry-run) ' : ''}${msg}`); }

function sh(cmd, opts = {}) {
  if (DRY_RUN) { act(`ejecutaría: ${cmd}`); return ''; }
  return cp.execSync(cmd, { stdio: 'pipe', encoding: 'utf-8', ...opts });
}
function shOk(cmd) { try { sh(cmd); return true; } catch (_) { return false; } }
function leer(p)   { try { return fs.readFileSync(p, 'utf-8'); } catch (_) { return null; } }
function existe(p) { try { fs.accessSync(p); return true; } catch (_) { return false; } }

function escribirSiDifiere(destino, contenido, label) {
  const actual = leer(destino);
  if (!difieren(actual, contenido)) { log(`${label}: sin cambios`); return false; }
  act(`escribir ${destino} (${label})`);
  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, contenido);
  }
  cambios++;
  return true;
}

function asegurarDir(dir, owner) {
  if (!existe(dir)) { act(`mkdir -p ${dir}`); if (!DRY_RUN) fs.mkdirSync(dir, { recursive: true }); cambios++; }
  if (owner) shOk(`chown -R ${owner}:${owner} ${dir}`);
}

// ---- el flujo ----

async function main() {
  const argv = process.argv.slice(2);
  DRY_RUN = argv.includes('--dry-run');
  const FRESH = argv.includes('--fresh');
  const argDom = (() => { const i = argv.indexOf('--domain'); return i >= 0 ? argv[i + 1] : null; })();

  console.log(`\n${CYAN}=== Reconciliador VPS Enki ${DRY_RUN ? '(DRY-RUN, no toca nada) ' : ''}===${RST}\n`);

  const M = MANIFIESTO;

  if (!DRY_RUN && process.getuid && process.getuid() !== 0) {
    throw new Error('necesita root. Usa: sudo node deployment/reconcile.js  (o añade --dry-run para ver el plan)');
  }

  // 1) Dominio (la única variable por-VPS)
  const caddyfileVivo = leer(M.caddy.destino);
  const envVivo = leer(path.join(M.install_dir, '.env')) || leer(path.join(__dirname, '..', '.env'));
  const dominio = detectarDominio(argDom, caddyfileVivo, envVivo);
  if (!dominio) {
    throw new Error('no pude detectar el dominio (ni --domain, ni Caddyfile vivo, ni DOMAIN= en .env). Pásalo con --domain tu-dominio.com');
  }
  log(`dominio: ${dominio}${argDom ? ' (explícito)' : ' (detectado)'}`);

  // 2) Migración Gen-1 → canónico (idempotente)
  const gen1 = esGen1({
    existeDirGen1: existe(M.gen1.install_dir),
    existeUnitGen1: existe(`/etc/systemd/system/${M.gen1.unit}`)
  });
  if (gen1) {
    warn(`layout Gen-1 detectado (${M.gen1.install_dir} / ${M.gen1.unit}) → migrando a canónico`);
    migrarGen1(M);
  } else {
    log('layout canónico (sin Gen-1 que migrar)');
  }

  // 3) Dirs + owners (incluye /opt/enki/public/<ns>, el namespace de superficies).
  for (const d of M.dirs) asegurarDir(d.path, d.owner);
  log(`namespace público: /${M.public_ns}/  → ${M.public_dir}`);

  // 4) Unidades systemd (render + escribir si difieren)
  let systemdCambio = false;
  // Key del API server de Hermes: preservar la del unit/config vivo si existe
  // (nunca versionada; fallback a env; en VPS nuevo la GENERA — y alimenta tanto
  // el unit de enki como el config del worker, para que todo quede listo de una).
  const keyHermesViva = (() => {
    const unitVivo = leer(M.servicios.enki.destino) || '';
    const cfgVivo = leer(M.hermes_worker?.config_destino) || '';
    const m1 = unitVivo.match(/Environment=HERMES_API_KEY=(\S+)/);
    const m2 = cfgVivo.match(/^(\s*)key:\s*([^\s]+)\s*$/m);
    // OJO: la key es el grupo 2 ([^\s]+); el grupo 1 es la indentación (\s*).
    // Usar m2[1] devolvía la indentación (truthy) → no regeneraba la key.
    const key = (m1 && m1[1]) || (m2 && m2[2]) || process.env.API_SERVER_KEY || '';
    if (!key || key === '__API_SERVER_KEY__') {
      const gen = crypto.randomBytes(24).toString('hex');
      act(`generando key del API server de Hermes (${gen.slice(0, 8)}…)`);
      return gen;
    }
    return key;
  })();
  for (const [nombre, svc] of Object.entries(M.servicios)) {
    const tmpl = leer(svc.plantilla);
    if (tmpl == null) { warn(`plantilla ausente: ${svc.plantilla} (salto ${nombre})`); continue; }
    const vars = {};
    for (const [k, val] of Object.entries(svc.vars || {})) vars[k] = renderPlantilla(val, { DOMAIN: dominio });
    let rendered = renderPlantilla(tmpl, { DOMAIN: dominio, ...vars });
    if (nombre === 'enki') rendered = rendered.replace(/Environment=HERMES_API_KEY=.*$/m, `Environment=HERMES_API_KEY=${keyHermesViva}`);
    if (escribirSiDifiere(svc.destino, rendered, nombre)) systemdCambio = true;
  }
  if (systemdCambio) { act('systemctl daemon-reload'); shOk('systemctl daemon-reload'); }

  // 5) Caddyfile (render con dominio local + snippets condicionales + escribir si difiere)
  const caddyTmpl = leer(M.caddy.plantilla);
  let caddyCambio = false;
  if (caddyTmpl == null) {
    warn(`plantilla Caddy ausente: ${M.caddy.plantilla}`);
  } else {
    let caddyRendered = renderCaddyfile(caddyTmpl, dominio, M.caddy, M.public_ns, M.public_dir);

    // Snippets condicionales: se concatenan al Caddyfile SOLO si el .env del VPS
    // declara la flag correspondiente (ej. ENABLE_OPENSCAD=true). Cada snippet
    // pasa por el mismo replace de dominio que la plantilla principal.
    for (const snip of (M.caddy_snippets || [])) {
      const flagValue = (envVivo || '').match(new RegExp(`^\\s*${snip.env_flag}\\s*=\\s*(.+?)\\s*$`, 'm'));
      if (flagValue && flagValue[1].trim().toLowerCase() === 'true') {
        const snippetTmpl = leer(snip.plantilla);
        if (snippetTmpl) {
          const snippetRendered = renderCaddyfile(snippetTmpl, dominio, M.caddy);
          caddyRendered += '\n' + snippetRendered;
          log(`snippet Caddy '${snip.id}' activado (${snip.env_flag}=true)`);
        } else {
          warn(`snippet Caddy '${snip.id}': plantilla ausente ${snip.plantilla}`);
        }
      } else {
        log(`snippet Caddy '${snip.id}' omitido (${snip.env_flag} no activado)`);
      }
    }

    caddyCambio = escribirSiDifiere(M.caddy.destino, caddyRendered, 'Caddyfile');
  }

  // 6) Habilitar + arrancar/recargar SOLO lo que cambió
  for (const nombre of Object.keys(M.servicios)) shOk(`systemctl enable ${nombre}`);
  shOk('systemctl enable caddy');

  if (FRESH || systemdCambio) {
    for (const nombre of Object.keys(M.servicios)) { act(`systemctl restart ${nombre}`); shOk(`systemctl restart ${nombre}`); }
  } else {
    log('servicios systemd sin cambios (no reinicio)');
  }
  if (FRESH || caddyCambio) { act('systemctl reload/restart caddy'); shOk('systemctl reload caddy') || shOk('systemctl restart caddy'); }
  else { log('Caddy sin cambios (no recargo)'); }

  // 6b) Hermes TRABAJADOR (/home/hermes/.hermes) — config renderizada preservando
  // la key + skills de Enki sincronizadas + usuario asegurado. Idempotente.
  const HW = M.hermes_worker;
  if (HW) {
    // usuario hermes (grupo + home) si no existe
    if (!shOk('id hermes')) {
      act(`useradd -m -s /bin/bash ${HW.usuario}`);
      if (!DRY_RUN) shOk(`useradd -m -s /bin/bash ${HW.usuario}`);
      cambios++;
    }
    if (!existe(HW.home)) { act(`mkdir -p ${HW.home}`); if (!DRY_RUN) fs.mkdirSync(HW.home, { recursive: true }); cambios++; }

    // INSTALAR Hermes si falta el binario (el trabajador no viaja en el repo:
    // el paquete hermes-agent se instala con el instalador oficial de Nous).
    // Idempotente: si el binario existe, no hace nada. En un VPS nuevo lo deja
    // listo de una — y genera la key del API server si no hay (abajo).
    const binHermes = `/home/${HW.usuario}/.local/bin/hermes`;
    if (!existe(binHermes)) {
      const installer = 'https://hermes-agent.nousresearch.com/install.sh';
      act(`instalando hermes-agent (${installer}) → ${binHermes}`);
      if (!DRY_RUN) {
        shOk(`curl -fsSL ${installer} | HOME=/home/${HW.usuario} bash`);
        if (!existe(binHermes)) {
          warn(`instalador de Hermes no dejó el binario en ${binHermes} — revisa journalctl/network. El VPS queda degradado (chat sin mente).`);
        } else {
          shOk(`chown -R ${HW.usuario}:${HW.usuario} /home/${HW.usuario}/.local /home/${HW.usuario}/.hermes`);
          cambios++;
        }
      }
    }

    // config.yaml: renderizar plantilla con la key viva (nunca versionada; la
    // resuelve/genera el paso 4 — VPS nuevo listo de una).
    const tmplCfg = leer(HW.config_plantilla);
    let workerConfigCambio = false;
    if (tmplCfg == null) {
      warn(`plantilla hermes-worker ausente: ${HW.config_plantilla} (salto config)`);
    } else {
      // Key de Ollama: se lee del .env vivo de Enki (data/.env, donde el
      // credential-manager lo persiste). Nunca se versiona. Soporta el nombre
      // de VPS1 (OLLAMA_API_KEY) y el de VPS2 (OLLAMA_CLOUD_API_KEY_GLOBAL).
      const envOllama = leer(path.join(M.install_dir, 'data', '.env')) || leer(path.join(M.install_dir, '.env')) || '';
      const ollamaViva = (envOllama.match(/^OLLAMA_API_KEY=(\S+)/m) || [])[1] || (envOllama.match(/^OLLAMA_CLOUD_API_KEY_GLOBAL=(\S+)/m) || [])[1] || '';
      let renderedCfg = tmplCfg.replace(/__API_SERVER_KEY__/g, keyHermesViva);
      renderedCfg = renderedCfg.replace(/__OLLAMA_API_KEY__/g, ollamaViva);
      workerConfigCambio = escribirSiDifiere(HW.config_destino, renderedCfg, 'hermes-worker config.yaml');
      if (workerConfigCambio) { act('chown config → hermes'); if (!DRY_RUN) shOk(`chown -R ${HW.usuario}:${HW.usuario} ${HW.home}`); }
    }

    // skills de Enki: sincronizar desde el repo (rsync sin borrar lo extra)
    if (existe(HW.skills_origen)) {
      act(`rsync skills enki → ${HW.skills_destino}`);
      if (!DRY_RUN) {
        shOk(`mkdir -p ${HW.skills_destino}`);
        shOk(`rsync -a --delete ${HW.skills_origen}/ ${HW.skills_destino}/`);
        shOk(`chown -R ${HW.usuario}:${HW.usuario} ${HW.skills_destino}`);
      }
      cambios++;
    }

    // reiniciar hermes-gateway si su config cambió (la unit ya se reinicia arriba si cambió)
    if (workerConfigCambio && !DRY_RUN) { act('systemctl restart hermes-gateway'); shOk('systemctl restart hermes-gateway'); }
  }

  // 6b2) Hermes ADMIN (/home/admin/.hermes) — skills/agentes clon céntrico-en-repo.
  // El binario se instala aparte (vps-setup.sh); aquí SOLO se sincronizan desde
  // el repo: skills de Enki (13), cantera de módulos (278 + agentes) y — si el
  // repo trae memoria semilla — se SIEMBRA una vez. NO crea el usuario (admin
  // ya existe), NO toca config/auth. Cada VPS es identidad independiente.
  const HA = M.hermes_admin;
  if (HA) {
    if (!existe(HA.home)) { act(`mkdir -p ${HA.home}`); if (!DRY_RUN) fs.mkdirSync(HA.home, { recursive: true }); cambios++; }

    // INSTALAR Hermes ADMIN si falta el binario (no viaja en el repo: el paquete
    // hermes-agent se instala con el instalador oficial de Nous). Idempotente:
    // si el binario existe, no hace nada. En VPS nuevo lo deja listo de una.
    const binAdmin = `/home/${HA.usuario}/.local/bin/hermes`;
    if (!existe(binAdmin)) {
      const installer = 'https://hermes-agent.nousresearch.com/install.sh';
      act(`instalando hermes-agent (admin) ${installer} → ${binAdmin}`);
      if (!DRY_RUN) {
        shOk(`curl -fsSL ${installer} | HOME=/home/${HA.usuario} bash`);
        if (!existe(binAdmin)) {
          warn(`instalador de Hermes admin no dejó el binario en ${binAdmin} — revisa journalctl/network. El VPS queda sin el Hermes conversacional.`);
        } else {
          shOk(`chown -R ${HA.usuario}:${HA.usuario} /home/${HA.usuario}/.local /home/${HA.usuario}/.hermes`);
          cambios++;
        }
      }
    }

    // config de PROVIDERS, clon céntrico-en-repo. SOLO se crea la PRIMERA vez
    // (config destino inexistente); después cada VPS evoluciona la suya
    // (identidad independiente). Multi-provider: detecta en el .env vivo de Enki
    // qué key existe — OLLAMA_API_KEY → Ollama Cloud (VPS1), DEEPSEEK_API_KEY_GLOBAL
    // → DeepSeek (VPS2) — y escribe el bloqua model correcto. La key NUNCA se
    // versiona; se rellena desde el .env.
    const HA_cfg = leer(HA.config_plantilla);
    if (HA_cfg != null && !existe(HA.config_destino)) {
      const HA_env = leer(path.join(M.install_dir, 'data', '.env')) || leer(path.join(M.install_dir, '.env')) || '';
      // detectar provider y su key
      const ollamaKey = (HA_env.match(/^OLLAMA_API_KEY=(\S+)/m) || [])[1] || '';
      const deepseekKey = (HA_env.match(/^DEEPSEEK_API_KEY_GLOBAL=(\S+)/m) || [])[1] || '';
      let baseUrl, defaultModel, apiKey;
      if (ollamaKey) {
        baseUrl = 'https://ollama.com/v1';
        defaultModel = 'deepseek-v4-flash';
        apiKey = ollamaKey;
      } else if (deepseekKey) {
        baseUrl = 'https://api.deepseek.com/v1';
        defaultModel = 'deepseek-chat';
        apiKey = deepseekKey;
      }
      let HA_rendered = HA_cfg;
      // si no hay key detectable, dejar el provider sin tocar (no escribir basura)
      if (apiKey) {
        const modelYaml = `model:\n  default: ${defaultModel}\n  provider: custom\n  base_url: ${baseUrl}\n  api_key: ${apiKey}\n\n`;
        // si la plantilla ya tiene un bloque model: lo reemplaza; si no, lo antepone
        if (/^model:/m.test(HA_cfg)) {
          HA_rendered = HA_cfg.replace(/^model:[\s\S]*?(?=^\S|\Z)/m, modelYaml);
        } else {
          HA_rendered = modelYaml + HA_cfg;
        }
      }
      act(`creando config de admin (provider: ${apiKey ? (ollamaKey ? 'ollama-cloud' : 'deepseek') : 'indetectado'}) → ${HA.config_destino}`);
      if (!DRY_RUN) {
        fs.writeFileSync(HA.config_destino, HA_rendered);
        shOk(`chown ${HA.usuario}:${HA.usuario} ${HA.config_destino}`);
      }
      cambios++;
    } else if (existe(HA.config_destino)) {
      log(`config de admin ya existe en ${HA.config_destino} — no se toca (identidad independiente)`);
    }

    // skills de Enki (SIN --delete — cada VPS es identidad independiente y
    // puede tener skills locales propias que no vienen del repo; el admin no
    // es un clon exacto del repo, a diferencia del worker que sí es repo-puro)
    if (existe(HA.skills_enki_origen)) {
      act(`rsync skills enki → ${HA.skills_enki_destino}`);
      if (!DRY_RUN) {
        shOk(`mkdir -p ${HA.skills_enki_destino}`);
        shOk(`rsync -a ${HA.skills_enki_origen}/ ${HA.skills_enki_destino}/`);
      }
      cambios++;
    }

    // cantera de módulos + agentes (SIN --delete — misma razón que skills)
    if (existe(HA.cantera_origen)) {
      act(`rsync cantera enki (módulos+agentes) → ${HA.cantera_destino}`);
      if (!DRY_RUN) {
        shOk(`mkdir -p ${HA.cantera_destino}`);
        shOk(`rsync -a ${HA.cantera_origen}/ ${HA.cantera_destino}/`);
      }
      cambios++;
    }

    // memoria-semilla: SOLO si el repo la trae y el destino NO existe aún
    // (una vez). Luego cada VPS evoluciona la suya de forma independiente.
    if (existe(HA.memoria_origen) && !existe(HA.memoria_destino)) {
      act(`sembrando memoria-semilla → ${HA.memoria_destino} (una vez)`);
      if (!DRY_RUN) {
        shOk(`mkdir -p ${HA.memoria_destino}`);
        shOk(`rsync -a ${HA.memoria_origen}/ ${HA.memoria_destino}/`);
      }
      cambios++;
    } else if (existe(HA.memoria_destino)) {
      log(`memoria de admin ya existe en ${HA.memoria_destino} — no se re-siembra (independiente)`);
    }

    // el dueño es admin (el reconcile corre como root; dejar el home a admin)
    if (!DRY_RUN) shOk(`chown -R ${HA.usuario}:${HA.usuario} ${HA.home}`);
  }

  // 6c) Docker services condicionales — levanta solo en VPS con la flag activa.
  // Idempotente: `docker compose up -d` no recrea si ya está corriendo y la
  // imagen no cambió; `--build` asegura que el Dockerfile del repo prevalece.
  for (const ds of (M.docker_services || [])) {
    const flagMatch = (envVivo || '').match(new RegExp(`^\\s*${ds.env_flag}\\s*=\\s*(.+?)\\s*$`, 'm'));
    const activo = flagMatch && flagMatch[1].trim().toLowerCase() === 'true';
    const composeFile = path.join(ds.compose_dir, 'docker-compose.yml');

    if (!existe(composeFile)) {
      warn(`docker service '${ds.id}': compose file ausente ${composeFile}`);
      continue;
    }

    if (activo) {
      act(`docker compose up -d --build (${ds.id})`);
      if (!DRY_RUN) {
        if (shOk(`docker compose -f ${composeFile} up -d --build`)) {
          log(`docker service '${ds.id}' levantado (${ds.env_flag}=true)`);
        } else {
          warn(`docker service '${ds.id}': fallo al levantar — revisa docker logs ${ds.container}`);
        }
      }
      cambios++;
    } else {
      log(`docker service '${ds.id}' omitido (${ds.env_flag} no activado)`);
    }
  }

  // 7) Self-check ruidoso
  if (DRY_RUN) {
    console.log(`\n${CYAN}=== dry-run: ${cambios} cambio(s) pendiente(s). Nada se ha tocado. ===${RST}\n`);
    return;
  }

  const veredicto = verificar(M, dominio);
  if (!veredicto.ok) {
    console.log(`\n${RED}=== DRIFT: el VPS NO quedó funcional ===${RST}`);
    for (const f of veredicto.fallos) console.log(`  ${RED}✗${RST} ${f}`);
    process.exit(1);
  }
  console.log(`\n${GREEN}=== VPS convergido y verificado (${cambios} cambio(s)) ===${RST}\n`);
}

function migrarGen1(M) {
  // Para el servicio viejo, deshabilítalo, y MERGEA su data en la canónica. NO
  // borra el dir viejo (seguridad: el operador lo revisa). Idempotente: el merge
  // es no-destructivo (rsync --ignore-existing → trae lo que falta, jamás pisa).
  shOk(`systemctl stop ${M.gen1.unit}`);
  shOk(`systemctl disable ${M.gen1.unit}`);

  const newData = path.join(M.install_dir, 'data');
  // La data vieja puede NO estar en /srv/event-core/data: el setup Gen-1 corría
  // desde el repo clonado (WorkingDirectory del unit). Probamos ambos.
  const candidatos = _oldDataCandidates(M);
  let origen = null;
  for (const oldData of candidatos) {
    if (existe(oldData) && _tieneContenido(oldData)) {
      act(`merge data ${oldData} → ${newData} (no-destructivo, no pisa lo existente)`);
      if (!DRY_RUN) {
        shOk(`mkdir -p ${newData}`);
        // rsync --ignore-existing: copia solo lo que falta en destino; NUNCA sobrescribe.
        shOk(`rsync -a --ignore-existing ${oldData}/ ${newData}/`);
        shOk(`chown -R ${M.usuario}:${M.usuario} ${newData}`);
      }
      origen = oldData;
      break;
    }
  }
  if (origen) warn(`data migrada desde ${origen} (merge no-destructivo). El origen queda intacto.`);
  else warn(`no encontré data vieja con contenido en ${candidatos.join(' | ')} — revisa a mano si faltan proyectos.`);
  warn(`Gen-1 migrado. El dir viejo ${M.gen1.install_dir} queda intacto para que lo revises y borres a mano cuando confirmes.`);
  cambios++;
}

// Candidatos a la data vieja: WorkingDirectory del unit Gen-1 (+/data) y el dir
// Gen-1 convencional (+/data). Deduplicados, en orden de preferencia.
function _oldDataCandidates(M) {
  const cands = [];
  const unit = leer(`/etc/systemd/system/${M.gen1.unit}`);
  const wd = parseWorkingDir(unit);
  if (wd) cands.push(path.join(wd, 'data'));
  cands.push(path.join(M.gen1.install_dir, 'data'));
  return [...new Set(cands)];
}

function _tieneContenido(dir) {
  try { return fs.readdirSync(dir).length > 0; } catch (_) { return false; }
}

function verificar(M, dominio) {
  const sondas = {
    caddyfileText: leer(M.caddy.destino),
    dirsEscribibles: {},
    serviciosActivos: {},
    healthOk: undefined
  };
  for (const dir of M.verificacion.dirs_escribibles) {
    try { fs.accessSync(dir, fs.constants.W_OK); sondas.dirsEscribibles[dir] = true; }
    catch (_) { sondas.dirsEscribibles[dir] = false; }
  }
  for (const svc of M.verificacion.servicios_activos) {
    sondas.serviciosActivos[svc] = shOk(`systemctl is-active --quiet ${svc}`);
  }
  return evaluarChecklist(sondas, M);
}

// Arranca el flujo SOLO al ejecutarse directamente (no en require desde tests).
if (require.main === module) {
  main().catch((err) => {
    console.error(`${RED}[reconcile] ERROR:${RST} ${err.message}`);
    process.exit(1);
  });
}
