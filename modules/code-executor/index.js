'use strict';

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const crypto = require('crypto');

class CodeExecutorModule {
  constructor() {
    this.name = 'code-executor';
    this.version = '2.0.0';
    this.logger = null;
    this.eventBus = null;
    this.metrics = null;
    this.config = null;
    this.blockedPatterns = [];
    this.processes = new Map();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.eventBus = core.eventBus;
    this.metrics = core.metrics;
    this.config = core.moduleConfig || {};
    this.blockedPatterns = (this.config.blockedPatterns || []).map(p => new RegExp(p, 'i'));

    this.logger.info('code-executor.loaded', {
      max_timeout: this.config.maxTimeout,
      max_processes: this.config.maxProcesses,
      blocked_commands: this.config.blockedCommands?.length || 0,
      blocked_patterns: this.blockedPatterns.length
    });
  }

  async onUnload() {
    const count = this.processes.size;
    for (const [, info] of this.processes.entries()) {
      try { info.process.kill('SIGTERM'); } catch (_) {}
    }
    this.processes.clear();
    this.logger.info('code-executor.unloaded', { processes_killed: count });
  }

  // ==========================================
  // Subscribe handlers
  // ==========================================

  async onExecRequest(payload) {
    const { command, cwd, timeout, env } = payload || {};
    return this.handleToolExec({ command, cwd, timeout, env }, payload);
  }

  // ==========================================
  // Tool handlers
  // ==========================================

