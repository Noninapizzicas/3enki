#!/usr/bin/env node
/**
 * Migración one-shot — aplicar campo `language` a los 66 module.json del repo.
 *
 * Decisión por la regla "directorio decide": si el nombre del directorio del
 * módulo es ES, language=es; si es EN, language=en. Confirmado por el equipo
 * (4 casos ambiguos resueltos manualmente: perifericos→es, metricas→es,
 * escandallo→es, pizzepos__menu-generator→es).
 *
 * El campo se inserta como tercer field, entre `version` y `description`,
 * para que sea visible cerca de la identidad del módulo.
 *
 * Uso:
 *   node arquitectura/convenciones/_scripts/apply-language-field.js [--dry]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT   = path.resolve(__dirname, '../../..');
const MODULES_DIR = path.join(REPO_ROOT, 'modules');

const LANGUAGE_MAP = {
  // ===== ES (29) =====
  'perifericos':                          'es',
  'metricas':                             'es',
  'recetas':                              'es',
  'escandallo':                           'es',
  'notas':                                'es',
  'viabilidad':                           'es',
  'facturas':                             'es',
  'facturacion__asesoria':                'es',
  'facturacion__fuentes':                 'es',
  'pizzepos__carta-design':               'es',
  'pizzepos__carta-digital':              'es',
  'pizzepos__carta-impresion':            'es',
  'pizzepos__carta-manager':              'es',
  'pizzepos__carta-marketing':            'es',
  'pizzepos__carta-scheduler':            'es',
  'pizzepos__categorias':                 'es',
  'pizzepos__cobros':                     'es',
  'pizzepos__cocina':                     'es',
  'pizzepos__comandero':                  'es',
  'pizzepos__cuentas':                    'es',
  'pizzepos__cuentas-canales':            'es',
  'pizzepos__impresion':                  'es',
  'pizzepos__ingredientes':               'es',
  'pizzepos__menu-generator':             'es',
  'pizzepos__pedidos':                    'es',
  'pizzepos__persistencia-comandero':     'es',
  'pizzepos__productos':                  'es',
  'pizzepos__tarifas':                    'es',
  'pizzepos__variaciones':                'es',

  // ===== EN (37) =====
  'admin-panel':                          'en',
  'bot-manager':                          'en',
  'calling-generator':                    'en',
  'certificate-authority':                'en',
  'channel-manager':                      'en',
  'code-executor':                        'en',
  'composition-manager':                  'en',
  'conversacion__ai-agent-framework':     'en',
  'conversacion__ai-gateway':             'en',
  'conversacion__chat-io':                'en',
  'conversacion__prompt-builder':         'en',
  'conversation-export':                  'en',
  'credential-manager':                   'en',
  'dashboard':                            'en',
  'database-manager':                     'en',
  'device-health':                        'en',
  'device-registry':                      'en',
  'device-shadow':                        'en',
  'esp32-dev':                            'en',
  'esp32-flasher':                        'en',
  'filesystem':                           'en',
  'firmware-builder':                     'en',
  'firmware-manager':                     'en',
  'gateway-manager':                      'en',
  'log-manager':                          'en',
  'pdf-viewer':                           'en',
  'plugin-manager':                       'en',
  'project-manager':                      'en',
  'prompt-manager':                       'en',
  'scheduler':                            'en',
  'scratch-designer':                     'en',
  'security-p2p':                         'en',
  'staff-manager':                        'en',
  'system-inspector':                     'en',
  'telegram-service':                     'en',
  'text-editor':                          'en',
  'ui-designer':                          'en'
};

function reorderWithLanguage(m, language) {
  const { name, version, description, author, language: existingLang, ...rest } = m;
  const out = {};
  if (name !== undefined)        out.name = name;
  if (version !== undefined)     out.version = version;
  if (description !== undefined) out.description = description;
  if (author !== undefined)      out.author = author;
  out.language = language;
  for (const [k, v] of Object.entries(rest)) out[k] = v;
  return out;
}

function slugToPath(slug) {
  // Slugs con __ son módulos anidados: pizzepos__cocina → pizzepos/cocina
  if (slug.includes('__')) {
    return slug.replace(/__/g, '/');
  }
  return slug;
}

function main() {
  const dry = process.argv.includes('--dry');
  let updated = 0, alreadySet = 0, missing = 0, errors = 0, mismatch = 0;

  const expected = Object.keys(LANGUAGE_MAP).length;
  console.log(`Procesando ${expected} módulos${dry ? ' [DRY-RUN]' : ''}...\n`);

  for (const [slug, language] of Object.entries(LANGUAGE_MAP)) {
    const modPath = slugToPath(slug);
    const mp = path.join(MODULES_DIR, modPath, 'module.json');
    if (!fs.existsSync(mp)) {
      console.error(`  MISS   ${slug}: module.json no existe`);
      missing++;
      continue;
    }
    let m;
    try {
      m = JSON.parse(fs.readFileSync(mp, 'utf8'));
    } catch (e) {
      console.error(`  ERROR  ${slug}: JSON inválido (${e.message})`);
      errors++;
      continue;
    }

    if (m.language === language) {
      console.log(`  OK     ${slug}: ya tiene language=${language}`);
      alreadySet++;
      continue;
    }
    if (m.language && m.language !== language) {
      console.error(`  CONFLICT ${slug}: tiene language=${m.language}, esperaba ${language}`);
      mismatch++;
      continue;
    }

    const reordered = reorderWithLanguage(m, language);
    if (!dry) {
      fs.writeFileSync(mp, JSON.stringify(reordered, null, 2) + '\n', 'utf8');
    }
    console.log(`  SET    ${slug}: language=${language}${dry ? ' [DRY]' : ''}`);
    updated++;
  }

  console.log(`\nResumen:`);
  console.log(`  ${updated} actualizados`);
  console.log(`  ${alreadySet} ya tenían language`);
  console.log(`  ${missing} sin module.json`);
  console.log(`  ${errors} errores`);
  console.log(`  ${mismatch} conflictos`);
  console.log(`  ${expected} esperados, ${updated + alreadySet + missing + errors + mismatch} procesados`);

  if (errors > 0 || mismatch > 0) process.exit(1);
}

main();
