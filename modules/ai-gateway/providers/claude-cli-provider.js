/**
 * Claude CLI Provider
 *
 * Usa Claude Code CLI como subprocess para aprovechar la suscripcion
 * Pro/Max sin consumir tokens de API.
 *
 * Modo: claude --print --output-format stream-json
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
 * @version 1.0.0
 */

const { spawn } = require('child_process');
const path = require('path');
const BaseProvider = require('./base-provider');

class ClaudeCliProvider extends BaseProvider {
  constructor(config, logger, credentialResolver) {
    super(config, logger, credentialResolver);
    this.name = 'claude-cli';
    this.cliPath = config.cli_path || 'claude';
    this.cliAvailable = false;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async initialize() {
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
    // Claude CLI no necesita API key — usa la sesion del usuario
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
    const args = this.buildCliArgs(options, 'json');

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const proc = spawn(this.cliPath, [...args, prompt], {
        cwd: options.cwd || process.cwd(),
        timeout: options.timeout || 180000,
        env: { ...process.env, CLAUDE_CODE_SIMPLE: '1' },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        const duration = Date.now() - startTime;

        if (code !== 0) {
          this.logger.error('claude-cli.error', { code, stderr: stderr.slice(0, 500) });
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr.slice(0, 200)}`));
          return;
        }

        try {
          const result = this.parseJsonOutput(stdout);
          const content = result.content || stdout.trim();
          const outputTokens = this.countTokens(content);
          const inputTokens = this.countTokens(prompt);

          resolve({
            provider: 'claude-cli',
            model: options.model || this.config.default_model || 'claude-cli',
            content,
            tool_calls: null,
            usage: {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              total_tokens: inputTokens + outputTokens
            },
            cost: 0, // Incluido en suscripcion
            finish_reason: 'stop',
            latency_ms: duration
          });
        } catch (parseError) {
          // Si no es JSON valido, tratar stdout como texto plano
          const content = stdout.trim();
          const outputTokens = this.countTokens(content);
          const inputTokens = this.countTokens(prompt);

          resolve({
            provider: 'claude-cli',
            model: options.model || this.config.default_model || 'claude-cli',
            content,
            tool_calls: null,
            usage: {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              total_tokens: inputTokens + outputTokens
            },
            cost: 0,
            finish_reason: 'stop',
            latency_ms: duration
          });
        }
      });

      proc.on('error', (error) => {
        reject(new Error(`Claude CLI spawn error: ${error.message}`));
      });
    });
  }

  // ==========================================
  // Chat Completion (streaming)
  // ==========================================

  async chatCompletionStream(messages, options = {}) {
    const prompt = this.messagesToPrompt(messages);
    const args = this.buildCliArgs(options, 'stream-json');

    const startTime = Date.now();
    let fullContent = '';

    return new Promise((resolve, reject) => {
      const proc = spawn(this.cliPath, [...args, prompt], {
        cwd: options.cwd || process.cwd(),
        timeout: options.timeout || 180000,
        env: { ...process.env, CLAUDE_CODE_SIMPLE: '1' },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderr = '';
      let lineBuffer = '';

      proc.stdout.on('data', (data) => {
        lineBuffer += data.toString();

        // Procesar lineas completas
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop(); // Ultima linea incompleta vuelve al buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const event = JSON.parse(line);
            const text = this.extractTextFromStreamEvent(event);

            if (text) {
              fullContent += text;
              if (options.onChunk) {
                options.onChunk(text);
              }
            }
          } catch {
            // Linea no es JSON — puede ser texto plano
            if (line.trim()) {
              fullContent += line;
              if (options.onChunk) {
                options.onChunk(line);
              }
            }
          }
        }
      });

      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        // Procesar lo que quede en el buffer
        if (lineBuffer.trim()) {
          try {
            const event = JSON.parse(lineBuffer);
            const text = this.extractTextFromStreamEvent(event);
            if (text) {
              fullContent += text;
              if (options.onChunk) {
                options.onChunk(text);
              }
            }
          } catch {
            if (lineBuffer.trim()) {
              fullContent += lineBuffer.trim();
              if (options.onChunk) {
                options.onChunk(lineBuffer.trim());
              }
            }
          }
        }

        const duration = Date.now() - startTime;

        if (code !== 0 && !fullContent) {
          this.logger.error('claude-cli.stream.error', { code, stderr: stderr.slice(0, 500) });
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr.slice(0, 200)}`));
          return;
        }

        const outputTokens = this.countTokens(fullContent);
        const inputTokens = this.countTokens(prompt);

        resolve({
          provider: 'claude-cli',
          model: options.model || this.config.default_model || 'claude-cli',
          content: fullContent,
          tool_calls: null,
          usage: {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            total_tokens: inputTokens + outputTokens
          },
          cost: 0,
          finish_reason: 'stop',
          latency_ms: duration
        });
      });

      proc.on('error', (error) => {
        reject(new Error(`Claude CLI spawn error: ${error.message}`));
      });
    });
  }

  // ==========================================
  // Helpers
  // ==========================================

  /**
   * Construye los argumentos del CLI
   */
  buildCliArgs(options, outputFormat) {
    const args = [
      '--print',
      '--output-format', outputFormat,
      '--bare'  // Sin hooks, LSP, ni auto-discovery
    ];

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
    const systemPrompt = this.extractSystemPrompt(options.messages || []);
    if (systemPrompt) {
      args.push('--append-system-prompt', systemPrompt);
    }

    // Max tokens (traducido a budget)
    if (options.max_budget_usd) {
      args.push('--max-budget-usd', String(options.max_budget_usd));
    }

    return args;
  }

  /**
   * Convierte el array de messages a un prompt texto para el CLI.
   * El CLI no acepta formato de mensajes — recibe un string.
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
        parts.push(`[Asistente anterior]: ${content}`);
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
    const systemMsgs = messages.filter(m => m.role === 'system');
    if (systemMsgs.length === 0) return null;

    return systemMsgs.map(m =>
      typeof m.content === 'string' ? m.content : ''
    ).join('\n');
  }

  /**
   * Extrae texto de un evento stream-json del CLI
   *
   * Formato stream-json de Claude Code:
   *   {"type":"assistant","message":{"type":"text","text":"..."}}
   *   {"type":"result","result":"...","cost_usd":...,"duration_ms":...}
   */
  extractTextFromStreamEvent(event) {
    if (!event) return null;

    // Mensaje de texto del asistente
    if (event.type === 'assistant' && event.message) {
      if (event.message.type === 'text' && event.message.text) {
        return event.message.text;
      }
    }

    // Resultado final
    if (event.type === 'result' && event.result) {
      // El resultado final ya fue streameado en chunks anteriores
      return null;
    }

    return null;
  }

  /**
   * Parsea la salida JSON del CLI (modo --output-format json)
   */
  parseJsonOutput(stdout) {
    const trimmed = stdout.trim();

    // Intentar parsear como JSON
    try {
      const parsed = JSON.parse(trimmed);
      // Formato: { result: "texto", cost_usd: 0, duration_ms: 1234, ... }
      if (parsed.result) {
        return { content: parsed.result };
      }
      return parsed;
    } catch {
      return { content: trimmed };
    }
  }
}

module.exports = ClaudeCliProvider;
