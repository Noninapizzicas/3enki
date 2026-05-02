#!/usr/bin/env node
/**
 * Validador de la convención events v1.0.0.
 *
 * Uso:
 *   node events.validate.js                # valida _outputs/events.json estructuralmente
 *   node events.validate.js --check-system # adicional: cross-checks contra módulos del repo
 *
 * Cross-checks que ejecuta con --check-system:
 *  1. drift_emit_bypass (warning)             — uso de .emit() sobre eventBus en código de módulos
 *  2. drift_silent_catch (warning)            — .publish().catch(()=>{}) sin log
 *  3. drift_rpc_over_pubsub (warning)         — eventos con sufijo .request/.response
 *  4. drift_generic_verb (warning)            — verbos genéricos del whitelist en posición de verbo
 *  5. drift_imperative_verb (warning)         — verbos imperativos en lugar de past participle
 *  6. drift_non_ascii_event_name (error)      — caracteres no-ASCII en nombres de evento
 *  7. drift_raw_topic_in_publish (warning)    — topic crudo (con / o core/) en publish/subscribe
 *  8. drift_undocumented_dynamic_subscribe (warning) — subscribe no declarado en manifest ni en lifecycle
 *  9. module_uses_publish_api_consistente (info)     — eventBus inyectado pero sin publish/subscribe
 *
 * El formato de salida sigue el de naming.validate.js y glossary.validate.js:
 * banner PASS/FAIL + listas de findings por severidad.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const Ajv  = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT      = path.resolve(__dirname, '../../..');
const SCHEMA_PATH    = path.join(REPO_ROOT, 'arquitectura/decisiones/_schemas/events.schema.json');
const OUTPUT_PATH    = path.join(REPO_ROOT, 'arquitectura/decisiones/_outputs/events.json');
const NAMING_PATH    = path.join(REPO_ROOT, 'arquitectura/convenciones/_outputs/naming.json');
const MODULES_DIR    = path.join(REPO_ROOT, 'modules');
const AUDITS_DIR     = path.join(REPO_ROOT, 'arquitectura/auditoria/_outputs/modulo-completo');
const MANIFESTS_DIR  = path.join(REPO_ROOT, 'arquitectura/auditoria/_outputs/manifest-completo');

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL   = '\x1b[33m';
const CYAN  = '\x1b[36m';
const RST   = '\x1b[0m';

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// -------- Listing helpers --------

function listAudits() {
  if (!fs.existsSync(AUDITS_DIR)) return [];
  return fs.readdirSync(AUDITS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(AUDITS_DIR, f));
}

function manifestPath(slug) {
  return path.join(MANIFESTS_DIR, `${slug}.json`);
}

function modulePathFromSlug(slug) {
  // slugs anidados (pizzepos__cocina) → modules/pizzepos/cocina/
  return path.join(MODULES_DIR, slug.replace(/__/g, '/'));
}

function moduleJsonPath(slug) {
  return path.join(modulePathFromSlug(slug), 'module.json');
}

function listModuleSourceFiles(slug) {
  const acc = [];
  const dir = modulePathFromSlug(slug);
  if (!fs.existsSync(dir)) return acc;
  const idx = path.join(dir, 'index.js');
  if (fs.existsSync(idx)) acc.push(idx);
  const libDir = path.join(dir, 'lib');
  if (fs.existsSync(libDir)) {
    for (const f of walkJs(libDir)) acc.push(f);
  }
  const svcDir = path.join(dir, 'services');
  if (fs.existsSync(svcDir)) {
    for (const f of walkJs(svcDir)) acc.push(f);
  }
  return acc;
}

function walkJs(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walkJs(full, acc);
      else if (name.endsWith('.js')) acc.push(full);
    } catch (_) {}
  }
  return acc;
}

// -------- Schema validation --------

function validateOutput(events) {
  const schema = loadJson(SCHEMA_PATH);
  const ajv    = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const ok = validate(events);
  return { ok, errors: validate.errors || [] };
}

// -------- Cross-checks --------

function lineOfOffset(content, offset) {
  return content.slice(0, offset).split('\n').length;
}

function isAsciiPure(s) {
  return /^[\x20-\x7E]*$/.test(s);
}

function checkEmitBypass(events, findings) {
  const re = new RegExp(events.detection_patterns.emit_bypass_regex);
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (re.test(line) && /eventBus/.test(line) && !line.trim().startsWith('//')) {
          const rel = path.relative(REPO_ROOT, file);
          findings.warnings.push(`drift_emit_bypass: ${slug} ${rel}:${i+1} — ${line.trim().slice(0, 120)}`);
        }
      }
    }
  }
}

function checkSilentCatch(events, findings) {
  const re = new RegExp(events.detection_patterns.silent_catch_regex, 'g');
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      let m;
      const reFresh = new RegExp(events.detection_patterns.silent_catch_regex, 'g');
      while ((m = reFresh.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_silent_catch: ${slug} ${rel}:${ln} — .publish().catch(()=>{}) sin log`);
      }
    }
  }
}

function checkRpcOverPubsub(events, findings) {
  const suffixes = events.detection_patterns.request_response_suffixes;
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const publicas = a.eventos?.publica || [];
    for (const ev of publicas) {
      if (ev.nombre?.tipo !== 'literal') continue;
      const name = ev.nombre.valor;
      if (!name) continue;
      for (const suf of suffixes) {
        if (name.endsWith(suf)) {
          findings.warnings.push(`drift_rpc_over_pubsub: ${slug} — evento "${name}" termina en "${suf}" (RPC sobre pub/sub) ${ev.ubicacion || ''}`);
          break;
        }
      }
    }
  }
}

function checkGenericVerb(events, findings) {
  const generic = new Set(events.detection_patterns.generic_verbs);
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const publicas = a.eventos?.publica || [];
    for (const ev of publicas) {
      if (ev.nombre?.tipo !== 'literal') continue;
      const name = ev.nombre.valor;
      if (!name) continue;
      const segs = name.split('.');
      const last = segs[segs.length - 1];
      if (generic.has(last)) {
        findings.warnings.push(`drift_generic_verb: ${slug} — evento "${name}" usa verbo genérico "${last}" ${ev.ubicacion || ''}`);
      }
    }
  }
}

function checkImperativeVerb(events, findings) {
  let naming;
  try { naming = loadJson(NAMING_PATH); } catch (_) { return; }
  const imperatives = {
    es: new Set(events.detection_patterns.imperative_verbs_es),
    en: new Set(events.detection_patterns.imperative_verbs_en)
  };
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const mp = moduleJsonPath(slug);
    let modLang = null;
    if (fs.existsSync(mp)) {
      try { modLang = loadJson(mp).language || null; } catch (_) {}
    }
    if (!modLang || !['es','en'].includes(modLang)) continue;
    const langImpSet = imperatives[modLang];
    const langWhitelist = new Set([
      ...(naming.languages?.[modLang]?.verbs_lifecycle || []),
      ...(naming.languages?.[modLang]?.verbs_compound_allowed || [])
    ]);
    const publicas = a.eventos?.publica || [];
    for (const ev of publicas) {
      if (ev.nombre?.tipo !== 'literal') continue;
      const name = ev.nombre.valor;
      if (!name) continue;
      const segs = name.split('.');
      const last = segs[segs.length - 1];
      if (!langWhitelist.has(last) && langImpSet.has(last)) {
        findings.warnings.push(`drift_imperative_verb: ${slug} (${modLang}) — evento "${name}" usa imperativo "${last}" en lugar de past participle ${ev.ubicacion || ''}`);
      }
    }
  }
}

function checkNonAsciiEventName(events, findings) {
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const publicas = a.eventos?.publica || [];
    for (const ev of publicas) {
      if (ev.nombre?.tipo !== 'literal') continue;
      const name = ev.nombre.valor;
      if (!name) continue;
      if (!isAsciiPure(name)) {
        findings.errors.push(`drift_non_ascii_event_name: ${slug} — evento "${name}" contiene caracteres no-ASCII ${ev.ubicacion || ''}`);
      }
    }
  }
}

function checkRawTopicInPublish(events, findings) {
  const indicators = events.detection_patterns.raw_topic_indicators;
  // regex que busca .publish('...')  o  .subscribe('...')
  const re = /\.(?:publish|subscribe)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      let m;
      const reFresh = new RegExp(re.source, 'g');
      while ((m = reFresh.exec(content)) !== null) {
        const arg = m[1];
        // Saltar si NO contiene indicador
        const matchIndic = indicators.find(ind => arg.includes(ind));
        if (matchIndic) {
          // Filtrar: si es la API mqtt directa documentada (eventBus.mqtt.publish), permitir
          // Heurística: ver si el contexto tiene 'mqtt.publish' o 'mqtt.subscribe' en lugar de 'eventBus.publish'
          const beforeStart = Math.max(0, m.index - 30);
          const ctx = content.slice(beforeStart, m.index + 20);
          if (/\.mqtt\.(publish|subscribe)\s*\(/.test(ctx)) continue;
          const ln = lineOfOffset(content, m.index);
          const rel = path.relative(REPO_ROOT, file);
          findings.warnings.push(`drift_raw_topic_in_publish: ${slug} ${rel}:${ln} — topic crudo "${arg}" en publish/subscribe`);
        }
      }
    }
  }
}

function checkUndocumentedDynamicSubscribe(events, findings) {
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const subs = a.eventos?.subscribes || [];
    const dynamicDocs = a.lifecycle?.subscribes_dinamicos_en_lifecycle || [];
    let manifest;
    try { manifest = loadJson(manifestPath(slug)); } catch (_) { manifest = null; }
    const declaredInManifest = new Set();
    if (manifest?.eventos?.subscribes) {
      for (const s of manifest.eventos.subscribes) {
        const evt = s.event || s.nombre || s;
        if (typeof evt === 'string') declaredInManifest.add(evt);
      }
    }
    for (const sub of subs) {
      if (sub.auto_wired) continue;
      const evt = sub.nombre || sub.event;
      if (!evt) continue;
      const inDynamicDocs = dynamicDocs.some(d => typeof d === 'string' && d.includes(evt));
      if (!declaredInManifest.has(evt) && !inDynamicDocs) {
        findings.warnings.push(`drift_undocumented_dynamic_subscribe: ${slug} — subscribe "${evt}" no está en manifest ni en lifecycle.subscribes_dinamicos_en_lifecycle`);
      }
    }
  }
}

function checkModuleUsesPublishApi(events, findings) {
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const refs = a.lifecycle?.onLoad?.guarda_referencias_externas || [];
    const usaEventBus = refs.some(r => /eventBus/i.test(r));
    if (!usaEventBus) continue;
    const publica = a.eventos?.publica || [];
    const subscribes = a.eventos?.subscribes || [];
    if (publica.length === 0 && subscribes.length === 0) {
      findings.info.push(`module_uses_publish_api_consistente: ${slug} — guarda this.eventBus pero no publica ni se suscribe (¿código muerto?)`);
    }
  }
}

// -------- Reporting --------

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

// -------- Main --------

function main() {
  const checkSystemFlag = process.argv.includes('--check-system');

  if (!fs.existsSync(OUTPUT_PATH)) {
    console.error(`${RED}FAIL${RST} no existe ${OUTPUT_PATH}`);
    process.exit(1);
  }
  let events;
  try { events = loadJson(OUTPUT_PATH); }
  catch (e) {
    console.error(`${RED}FAIL${RST} events.json inválido (${e.message})`);
    process.exit(1);
  }

  const { ok, errors } = validateOutput(events);
  if (!ok) {
    console.log(`${RED}FAIL${RST} events (schema)`);
    for (const e of errors) {
      console.log(`  ${RED}schema${RST}  ${e.instancePath || '/'} ${e.message} (${JSON.stringify(e.params)})`);
    }
    process.exit(1);
  }
  console.log(`${GREEN}PASS${RST} events (schema)`);

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el sistema ===${RST}`);
    const findings = { errors: [], warnings: [], info: [] };
    checkEmitBypass(events, findings);
    checkSilentCatch(events, findings);
    checkRpcOverPubsub(events, findings);
    checkGenericVerb(events, findings);
    checkImperativeVerb(events, findings);
    checkNonAsciiEventName(events, findings);
    checkRawTopicInPublish(events, findings);
    checkUndocumentedDynamicSubscribe(events, findings);
    checkModuleUsesPublishApi(events, findings);
    reportFindings(findings);
  }

  process.exit(0);
}

main();
