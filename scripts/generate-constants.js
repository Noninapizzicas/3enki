#!/usr/bin/env node

/**
 * Generador de Constantes
 *
 * Lee todos los module.json y genera core/constants.js automáticamente.
 * Esto garantiza que las constantes siempre estén sincronizadas con los módulos.
 *
 * Uso:
 *   node scripts/generate-constants.js
 *   npm run generate:constants
 *
 * Beneficios:
 *   - Fuente única de verdad: module.json
 *   - Previene typos en nombres de eventos
 *   - Autocompletado en IDE
 *   - Validación en tiempo de carga
 */

const fs = require('fs');
const path = require('path');

// Paths
const MODULES_PATH = path.join(process.cwd(), 'modules');
const OTROS_MODULES_PATH = path.join(process.cwd(), 'otros-modulos', 'modules');
const OUTPUT_PATH = path.join(process.cwd(), 'core', 'constants.js');

// Collected data
const events = {};
const apiRoutes = {};
const moduleList = [];

/**
 * Convierte nombre de evento a nombre de constante
 * 'tool.call.request' -> 'CALL_REQUEST'
 */
function eventToConstant(eventName) {
  const parts = eventName.split('.');
  // Quitar el primer segmento (dominio)
  const actionParts = parts.slice(1);
  return actionParts.join('_').toUpperCase();
}

/**
 * Convierte nombre de módulo a nombre de dominio
 * 'tool-orchestrator' -> 'TOOL'
 * 'credential-manager' -> 'CREDENTIAL'
 */
function moduleToDomain(moduleName) {
  // Mapeo especial para nombres comunes
  const mapping = {
    'tool-orchestrator': 'TOOL',
    'credential-manager': 'CREDENTIAL',
    'prompt-manager': 'PROMPT',
    'ai-gateway': 'AI',
    'ai-agent-framework': 'AGENT',
    'menu-generator': 'MENU',
    'plugin-manager': 'PLUGIN',
    'admin-panel': 'ADMIN',
    'calling-generator': 'CALLING',
    // Módulos de negocio
    'productos': 'PRODUCTO',
    'pedidos': 'PEDIDO',
    'cuentas': 'CUENTA',
    'cuentas-mesa': 'CUENTA_MESA',
    'cuentas-llevar': 'CUENTA_LLEVAR',
    'cuentas-telefono': 'CUENTA_TELEFONO',
    'cobros': 'COBRO',
    'cocina': 'COCINA',
    'categorias': 'CATEGORIA',
    'ingredientes': 'INGREDIENTE',
    'variaciones': 'VARIACION'
  };

  if (mapping[moduleName]) {
    return mapping[moduleName];
  }

  // Default: primera palabra en mayúsculas
  return moduleName.split('-')[0].toUpperCase();
}

/**
 * Extrae el dominio del nombre del evento
 * 'tool.call.request' -> 'TOOL'
 * 'menu-generator.conversation.created' -> 'MENU_GENERATOR'
 */
function getDomainFromEvent(eventName) {
  const domain = eventName.split('.')[0];
  // Evitar dominios inválidos como identificadores JS
  if (domain === '*') return 'WILDCARD';
  if (/^\d/.test(domain)) return '_' + domain.toUpperCase();
  // Convert hyphens to underscores for valid JS identifiers
  return domain.replace(/-/g, '_').toUpperCase();
}

/**
 * Procesa un module.json
 */
