#!/usr/bin/env node
/**
 * Validador del transversal frontend v1.0.0.
 *
 * Uso:
 *   node frontend.validate.js                # valida que el contrato sea JSON estructuralmente
 *   node frontend.validate.js --check-system # adicional: cross-checks contra el repo
 *
 * Cross-checks (7):
 *  1. frontend_contract_estructura_valida          (error)   — el contrato es JSON valido y tiene amplitud canonica
 *  2. drift_ui_handler_sin_type_canonico           (warning) — modulo declara ui_handlers sin type ∈ {workspace_module, chat_tool, inline_render, system_panel}
 *  3. drift_ui_handler_sin_zone_canonica           (warning) — modulo declara ui_handlers sin zone ∈ las 5 zonas + lateral
 *  4. drift_navigation_spa_en_frontend             (error)   — frontend/src/routes/ contiene rutas hermanas al frame unico
 *  5. drift_panel_excede_33vh                      (warning) — componentes panel/drawer en frontend/src/lib superan 33vh
 *  6. drift_endpoint_http_ui_intermedio            (error)   — modulo backend expone endpoints HTTP /ui/*
 *  7. drift_color_proyecto_fuera_paleta            (warning) — futuro: cuando project-manager exponga proyectos validables
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT       = path.resolve(__dirname, '../../..');
const CONTRACT_PATH   = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/frontend.contract.json');
const MODULES_DIR     = path.join(REPO_ROOT, 'modules');
const FRONTEND_ROUTES = path.join(REPO_ROOT, 'frontend/src/routes');
const FRONTEND_LIB    = path.join(REPO_ROOT, 'frontend/src/lib');

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL   = '\x1b[33m';
const CYAN  = '\x1b[36m';
const RST   = '\x1b[0m';

const TYPES_CANONICOS  = new Set(['workspace_module', 'chat_tool', 'inline_render', 'system_panel']);
const ZONES_CANONICAS  = new Set(['barra_modulos', 'area_chat', 'barra_chat_superior', 'input_chat', 'barra_chat_inferior', 'lateral_derecha']);
const SECCIONES_CANONICAS = ['_doc','id','version','creada','supersedes_nota','objetivo','inputs','filosofia','principios','decisiones_arquitectonicas','prohibido','output_shape_resumen','reglas_de_extraccion','derivaciones','validaciones_cross_realizadas_por_validator','salida_validador','convenciones_complementarias'];

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

function listModuleManifests() {
  const manifests = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          const mj = path.join(full, 'module.json');
          if (fs.existsSync(mj)) {
            try { manifests.push({ slug: path.relative(MODULES_DIR, full).replace(/\//g, '__'), path: mj, manifest: loadJson(mj) }); } catch (_) {}
          } else {
            walk(full);
          }
        }
      } catch (_) {}
    }
  }
  walk(MODULES_DIR);
  return manifests;
}

function listFrontendRoutes() {
  if (!fs.existsSync(FRONTEND_ROUTES)) return [];
  const acc = [];
  for (const name of fs.readdirSync(FRONTEND_ROUTES)) {
    const full = path.join(FRONTEND_ROUTES, name);
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) acc.push({ name, path: full });
    } catch (_) {}
  }
  return acc;
}

function walkFiles(dir, ext, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walkFiles(full, ext, acc);
      else if (name.endsWith(ext)) acc.push(full);
    } catch (_) {}
  }
  return acc;
}

function lineOfOffset(content, offset) {
  return content.slice(0, offset).split('\n').length;
}

// ---- Cross-checks ----

function checkUiHandlerType(findings) {
  for (const { slug, manifest } of listModuleManifests()) {
    const handlers = manifest.ui_handlers;
    if (!Array.isArray(handlers) || handlers.length === 0) continue;
    for (const h of handlers) {
      // Algunos manifests usan format heredado (action solo, sin type/zone). Si NO declara type ni zone, drift.
      if (typeof h === 'string') {
        findings.warnings.push(`drift_ui_handler_sin_type_canonico: ${slug} declara ui_handler como string '${h}' — debe ser objeto con type, action, zone`);
        continue;
      }
      const t = h.type;
      if (t === undefined) {
        findings.warnings.push(`drift_ui_handler_sin_type_canonico: ${slug} ui_handler '${h.action || JSON.stringify(h).slice(0,40)}' sin campo type`);
      } else if (!TYPES_CANONICOS.has(t)) {
        findings.warnings.push(`drift_ui_handler_sin_type_canonico: ${slug} ui_handler '${h.action || ''}' con type='${t}' (canonicos: workspace_module|chat_tool|inline_render|system_panel)`);
      }
    }
  }
}

function checkUiHandlerZone(findings) {
  for (const { slug, manifest } of listModuleManifests()) {
    const handlers = manifest.ui_handlers;
    if (!Array.isArray(handlers) || handlers.length === 0) continue;
    for (const h of handlers) {
      if (typeof h === 'string') continue; // ya reportado en check anterior
      const z = h.zone;
      if (z === undefined) {
        findings.warnings.push(`drift_ui_handler_sin_zone_canonica: ${slug} ui_handler '${h.action || ''}' sin campo zone`);
      } else if (!ZONES_CANONICAS.has(z)) {
        findings.warnings.push(`drift_ui_handler_sin_zone_canonica: ${slug} ui_handler '${h.action || ''}' con zone='${z}' (canonicas: barra_modulos|area_chat|barra_chat_superior|input_chat|barra_chat_inferior|lateral_derecha)`);
      }
    }
  }
}

function checkNavigationSpa(findings) {
  // El frame único es frontend/src/routes/+page.svelte (raíz). Cualquier carpeta hermana a esa raíz que sea una "ruta" SPA tradicional es drift.
  // Permitido: subdirectorios que sean deep-links al estado del frame único (ej. /conversations/[id]/ que abre el frame con esa conversación).
  // Heurística: si frontend/src/routes contiene MÁS de una página independiente (varios +page.svelte en niveles distintos sin parámetro), drift.
  const routes = listFrontendRoutes();
  const pageFiles = walkFiles(FRONTEND_ROUTES, '+page.svelte', []);
  // Si hay más de 5 +page.svelte y ninguno en parámetros [...], es señal de SPA tradicional.
  // Esta heurística es conservadora — cuando se profundice se ajustará.
  if (pageFiles.length > 5) {
    const dynamic = pageFiles.filter(f => /\[[^\]]+\]/.test(f));
    if (dynamic.length === 0) {
      findings.warnings.push(`drift_navigation_spa_en_frontend: frontend/src/routes/ contiene ${pageFiles.length} +page.svelte sin rutas dinámicas — posible SPA tradicional. Verificar manualmente.`);
    }
  }
}

function checkPanelExceeds33vh(findings) {
  if (!fs.existsSync(FRONTEND_LIB)) return;
  const svelte = walkFiles(FRONTEND_LIB, '.svelte', []);
  for (const file of svelte) {
    let content;
    try { content = fs.readFileSync(file, 'utf-8'); } catch (_) { continue; }
    // Heurística: max-height: <num>vh donde num > 33
    const re = /max-height\s*:\s*(\d+)vh/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      const num = parseInt(m[1], 10);
      if (num > 33) {
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_panel_excede_33vh: ${rel}:${ln} — max-height: ${num}vh excede el limite canonico de 33vh`);
      }
    }
  }
}

function checkEndpointUiIntermedio(findings) {
  for (const { slug, manifest } of listModuleManifests()) {
    const apis = manifest.apis_http || manifest.http_endpoints || [];
    if (!Array.isArray(apis) || apis.length === 0) continue;
    for (const api of apis) {
      const route = (typeof api === 'string') ? api : (api.route || api.path || '');
      if (typeof route === 'string' && /^\/ui\//i.test(route)) {
        findings.errors.push(`drift_endpoint_http_ui_intermedio: ${slug} expone endpoint HTTP '${route}' — frontend habla MQTT directo, no /ui/*`);
      }
    }
  }
}

function checkUiHandlerSinAction(findings) {
  for (const { slug, manifest } of listModuleManifests()) {
    const handlers = manifest.ui_handlers;
    if (!Array.isArray(handlers) || handlers.length === 0) continue;
    for (const h of handlers) {
      if (typeof h === 'string') continue; // ya reportado en otro check
      if (typeof h.action !== 'string' || h.action.length === 0) {
        findings.warnings.push(`drift_ui_handler_sin_action: ${slug} ui_handler sin campo action (key obligatoria para discovery del frontend)`);
      }
    }
  }
}

const PALETA_PROYECTO_HEX = new Set(['#22c55e', '#3b82f6', '#a855f7', '#f97316', '#ef4444', '#eab308', '#06b6d4', '#ec4899']);

function checkColorHexCustomEnFrontend(findings) {
  const FRONTEND_SRC = path.join(REPO_ROOT, 'frontend/src');
  if (!fs.existsSync(FRONTEND_SRC)) return;
  const exts = new Set(['.svelte', '.css', '.ts', '.js']);
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full);
        else if (exts.has(path.extname(name))) {
          const content = fs.readFileSync(full, 'utf-8');
          // Detect hex colors NOT in palette
          const rx = /#[0-9a-fA-F]{6}\b/g;
          const matches = content.match(rx) || [];
          for (const m of matches) {
            const norm = m.toLowerCase();
            if (PALETA_PROYECTO_HEX.has(norm)) continue;
            // Tailwind neutral / common values frequently appear: ignore #fff, #000, #ffffff, #000000
            if (/^#0{6}$|^#f{6}$|^#1{6}$|^#e{6}$/i.test(m)) continue;
            // Solo reportar primer match por archivo para no inundar
            const ln = lineOfOffset(content, content.indexOf(m));
            findings.warnings.push(`drift_color_hex_custom_en_frontend_src: ${path.relative(REPO_ROOT, full)}:${ln} — ${m} fuera de paleta canonica`);
            break;
          }
        }
      } catch (_) {}
    }
  }
  walk(FRONTEND_SRC);
}

function checkModalBloqueante(findings) {
  const FRONTEND_SRC = path.join(REPO_ROOT, 'frontend/src');
  if (!fs.existsSync(FRONTEND_SRC)) return;
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full);
        else if (name.endsWith('.svelte')) {
          const content = fs.readFileSync(full, 'utf-8');
          if (/<dialog\s+open/i.test(content) || /document\.body\.style\.overflow\s*=\s*['"`]hidden['"`]/.test(content) || /class\s*=\s*['"`][^'"`]*modal-backdrop/.test(content)) {
            findings.warnings.push(`drift_modal_bloqueante_con_backdrop: ${path.relative(REPO_ROOT, full)} — patron modal bloqueante detectado (frontend.contract prohibe modales que tomen control completo de pantalla)`);
          }
        }
      } catch (_) {}
    }
  }
  walk(FRONTEND_SRC);
}

const LOCALSTORAGE_DOMAIN_KEYS = /['"`]\w*(recipe|conversation|message|project|escandallo|order|invoice|cuenta)\w*['"`]/i;

function checkLocalStorageDeDominio(findings) {
  const FRONTEND_SRC = path.join(REPO_ROOT, 'frontend/src');
  if (!fs.existsSync(FRONTEND_SRC)) return;
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full);
        else if (/\.(svelte|js|ts)$/.test(name)) {
          const content = fs.readFileSync(full, 'utf-8');
          const rx = /localStorage\.setItem\s*\(\s*([^,)]+)/g;
          let m;
          while ((m = rx.exec(content)) !== null) {
            if (LOCALSTORAGE_DOMAIN_KEYS.test(m[1])) {
              const ln = lineOfOffset(content, m.index);
              findings.warnings.push(`drift_localstorage_de_estado_de_dominio: ${path.relative(REPO_ROOT, full)}:${ln} — localStorage.setItem con key ${m[1].trim()} (datos de dominio van al backend)`);
            }
          }
        }
      } catch (_) {}
    }
  }
  walk(FRONTEND_SRC);
}

function checkIconfontOSvgInline(findings) {
  const FRONTEND_PKG = path.join(REPO_ROOT, 'frontend/package.json');
  if (fs.existsSync(FRONTEND_PKG)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(FRONTEND_PKG, 'utf-8'));
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      for (const dep of Object.keys(allDeps)) {
        if (/^(@fortawesome\/|material-icons|@mdi\/font|lucide-)/.test(dep)) {
          findings.warnings.push(`drift_iconfont_o_svg_inline_obligatorio_para_iconos: frontend/package.json incluye "${dep}" — iconos canonicos son emojis Unicode`);
        }
      }
    } catch (_) {}
  }
}

const FRAMEWORKS_UI_HEAVY = ['@mui/material', 'bootstrap', 'bulma', '@chakra-ui/react', 'daisyui', '@skeletonlabs/skeleton'];
const STATE_LIBS_PROHIBIDAS = ['redux', '@reduxjs/toolkit', 'mobx', 'zustand', 'pinia', 'jotai', 'recoil'];

function checkFrameworkUiYStateContainer(findings) {
  const FRONTEND_PKG = path.join(REPO_ROOT, 'frontend/package.json');
  if (!fs.existsSync(FRONTEND_PKG)) return;
  try {
    const pkg = JSON.parse(fs.readFileSync(FRONTEND_PKG, 'utf-8'));
    const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const lib of FRAMEWORKS_UI_HEAVY) {
      if (allDeps[lib]) findings.errors.push(`drift_framework_ui_heavy_en_dependencies: frontend/package.json incluye "${lib}" — solo Tailwind permitido`);
    }
    for (const lib of STATE_LIBS_PROHIBIDAS) {
      if (allDeps[lib]) findings.errors.push(`drift_redux_mobx_zustand_pinia: frontend/package.json incluye "${lib}" — solo Svelte stores nativos`);
    }
  } catch (_) {}
}

// ---- Reporting ----

function reportFindings(findings) {
  if (findings.errors.length > 0) {
    console.log(`${RED}cross-system errors (${findings.errors.length})${RST}`);
    for (const e of findings.errors) console.log(`  ${RED}✗${RST} ${e}`);
  }
  if (findings.warnings.length > 0) {
    console.log(`${YEL}cross-system warnings (${findings.warnings.length})${RST}`);
    for (const w of findings.warnings) console.log(`  ${YEL}!${RST} ${w}`);
  }
  if (findings.info.length > 0) {
    console.log(`${CYAN}cross-system info (${findings.info.length})${RST}`);
    for (const i of findings.info) console.log(`  ${CYAN}i${RST} ${i}`);
  }
  if (findings.errors.length === 0 && findings.warnings.length === 0 && findings.info.length === 0) {
    console.log(`${GREEN}cross-system: sin drift detectado${RST}`);
  }
}

// ---- Main ----

function main() {
  const checkSystemFlag = process.argv.includes('--check-system');

  // 1. Contrato existe + JSON valido + amplitud canonica
  if (!fs.existsSync(CONTRACT_PATH)) {
    console.log(`${RED}FAIL${RST} frontend.contract.json no existe`);
    process.exit(1);
  }
  let contract;
  try { contract = loadJson(CONTRACT_PATH); }
  catch (e) {
    console.log(`${RED}FAIL${RST} frontend.contract.json invalido (${e.message})`);
    process.exit(1);
  }
  const keys = Object.keys(contract);
  const faltan = SECCIONES_CANONICAS.filter(k => !keys.includes(k));
  if (faltan.length > 0) {
    console.log(`${RED}FAIL${RST} frontend.contract.json amplitud canonica incompleta. Faltan: ${faltan.join(', ')}`);
    process.exit(1);
  }
  console.log(`${GREEN}PASS${RST} frontend (contrato valido, ${keys.length} secciones canonicas)`);

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el repo (frontend) ===${RST}`);
    const findings = { errors: [], warnings: [], info: [] };
    checkUiHandlerType(findings);
    checkUiHandlerZone(findings);
    checkNavigationSpa(findings);
    checkPanelExceeds33vh(findings);
    checkEndpointUiIntermedio(findings);
    checkUiHandlerSinAction(findings);
    checkColorHexCustomEnFrontend(findings);
    checkModalBloqueante(findings);
    checkLocalStorageDeDominio(findings);
    checkIconfontOSvgInline(findings);
    checkFrameworkUiYStateContainer(findings);
    reportFindings(findings);
  }

  process.exit(0);
}

main();
