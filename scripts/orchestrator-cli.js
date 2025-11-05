#!/usr/bin/env node

/**
 * Orchestrator CLI - Interfaz de línea de comandos para Service Manager
 *
 * Comandos:
 * - start [service]    - Arranca todos los servicios o uno específico
 * - stop [service]     - Para todos los servicios o uno específico
 * - restart [service]  - Reinicia un servicio
 * - status             - Muestra estado de servicios
 * - list               - Lista servicios definidos
 *
 * @example
 * node scripts/orchestrator-cli.js start
 * node scripts/orchestrator-cli.js stop core-a
 * node scripts/orchestrator-cli.js status
 */

const path = require('path');
const { ServiceManager } = require('../core/orchestrator');
const { ServiceRegistry } = require('../core/utils');

// Cargar definiciones de servicios si existen
let serviceDefinitions = {};
try {
  const servicesPath = path.join(process.cwd(), 'config', 'services.js');
  serviceDefinitions = require(servicesPath);
} catch (error) {
  // No hay definiciones todavía, está bien
}

class OrchestratorCLI {
  constructor() {
    this.registry = new ServiceRegistry({ autocleanup: false });
    this.manager = new ServiceManager({ registry: this.registry });

    // Cargar definiciones
    for (const [id, definition] of Object.entries(serviceDefinitions)) {
      this.manager.define(id, definition);
    }
  }

  async start(serviceId = null) {
    try {
      if (serviceId) {
        console.log(`🚀 Starting ${serviceId}...\n`);
        const service = await this.manager.startService(serviceId);
        console.log(`\n✅ ${serviceId} started on port ${service.port}`);
      } else {
        console.log('🚀 Starting all services...\n');
        await this.manager.startAll();
      }
    } catch (error) {
      console.error(`\n❌ Failed to start: ${error.message}`);
      process.exit(1);
    }
  }

  async stop(serviceId = null) {
    try {
      if (serviceId) {
        console.log(`🛑 Stopping ${serviceId}...\n`);
        await this.manager.stopService(serviceId);
      } else {
        console.log('🛑 Stopping all services...\n');
        await this.manager.stopAll();
      }
    } catch (error) {
      console.error(`\n❌ Failed to stop: ${error.message}`);
      process.exit(1);
    }
  }

  async restart(serviceId) {
    if (!serviceId) {
      console.error('❌ Please specify a service to restart');
      console.error('Usage: node scripts/orchestrator-cli.js restart <service-id>');
      process.exit(1);
    }

    try {
      console.log(`🔄 Restarting ${serviceId}...\n`);
      const service = await this.manager.restartService(serviceId);
      console.log(`\n✅ ${serviceId} restarted on port ${service.port}`);
    } catch (error) {
      console.error(`\n❌ Failed to restart: ${error.message}`);
      process.exit(1);
    }
  }

  status() {
    this.manager.printStatus();
  }

  list() {
    console.log('\n📋 Defined Services\n');

    if (Object.keys(serviceDefinitions).length === 0) {
      console.log('No services defined');
      console.log('Create config/services.js to define services\n');
      return;
    }

    for (const [id, def] of Object.entries(serviceDefinitions)) {
      console.log(`• ${id}`);
      console.log(`  Type: ${def.type}`);
      console.log(`  Command: ${def.command} ${(def.args || []).join(' ')}`);
      if (def.dependsOn && def.dependsOn.length > 0) {
        console.log(`  Depends on: ${def.dependsOn.join(', ')}`);
      }
      console.log('');
    }
  }

  showHelp() {
    console.log(`
Event Core - Service Orchestrator CLI

Usage: node scripts/orchestrator-cli.js <command> [options]

Commands:
  start [service]     Start all services or a specific one
  stop [service]      Stop all services or a specific one
  restart <service>   Restart a specific service
  status              Show status of all services
  list                List all defined services
  help                Show this help

Examples:
  node scripts/orchestrator-cli.js start
  node scripts/orchestrator-cli.js start core-a
  node scripts/orchestrator-cli.js stop
  node scripts/orchestrator-cli.js restart core-a
  node scripts/orchestrator-cli.js status

Notes:
  - Services are defined in config/services.js
  - Use './scripts/services.sh' for easier access
`);
  }

  async run(args) {
    const command = args[0];
    const argument = args[1];

    switch (command) {
      case 'start':
        await this.start(argument);
        break;

      case 'stop':
        await this.stop(argument);
        break;

      case 'restart':
        await this.restart(argument);
        break;

      case 'status':
        this.status();
        break;

      case 'list':
        this.list();
        break;

      case 'help':
      case '--help':
      case '-h':
      case undefined:
        this.showHelp();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run "node scripts/orchestrator-cli.js help" for usage');
        process.exit(1);
    }
  }
}

// Main
if (require.main === module) {
  const cli = new OrchestratorCLI();
  cli.run(process.argv.slice(2)).catch(error => {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = OrchestratorCLI;
