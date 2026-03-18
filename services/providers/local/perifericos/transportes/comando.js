/**
 * Transporte Comando — Pipe a un comando shell arbitrario
 *
 * Para CUPS, lp, scripts custom, o cualquier programa que
 * acepte datos por stdin.
 *
 * Config esperada:
 *   { comando: 'lp -d impresora-cocina' }
 *
 * Migrado desde modules/pizzepos/impresion/transporte.js (modo "comando")
 */

const { spawn } = require('child_process');
const TransporteBase = require('./base');
const { ESTADO } = require('./base');

class TransporteComando extends TransporteBase {
  constructor(config, logger) {
    super('comando', config, logger);
    this.config = {
      comando: null,
      timeout: 10000,
      ...config
    };
  }

  async conectar() {
    if (!this.config.comando) {
      this.estado = ESTADO.ERROR;
      return { ok: false, error: 'No se configuró comando' };
    }

    // Modo comando no necesita conexión persistente
    this.estado = ESTADO.CONECTADO;
    this.logger.info('transporte.comando.listo', { comando: this.config.comando });
    return { ok: true };
  }

  async enviar(datos, opciones) {
    const { comando, timeout } = this.config;
    if (!comando) {
      return { ok: false, error: 'No se configuró comando' };
    }

    const buffer = Buffer.isBuffer(datos) ? datos : Buffer.from(datos, 'binary');

    return new Promise((resolve) => {
      const proc = spawn('sh', ['-c', comando], { stdio: ['pipe', 'ignore', 'pipe'] });
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          proc.kill();
          resolve({ ok: false, error: `Timeout ejecutando comando (${timeout}ms)` });
        }
      }, timeout);

      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

      proc.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ ok: false, error: `Error ejecutando comando: ${err.message}` });
        }
      });

      proc.on('close', (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          if (code === 0) {
            this.logger.debug('transporte.comando.enviado', { bytes: buffer.length });
            resolve({ ok: true, bytes: buffer.length });
          } else {
            resolve({ ok: false, error: `Comando salió con código ${code}: ${stderr}` });
          }
        }
      });

      proc.stdin.write(buffer);
      proc.stdin.end();
    });
  }

  async getEstado() {
    return {
      conectado: this.estado === ESTADO.CONECTADO,
      tipo: this.tipo,
      estado: this.estado,
      info: {
        comando: this.config.comando
      }
    };
  }

  async desconectar() {
    this.estado = ESTADO.DESCONECTADO;
    this.logger.info('transporte.comando.desconectado');
  }
}

module.exports = TransporteComando;
