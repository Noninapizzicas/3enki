'use strict';

/**
 * ejecutor — LA PUERTA GUARDADA para EJECUTAR comandos (skill CLI → shell) desde el chat.
 *
 * Frontier que cierra: USAR una skill (defuddle y cualquier CLI) con reja. El LLM llama
 * AQUÍ (ejecutor.ejecutar), NUNCA a shell.exec crudo. Nace de auditar Hermes; casa lo que
 * Enki ya tenía —code-executor (crudo) + portal (patrón de guard)— y añade lo que Hermes
 * enseña: aprobación graduada + audit → propiocepción.
 *
 * La tríada:  ejecutor(reflejo) → _guard (forma portal) → ejecución (local en Fase 1)
 *
 * Cadena del guard (orden EXACTO de Hermes):
 *   1. KILL-SWITCH   interruptor 'ejecutor' OFF → puerta_cerrada (503)
 *   2. HARDLINE      blocklist dura (rm -rf /, mkfs, dd a /dev/sd*, fork bomb, shutdown) →
 *                    NINGUNA aprobación la anula
 *   3. ALLOWLIST     glob de config ('defuddle *', 'npx skills *') → auto (permitido)
 *   4. YA-APROBADO   (project::patrón) cacheado session/always → aprobado
 *   5. PELIGROSO?    patrón peligroso (curl|sh, rm -r, sudo, > /dev…) → si NO confirmado:
 *                    pendiente_aprobacion (202) + emite ejecutor.aprobacion.pendiente (el nervio
 *                    lo surfacea). El humano dice sí → el LLM reintenta con confirmado:true.
 *   6. resto benigno → permitido
 *
 * HONESTIDAD (de Hermes, literal): la reja para ERRORES COOPERATIVOS, no output adversarial.
 * La contención real de input no-confiable = aislamiento en contenedor (Fase 2). La reja NO se
 * disfraza de sandbox.
 *
 * Ver arquitectura/decisiones/propuestas/ejecutor-guardado.md.
 */

const path = require('path');
const fs = require('fs');
const { exec, execFile, execFileSync } = require('child_process');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

// HARDLINE — catastrófico, ninguna aprobación lo abre. Mínimo y estable.
const HARDLINE = [
  /rm\s+-[rf]{1,2}\s+\/(?:\s|$|\*)/i,            // rm -rf / o /*
  /\bmkfs\b/i,
  /\bdd\b[^\n]*\bof=\/dev\/[sh]d/i,              // dd of=/dev/sd*
  />\s*\/dev\/[sh]d/i,                            // > /dev/sd*
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,     // fork bomb :(){ :|:& };:
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  /\bmv\b[^\n]*\/\*[^\n]*\/dev\/null/i
];

// PELIGROSO — pide aprobación humana (confirmado:true). Errores cooperativos, no adversarial.
const PELIGROSO = [
  /\brm\s+-[^\s]*r/i,                             // rm -r…
  /\b(curl|wget)\b[^\n]*\|\s*(?:[/\w]*\/)?(?:ba)?sh/i,  // curl … | sh
  /\bsudo\b/i,
  /\bchmod\s+-R\b/i,
  /\bchown\s+-R\b/i,
  /\bdd\b/i,
  />\s*\/dev\/(?!null|stdout|stderr)/i,           // redirige a device (no null/std*)
  /\bgit\s+push\b/i,
  /\b(kill|pkill|killall)\b/i
];

class EjecutorModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'ejecutor';
    this.version = '0.2.0';
    this.config = null;
    this.activo = false;                 // interruptor 'ejecutor' — OFF por defecto (puerta cerrada)
    this.allowlist = [];                 // Array<RegExp> desde globs de config
    this.aprobadas = new Map();          // `${project}::${patrón}` → 'session'|'always'
    this.defaultTimeoutMs = 30000;
    this.maxTimeoutMs = 120000;
    this.maxBuffer = 4 * 1024 * 1024;
    // Fase 2 — aislamiento en contenedor (la contención REAL de input no-confiable).
    this.dockerOk = false;               // ¿docker disponible? (probado en onLoad)
    this.contenedorImagen = 'node:20-slim';
    this.contenedorMemoria = '512m';
    this.contenedorPidsLimit = 256;
  }

  async onLoad(context) {
    await super.onLoad(context);
    this.config = context.moduleConfig || {};
    this.activo = this.config.enabled_default === true;
    this.defaultTimeoutMs = Number(this.config.default_timeout_ms) || 30000;
    this.maxTimeoutMs = Number(this.config.max_timeout_ms) || 120000;
    this.allowlist = (this.config.allowlist || DEFAULT_ALLOWLIST).map(g => this._globToRe(g));
    this.contenedorImagen = this.config.contenedor_imagen || 'node:20-slim';
    this.contenedorMemoria = this.config.contenedor_memoria || '512m';
    this.contenedorPidsLimit = Number(this.config.contenedor_pids_limit) || 256;
    this.dockerOk = this._probarDocker();   // best-effort: ¿hay docker en este host?
    this._registrarBoton();
    this.logger?.info('ejecutor.loaded', { module: this.name, version: this.version, activo: this.activo, allowlist: this.allowlist.length, docker: this.dockerOk });
  }

  async onUnload() {
    this.aprobadas.clear();
    await super.onUnload();
  }

  _registrarBoton() {
    try {
      this.eventBus.publish('interruptor.registrar', {
        id: 'ejecutor', label: 'Ejecutor (puerta guardada para correr comandos)', grupo: 'sistema',
        descripcion: 'Deja al chat EJECUTAR comandos (skills CLI) con reja: hardline + aprobación humana + audit. OFF = puerta cerrada. Nace apagado — poder de ejecución.',
        default: false
      });
    } catch (_) { /* best-effort */ }
  }

  onSolicitarRegistro() { this._registrarBoton(); }

  onInterruptorCambiado(event) {
    const d = (event && event.data) || event || {};
    if (d.id === 'ejecutor') {
      this.activo = !!d.enabled;
      this.logger?.warn('ejecutor.toggled', { activo: this.activo });
    }
  }

  onEjecutarRequest(event) { return this._atender(event, 'ejecutar', 'ejecutor.ejecutar.response', (d) => this._ejecutar(d)); }

  // ── LA PUERTA: guard → (aprobación) → ejecución local → audit ──
  async _ejecutar({ command, project_id, cwd, timeout_ms, confirmado, recordar, aislamiento } = {}) {
    if (!command || typeof command !== 'string') return this._invalid('command');
    const cmd = command.trim();

    const v = this._guard(cmd, { project_id: project_id || 'system', confirmado: !!confirmado, recordar });
    if (v.veredicto === 'puerta_cerrada') { this._audit(project_id, cmd, v.veredicto, false); return this._resp(503, { ok: false, veredicto: v.veredicto, motivo: "interruptor 'ejecutor' OFF" }); }
    if (v.veredicto === 'hardline')       { this._audit(project_id, cmd, v.veredicto, false); return this._resp(403, { ok: false, veredicto: v.veredicto, motivo: v.motivo }); }
    if (v.veredicto === 'pendiente_aprobacion') {
      const aprobacion_id = this._id();
      this._emitirPendiente(aprobacion_id, project_id, cmd, v.motivo);
      this._audit(project_id, cmd, v.veredicto, false);
      return this._resp(202, { ok: false, veredicto: v.veredicto, aprobacion_id, motivo: v.motivo, instruccion: 'pide el visto bueno al usuario y reintenta con confirmado:true (NO en bucle)' });
    }

    // permitido | allowlist | aprobado → ejecutar
    const timeout = Math.min(Number(timeout_ms) || this.defaultTimeoutMs, this.maxTimeoutMs);
    const dir = this._resolverCwd(project_id, cwd);
    const modo = aislamiento === 'contenedor' ? 'contenedor' : 'local';

    // aislamiento=contenedor pero docker no está → degrada HONESTO (503), NO cae a local en
    // silencio: sería saltarse la contención que se pidió (Hermes: no simular un sandbox que no hay).
    if (modo === 'contenedor' && !this.dockerOk) {
      this._audit(project_id, cmd, 'aislamiento_no_disponible', false, undefined, undefined, 'contenedor');
      return this._resp(503, { ok: false, veredicto: 'aislamiento_no_disponible', motivo: 'se pidió aislamiento=contenedor pero docker no está en el host; NO se ejecuta en local en silencio' });
    }

    const t0 = Date.now();
    const res = modo === 'contenedor'
      ? await this._ejecutarContenedor(cmd, dir, timeout)
      : await this._ejecutarLocal(cmd, dir, timeout);
    const duracion_ms = Date.now() - t0;
    this._audit(project_id, cmd, v.veredicto, res.exit_code === 0, res.exit_code, duracion_ms, modo);
    return this._resp(200, {
      ok: res.exit_code === 0, veredicto: v.veredicto,
      stdout: res.stdout, stderr: res.stderr, exit_code: res.exit_code, duracion_ms, aislamiento: modo
    });
  }

  // ── el guard: determinista, orden exacto de Hermes ──
  _guard(cmd, { project_id, confirmado, recordar }) {
    if (!this.activo) return { veredicto: 'puerta_cerrada' };
    for (const re of HARDLINE) if (re.test(cmd)) return { veredicto: 'hardline', motivo: `comando catastrófico bloqueado (${re})` };
    if (this._matchAllowlist(cmd)) return { veredicto: 'allowlist' };
    const key = `${project_id}::${this._patron(cmd)}`;
    if (this.aprobadas.has(key)) return { veredicto: 'aprobado' };
    if (this._esPeligroso(cmd)) {
      if (confirmado) {
        if (recordar === 'session' || recordar === 'always') this.aprobadas.set(key, recordar);
        return { veredicto: 'aprobado' };
      }
      return { veredicto: 'pendiente_aprobacion', motivo: 'comando peligroso: requiere visto bueno del usuario' };
    }
    return { veredicto: 'permitido' };
  }

  _esPeligroso(cmd) { return PELIGROSO.some(re => re.test(cmd)); }
  _matchAllowlist(cmd) { return this.allowlist.some(re => re.test(cmd)); }
  _patron(cmd) { return cmd.split(/\s+/).slice(0, 2).join(' '); }   // p.ej. "npx skills" — la cache es por patrón, no por comando exacto

  _globToRe(glob) {
    const esc = String(glob).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp('^' + esc + '$', 'i');
  }

  _resolverCwd(project_id, cwd) {
    if (cwd && path.isAbsolute(cwd)) return cwd;
    const base = project_id ? path.join(process.cwd(), 'data', 'projects', String(project_id), 'storage') : process.cwd();
    const root = fs.existsSync(base) ? base : process.cwd();
    return cwd ? path.join(root, cwd) : root;
  }

  _ejecutarLocal(cmd, cwd, timeout) {
    return new Promise((resolve) => {
      exec(cmd, { cwd, timeout, maxBuffer: this.maxBuffer, shell: '/bin/bash' }, (err, stdout, stderr) => {
        const exit_code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
        const killed = err && err.killed ? '\n[ejecutor] timeout — proceso terminado' : '';
        resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') + killed, exit_code });
      });
    });
  }

  // ── AISLAMIENTO EN CONTENEDOR (la contención real): docker run efímero, sin privilegios,
  // con límites. El workspace del proyecto se monta en /work. Red ABIERTA (defuddle y demás
  // necesitan fetch) — la contención es fs + caps + pids + memoria, no red. HONESTO: si docker
  // no está, _ejecutar ya devolvió 503 (no se llega aquí). ──
  _ejecutarContenedor(cmd, cwd, timeout) {
    const args = [
      'run', '--rm', '-i',
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      '--pids-limit', String(this.contenedorPidsLimit),
      '--memory', String(this.contenedorMemoria),
      '-v', `${cwd}:/work`, '-w', '/work',
      this.contenedorImagen, 'bash', '-lc', cmd
    ];
    return new Promise((resolve) => {
      execFile('docker', args, { timeout, maxBuffer: this.maxBuffer }, (err, stdout, stderr) => {
        const exit_code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
        const killed = err && err.killed ? '\n[ejecutor] timeout — contenedor terminado' : '';
        resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') + killed, exit_code });
      });
    });
  }

  // best-effort: ¿docker responde en este host? (una vez, en onLoad). Stubbable en test.
  _probarDocker() {
    try { execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 4000, stdio: 'ignore' }); return true; }
    catch (_) { return false; }
  }

  _emitirPendiente(aprobacion_id, project_id, command, motivo) {
    try {
      this.eventBus.publish('ejecutor.aprobacion.pendiente', {
        aprobacion_id, project_id: project_id || null, command, motivo, timestamp: new Date().toISOString()
      });
    } catch (_) { /* best-effort */ }
  }

  // audit → propiocepción lo capta (ningún acto invisible)
  _audit(project_id, command, veredicto, ok, exit_code, duracion_ms, aislamiento = 'local') {
    try {
      this.eventBus.publish('ejecutor.invocado', {
        project_id: project_id || null, command, veredicto, ok: !!ok,
        ...(exit_code !== undefined ? { exit_code } : {}),
        ...(duracion_ms !== undefined ? { duracion_ms } : {}),
        aislamiento, timestamp: new Date().toISOString()
      });
      this.metrics?.increment('ejecutor.invocado.total', { veredicto });
    } catch (_) { /* best-effort */ }
  }

  _resp(status, data) { return { status, data }; }
  _id() { return require('crypto').randomBytes(6).toString('hex'); }
}

const DEFAULT_ALLOWLIST = [
  'defuddle *', 'npx skills *', 'npx defuddle *',
  'node *', 'python *', 'python3 *',
  'ls *', 'ls', 'cat *', 'head *', 'tail *', 'wc *', 'grep *', 'find *', 'echo *', 'pwd'
];

module.exports = EjecutorModule;
