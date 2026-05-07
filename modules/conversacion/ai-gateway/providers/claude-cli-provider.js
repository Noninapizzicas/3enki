/**
 * Claude CLI Provider
 *
 * Usa Claude Code CLI como subprocess para aprovechar la suscripcion
 * Pro/Max sin consumir tokens de API.
 *
 * Modo: claude --print --output-format stream-json --verbose
 *
 * Ventajas:
 *   - Sin coste adicional por tokens (incluido en suscripcion)
 *   - Acceso a tools nativos de Claude Code (Read, Edit, Bash, Glob, Grep)
 *   - Streaming real via stdout del proceso
 *
 * Limitaciones:
 *   - Rate limits de la suscripcion
 *   - Latencia de spawn del proceso
 *   - No soporta tool_calls custom del ai-gateway (usa sus propios tools)
 *
 * @version 1.1.0
 */

const { spawn } = require('child_process');
const BaseProvider = require('./base-provider');

class ClaudeCliProvider extends BaseProvider {
  constructor(config, logger, credentialResolver) {
    super(config, logger, credentialResolver);
    this.name = 'claude-cli';
    this.cliPath = config.cli_path || 'claude';
    this.cliAvailable = false;

    // Track active processes for cleanup
    this.activeProcesses = new Set();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async configure() {
    this.cliAvailable = await this.checkCliAvailable();

    if (this.cliAvailable) {
      // Claude CLI usa autenticacion propia (suscripcion), no API key
      this.apiKey = 'cli-subscription';
      this.logger.info('claude-cli.initialized', {
        cli_path: this.cliPath,
        available: true
      });
    } else {
      this.logger.warn('claude-cli.not_available', {
        cli_path: this.cliPath,
        hint: 'Claude Code CLI not found. Install from https://claude.ai/code'
      });
    }
  }

  async checkCliAvailable() {
    return new Promise((resolve) => {
      const proc = spawn(this.cliPath, ['--version'], {
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      proc.stdout.on('data', (d) => { output += d.toString(); });

      proc.on('close', (code) => {
        if (code === 0 && output.includes('Claude Code')) {
          this.logger.info('claude-cli.version', { version: output.trim() });
          resolve(true);
        } else {
          resolve(false);
        }
      });

      proc.on('error', () => resolve(false));
    });
  }

  refreshApiKeyFromEnv() {
    if (this.cliAvailable) {
      this.apiKey = 'cli-subscription';
    }
  }

  async isAvailable() {
    return this.cliAvailable && this.config.enabled;
  }

  // ==========================================
  // Chat Completion (non-streaming)
  // ==========================================

  async chatCompletion(messages, options = {}) {
    const prompt = this.messagesToPrompt(messages);
    const systemPrompt = this.extractSystemPrompt(messages);
    const args = this.buildCliArgs(options, systemPrompt, 'json');

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const proc = this.spawnCli(args, prompt, options);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        this.activeProcesses.delete(proc);
        const duration = Date.now() - startTime;

        if (code !== 0) {
          this.logger.error('claude-cli.error', { code, stderr: stderr.slice(0, 500) });
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr.slice(0, 200)}`));
          return;
        }

        const parsed = this.parseJsonOutput(stdout);

        resolve({
          provider: 'claude-cli',
          model: parsed.model || options.model || this.config.default_model || 'claude-cli',
          content: parsed.content,
          tool_calls: null,
          usage: parsed.usage,
          cost: parsed.cost,
          finish_reason: parsed.stop_reason || 'stop',
          latency_ms: duration
        });
      });

      proc.on('error', (error) => {
        this.activeProcesses.delete(proc);
        reject(new Error(`Claude CLI spawn error: ${error.message}`));
      });
    });
  }

  // ==========================================
  // Chat Completion (streaming)
  // ==========================================

  async chatCompletionStream(messages, options = {}) {
    const prompt = this.messagesToPrompt(messages);
    const systemPrompt = this.extractSystemPrompt(messages);
    // stream-json requiere --verbose
    const args = this.buildCliArgs(options, systemPrompt, 'stream-json');

    const startTime = Date.now();
    let fullContent = '';
    let lastResult = null;

    return new Promise((resolve, reject) => {
      const proc = this.spawnCli(args, prompt, options);

      let stderr = '';
      let lineBuffer = '';

      proc.stdout.on('data', (data) => {
        lineBuffer += data.toString();

        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop(); // Ultima linea incompleta vuelve al buffer

        for (const line of lines) {
          this.processStreamLine(line, options.onChunk, (text) => {
            fullContent += text;
          }, (result) => {
            lastResult = result;
          });
        }
      });

      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        this.activeProcesses.delete(proc);

        // Procesar lo que quede en el buffer
        if (lineBuffer.trim()) {
          this.processStreamLine(lineBuffer, options.onChunk, (text) => {
            fullContent += text;
          }, (result) => {
            lastResult = result;
          });
        }

        const duration = Date.now() - startTime;

        if (code !== 0 && !fullContent) {
          this.logger.error('claude-cli.stream.error', { code, stderr: stderr.slice(0, 500) });
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr.slice(0, 200)}`));
          return;
        }

        // Usar usage real del CLI si esta disponible
        const usage = lastResult?.usage || {
          input_tokens: this.countTokens(prompt),
          output_tokens: this.countTokens(fullContent),
          total_tokens: this.countTokens(prompt) + this.countTokens(fullContent)
        };

        resolve({
          provider: 'claude-cli',
          model: lastResult?.model || options.model || this.config.default_model || 'claude-cli',
          content: fullContent || lastResult?.result || '',
          tool_calls: null,
          usage,
          cost: lastResult?.cost || 0,
          finish_reason: lastResult?.stop_reason || 'stop',
          latency_ms: duration
        });
      });

      proc.on('error', (error) => {
        this.activeProcesses.delete(proc);
        reject(new Error(`Claude CLI spawn error: ${error.message}`));
      });
    });
  }

  // ==========================================
  // Process Management
  // ==========================================

  /**
   * Spawn CLI process. Usa stdin para el prompt (evita limites de ARG_MAX
   * del OS cuando el prompt es largo).
   */
  spawnCli(args, prompt, options) {
    const proc = spawn(this.cliPath, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, CLAUDE_CODE_SIMPLE: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.activeProcesses.add(proc);

    // Enviar prompt por stdin en vez de como argumento
    // Esto evita el limite ARG_MAX del OS (~128KB-2MB segun sistema)
    proc.stdin.write(prompt);
    proc.stdin.end();

    // Timeout manual (spawn timeout no es fiable en todas las versiones de Node)
    const timeout = options.timeout || 180000;
    const timer = setTimeout(() => {
      this.logger.warn('claude-cli.timeout', { timeout });
      proc.kill('SIGTERM');
    }, timeout);

    proc.on('close', () => clearTimeout(timer));

    return proc;
  }

  /**
   * Limpieza de procesos activos (llamado desde onUnload del modulo)
   */
  cleanup() {
    for (const proc of this.activeProcesses) {
      try {
        proc.kill('SIGTERM');
      } catch {
        // Proceso ya termino
      }
    }
    this.activeProcesses.clear();
  }

  // ==========================================
  // Helpers
  // ==========================================

  /**
   * Construye los argumentos del CLI.
   * El prompt NO va aqui — va por stdin.
   */
  buildCliArgs(options, systemPrompt, outputFormat) {
    const args = [
      '--print',
      '--output-format', outputFormat
    ];

    // stream-json requiere --verbose (el CLI lo exige)
    if (outputFormat === 'stream-json') {
      args.push('--verbose');
    }

    // Modelo
    const model = options.model || this.config.default_model;
    if (model) {
      args.push('--model', model);
    }

    // Tools permitidos
    if (this.config.allowed_tools && this.config.allowed_tools.length > 0) {
      args.push('--allowedTools', ...this.config.allowed_tools);
    }

    // System prompt
    if (systemPrompt) {
      args.push('--append-system-prompt', systemPrompt);
    }

    // Max budget
    if (options.max_budget_usd) {
      args.push('--max-budget-usd', String(options.max_budget_usd));
    }

    // No guardar sesion (cada request es independiente)
    args.push('--no-session-persistence');

    return args;
  }

  /**
   * Convierte el array de messages a un prompt texto para el CLI.
   * El CLI recibe un string, no formato de mensajes.
   */
  messagesToPrompt(messages) {
    if (!messages || messages.length === 0) return '';

    const parts = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue; // Se pasa via --append-system-prompt

      const content = typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
          : '';

      if (!content) continue;

      if (msg.role === 'assistant') {
        parts.push(`[Respuesta anterior del asistente]: ${content}`);
      } else if (msg.role === 'tool') {
        parts.push(`[Resultado de herramienta]: ${content}`);
      } else {
        parts.push(content);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Extrae el system prompt del array de messages
   */
  extractSystemPrompt(messages) {
    if (!messages) return null;
    const systemMsgs = messages.filter(m => m.role === 'system');
    if (systemMsgs.length === 0) return null;

    return systemMsgs.map(m =>
      typeof m.content === 'string' ? m.content : ''
    ).filter(Boolean).join('\n');
  }

  /**
   * Procesa una linea de stream-json del CLI.
   *
   * Formato real del CLI (verificado):
   *   {"type":"system","subtype":"init",...}
   *   {"type":"assistant","message":{"content":[{"type":"text","text":"..."}],...}}
   *   {"type":"rate_limit_event",...}
   *   {"type":"result","result":"...","total_cost_usd":...,"usage":{...}}
   */
  processStreamLine(line, onChunk, onText, onResult) {
    if (!line.trim()) return;

    try {
      const event = JSON.parse(line);

      // Mensaje del asistente — contiene content blocks
      if (event.type === 'assistant' && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === 'text' && block.text) {
            onText(block.text);
            if (onChunk) onChunk(block.text);
          }
        }
        return;
      }

      // Resultado final — contiene usage real y coste
      if (event.type === 'result') {
        const usage = event.usage || {};
        onResult({
          result: event.result || '',
          stop_reason: event.stop_reason || 'end_turn',
          cost: event.total_cost_usd || 0,
          model: event.modelUsage ? Object.keys(event.modelUsage)[0] : null,
          usage: {
            input_tokens: usage.input_tokens || 0,
            output_tokens: usage.output_tokens || 0,
            total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
            cache_read_input_tokens: usage.cache_read_input_tokens || 0,
            cache_creation_input_tokens: usage.cache_creation_input_tokens || 0
          }
        });
        return;
      }

      // system, rate_limit_event — ignorar silenciosamente
    } catch {
      // Linea no es JSON — ignorar (no añadir como contenido)
    }
  }

  /**
   * Parsea la salida JSON del CLI (modo --output-format json)
   *
   * Formato real verificado:
   * {"type":"result","subtype":"success","result":"Hola","total_cost_usd":0.047,
   *  "usage":{"input_tokens":3,"output_tokens":6,...},"stop_reason":"end_turn",...}
   */
  parseJsonOutput(stdout) {
    const trimmed = stdout.trim();

    try {
      const parsed = JSON.parse(trimmed);

      if (parsed.type === 'result') {
        const usage = parsed.usage || {};
        return {
          content: parsed.result || '',
          stop_reason: parsed.stop_reason || 'end_turn',
          cost: parsed.total_cost_usd || 0,
          model: parsed.modelUsage ? Object.keys(parsed.modelUsage)[0] : null,
          usage: {
            input_tokens: usage.input_tokens || 0,
            output_tokens: usage.output_tokens || 0,
            total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0)
          }
        };
      }

      return {
        content: parsed.result || parsed.content || trimmed,
        usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        cost: 0
      };
    } catch {
      return {
        content: trimmed,
        usage: {
          input_tokens: this.countTokens(trimmed),
          output_tokens: this.countTokens(trimmed),
          total_tokens: this.countTokens(trimmed) * 2
        },
        cost: 0
      };
    }
  }
}

module.exports = ClaudeCliProvider;
