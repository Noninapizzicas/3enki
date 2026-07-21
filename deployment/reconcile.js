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
  for (const [nombre, svc] of Object.entries(M.servicios)) {
    const tmpl = leer(svc.plantilla);
    if (tmpl == null) { warn(`plantilla ausente: ${svc.plantilla} (salto ${nombre})`); continue; }
    const vars = {};
    for (const [k, val] of Object.entries(svc.vars || {})) vars[k] = renderPlantilla(val, { DOMAIN: dominio });
    const rendered = renderPlantilla(tmpl, { DOMAIN: dominio, ...vars });
    if (escribirSiDifiere(svc.destino, rendered, nombre)) systemdCambio = true;
  }
  if (systemdCambio) { act('systemctl daemon-reload'); shOk('systemctl daemon-reload'); }

  // 5) Caddyfile (render con dominio local + escribir si difiere)
  const caddyTmpl = leer(M.caddy.plantilla);
  let caddyCambio = false;
  if (caddyTmpl == null) {
    warn(`plantilla Caddy ausente: ${M.caddy.plantilla}`);
  } else {
    const caddyRendered = renderCaddyfile(caddyTmpl, dominio, M.caddy, M.public_ns, M.public_dir);
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
