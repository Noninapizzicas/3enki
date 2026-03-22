/**
 * GatewayCMD — Traduce MQTT→comando shell.
 *
 * Para CUPS, lp, scripts custom.
 * Autodescubrimiento via lpstat (CUPS printers).
 *
 * Reutiliza: services/providers/local/perifericos/transportes/comando.js
 */

const GatewayBase = require('../base');

class GatewayCMD extends GatewayBase {
  constructor(config, deps) {
    super('cmd', config, deps);
  }

  _getProtocol() {
    return 'cmd';
  }

  async _createTransport(deviceConfig) {
    try {
      const TransporteComando = require('../../../services/providers/local/perifericos/transportes/comando');
      return new TransporteComando({
        comando: deviceConfig.command || deviceConfig.comando
      }, this.logger);
    } catch (err) {
      this.logger.warn('gateway.cmd.transport_load_error', { error: err.message });

      // Fallback: transporte simple con child_process
      const command = deviceConfig.command || deviceConfig.comando;
      if (!command) return null;

      const { exec } = require('child_process');
      return {
        tipo: 'comando',
        estado: 'conectado',

        async conectar() { return { ok: true }; },

        async enviar(datos) {
          return new Promise(resolve => {
            const child = exec(command, (err) => {
              if (err) resolve({ ok: false, error: err.message });
              else resolve({ ok: true, bytes: datos.length });
            });
            child.stdin.write(datos);
            child.stdin.end();
          });
        },

        async getEstado() {
          return { conectado: true, tipo: 'comando', estado: 'conectado', info: { command } };
        },

        async desconectar() { this.estado = 'desconectado'; }
      };
    }
  }

  /**
   * Autodescubrimiento: lista impresoras CUPS con lpstat.
   */
  async _discoverDevices() {
    if (!this.config.autodiscovery) return [];

    try {
      const { execSync } = require('child_process');
      const output = execSync('lpstat -a 2>/dev/null', {
        timeout: 5000,
        encoding: 'utf8'
      });

      const found = [];
      for (const line of output.split('\n')) {
        const match = line.match(/^(\S+)\s+accepting/i);
        if (match) {
          const printerName = match[1];
          found.push({
            device_id: `cups-${printerName}`,
            command: `lp -d ${printerName}`,
            nombre: printerName,
            type: 'impresora-termica',
            capabilities: ['imprimir'],
            metadata: { cups_name: printerName }
          });
        }
      }

      this.logger.info('gateway.cmd.autodiscovery.completed', { found: found.length });
      return found;
    } catch {
      this.logger.info('gateway.cmd.autodiscovery.cups_not_available');
      return [];
    }
  }
}

module.exports = GatewayCMD;