function processModuleJson(modulePath, moduleName) {
  const moduleJsonPath = path.join(modulePath, 'module.json');

  if (!fs.existsSync(moduleJsonPath)) {
    return null;
  }

  try {
    const moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf-8'));
    const moduleEvents = { publishes: [], subscribes: [] };

    // Extraer eventos de la sección "events"
    if (moduleJson.events) {
      if (moduleJson.events.publishes) {
        for (const pub of moduleJson.events.publishes) {
          const eventName = pub.event || pub.name;
          if (eventName) {
            moduleEvents.publishes.push(eventName);
          }
        }
      }
      if (moduleJson.events.subscribes) {
        for (const sub of moduleJson.events.subscribes) {
          const eventName = sub.event || sub.name;
          if (eventName) {
            moduleEvents.subscribes.push(eventName);
          }
        }
      }
    }

    // Extraer eventos de la sección "provides" (formato antiguo)
    if (moduleJson.provides) {
      if (moduleJson.provides.events) {
        for (const event of moduleJson.provides.events) {
          if (!moduleEvents.publishes.includes(event)) {
            moduleEvents.publishes.push(event);
          }
        }
      }
      if (moduleJson.provides.queries) {
        for (const query of moduleJson.provides.queries) {
          if (!moduleEvents.subscribes.includes(query)) {
            moduleEvents.subscribes.push(query);
          }
        }
      }
    }

    // Extraer APIs
    const moduleApis = [];
    if (moduleJson.apis) {
      for (const api of moduleJson.apis) {
        moduleApis.push({
          method: api.method,
          path: `/modules/${moduleName}${api.path}`,
          handler: api.handler
        });
      }
    }

    return {
      name: moduleName,
      version: moduleJson.version,
      description: moduleJson.description,
      events: moduleEvents,
      apis: moduleApis
    };

  } catch (error) {
    console.error(`Error parsing ${moduleJsonPath}: ${error.message}`);
    return null;
  }
}

/**
 * Escanea directorio de módulos
 */
