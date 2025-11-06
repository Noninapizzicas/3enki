#!/usr/bin/env node

/**
 * Event Core - Main Entry Point
 *
 * Orchestrates initialization of all core components:
 * - MQTT Broker (Aedes)
 * - Event Bus
 * - Hook System
 * - Module Loader
 * - HTTP Gateway
 * - Observability
 *
 * Usage:
 *   node index.js [--port 3000] [--broker-port 1883] [--core-id mycore]
 *
 * Environment variables:
 *   EVENT_CORE_PORT=3000
 *   EVENT_CORE_BROKER_PORT=1883
 *   EVENT_CORE_ID=mycore
 *   EVENT_CORE_MODULES_PATH=./modules
 *   EVENT_CORE_LOG_LEVEL=info
 */

const path = require('path');
const fs = require('fs');

// Core components
const { MQTTClient } = require('./core/mqtt');
const EventBus = require('./core/events/bus');
const HookManager = require('./core/hooks');
const ModuleLoader = require('./core/modules/loader');
const ModuleRegistry = require('./core/modules/registry');
const HTTPGateway = require('./core/gateway/http');
const Discovery = require('./core/discovery');
const { Logger, Tracer, Metrics } = require('./core/observability');
const { loadConfig, getConfigValue } = require('./core/config');

// Port Management & Service Registry
const { ServiceRegistry } = require('./core/utils');

