/**
 * Plop Generator - Event Core Module Generator
 *
 * Generador interactivo para crear módulos Event-Core completos.
 *
 * Uso:
 *   npx plop module
 *   npm run plop
 *
 * @version 1.0.0
 */

module.exports = function (plop) {
  // Helpers personalizados
  plop.setHelper('snakeCase', (text) => {
    if (!text) return '';
    return text.replace(/\./g, '_').replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  });

  plop.setHelper('json', (obj) => {
    return JSON.stringify(obj, null, 2);
  });

  plop.setHelper('currentDate', () => {
    return new Date().toISOString().split('T')[0];
  });

  plop.setHelper('eq', (a, b) => a === b);

  // ==========================================
  // Generator: module
  // ==========================================
  plop.setGenerator('module', {
    description: 'Crear un nuevo módulo Event-Core completo',

    prompts: [
      {
        type: 'input',
        name: 'name',
        message: '📦 Nombre del módulo (kebab-case):',
        validate: (value) => {
          if (!value) return 'El nombre es requerido';
          if (!/^[a-z][a-z0-9-]*$/.test(value)) {
            return 'Usa kebab-case (ej: mi-modulo)';
          }
          return true;
        }
      },
      {
        type: 'input',
        name: 'description',
        message: '📝 Descripción del módulo:',
        default: 'Módulo Event-Core'
      },
      {
        type: 'input',
        name: 'author',
        message: '👤 Autor:',
        default: 'Event Core Team'
      },
      {
        type: 'confirm',
        name: 'ui',
        message: '🎨 ¿Incluir UI/Dashboard?',
        default: true
      },
      {
        type: 'input',
        name: 'icon',
        message: '🔸 Icono (emoji):',
        default: '📦',
        when: (answers) => answers.ui
      },
      {
        type: 'confirm',
        name: 'persistence',
        message: '💾 ¿Incluir persistencia JSON?',
        default: false
      },
      {
        type: 'input',
        name: 'publishEventsRaw',
        message: '📤 Eventos a publicar (separados por coma, ej: item.created,item.updated):',
        default: ''
      },
      {
        type: 'input',
        name: 'subscriptionsRaw',
        message: '📥 Eventos a escuchar (separados por coma, ej: *.created,other.event):',
        default: ''
      },
      {
        type: 'input',
        name: 'apisRaw',
        message: '🔌 APIs HTTP (formato: METHOD /path, separados por coma, ej: GET /items,POST /items,DELETE /items/:id):',
        default: 'GET /data'
      }
    ],

    actions: (data) => {
      // Procesar eventos publicados
      data.publishEvents = data.publishEventsRaw
        ? data.publishEventsRaw.split(',').map(e => e.trim()).filter(e => e)
        : [];

      // Procesar suscripciones
      data.subscriptions = data.subscriptionsRaw
        ? data.subscriptionsRaw.split(',').map(e => {
            const event = e.trim();
            const handler = 'on' + event
              .split('.')
              .map(part => part.charAt(0).toUpperCase() + part.slice(1))
              .join('')
              .replace(/\*/g, 'Any');
            return { event, handler };
          }).filter(s => s.event)
        : [];

      data.hasSubscriptions = data.subscriptions.length > 0;

      // Procesar APIs
      data.apis = data.apisRaw
        ? data.apisRaw.split(',').map(api => {
            const parts = api.trim().split(' ');
            const method = parts[0].toUpperCase();
            const path = parts[1] || '/';
            const pathParts = path.split('/').filter(p => p && !p.startsWith(':'));
            const handlerName = 'handle' + method.charAt(0) + method.slice(1).toLowerCase() +
              pathParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
            return {
              method,
              path,
              handler: handlerName || 'handleRequest',
              description: `${method} ${path}`
            };
          }).filter(a => a.method)
        : [];

      // Asegurar icon por defecto
      if (!data.icon) data.icon = '📦';

      const modulePath = `modules/${data.name}`;

      return [
        // Crear index.js
        {
          type: 'add',
          path: `${modulePath}/index.js`,
          templateFile: 'plop-templates/module/index.js.hbs'
        },
        // Crear module.json
        {
          type: 'add',
          path: `${modulePath}/module.json`,
          templateFile: 'plop-templates/module/module.json.hbs'
        },
        // Crear README.md
        {
          type: 'add',
          path: `${modulePath}/README.md`,
          templateFile: 'plop-templates/module/README.md.hbs'
        },
        // Crear schemas/events.json
        {
          type: 'add',
          path: `${modulePath}/schemas/events.json`,
          templateFile: 'plop-templates/module/schemas/events.json.hbs'
        },
        // Crear schemas/main.json (renombrado al nombre del módulo)
        {
          type: 'add',
          path: `${modulePath}/schemas/${data.name}.json`,
          templateFile: 'plop-templates/module/schemas/main.json.hbs'
        },
        // Mensaje final
        {
          type: 'add',
          path: `${modulePath}/.generated`,
          template: `Módulo generado el {{currentDate}}\nGenerador: plop module\n`
        },
        // Log
        () => {
          console.log('\n✅ Módulo creado exitosamente en:', modulePath);
          console.log('\n📁 Archivos generados:');
          console.log('   ├── index.js');
          console.log('   ├── module.json');
          console.log('   ├── README.md');
          console.log('   └── schemas/');
          console.log('       ├── events.json');
          console.log(`       └── ${data.name}.json`);
          console.log('\n🚀 Próximos pasos:');
          console.log('   1. Editar index.js con la lógica de negocio');
          console.log('   2. Ajustar schemas según necesidades');
          console.log('   3. Reiniciar el servidor: npm start');
          console.log(`   4. Probar: curl http://localhost:3000/modules/${data.name}/health\n`);
          return '';
        }
      ];
    }
  });

  // ==========================================
  // Generator: api (agregar API a módulo existente)
  // ==========================================
  plop.setGenerator('api', {
    description: 'Agregar una API HTTP a un módulo existente',

    prompts: [
      {
        type: 'input',
        name: 'moduleName',
        message: '📦 Nombre del módulo:',
        validate: (value) => value ? true : 'El nombre es requerido'
      },
      {
        type: 'list',
        name: 'method',
        message: '🔸 Método HTTP:',
        choices: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
      },
      {
        type: 'input',
        name: 'path',
        message: '🔸 Path (ej: /items/:id):',
        validate: (value) => value ? true : 'El path es requerido'
      },
      {
        type: 'input',
        name: 'description',
        message: '📝 Descripción:',
        default: 'Nuevo endpoint'
      }
    ],

    actions: (data) => {
      console.log('\n📝 Para agregar la API manualmente:');
      console.log('\n1. En module.json, agregar a "apis":');
      console.log(`   {`);
      console.log(`     "method": "${data.method}",`);
      console.log(`     "path": "${data.path}",`);
      console.log(`     "handler": "handleNew",`);
      console.log(`     "description": "${data.description}"`);
      console.log(`   }`);
      console.log('\n2. En index.js, agregar el handler:');
      console.log(`   async handleNew(req, context) {`);
      console.log(`     // TODO: Implementar`);
      console.log(`     return { status: 200, data: {} };`);
      console.log(`   }\n`);
      return [];
    }
  });

  // ==========================================
  // Generator: event (agregar evento a módulo)
  // ==========================================
  plop.setGenerator('event', {
    description: 'Agregar un evento a un módulo existente',

    prompts: [
      {
        type: 'input',
        name: 'moduleName',
        message: '📦 Nombre del módulo:',
        validate: (value) => value ? true : 'El nombre es requerido'
      },
      {
        type: 'list',
        name: 'type',
        message: '🔸 Tipo de evento:',
        choices: ['publish (publicar)', 'subscribe (escuchar)']
      },
      {
        type: 'input',
        name: 'eventName',
        message: '🔸 Nombre del evento (ej: item.created):',
        validate: (value) => value ? true : 'El nombre es requerido'
      }
    ],

    actions: (data) => {
      const isPublish = data.type.includes('publish');
      console.log(`\n📝 Para agregar el evento ${isPublish ? 'de publicación' : 'de suscripción'}:`);

      if (isPublish) {
        console.log('\n1. En module.json, agregar a "events.publishes":');
        console.log(`   {`);
        console.log(`     "event": "${data.eventName}",`);
        console.log(`     "description": "Descripción del evento"`);
        console.log(`   }`);
        console.log('\n2. En index.js, publicar con:');
        console.log(`   await this.eventBus.publish('${data.eventName}', { data }, { correlationId });\n`);
      } else {
        console.log('\n1. En module.json, agregar a "events.subscribes":');
        console.log(`   {`);
        console.log(`     "event": "${data.eventName}",`);
        console.log(`     "handler": "onEventHandler"`);
        console.log(`   }`);
        console.log('\n2. En index.js, agregar suscripción y handler.\n');
      }
      return [];
    }
  });

  // ==========================================
  // Generator: ui-component (Auto-UI)
  // ==========================================
  plop.setGenerator('ui-component', {
    description: 'Crear un componente Auto-UI',

    prompts: [
      {
        type: 'input',
        name: 'name',
        message: '🎨 Nombre del componente (kebab-case):',
        validate: (value) => {
          if (!value) return 'El nombre es requerido';
          if (!/^[a-z][a-z0-9-]*$/.test(value)) {
            return 'Usa kebab-case (ej: my-button)';
          }
          return true;
        }
      },
      {
        type: 'list',
        name: 'category',
        message: '📁 Categoría:',
        choices: ['core', 'layout', 'data', 'feedback', 'form', 'navigation', 'custom']
      },
      {
        type: 'checkbox',
        name: 'interactions',
        message: '👆 Interacciones:',
        choices: [
          { name: 'Click', value: 'click', checked: true },
          { name: 'Double click', value: 'double-click' },
          { name: 'Hold (mantener pulsado)', value: 'hold' },
          { name: 'Swipe (gestos táctiles)', value: 'swipe' },
          { name: 'Drag & Drop', value: 'drag' }
        ]
      },
      {
        type: 'confirm',
        name: 'hasVariants',
        message: '🎭 ¿Tiene variantes (primary, secondary, danger, etc)?',
        default: true
      }
    ],

    actions: (data) => {
      const componentPath = `auto-ui/components/${data.category}`;
      const jsPath = `auto-ui/client/js/components`;

      return [
        {
          type: 'add',
          path: `${componentPath}/{{name}}.json`,
          templateFile: 'plop-templates/ui-component/component.json.hbs'
        },
        {
          type: 'add',
          path: `${jsPath}/{{name}}.js`,
          templateFile: 'plop-templates/ui-component/component.js.hbs'
        },
        () => {
          console.log('\n✅ Componente UI creado exitosamente');
          console.log('\n📁 Archivos generados:');
          console.log(`   ├── ${componentPath}/${data.name}.json`);
          console.log(`   └── ${jsPath}/${data.name}.js`);
          console.log('\n🚀 Próximos pasos:');
          console.log(`   1. Personalizar ${data.name}.json con variantes y estados`);
          console.log(`   2. Ajustar ${data.name}.js con lógica específica`);
          console.log('   3. Importar el componente en auto-ui/client/js/core.js\n');
          return '';
        }
      ];
    }
  });

  // ==========================================
  // Generator: ui-view (Auto-UI)
  // ==========================================
  plop.setGenerator('ui-view', {
    description: 'Crear una vista Auto-UI para un módulo',

    prompts: [
      {
        type: 'input',
        name: 'moduleName',
        message: '📦 Nombre del módulo:',
        validate: (value) => value ? true : 'El nombre es requerido'
      },
      {
        type: 'list',
        name: 'viewType',
        message: '📄 Tipo de vista:',
        choices: [
          { name: 'Lista (tabla con acciones)', value: 'list' },
          { name: 'Detalle (vista de un registro)', value: 'detail' },
          { name: 'Formulario (crear/editar)', value: 'form' },
          { name: 'Dashboard (métricas y widgets)', value: 'dashboard' },
          { name: 'Personalizada', value: 'custom' }
        ]
      },
      {
        type: 'confirm',
        name: 'realtime',
        message: '⚡ ¿Actualización en tiempo real (SSE)?',
        default: true
      }
    ],

    actions: (data) => {
      const viewPath = `modules/${data.moduleName}/views`;

      return [
        {
          type: 'add',
          path: `${viewPath}/{{viewType}}.json`,
          templateFile: 'plop-templates/ui-view/view.json.hbs'
        },
        () => {
          console.log('\n✅ Vista UI creada exitosamente');
          console.log('\n📁 Archivo generado:');
          console.log(`   └── ${viewPath}/${data.viewType}.json`);
          console.log('\n🚀 Próximos pasos:');
          console.log('   1. Ajustar columnas/campos en el archivo generado');
          console.log('   2. Configurar acciones específicas');
          if (data.realtime) {
            console.log('   3. Verificar eventos de real-time en module.json');
          }
          console.log(`\n🔗 Acceder a la vista: /auto-ui/${data.moduleName}/${data.viewType}\n`);
          return '';
        }
      ];
    }
  });

  // ==========================================
  // Generator: ui-theme (Auto-UI)
  // ==========================================
  plop.setGenerator('ui-theme', {
    description: 'Crear un nuevo tema Auto-UI',

    prompts: [
      {
        type: 'input',
        name: 'name',
        message: '🎨 Nombre del tema:',
        validate: (value) => {
          if (!value) return 'El nombre es requerido';
          if (!/^[a-z][a-z0-9-]*$/.test(value)) {
            return 'Usa kebab-case (ej: my-theme)';
          }
          return true;
        }
      },
      {
        type: 'list',
        name: 'base',
        message: '📋 Basado en:',
        choices: [
          { name: 'Oscuro (dark)', value: 'dark' },
          { name: 'Claro (light)', value: 'light' },
          { name: 'Alto contraste', value: 'high-contrast' },
          { name: 'Desde cero', value: 'scratch' }
        ]
      }
    ],

    actions: (data) => {
      return [
        {
          type: 'add',
          path: `auto-ui/config/themes/{{name}}.json`,
          templateFile: 'plop-templates/ui-theme/theme.json.hbs'
        },
        () => {
          console.log('\n✅ Tema creado exitosamente');
          console.log('\n📁 Archivo generado:');
          console.log(`   └── auto-ui/config/themes/${data.name}.json`);
          console.log('\n🚀 Para activar el tema:');
          console.log(`   npm run ui:theme ${data.name}`);
          console.log('\n   O manualmente:');
          console.log(`   cp auto-ui/config/themes/${data.name}.json auto-ui/config/theme.json\n`);
          return '';
        }
      ];
    }
  });
};