  async handleToolExec(args, opts) {
    const { command, cwd, timeout, env } = args || {};

    if (!command) {
      return this._errorResponse(400, 'INVALID_INPUT', 'command is required', { field: 'command' });
    }

    const safety = this._checkCommandSafe(command);
    if (!safety.safe) {
      this.logger.warn('code-executor.exec.blocked', {
        command: command.substring(0, 100),
        reason: safety.reason
      });
      this.metrics?.increment('code-executor.exec.blocked', 1, { code: 'PERMISSION_DENIED', kind: 'domain' });
      return this._errorResponse(403, 'PERMISSION_DENIED', 'Command blocked for security reasons', { reason: safety.reason });
    }

    const execTimeout = Math.min(
      timeout || this.config.defaultTimeout || 30000,
      this.config.maxTimeout || 300000
    );
    const execCwd = cwd || process.cwd();

    this.logger.info('code-executor.exec.start', {
      command: command.substring(0, 100),
      cwd: execCwd,
      timeout: execTimeout
    });
    this.metrics?.increment('code-executor.exec.total', 1);

    const startTime = Date.now();

    return new Promise((resolve) => {
      exec(command, {
        cwd: execCwd,
        timeout: execTimeout,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, ...(env || {}) },
        shell: this.config.shell || '/bin/sh'
      }, async (error, stdout, stderr) => {
        const duration = Date.now() - startTime;
        const exitCode = error?.code || 0;
        const killed = error?.killed || false;
        const signal = error?.signal || null;

        if (killed || signal === 'SIGTERM') {
          this.logger.warn('code-executor.exec.timeout', {
            command: command.substring(0, 100),
            timeout: execTimeout
          });
          this.metrics?.increment('code-executor.exec.timeout', 1, { kind: 'infrastructure' });
          await this._publicarEvento('shell.error', {
            command: command.substring(0, 100),
            error_code: 'TIMEOUT',
            timeout: execTimeout
          }, opts);
          resolve(this._errorResponse(504, 'TIMEOUT', 'Command timed out', {
            timeout: execTimeout,
            stdout: stdout?.toString() || '',
            stderr: stderr?.toString() || ''
          }));
          return;
        }

        if (error && exitCode !== 0) {
          this.logger.warn('code-executor.exec.nonzero', {
            command: command.substring(0, 100),
            exitCode,
            duration
          });
          this.metrics?.increment('code-executor.exec.error', 1);
          await this._publicarEvento('shell.error', {
            command: command.substring(0, 100),
            exitCode,
            stderr: stderr?.toString().substring(0, 500)
          }, opts);
          resolve({
            status: 200,
            data: {
              exitCode,
              stdout: stdout?.toString() || '',
              stderr: stderr?.toString() || '',
              duration
            }
          });
          return;
        }

        this.logger.info('code-executor.exec.success', {
          command: command.substring(0, 100),
          exitCode: 0,
          duration,
          stdout_length: stdout?.length || 0
        });
        this.metrics?.increment('code-executor.exec.success', 1);
        await this._publicarEvento('shell.executed', {
          command: command.substring(0, 100),
          exitCode: 0,
          duration
        }, opts);
        resolve({
          status: 200,
          data: {
            exitCode: 0,
            stdout: stdout?.toString() || '',
            stderr: stderr?.toString() || '',
            duration
          }
        });
      });
    });
  }

  async handleToolScript(args, opts) {
    const { projectId, scriptPath, args: scriptArgs = [], timeout } = args || {};

    if (!projectId) {
      return this._errorResponse(400, 'INVALID_INPUT', 'projectId is required', { field: 'projectId' });
    }
    if (!scriptPath) {
      return this._errorResponse(400, 'INVALID_INPUT', 'scriptPath is required', { field: 'scriptPath' });
    }

    try {
      const projectPath = await this._getProjectPath(projectId);
      const fullScriptPath = path.join(projectPath, scriptPath);
      const resolvedScript = path.resolve(fullScriptPath);

      if (!resolvedScript.startsWith(projectPath)) {
        return this._errorResponse(403, 'PERMISSION_DENIED', 'Script path outside project directory');
      }

      try {
        await fs.access(resolvedScript, fsSync.constants.R_OK);
      } catch {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Script not found: ${scriptPath}`, {
          entity_type: 'script',
          entity_id: scriptPath
        });
      }

      const ext = path.extname(scriptPath).toLowerCase();
      let interpreter;

      switch (ext) {
        case '.sh': case '.bash': interpreter = 'bash'; break;
        case '.py': interpreter = 'python3'; break;
        case '.js': case '.mjs': interpreter = 'node'; break;
        case '.rb': interpreter = 'ruby'; break;
        case '.pl': interpreter = 'perl'; break;
        default: {
          try {
            const content = await fs.readFile(resolvedScript, 'utf-8');
            const firstLine = content.split('\n')[0];
            interpreter = firstLine.startsWith('#!') ? firstLine.slice(2).trim() : 'bash';
          } catch {
            interpreter = 'bash';
          }
        }
      }

      const argsStr = scriptArgs.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ');
      const command = `${interpreter} "${resolvedScript}" ${argsStr}`.trim();

      return this.handleToolExec({ command, cwd: projectPath, timeout: timeout || 60000 }, opts);

    } catch (error) {
      return this._handleHandlerError('code-executor.script.failed', error, 'script');
    }
  }

  async handleToolBackground(args, opts) {
    const { command, cwd, name } = args || {};

    if (!command) {
      return this._errorResponse(400, 'INVALID_INPUT', 'command is required', { field: 'command' });
    }

    const maxProcesses = this.config.maxProcesses || 10;
    if (this.processes.size >= maxProcesses) {
      this.metrics?.increment('code-executor.background.errors', 1, { code: 'QUOTA_EXCEEDED', kind: 'domain' });
      return this._errorResponse(429, 'QUOTA_EXCEEDED', 'Maximum background processes reached', {
        limit: maxProcesses,
        active: this.processes.size
      });
    }

    const safety = this._checkCommandSafe(command);
    if (!safety.safe) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'Command blocked for security reasons', { reason: safety.reason });
    }

    const processName = name || `proc-${Date.now()}`;
    const execCwd = cwd || process.cwd();

    this.logger.info('code-executor.background.start', {
      name: processName,
      command: command.substring(0, 100),
      cwd: execCwd
    });

    try {
      const child = spawn(command, [], {
        cwd: execCwd,
        shell: this.config.shell || '/bin/sh',
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env
      });

      let stdout = '';
      let stderr = '';
      const maxBuffer = 100 * 1024;

      child.stdout?.on('data', (data) => {
        if (stdout.length < maxBuffer) stdout += data.toString();
      });
      child.stderr?.on('data', (data) => {
        if (stderr.length < maxBuffer) stderr += data.toString();
      });

      this.processes.set(processName, {
        process: child,
        command,
        cwd: execCwd,
        startedAt: new Date().toISOString(),
        pid: child.pid,
        getOutput: () => ({ stdout, stderr })
      });

      child.on('exit', async (code, signal) => {
        this.logger.info('code-executor.background.exit', {
          name: processName,
          pid: child.pid,
          code,
          signal
        });
        await this._publicarEvento('shell.process.stopped', {
          name: processName,
          pid: child.pid,
          exitCode: code,
          signal
        }, opts);
        this.processes.delete(processName);
      });

      await this._publicarEvento('shell.process.started', {
        name: processName,
        pid: child.pid,
        command: command.substring(0, 100)
      }, opts);

      return {
        status: 200,
        data: {
          name: processName,
          pid: child.pid,
          command: command.substring(0, 100)
        }
      };

    } catch (error) {
      return this._handleHandlerError('code-executor.background.failed', error, 'background');
    }
  }

  async handleToolKill(args) {
    const { pid, name } = args || {};

    if (!pid && !name) {
      return this._errorResponse(400, 'INVALID_INPUT', 'Either pid or name is required');
    }

    let processInfo = null;
    let processKey = null;

    if (name) {
      processInfo = this.processes.get(name);
      processKey = name;
    } else {
      for (const [key, info] of this.processes.entries()) {
        if (info.pid === pid) {
          processInfo = info;
          processKey = key;
          break;
        }
      }
    }

    if (!processInfo) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Process not found', {
        entity_type: 'process',
        entity_id: name || String(pid)
      });
    }

    try {
      processInfo.process.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 500));
      if (!processInfo.process.killed) {
        processInfo.process.kill('SIGKILL');
      }
      const output = processInfo.getOutput?.() || {};
      this.logger.info('code-executor.kill.success', { name: processKey, pid: processInfo.pid });
      this.processes.delete(processKey);

      return {
        status: 200,
        data: {
          name: processKey,
          pid: processInfo.pid,
          stdout: output.stdout?.substring(0, 5000) || '',
          stderr: output.stderr?.substring(0, 5000) || ''
        }
      };

    } catch (error) {
      return this._handleHandlerError('code-executor.kill.failed', error, 'kill');
    }
  }

  async handleToolList() {
    const processes = [];
    for (const [name, info] of this.processes.entries()) {
      processes.push({
        name,
        pid: info.pid,
        command: info.command.substring(0, 100),
        cwd: info.cwd,
        startedAt: info.startedAt,
        running: !info.process.killed
      });
    }
    return {
      status: 200,
      data: {
        processes,
        count: processes.length,
        limit: this.config.maxProcesses || 10
      }
    };
  }

  // ==========================================
  // Domain helper
  // ==========================================

  _checkCommandSafe(command) {
    if (!command || typeof command !== 'string') {
      return { safe: false, reason: 'Invalid command' };
    }
    const normalized = command.trim().toLowerCase();
    for (const blocked of (this.config.blockedCommands || [])) {
      if (normalized.includes(blocked.toLowerCase())) {
        return { safe: false, reason: `Blocked command: ${blocked}` };
      }
    }
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(command)) {
        return { safe: false, reason: `Matches blocked pattern: ${pattern.source}` };
      }
    }
    return { safe: true };
  }

  async _getProjectPath(projectId) {
    if (!projectId) return process.cwd();
    const projectsRoot = path.resolve(this.config.projectsPath || './data/projects');
    const resolved = path.resolve(path.join(projectsRoot, projectId));
    if (!resolved.startsWith(projectsRoot)) {
      const err = new Error('Path traversal detected');
      err._code = 'PERMISSION_DENIED';
      throw err;
    }
    return resolved;
  }

  // ==========================================
  // Helpers POC2 canonicos (5)
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details && typeof details === 'object') error.details = details;
    return { status, error };
  }

  _handleHandlerError(logEvent, err, kind) {
    const code = err._code || this._classifyHandlerError(err);
    const status = code === 'INVALID_INPUT' ? 400
      : code === 'RESOURCE_NOT_FOUND' ? 404
      : code === 'PERMISSION_DENIED' ? 403
      : code === 'TIMEOUT' ? 504
      : code === 'QUOTA_EXCEEDED' ? 429
      : 500;
    const message = err.message || String(err);
    const isInfra = status >= 500;
    this.logger[isInfra ? 'error' : 'warn'](logEvent, { error: message, code });
    this.metrics?.increment('code-executor.errors', 1, { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation')) return 'INVALID_INPUT';
    if (msg.includes('permission') || msg.includes('blocked') || msg.includes('traversal')) return 'PERMISSION_DENIED';
    if (msg.includes('timeout') || msg.includes('timed out')) return 'TIMEOUT';
    return 'UNKNOWN_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...payload
    };
    await this.eventBus?.publish(name, enriched);
  }
}

module.exports = CodeExecutorModule;