function scanModules(basePath, label) {
  if (!fs.existsSync(basePath)) {
    console.log(`  [skip] ${label} no existe`);
    return;
  }

  const moduleDirs = fs.readdirSync(basePath, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  console.log(`  Escaneando ${label}: ${moduleDirs.length} módulos`);

  for (const moduleName of moduleDirs) {
    const modulePath = path.join(basePath, moduleName);
    const moduleData = processModuleJson(modulePath, moduleName);

    if (moduleData) {
      moduleList.push(moduleData);

      // Agrupar eventos por dominio
      const allEvents = [...moduleData.events.publishes, ...moduleData.events.subscribes];

      for (const eventName of allEvents) {
        const domain = getDomainFromEvent(eventName);
        const constName = eventToConstant(eventName);

        if (!events[domain]) {
          events[domain] = {};
        }
        events[domain][constName] = eventName;
      }

      // Agrupar APIs
      if (moduleData.apis.length > 0) {
        const domain = moduleToDomain(moduleName);
        if (!apiRoutes[domain]) {
          apiRoutes[domain] = { BASE: `/modules/${moduleName}` };
        }
        for (const api of moduleData.apis) {
          if (!api.handler) continue;
          const routeName = api.handler
            .replace('handle', '')
            .replace(/([A-Z])/g, '_$1')
            .toUpperCase()
            .replace(/^_/, '');
          apiRoutes[domain][routeName] = api.path;
        }
      }
    }
  }
}

/**
 * Genera el archivo constants.js
 */
function generateConstants() {
  const lines = [];

  lines.push(`/**
 * CONSTANTES CENTRALIZADAS DEL SISTEMA
 *
 * ⚠️  ARCHIVO AUTO-GENERADO - NO EDITAR MANUALMENTE
 *
 * Generado por: scripts/generate-constants.js
 * Fuente: module.json de cada módulo
 *
 * Para regenerar: npm run generate:constants
 *
 * Este archivo es la ÚNICA fuente de verdad para:
 * - Nombres de eventos MQTT
 * - Rutas de APIs HTTP
 */

// ============================================
// EVENTOS MQTT - Generados desde module.json
// ============================================

const EVENTS = {`);

  // Ordenar dominios
  const sortedDomains = Object.keys(events).sort();

  for (const domain of sortedDomains) {
    const domainEvents = events[domain];
    const sortedEvents = Object.keys(domainEvents).sort();

    lines.push(`  // === ${domain} ===`);
    lines.push(`  ${domain}: {`);

    for (const eventConst of sortedEvents) {
      lines.push(`    ${eventConst}: '${domainEvents[eventConst]}',`);
    }

    lines.push(`  },\n`);
  }

  lines.push(`};

// ============================================
// RUTAS DE APIs HTTP - Generadas desde module.json
// ============================================

const API_ROUTES = {`);

  // Ordenar dominios de API
  const sortedApiDomains = Object.keys(apiRoutes).sort();

  for (const domain of sortedApiDomains) {
    const routes = apiRoutes[domain];
    lines.push(`  ${domain}: {`);

    for (const [routeName, routePath] of Object.entries(routes)) {
      lines.push(`    ${routeName}: '${routePath}',`);
    }

    lines.push(`  },\n`);
  }

  lines.push(`};

// ============================================
// REGISTRO DE MÓDULOS
// ============================================

const MODULES = {`);

  for (const mod of moduleList) {
    lines.push(`  '${mod.name}': {`);
    lines.push(`    version: '${mod.version || '1.0.0'}',`);
    lines.push(`    events: {`);
    lines.push(`      publishes: [${mod.events.publishes.map(e => `'${e}'`).join(', ')}],`);
    lines.push(`      subscribes: [${mod.events.subscribes.map(e => `'${e}'`).join(', ')}],`);
    lines.push(`    },`);
    lines.push(`  },`);
  }

  lines.push(`};

// ============================================
// HELPERS
// ============================================

const HELPERS = {
  /**
   * Valida que un evento esté registrado
   * @param {string} eventName - Nombre del evento
   * @returns {boolean} true si el evento es válido
   */
  isValidEvent(eventName) {
    const domain = eventName.split('.')[0].toUpperCase();
    if (!EVENTS[domain]) return false;

    const constName = eventName.split('.').slice(1).join('_').toUpperCase();
    return EVENTS[domain][constName] === eventName;
  },

  /**
   * Obtiene todos los eventos de un dominio
   * @param {string} domain - Dominio (ej: 'TOOL')
   * @returns {string[]} Lista de eventos
   */
  getEventsByDomain(domain) {
    return EVENTS[domain] ? Object.values(EVENTS[domain]) : [];
  },

  /**
   * Obtiene todos los eventos registrados
   * @returns {string[]} Lista de todos los eventos
   */
  getAllEvents() {
    const all = [];
    for (const domain of Object.values(EVENTS)) {
      all.push(...Object.values(domain));
    }
    return all;
  },

  /**
   * Genera un request_id único
   * @returns {string} Request ID
   */
  generateRequestId() {
    return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
};

// ============================================
// EXPORTS
// ============================================

module.exports = {
  EVENTS,
  API_ROUTES,
  MODULES,
  HELPERS
};
`);

  return lines.join('\n');
}

/**
 * Main
 */
function main() {
  console.log('\n🔧 Generador de Constantes\n');
  console.log('='.repeat(50) + '\n');

  // Escanear módulos
  scanModules(MODULES_PATH, 'modules/');
  scanModules(OTROS_MODULES_PATH, 'otros-modulos/modules/');

  console.log(`\n📊 Resumen:`);
  console.log(`   Módulos: ${moduleList.length}`);
  console.log(`   Dominios de eventos: ${Object.keys(events).length}`);
  console.log(`   Total eventos: ${Object.values(events).reduce((sum, d) => sum + Object.keys(d).length, 0)}`);

  // Generar archivo
  const content = generateConstants();
  fs.writeFileSync(OUTPUT_PATH, content);

  console.log(`\n✅ Generado: ${OUTPUT_PATH}`);
  console.log(`   Tamaño: ${(content.length / 1024).toFixed(2)} KB\n`);

  // Listar eventos por dominio
  console.log('📋 Eventos por dominio:');
  for (const [domain, domainEvents] of Object.entries(events).sort()) {
    console.log(`   ${domain}: ${Object.keys(domainEvents).length} eventos`);
  }
  console.log('');
}

main();
