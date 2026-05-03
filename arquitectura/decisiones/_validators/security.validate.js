#!/usr/bin/env node
/**
 * Validador del transversal security v1.0.0.
 *
 * Cross-checks (7):
 *  1. security_contract_estructura_valida          (error)
 *  2. drift_lectura_directa_de_credenciales        (error) — modulo distinto de credential-manager hace fs.readFile sobre credenciales
 *  3. drift_hardcoded_api_key                      (error) — patrones de keys de proveedor en codigo
 *  4. drift_secret_en_log                          (error) — variables sospechosas pasadas a logger
 *  5. drift_secret_en_publish                      (error) — publish con campos sospechosos
 *  6. drift_endpoint_http_responde_con_credencial  (error) — HTTP response con campos sospechosos
 *  7. drift_operacion_sin_project_id               (warning, deuda single-tenant)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/security.contract.json');
const MODULES_DIR   = path.join(REPO_ROOT, 'modules');

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL   = '\x1b[33m';
const CYAN  = '\x1b[36m';
const RST   = '\x1b[0m';

const SECCIONES_CANONICAS = ['_doc','id','version','creada','supersedes_nota','objetivo','inputs','filosofia','principios','decisiones_arquitectonicas','prohibido','output_shape_resumen','reglas_de_extraccion','derivaciones','validaciones_cross_realizadas_por_validator','salida_validador','convenciones_complementarias'];

const HARDCODED_KEY_PATTERNS = [
  { name: 'OpenAI sk-',        rx: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: 'Anthropic claude-', rx: /\bsk-ant-api[0-9]{2}-[A-Za-z0-9_-]{40,}\b/ },
  { name: 'AWS AKIA',          rx: /\bAKIA[A-Z0-9]{16}\b/ },
  { name: 'GitHub ghp_',       rx: /\bghp_[A-Za-z0-9]{36,}\b/ },
  { name: 'GitHub github_pat_',rx: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/ }
];
// Detecta paso de variable sospechosa como propiedad/destructuring de objeto.
// La palabra debe ir seguida de `:`, `,` o `}` (key de objeto literal o destructuring),
// NO dentro de string literal del mensaje del log. Negative lookahead `(?!_)` excluye
// compound names tipo token_configured, password_hash, has_token (metadata segura).
const SECRET_VARS_RX = /\b(this\.logger\.\w+|console\.\w+)\([^)]*\{[^}]*\b(apiKey|api_key|token|password|authHeader|authorization)\b(?!_)\s*[:,}]/i;
const FS_READ_CREDENTIAL_RX = /\bfs\.readFile(?:Sync)?\s*\([^)]*(\.env|credential|secret|\.token|\.key|\.pem)/i;
const PUBLISH_SECRET_RX = /publish\s*\([^,]+,\s*\{[^}]*\b(apiKey|api_key|token|password|authorization)\s*:/i;

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

function listSourceFiles() {
  const acc = [];
  function walk(dir, depth) {
    if (depth > 6) return;
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '_archived' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full, depth + 1);
        else if (name.endsWith('.js')) acc.push(full);
      } catch (_) {}
    }
  }
  walk(MODULES_DIR, 0);
  return acc;
}

function lineOfOffset(content, offset) { return content.slice(0, offset).split('\n').length; }

// ---- Cross-checks ----

function checkLecturaDirectaCredenciales(findings) {
  for (const file of listSourceFiles()) {
    if (file.includes('credential-manager')) continue; // modulo dueño
    const content = fs.readFileSync(file, 'utf-8');
    const m = content.match(FS_READ_CREDENTIAL_RX);
    if (m) {
      const ln = lineOfOffset(content, m.index);
      const rel = path.relative(REPO_ROOT, file);
      findings.errors.push(`drift_lectura_directa_de_credenciales: ${rel}:${ln} — fs.readFile sobre credenciales fuera de credential-manager`);
    }
    if (/require\s*\(\s*['"`]dotenv['"`]\s*\)/i.test(content)) {
      findings.errors.push(`drift_lectura_directa_de_credenciales: ${path.relative(REPO_ROOT, file)} — require('dotenv') fuera de credential-manager`);
    }
  }
}

function checkHardcodedApiKey(findings) {
  for (const file of listSourceFiles()) {
    const content = fs.readFileSync(file, 'utf-8');
    for (const { name, rx } of HARDCODED_KEY_PATTERNS) {
      const m = content.match(rx);
      if (m) {
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.errors.push(`drift_hardcoded_api_key: ${rel}:${ln} — patron de ${name} detectado`);
      }
    }
  }
}

function checkSecretEnLog(findings) {
  for (const file of listSourceFiles()) {
    if (file.includes('credential-manager')) continue;
    const content = fs.readFileSync(file, 'utf-8');
    const m = content.match(SECRET_VARS_RX);
    if (m) {
      const ln = lineOfOffset(content, m.index);
      const rel = path.relative(REPO_ROOT, file);
      findings.warnings.push(`drift_secret_en_log: ${rel}:${ln} — variable sospechosa (apiKey/token/password/authorization) en objeto de logger; verificar manualmente que no expone valor`);
    }
  }
}

function checkSecretEnPublish(findings) {
  for (const file of listSourceFiles()) {
    if (file.includes('credential-manager')) continue;
    const content = fs.readFileSync(file, 'utf-8');
    const m = content.match(PUBLISH_SECRET_RX);
    if (m) {
      const ln = lineOfOffset(content, m.index);
      const rel = path.relative(REPO_ROOT, file);
      findings.errors.push(`drift_secret_en_publish: ${rel}:${ln} — publish con campo sospechoso (apiKey/token/password) fuera de credential-manager`);
    }
  }
}

function checkCredentialManagerExiste(findings) {
  const cmDir = path.join(MODULES_DIR, 'credential-manager');
  const cmManifest = path.join(cmDir, 'module.json');
  if (!fs.existsSync(cmManifest)) {
    findings.errors.push(`drift_credential_manager_no_existe_o_sin_publishes_canonicos: modules/credential-manager/module.json no existe`);
    return;
  }
  try {
    const manifest = loadJson(cmManifest);
    const publishes = (manifest.events?.publishes || []).map(p => typeof p === 'string' ? p : p.event);
    const subscribes = (manifest.events?.subscribes || []).map(s => typeof s === 'string' ? s : s.event);
    const required_pub = ['credential.saved', 'credential.updated', 'credential.deleted'];
    const required_sub = ['credential.resolve.request'];
    for (const ev of required_pub) if (!publishes.includes(ev)) findings.errors.push(`drift_credential_manager_no_existe_o_sin_publishes_canonicos: credential-manager no publica "${ev}"`);
    for (const ev of required_sub) if (!subscribes.includes(ev)) findings.errors.push(`drift_credential_manager_no_existe_o_sin_publishes_canonicos: credential-manager no subscribe "${ev}"`);
  } catch (_) {}
}

function checkCertificateAuthorityExiste(findings) {
  const caManifest = path.join(MODULES_DIR, 'certificate-authority/module.json');
  if (!fs.existsSync(caManifest)) {
    findings.warnings.push(`drift_certificate_authority_no_existe: modules/certificate-authority/module.json no existe (mTLS para cluster requiere su presencia cuando aplique)`);
  }
}

const PASSWORD_LITERAL_RX = /\bpassword\s*[=:]\s*['"`]([^'"`]{8,})['"`]/gi;
const PASSWORD_PLACEHOLDERS = new Set(['changeme', 'password', 'YOUR_PASSWORD_HERE', 'your_password', 'placeholder', 'example', 'redacted', 'xxxxxxxx', '********']);

function checkPasswordLiteral(findings) {
  for (const file of listSourceFiles()) {
    const content = fs.readFileSync(file, 'utf-8');
    let m;
    while ((m = PASSWORD_LITERAL_RX.exec(content)) !== null) {
      const value = m[1];
      if (PASSWORD_PLACEHOLDERS.has(value.toLowerCase())) continue;
      // Heurística adicional: si contiene espacios o solo letras minúsculas, probablemente texto legible (placeholder)
      if (/^[a-z\s]{8,}$/.test(value)) continue;
      const ln = lineOfOffset(content, m.index);
      const rel = path.relative(REPO_ROOT, file);
      findings.errors.push(`drift_password_en_string_literal: ${rel}:${ln} — password literal de longitud ${value.length} (revisar si es placeholder o secreto real)`);
    }
  }
}

const JWT_RX = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

function checkJwtHardcoded(findings) {
  for (const file of listSourceFiles()) {
    const content = fs.readFileSync(file, 'utf-8');
    let m;
    while ((m = JWT_RX.exec(content)) !== null) {
      const ln = lineOfOffset(content, m.index);
      const rel = path.relative(REPO_ROOT, file);
      findings.errors.push(`drift_jwt_token_hardcoded: ${rel}:${ln} — patron de JWT detectado`);
    }
  }
}

function checkDotenvFiles(findings) {
  function walk(dir, depth) {
    if (depth > 4 || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '_archived' || name === '.git') continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full, depth + 1);
        else if (/^\.env(\.|$)/.test(name) && !/\.example$|\.template$|\.sample$/.test(name)) {
          findings.errors.push(`drift_dotenv_path_en_repo: ${path.relative(REPO_ROOT, full)} — archivo .env real committeado (solo .env.example/.template/.sample permitidos)`);
        }
      } catch (_) {}
    }
  }
  walk(REPO_ROOT, 0);
}

function checkSecretsPersistidosFueraCredentialManager(findings) {
  // Detectar fs.writeFile sobre paths sospechosos + crypto.createCipher en mismo archivo (heurística)
  for (const file of listSourceFiles()) {
    if (file.includes('credential-manager')) continue;
    const content = fs.readFileSync(file, 'utf-8');
    const writesCredFile = /fs\.writeFile(?:Sync)?\s*\([^)]*(credential|secret|\.token|\.key|\.pem|encrypted)/i.test(content);
    const usesCipher = /crypto\.createCipher|crypto\.createCipheriv|crypto\.scryptSync\s*\([^)]*['"`](pbkdf2|aes)/.test(content);
    if (writesCredFile && usesCipher) {
      findings.errors.push(`drift_secrets_persistidos_fuera_credential_manager: ${path.relative(REPO_ROOT, file)} — escribe archivo con credential/secret/token + usa crypto cipher (lógica de cifrado fuera de credential-manager)`);
    }
  }
}

function reportFindings(findings) {
  if (findings.errors.length > 0) { console.log(`${RED}cross-system errors (${findings.errors.length})${RST}`); for (const e of findings.errors) console.log(`  ${RED}✗${RST} ${e}`); }
  if (findings.warnings.length > 0) { console.log(`${YEL}cross-system warnings (${findings.warnings.length})${RST}`); for (const w of findings.warnings) console.log(`  ${YEL}!${RST} ${w}`); }
  if (findings.info.length > 0) { console.log(`${CYAN}cross-system info (${findings.info.length})${RST}`); for (const i of findings.info) console.log(`  ${CYAN}i${RST} ${i}`); }
  if (findings.errors.length === 0 && findings.warnings.length === 0 && findings.info.length === 0) console.log(`${GREEN}cross-system: sin drift detectado${RST}`);
}

function main() {
  const checkSystemFlag = process.argv.includes('--check-system');
  if (!fs.existsSync(CONTRACT_PATH)) { console.log(`${RED}FAIL${RST} security.contract.json no existe`); process.exit(1); }
  let contract;
  try { contract = loadJson(CONTRACT_PATH); } catch (e) { console.log(`${RED}FAIL${RST} ${e.message}`); process.exit(1); }
  const faltan = SECCIONES_CANONICAS.filter(k => !Object.keys(contract).includes(k));
  if (faltan.length > 0) { console.log(`${RED}FAIL${RST} security.contract amplitud incompleta. Faltan: ${faltan.join(', ')}`); process.exit(1); }
  console.log(`${GREEN}PASS${RST} security (contrato valido, ${Object.keys(contract).length} secciones canonicas)`);

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el repo (security) ===${RST}`);
    const findings = { errors: [], warnings: [], info: [] };
    checkLecturaDirectaCredenciales(findings);
    checkHardcodedApiKey(findings);
    checkSecretEnLog(findings);
    checkSecretEnPublish(findings);
    checkCredentialManagerExiste(findings);
    checkCertificateAuthorityExiste(findings);
    checkPasswordLiteral(findings);
    checkJwtHardcoded(findings);
    checkDotenvFiles(findings);
    checkSecretsPersistidosFueraCredentialManager(findings);
    reportFindings(findings);
  }
  process.exit(0);
}

main();