// Parse CLI args
function parseCLIArgs() {
  const args = process.argv.slice(2);
  const cliArgs = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      cliArgs.httpPort = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--broker-port' && args[i + 1]) {
      cliArgs.brokerPort = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--core-id' && args[i + 1]) {
      cliArgs.coreId = args[i + 1];
      i++;
    } else if (args[i] === '--modules-path' && args[i + 1]) {
      cliArgs.modulesPath = args[i + 1];
      i++;
    } else if (args[i] === '--log-level' && args[i + 1]) {
      cliArgs.logLevel = args[i + 1];
      i++;
    } else if (args[i] === '--config' && args[i + 1]) {
      cliArgs.configPath = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Event Core - Meta-Core Event-Driven Framework

Usage:
  node index.js [options]

Options:
  --config <path>         Path to config file (default: ./config.json)
  --port <port>           HTTP Gateway port (overrides config)
  --broker-port <port>    MQTT Broker port (overrides config)
  --core-id <id>          Core instance ID (overrides config)
  --modules-path <path>   Modules directory (overrides config)
  --log-level <level>     Log level: debug, info, warn, error (overrides config)
  --help, -h              Show this help message

Configuration Priority (highest to lowest):
  1. CLI arguments (--port, etc)
  2. Environment variables (EVENT_CORE_*)
  3. config.{NODE_ENV}.json (e.g., config.production.json)
  4. config.json

Environment Variables:
  NODE_ENV                Environment (development, production, etc)
  EVENT_CORE_PORT         HTTP Gateway port
  EVENT_CORE_BROKER_PORT  MQTT Broker port
  EVENT_CORE_ID           Core instance ID
  EVENT_CORE_MODULES_PATH Modules directory path
  EVENT_CORE_LOG_LEVEL    Log level

Examples:
  node index.js
  node index.js --port 3001 --core-id core-b
  NODE_ENV=production node index.js
  EVENT_CORE_LOG_LEVEL=debug node index.js
  node index.js --config /path/to/custom-config.json
      `);
      process.exit(0);
    }
  }

  return cliArgs;
}

// Main initialization
async function main() {
  // Parse CLI arguments
  const cliArgs = parseCLIArgs();

  // Load configuration
  const config = loadConfig({
    configPath: cliArgs.configPath,
    cliArgs
  });

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    EVENT CORE v0.2.0                       ║');
  console.log('║          Meta-Core Event-Driven Framework                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`📋 Configuration:`);
  console.log(`   Environment:    ${config.core.environment}`);
  console.log(`   Core ID:        ${config.core.id}`);
  console.log(`   HTTP Port:      ${config.http.port}`);
  console.log(`   Broker Port:    ${config.mqtt.broker.port}`);
  console.log(`   Modules Path:   ${config.modules.path}`);
  console.log(`   Log Level:      ${config.observability.logging.level}\n`);

  // Global state
  const core = {
    id: config.core.id,
    config,
    mqttClient: null,
    eventBus: null,
    hooks: null,
    moduleLoader: null,
    moduleRegistry: null,
    httpGateway: null,
    discovery: null,
    logger: null,
    tracer: null,
    metrics: null,
    serviceRegistry: null,
    heartbeatTimer: null
  };

  try {
    // ========================================================================
    // Step 1: Initialize Observability
    // ========================================================================
    console.log('🔍 [1/6] Initializing Observability...');

    core.logger = new Logger({
      level: config.observability.logging.level,
      outputs: config.observability.logging.outputs
    });

    core.tracer = new Tracer({
      service_name: `event-core-${config.core.id}`
    });

    core.metrics = new Metrics();

    core.logger.info('core.observability.initialized', {
      log_level: config.observability.logging.level,
      core_id: config.core.id
    });

    // ========================================================================
    // Step 2: Initialize MQTT Client (with embedded broker fallback)
    // ========================================================================
    console.log('📡 [2/6] Connecting to MQTT Broker...');

    core.mqttClient = new MQTTClient({
      brokerUrl: `mqtt://localhost:${config.mqtt.broker.port}`,
      coreId: config.core.id,
      brokerPort: config.mqtt.broker.port,
      logger: core.logger,
      metrics: core.metrics
    });

    await core.mqttClient.connect();

    const mqttStats = core.mqttClient.getStats();
    console.log(`   ✅ ${mqttStats.usingEmbedded ? 'Started embedded broker' : 'Connected to external broker'} on port ${config.mqtt.broker.port}`);

    core.logger.info('core.mqtt.connected', {
      using_embedded: mqttStats.usingEmbedded,
      port: config.mqtt.broker.port
    });

    // ========================================================================
    // Step 3: Initialize Hook System
    // ========================================================================
    console.log('🪝 [3/6] Initializing Hook System...');

    core.hooks = new HookManager({
      logger: core.logger
    });

    core.logger.info('core.hooks.initialized', {
      available_hooks: core.hooks.listHooks().length
    });

    // ========================================================================
    // Step 4: Initialize Event Bus
    // ========================================================================
    console.log('🔄 [4/6] Initializing Event Bus...');

    core.eventBus = new EventBus({
      coreId: config.core.id,
      mqtt: core.mqttClient,
      hooks: core.hooks,
      logger: core.logger,
      tracer: core.tracer,
      metrics: core.metrics
    });

    // Alias for modules that use core.events
    core.events = core.eventBus;

    core.logger.info('core.eventbus.initialized', {
      core_id: config.core.id
    });

    // ========================================================================
    // Step 5: Load Modules
    // ========================================================================
    console.log('📦 [5/6] Loading Modules...');

    const modulesPath = path.resolve(__dirname, config.modules.path);

    if (!fs.existsSync(modulesPath)) {
      core.logger.warn('core.modules.path_not_found', {
        path: modulesPath
      });
      console.log(`   ⚠️  Modules path not found: ${modulesPath}`);
      console.log(`   ℹ️  Continuing without modules...\n`);
    } else {
      // Create Module Registry
      core.moduleRegistry = new ModuleRegistry({
        logger: core.logger
      });

      // Create the core context that will be passed to modules
      const coreContext = {
        id: config.core.id,
        logger: core.logger,
        metrics: core.metrics,
        hooks: core.hooks,
        events: core.eventBus,  // Alias for EventBus (modules use core.events)
        eventBus: core.eventBus,
        tracer: core.tracer
      };

      core.moduleLoader = new ModuleLoader({
        modulesPath,
        core: coreContext,
        registry: core.moduleRegistry,
        logger: core.logger,
        metrics: core.metrics
      });

      await core.moduleLoader.loadAll();

      const loadedModules = core.moduleLoader.getLoadedModules();

      core.logger.info('core.modules.loaded', {
        count: loadedModules.length,
        modules: loadedModules.map(m => m.name)
      });

      console.log(`   ✅ Loaded ${loadedModules.length} module(s):`);
      loadedModules.forEach(mod => {
        console.log(`      - ${mod.name} v${mod.version}`);
      });
      console.log('');
    }

    // ========================================================================
    // Step 6: Initialize Service Registry & Allocate Port
    // ========================================================================
    console.log('📋 [6/8] Initializing Service Registry...');

    core.serviceRegistry = new ServiceRegistry({
      autocleanup: true
    });

    // Check if port is already specified or if we should auto-allocate
    let httpPort = config.http.port;

    // Auto-allocate port if using default and it might conflict
    if (!process.env.HTTP_PORT && !cliArgs.httpPort) {
      try {
        const autoPort = await core.serviceRegistry.findFreePort('EVENT_CORE');
        console.log(`   🔍 Auto-allocated port: ${autoPort}`);
        httpPort = autoPort;
      } catch (error) {
        core.logger.warn('core.registry.port_allocation_failed', {
          error: error.message,
          fallback: httpPort
        });
        console.log(`   ⚠️  Port auto-allocation failed, using configured port: ${httpPort}`);
      }
    }

    // ========================================================================
    // Step 7: Initialize Discovery System
    // ========================================================================
    console.log('🔍 [7/8] Initializing Discovery System...');

    const loadedModules = core.moduleLoader ? core.moduleLoader.getLoadedModules() : [];

    core.discovery = new Discovery({
      coreId: config.core.id,
      version: '0.2.0',
      port: httpPort, // Port is now allocated
      host: config.http.host || '0.0.0.0',
      modules: loadedModules.map(m => m.name),
      capabilities: {
        mqtt: true,
        http: true,
        embedded_broker: mqttStats.usingEmbedded
      },
      mqttClient: core.mqttClient,
      logger: core.logger,
      heartbeatInterval: 30000, // 30s
      aliveTimeout: 60000 // 1 min
    });

    // Start discovery
    await core.discovery.start();

    core.logger.info('core.discovery.initialized', {
      core_id: config.core.id,
      heartbeat_interval: 30000
    });

    console.log(`   ✅ Discovery system started`);
    console.log(`   📡 Publishing status to core/${config.core.id}/status\n`);

    // Pass discovery to dashboard module if loaded
    if (core.moduleLoader) {
      const dashboardModule = core.moduleLoader.getModule('dashboard');
      if (dashboardModule && dashboardModule.instance && typeof dashboardModule.instance.setDiscovery === 'function') {
        dashboardModule.instance.setDiscovery(core.discovery);
        core.logger.debug('core.discovery.passed_to_dashboard');
      }
    }

    // ========================================================================
    // Step 8: Start HTTP Gateway
    // ========================================================================
    console.log('🌐 [8/8] Starting HTTP Gateway...');

    core.httpGateway = new HTTPGateway({
      port: httpPort,
      coreId: config.core.id,
      registry: core.moduleRegistry,
      hooks: core.hooks,
      logger: core.logger,
      metrics: core.metrics,
      core: core  // Pass core for UI Gateway
    });

    await core.httpGateway.start();

    core.logger.info('core.gateway.started', {
      port: httpPort,
      core_id: config.core.id
    });

    // ========================================================================
    // Register Service in Registry & Update Discovery Port
    // ========================================================================
    const modules = core.moduleLoader ? core.moduleLoader.getLoadedModules() : [];

    core.serviceRegistry.register(config.core.id, 'EVENT_CORE', httpPort, {
      version: '0.2.0',
      pid: process.pid,
      modules: modules.map(m => m.name),
      mqtt_port: config.mqtt.broker.port,
      using_embedded_mqtt: mqttStats.usingEmbedded
    });

    // Start heartbeat timer (every 10 seconds)
    core.heartbeatTimer = setInterval(() => {
      core.serviceRegistry.heartbeat(config.core.id);
    }, 10000);

    core.logger.info('core.registry.registered', {
      core_id: config.core.id,
      port: httpPort
    });

    // ========================================================================
    // Startup Complete
    // ========================================================================
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                  ✅ CORE STARTED SUCCESSFULLY               ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('📍 Endpoints:');
    console.log(`   HTTP Gateway:   http://localhost:${httpPort}`);
    console.log(`   Admin UI:       http://localhost:${httpPort}/ui`);
    console.log(`   MQTT Broker:    mqtt://localhost:${config.mqtt.broker.port}`);
    console.log(`   Health Check:   http://localhost:${httpPort}/health\n`);

    console.log('🔧 Management:');
    console.log(`   View Status:    curl http://localhost:${httpPort}/stats`);
    console.log(`   List Modules:   curl http://localhost:${httpPort}/modules`);
    console.log(`   Shutdown:       Ctrl+C or SIGTERM\n`);

    console.log('📋 Service Registry:');
    console.log(`   Registered as:  ${config.core.id}`);
    console.log(`   Registry file:  ${core.serviceRegistry.registryFile}\n`);

    core.metrics.increment('core.startup.success');

    // ========================================================================
    // Graceful Shutdown
    // ========================================================================
    const shutdown = async (signal) => {
      console.log(`\n\n🛑 Received ${signal}, shutting down gracefully...\n`);

      core.logger.info('core.shutdown.initiated', { signal });

      try {
        // Step 1: Stop heartbeat timer
        if (core.heartbeatTimer) {
          clearInterval(core.heartbeatTimer);
          core.heartbeatTimer = null;
        }

        // Step 2: Unregister from Service Registry
        if (core.serviceRegistry) {
          console.log('   [1/6] Unregistering from Service Registry...');
          core.serviceRegistry.unregister(config.core.id);
          core.logger.info('core.registry.unregistered');
        }

        // Step 3: Stop HTTP Gateway
        if (core.httpGateway) {
          console.log('   [2/6] Stopping HTTP Gateway...');
          await core.httpGateway.stop();
          core.logger.info('core.gateway.stopped');
        }

        // Step 4: Unload Modules
        if (core.moduleLoader) {
          console.log('   [3/6] Unloading modules...');
          await core.moduleLoader.unloadAll();
          core.logger.info('core.modules.unloaded');
        }

        // Step 5: Stop Discovery System (antes de desconectar MQTT)
        if (core.discovery) {
          console.log('   [4/6] Stopping Discovery System...');
          await core.discovery.stop();
          core.logger.info('core.discovery.stopped');

          // Small delay to let MQTT process pending messages
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Step 6: Disconnect MQTT Client (also stops embedded broker if used)
        if (core.mqttClient) {
          console.log('   [5/6] Disconnecting MQTT Client...');
          await core.mqttClient.disconnect();
          core.logger.info('core.mqtt.disconnected');
        }

        console.log('\n✅ Shutdown complete. Goodbye!\n');
        process.exit(0);

      } catch (error) {
        console.error('\n❌ Error during shutdown:', error.message);
        core.logger.error('core.shutdown.error', { error: error.message }, error);
        process.exit(1);
      }
    };

    // Register signal handlers
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('\n💥 Uncaught Exception:', error);
      core.logger.error('core.uncaught_exception', { error: error.message }, error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('\n💥 Unhandled Rejection:', reason);
      core.logger.error('core.unhandled_rejection', { reason }, reason);
      shutdown('unhandledRejection');
    });

  } catch (error) {
    console.error('\n❌ Startup failed:', error.message);
    console.error(error.stack);

    if (core.logger) {
      core.logger.error('core.startup.failed', { error: error.message }, error);
    }

    process.exit(1);
  }
}

// Run
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { parseCLIArgs, loadConfig, main };
