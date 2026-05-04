#!/usr/bin/env node
/**
 * Validador del sub-contrato agents-config v1.0.0.
 *
 * Uso:
 *   node agents-config.validate.js                # valida el schema estructuralmente
 *   node agents-config.validate.js --check-system # adicional: cross-checks contra archivos del repo
 *
 * Cross-checks (13):
 *   1. agents_config_schema_compile_ok                   (error)   — el schema compila AJV strict.
 *   2. drift_agent_no_cumple_schema                      (warning) — agents/<name>.json no valida.
 *   3. drift_agent_id_name_filename_divergen             (warning) — id/name/filename no coinciden.
 *   4. drift_agent_tools_fantasma                        (error)   — tool del agente no existe en el catalogo del repo.
 *   5. drift_agent_prompt_file_inexistente               (error)   — el .md referenciado no existe.
 *   6. drift_agent_prompt_file_demasiado_corto           (warning) — .md con <200 chars de contenido.
 *   7. drift_agent_prompt_file_sin_h1                    (warning) — el .md no tiene h1 en las primeras 10 lineas.
 *   8. drift_agent_prompt_file_con_frontmatter_yaml      (warning) — .md empieza por '---' (YAML).
 *   9. drift_agent_stats_persistido                      (warning) — campo stats presente en el JSON.
 *  10. drift_agent_provider_no_canonico                  (warning) — cubierto por schema enum (defensa extra).
 *  11. drift_agent_demasiadas_tools                      (info)    — agent.tools.length > 20.
 *  12. drift_agent_disabled_sin_razon_documentada        (info)    — enabled:false sin metadata.disabled_reason.
 *  13. drift_agent_idioma_inconsistente_con_modulo       (info)    — heuristica lexica.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const Ajv  = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT      = path.resolve(__dirname, '../../..');
const SCHEMA_DIR     = path.join(REPO_ROOT, 'arquitectura/decisiones/_schemas/agents-config');
const CONTRACT_PATH  = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/agents-config.contract.json');
const MODULES_DIR    = path.join(REPO_ROOT, 'modules');

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL   = '\x1b[33m';
const CYAN  = '\x1b[36m';
const RST   = '\x1b[0m';

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

function compileSchema() {
  const ajv = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  const schema = loadJson(path.join(SCHEMA_DIR, 'agent.config.schema.json'));
  ajv.addSchema(schema, 'agent.config.schema.json');
  return { ajv, validate: ajv.compile(schema) };
}

function findAgentDirs() {
  // Busca directorios agents/ junto a un module.json en cualquier modulo del repo.
  const acc = [];
  function walk(dir, slug = '') {
    if (!fs.existsSync(dir)) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    const hasManifest = entries.some(e => e.isFile() && e.name === 'module.json');
    if (hasManifest) {
      const agentsDir = path.join(dir, 'agents');
      const promptsDir = path.join(dir, 'prompts');
      if (fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory()) {
        acc.push({ moduleDir: dir, slug, agentsDir, promptsDir: fs.existsSync(promptsDir) ? promptsDir : null });
      }
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith('_') || e.name.startsWith('.') || e.name === 'node_modules') continue;
      walk(path.join(dir, e.name), slug ? `${slug}__${e.name}` : e.name);
    }
  }
  walk(MODULES_DIR);
  return acc;
}

function loadCanonicalToolsCatalog() {
  // Cataloga todas las tools registradas via module.json.tools[].name en el repo.
  const names = new Set();
  function walk(dir, slug = '') {
    if (!fs.existsSync(dir)) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    const manifestPath = path.join(dir, 'module.json');
    if (entries.some(e => e.isFile() && e.name === 'module.json')) {
      try {
        const m = loadJson(manifestPath);
        const tools = m.tools || [];
        for (const t of tools) {
          if (typeof t === 'object' && typeof t.name === 'string') names.add(t.name);
          else if (typeof t === 'string') names.add(t);
        }
      } catch (_) {}
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith('_') || e.name.startsWith('.') || e.name === 'node_modules') continue;
      walk(path.join(dir, e.name), slug ? `${slug}__${e.name}` : e.name);
    }
  }
  walk(MODULES_DIR);
  // Anadir meta-tool del sistema registrada en runtime
  names.add('invoke_agent');
  return names;
}

function readModuleLanguage(moduleDir) {
  try {
    const m = loadJson(path.join(moduleDir, 'module.json'));
    return m.language || 'en';
  } catch (_) { return 'en'; }
}

function checkPromptFile(content, agentSlug, agentId, findings) {
  const trimmed = (content || '').trim();
  // 6. drift_agent_prompt_file_demasiado_corto
  if (trimmed.length < 200) {
    findings.warnings.push(`drift_agent_prompt_file_demasiado_corto: ${agentSlug}/agents/${agentId}.json prompt_file tiene <200 chars de contenido (actual: ${trimmed.length})`);
  }
  // 8. drift_agent_prompt_file_con_frontmatter_yaml
  if (/^---\s*\n/.test(content || '')) {
    findings.warnings.push(`drift_agent_prompt_file_con_frontmatter_yaml: ${agentSlug}/agents/${agentId}.json prompt_file empieza con frontmatter YAML — debe ser markdown puro`);
  }
  // 7. drift_agent_prompt_file_sin_h1
  const lines = (content || '').split('\n').slice(0, 10);
  const hasH1 = lines.some(l => /^#\s+\S/.test(l));
  if (!hasH1) {
    findings.warnings.push(`drift_agent_prompt_file_sin_h1: ${agentSlug}/agents/${agentId}.json prompt_file no tiene h1 en las primeras 10 lineas`);
  }
}

function detectLanguageInconsistency(description, moduleLanguage) {
  // Heuristica simple: palabras en ingles tipicas en description de modulo en español.
  const enWords = /\b(generate|return|fetch|update|delete|create|the|and|with|from|this|that)\b/gi;
  const esWords = /\b(genera|devuelve|crea|actualiza|elimina|el|la|los|con|desde|este|para)\b/gi;
  if (moduleLanguage === 'es') {
    const enMatches = (description.match(enWords) || []).length;
    const esMatches = (description.match(esWords) || []).length;
    return enMatches > 2 && esMatches === 0;
  }
  if (moduleLanguage === 'en') {
    const enMatches = (description.match(enWords) || []).length;
    const esMatches = (description.match(esWords) || []).length;
    return esMatches > 2 && enMatches === 0;
  }
  return false;
}

// ---- Cross-checks ----

function checkAll(findings) {
  const agentDirs = findAgentDirs();
  if (agentDirs.length === 0) {
    findings.info.push('no_agent_dirs_found: ningun modulo declara carpeta agents/ — nothing to check');
    return;
  }

  const toolsCatalog = loadCanonicalToolsCatalog();
  const { validate } = compileSchema();

  for (const { moduleDir, slug, agentsDir, promptsDir } of agentDirs) {
    const moduleLanguage = readModuleLanguage(moduleDir);
    let files;
    try { files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.json')); } catch (_) { continue; }

    for (const file of files) {
      const filePath = path.join(agentsDir, file);
      const filenameBase = file.replace(/\.json$/, '');
      let config;
      try { config = loadJson(filePath); }
      catch (e) {
        findings.warnings.push(`drift_agent_no_cumple_schema: ${slug}/agents/${file} — JSON invalido: ${e.message}`);
        continue;
      }

      // 2. drift_agent_no_cumple_schema
      const schemaOk = validate(config);
      if (!schemaOk) {
        const errs = (validate.errors || []).map(e => `${e.instancePath || '/'} ${e.message}`).join('; ');
        findings.warnings.push(`drift_agent_no_cumple_schema: ${slug}/agents/${file} — ${errs}`);
      }

      // 9. drift_agent_stats_persistido (defensa extra: schema ya rechaza, esto re-flagea con mensaje claro)
      if ('stats' in (config || {})) {
        findings.warnings.push(`drift_agent_stats_persistido: ${slug}/agents/${file} — campo stats presente (debe vivir en memoria del modulo cargador, no en archivo declarativo)`);
      }

      // 3. drift_agent_id_name_filename_divergen
      if (config.id && config.id !== filenameBase) {
        findings.warnings.push(`drift_agent_id_name_filename_divergen: ${slug}/agents/${file} — agent.id="${config.id}" pero filename basename="${filenameBase}"`);
      }
      if (config.name && config.name !== filenameBase) {
        findings.warnings.push(`drift_agent_id_name_filename_divergen: ${slug}/agents/${file} — agent.name="${config.name}" pero filename basename="${filenameBase}"`);
      }

      // 4. drift_agent_tools_fantasma
      if (Array.isArray(config.tools)) {
        for (const toolName of config.tools) {
          if (typeof toolName !== 'string') continue;
          if (!toolsCatalog.has(toolName)) {
            findings.errors.push(`drift_agent_tools_fantasma: ${slug}/agents/${file} — tool "${toolName}" no esta registrada en ningun module.json del repo`);
          }
        }
        // 11. drift_agent_demasiadas_tools
        if (config.tools.length > 20) {
          findings.info.push(`drift_agent_demasiadas_tools: ${slug}/agents/${file} — ${config.tools.length} tools (>20). Posible candidato a dividir en agentes especializados.`);
        }
      }

      // 5. drift_agent_prompt_file_inexistente + 6/7/8 contenido
      if (typeof config.prompt_file === 'string') {
        const promptPath = path.resolve(moduleDir, config.prompt_file);
        if (!fs.existsSync(promptPath)) {
          findings.errors.push(`drift_agent_prompt_file_inexistente: ${slug}/agents/${file} — prompt_file "${config.prompt_file}" no existe en filesystem`);
        } else {
          let content;
          try { content = fs.readFileSync(promptPath, 'utf-8'); } catch (_) { content = ''; }
          checkPromptFile(content, slug, filenameBase, findings);
        }
      }

      // 12. drift_agent_disabled_sin_razon_documentada
      if (config.enabled === false) {
        const hasReason = config.metadata && typeof config.metadata.disabled_reason === 'string' && config.metadata.disabled_reason.length > 0;
        if (!hasReason) {
          findings.info.push(`drift_agent_disabled_sin_razon_documentada: ${slug}/agents/${file} — enabled:false pero sin metadata.disabled_reason`);
        }
      }

      // 13. drift_agent_idioma_inconsistente_con_modulo
      if (config.description && detectLanguageInconsistency(config.description, moduleLanguage)) {
        findings.info.push(`drift_agent_idioma_inconsistente_con_modulo: ${slug}/agents/${file} — description parece estar en idioma distinto a module.language="${moduleLanguage}"`);
      }
    }
  }
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

  // 1. Compilar schema (estructural)
  try {
    compileSchema();
    console.log(`${GREEN}PASS${RST} agents-config (1 schema compila AJV strict)`);
  } catch (err) {
    console.log(`${RED}FAIL${RST} agents-config (schema no compila)`);
    console.log(`  ${err.message}`);
    process.exit(1);
  }

  // 2. Verificar contrato existe y JSON valido
  if (!fs.existsSync(CONTRACT_PATH)) {
    console.log(`${RED}FAIL${RST} agents-config.contract.json no existe`);
    process.exit(1);
  }
  try { loadJson(CONTRACT_PATH); }
  catch (e) {
    console.log(`${RED}FAIL${RST} agents-config.contract.json invalido (${e.message})`);
    process.exit(1);
  }

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra archivos de agentes del repo ===${RST}`);
    const findings = { errors: [], warnings: [], info: [] };
    checkAll(findings);
    reportFindings(findings);
  }

  process.exit(0);
}

main();
