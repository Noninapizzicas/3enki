/**
 * Plop Generator - Event Core Module Generator
 *
 * Generador interactivo para crear módulos Event-Core completos.
 *
 * Uso:
 *   npx plop module
 *   npm run plop
 *
 * @version 2.0.0
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

  // Helper: pascalCase (MiModulo)
  plop.setHelper('pascalCase', (text) => {
    if (!text) return '';
    return text.split(/[-_]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
  });

  // Helper: titleCase (Mi Modulo)
  plop.setHelper('titleCase', (text) => {
    if (!text) return '';
    return text.split(/[-_]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  });

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
        type: 'input',
        name: 'icon',
        message: '🔸 Icono (emoji):',
        default: '📦'
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
      },
      {
        type: 'input',
        name: 'uiActionsRaw',
        message: '🖱️ UI Actions MQTT (separados por coma, ej: list,get,create,update,delete):',
        default: ''
      },
      {
        type: 'input',
        name: 'toolsRaw',
        message: '🤖 Tools para AI (nombre:descripcion, ej: list_items:Lista todos los items):',
        default: ''
      },
      {
        type: 'list',
        name: 'uiType',
        message: '🎨 Tipo de UI:',
        choices: [
          { name: 'Ninguna', value: 'none' },
          { name: 'Simple (zone + icon)', value: 'simple' },
          { name: 'Avanzada (Auto-UI v2.0 dashboard)', value: 'advanced' }
        ],
        default: 'none'
      },
      {
        type: 'list',
        name: 'uiZone',
        message: '📍 Zona de UI:',
        choices: ['work-bar', 'chat-config', 'chat-tools'],
        default: 'work-bar',
        when: (answers) => answers.uiType === 'simple'
      },
      {
        type: 'input',
        name: 'dependenciesRaw',
        message: '📦 Dependencias (módulos separados por coma, ej: database-manager,ai-gateway):',
        default: ''
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

      // Procesar UI Actions
      data.uiActions = data.uiActionsRaw
        ? data.uiActionsRaw.split(',').map(a => a.trim()).filter(a => a)
        : [];

      // Procesar Tools para AI
      data.tools = data.toolsRaw
        ? data.toolsRaw.split(',').map(t => {
            const [name, description] = t.trim().split(':');
            return {
              name: name.trim(),
              description: description?.trim() || `Tool ${name}`,
              params: [],
              required: []
            };
          }).filter(t => t.name)
        : [];

      // Procesar UI type
      data.uiSimple = data.uiType === 'simple';
      data.uiAdvanced = data.uiType === 'advanced';
      data.ui = data.uiType !== 'none';

      // Procesar dependencies
      data.dependencies = data.dependenciesRaw
        ? data.dependenciesRaw.split(',').map(d => d.trim()).filter(d => d)
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
  // Generator: svelte-component
  // ==========================================
  plop.setGenerator('svelte-component', {
    description: 'Crear un componente Svelte reutilizable',

    prompts: [
      {
        type: 'input',
        name: 'name',
        message: '🎨 Nombre del componente (PascalCase, ej: ColorPicker):',
        validate: (value) => {
          if (!value) return 'El nombre es requerido';
          if (!/^[A-Z][a-zA-Z0-9]*$/.test(value)) {
            return 'Usa PascalCase (ej: ColorPicker, DateInput)';
          }
          return true;
        }
      },
      {
        type: 'list',
        name: 'category',
        message: '📁 Categoría:',
        choices: [
          { name: 'ui - Componentes básicos (Button, Input...)', value: 'ui' },
          { name: 'data - Visualización de datos (Table, Grid...)', value: 'data' },
          { name: 'feedback - Notificaciones y modales', value: 'feedback' },
          { name: 'layout - Estructura de página', value: 'layout' },
          { name: 'navigation - Navegación', value: 'navigation' },
          { name: 'input - Inputs especializados', value: 'input' },
          { name: 'ai - Componentes IA', value: 'ai' }
        ]
      },
      {
        type: 'input',
        name: 'propsRaw',
        message: '🔧 Props (nombre:tipo=default, separados por coma, ej: label:string,size:string=md):',
        default: ''
      },
      {
        type: 'confirm',
        name: 'hasVariants',
        message: '🎭 ¿Tiene variantes visuales (primary, secondary...)?',
        default: false
      },
      {
        type: 'input',
        name: 'variantsRaw',
        message: '🎨 Variantes (nombre:clases, ej: primary:bg-primary text-white,danger:bg-danger):',
        default: 'primary:bg-primary text-white,secondary:bg-bg-card text-text',
        when: (answers) => answers.hasVariants
      },
      {
        type: 'confirm',
        name: 'hasEvents',
        message: '📤 ¿Emite eventos personalizados?',
        default: false
      },
      {
        type: 'input',
        name: 'eventsRaw',
        message: '⚡ Eventos (nombre:payload, ej: change:string,select:{ id: string }):',
        default: 'click:MouseEvent',
        when: (answers) => answers.hasEvents
      },
      {
        type: 'confirm',
        name: 'hasSlots',
        message: '🔲 ¿Tiene slots adicionales (además del default)?',
        default: false
      },
      {
        type: 'input',
        name: 'slotsRaw',
        message: '📦 Slots (nombres separados por coma, ej: header,footer,icon):',
        default: 'header,footer',
        when: (answers) => answers.hasSlots
      },
      {
        type: 'input',
        name: 'baseClasses',
        message: '🎨 Clases CSS base (Tailwind):',
        default: 'rounded-lg border border-border p-4'
      }
    ],

    actions: (data) => {
      // Procesar props
      data.props = data.propsRaw
        ? data.propsRaw.split(',').map(p => {
            const match = p.trim().match(/^(\w+):(\w+)(?:=(.+))?$/);
            if (match) {
              return {
                name: match[1],
                type: match[2],
                default: match[3] ? (match[2] === 'string' ? `'${match[3]}'` : match[3]) : null
              };
            }
            return null;
          }).filter(Boolean)
        : [];

      // Procesar variantes
      data.variants = data.variantsRaw
        ? data.variantsRaw.split(',').map(v => {
            const [name, classes] = v.trim().split(':');
            return { name: name.trim(), classes: classes?.trim() || '' };
          })
        : [];

      // Procesar eventos
      data.events = data.eventsRaw
        ? data.eventsRaw.split(',').map(e => {
            const [name, payload] = e.trim().split(':');
            return { name: name.trim(), payload: payload?.trim() || 'void' };
          })
        : [];

      // Procesar slots
      data.slots = [{ name: 'default' }];
      if (data.slotsRaw) {
        data.slotsRaw.split(',').forEach(s => {
          data.slots.push({ name: s.trim() });
        });
      }

      const componentPath = `frontend/src/lib/components/${data.category}`;

      return [
        {
          type: 'add',
          path: `${componentPath}/{{name}}.svelte`,
          templateFile: 'plop-templates/svelte-component/component.svelte.hbs'
        },
        // Agregar export al index.ts
        {
          type: 'append',
          path: `${componentPath}/index.ts`,
          template: "export { default as {{name}} } from './{{name}}.svelte';\n"
        },
        () => {
          console.log('\n✅ Componente Svelte creado exitosamente');
          console.log('\n📁 Archivos modificados:');
          console.log(`   ├── ${componentPath}/${data.name}.svelte`);
          console.log(`   └── ${componentPath}/index.ts (export añadido)`);
          console.log('\n📦 Uso:');
          console.log(`   import { ${data.name} } from '$components/${data.category}';`);
          console.log(`   // o`);
          console.log(`   import { ${data.name} } from '$components';`);
          console.log('\n🚀 Próximos pasos:');
          console.log(`   1. Editar ${data.name}.svelte con la lógica específica`);
          console.log('   2. Añadir estilos y comportamiento');
          console.log('   3. Probar en una página de ejemplo\n');
          return '';
        }
      ];
    }
  });

  // ==========================================
  // Generator: full-module (Backend + Frontend Svelte)
  // ==========================================
  plop.setGenerator('full-module', {
    description: 'Crear módulo completo: Backend Event-Core + Frontend Svelte',

    prompts: [
      {
        type: 'input',
        name: 'name',
        message: '📦 Nombre del módulo (kebab-case):',
        validate: (value) => {
          if (!value) return 'El nombre es requerido';
          if (!/^[a-z][a-z0-9-]*$/.test(value)) return 'Usa kebab-case (ej: mi-modulo)';
          return true;
        }
      },
      {
        type: 'input',
        name: 'description',
        message: '📝 Descripción:',
        default: 'Módulo Event-Core con UI Svelte'
      },
      {
        type: 'input',
        name: 'icon',
        message: '🔸 Icono (emoji):',
        default: '📦'
      },
      {
        type: 'input',
        name: 'author',
        message: '👤 Autor:',
        default: 'Event Core Team'
      },
      {
        type: 'input',
        name: 'entityName',
        message: '📋 Nombre de la entidad (singular, ej: tarea):',
        default: (answers) => answers.name.replace(/-/g, '_')
      },
      {
        type: 'input',
        name: 'fieldsRaw',
        message: '🔧 Campos (nombre:tipo separados por coma, ej: titulo:string,cantidad:number):',
        default: 'nombre:string,descripcion:string'
      },
      {
        type: 'input',
        name: 'titleField',
        message: '🏷️ Campo para título en cards:',
        default: 'nombre'
      },
      {
        type: 'input',
        name: 'descriptionField',
        message: '📄 Campo para descripción en cards (vacío si no aplica):',
        default: 'descripcion'
      }
    ],

    actions: (data) => {
      // Procesar campos
      data.fields = data.fieldsRaw
        ? data.fieldsRaw.split(',').map(f => {
            const [name, type = 'string'] = f.trim().split(':');
            return {
              name: name.trim(),
              type: type.trim(),
              label: name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' '),
              placeholder: `Ingresa ${name.replace(/_/g, ' ')}`,
              inputType: type === 'number' ? 'number' : (name.includes('descripcion') || name.includes('contenido') ? 'textarea' : 'text'),
              required: name === data.titleField
            };
          }).filter(f => f.name)
        : [];

      data.hasForm = data.fields.length > 0;
      data.pluralName = data.entityName + 's';
      data.publishEvents = [`${data.entityName}.creado`, `${data.entityName}.actualizado`, `${data.entityName}.eliminado`];
      const entity = data.entityName.charAt(0).toUpperCase() + data.entityName.slice(1);
      data.apis = [
        { method: 'GET', path: `/${data.pluralName}`, handler: `handleList${entity}s`, description: 'Listar todos' },
        { method: 'GET', path: `/${data.pluralName}/:id`, handler: `handleGet${entity}`, description: 'Obtener por ID' },
        { method: 'POST', path: `/${data.pluralName}`, handler: `handleCreate${entity}`, description: 'Crear nuevo' },
        { method: 'PATCH', path: `/${data.pluralName}/:id`, handler: `handleUpdate${entity}`, description: 'Actualizar' },
        { method: 'DELETE', path: `/${data.pluralName}/:id`, handler: `handleDelete${entity}`, description: 'Eliminar' },
        { method: 'GET', path: '/health', handler: 'handleHealthCheck', description: 'Health check' }
      ];
      data.subscriptions = [];
      data.hasSubscriptions = false;
      data.persistence = false;
      data.ui = true;

      const modulePath = `modules/${data.name}`;
      const frontendPath = `frontend/src/routes/${data.name}`;

      return [
        { type: 'add', path: `${modulePath}/index.js`, templateFile: 'plop-templates/module/index.js.hbs' },
        { type: 'add', path: `${modulePath}/module.json`, templateFile: 'plop-templates/module/module.json.hbs' },
        { type: 'add', path: `${modulePath}/README.md`, templateFile: 'plop-templates/module/README.md.hbs' },
        { type: 'add', path: `${modulePath}/schemas/events.json`, templateFile: 'plop-templates/module/schemas/events.json.hbs' },
        { type: 'add', path: `${modulePath}/schemas/${data.name}.json`, templateFile: 'plop-templates/module/schemas/main.json.hbs' },
        { type: 'add', path: `${frontendPath}/+page.svelte`, templateFile: 'plop-templates/full-module/page.svelte.hbs' },
        () => {
          console.log('\n✅ Módulo completo creado');
          console.log(`\n📁 Backend: ${modulePath}/`);
          console.log(`🎨 Frontend: ${frontendPath}/+page.svelte`);
          console.log('\n🚀 Próximos pasos:');
          console.log(`   1. Agregar "${data.name}" a config.json → modules.enabled`);
          console.log('   2. Reiniciar Event-Core: npm start');
          console.log('   3. Frontend: cd frontend && npm run dev');
          console.log(`   4. Acceder: http://localhost:5173/${data.name}\n`);
          return '';
        }
      ];
    }
  });

  // ==========================================
  // Generator: chat-module (Módulo con Chat IA)
  // ==========================================
  plop.setGenerator('chat-module', {
    description: 'Crear módulo con interfaz de Chat IA (ChatAIWorkspace)',

    prompts: [
      {
        type: 'input',
        name: 'name',
        message: '📦 Nombre del módulo (kebab-case):',
        validate: (value) => {
          if (!value) return 'El nombre es requerido';
          if (!/^[a-z][a-z0-9-]*$/.test(value)) return 'Usa kebab-case (ej: mi-modulo)';
          return true;
        }
      },
      {
        type: 'input',
        name: 'description',
        message: '📝 Descripción:',
        default: 'Módulo con Chat IA'
      },
      {
        type: 'input',
        name: 'icon',
        message: '🔸 Icono (emoji):',
        default: '🤖'
      },
      {
        type: 'input',
        name: 'author',
        message: '👤 Autor:',
        default: 'Event Core Team'
      },
      {
        type: 'input',
        name: 'chatPlaceholder',
        message: '💬 Placeholder del chat:',
        default: 'Escribe tu mensaje...'
      },
      {
        type: 'input',
        name: 'toolsRaw',
        message: '🔧 Tools (nombre:descripcion:categoria, ej: parser:Extrae datos:ai):',
        default: ''
      },
      {
        type: 'input',
        name: 'promptsRaw',
        message: '📝 Prompts rápidos (nombre:contenido, ej: Ejemplo:Genera un ejemplo):',
        default: ''
      }
    ],

    actions: (data) => {
      // Procesar tools
      data.tools = data.toolsRaw
        ? data.toolsRaw.split(',').map((t, i) => {
            const parts = t.trim().split(':');
            return {
              id: `tool-${i + 1}`,
              name: parts[0] || `Tool ${i + 1}`,
              description: parts[1] || '',
              category: parts[2] || 'general',
              enabled: true
            };
          }).filter(t => t.name)
        : [];

      // Procesar prompts
      data.prompts = data.promptsRaw
        ? data.promptsRaw.split(',').map((p, i) => {
            const parts = p.trim().split(':');
            return {
              id: `prompt-${i + 1}`,
              name: parts[0] || `Prompt ${i + 1}`,
              content: parts[1] || '',
              category: 'general',
              favorite: i === 0
            };
          }).filter(p => p.name)
        : [];

      // Eventos por defecto
      data.publishEvents = [
        `${data.name}.chat.started`,
        `${data.name}.chat.message`,
        `${data.name}.chat.completed`
      ];

      // APIs por defecto
      data.apis = [
        { method: 'GET', path: '/conversations', handler: 'handleListConversations', description: 'Listar conversaciones' },
        { method: 'POST', path: '/conversations', handler: 'handleCreateConversation', description: 'Crear conversación' },
        { method: 'GET', path: '/conversations/:id', handler: 'handleGetConversation', description: 'Obtener conversación' },
        { method: 'POST', path: '/conversations/:id/messages', handler: 'handleSendMessage', description: 'Enviar mensaje' },
        { method: 'GET', path: '/health', handler: 'handleHealthCheck', description: 'Health check' }
      ];

      // Suscripciones
      data.subscriptions = [
        { event: 'ai.completion.completed', handler: 'onAICompletionCompleted' }
      ];
      data.hasSubscriptions = true;

      data.persistence = false;
      data.hasChatUI = true;

      const modulePath = `modules/${data.name}`;
      const frontendPath = `frontend/src/routes/${data.name}`;

      return [
        { type: 'add', path: `${modulePath}/index.js`, templateFile: 'plop-templates/chat-module/index.js.hbs' },
        { type: 'add', path: `${modulePath}/module.json`, templateFile: 'plop-templates/chat-module/module.json.hbs' },
        { type: 'add', path: `${modulePath}/README.md`, templateFile: 'plop-templates/module/README.md.hbs' },
        { type: 'add', path: `${frontendPath}/+page.svelte`, templateFile: 'plop-templates/chat-module/page.svelte.hbs' },
        () => {
          console.log('\n✅ Módulo con Chat IA creado');
          console.log(`\n📁 Backend: ${modulePath}/`);
          console.log(`🎨 Frontend: ${frontendPath}/+page.svelte`);
          console.log('\n📦 Incluye:');
          console.log('   - ChatAIWorkspace con todos los paneles');
          console.log('   - Selector de modelos IA');
          console.log('   - Selector de credenciales');
          console.log('   - Tools y plugins');
          console.log('   - Prompts rápidos');
          console.log('\n🚀 Próximos pasos:');
          console.log(`   1. Agregar "${data.name}" a config.json → modules.enabled`);
          console.log('   2. Personalizar la lógica de chat en index.js');
          console.log('   3. Reiniciar Event-Core: npm start');
          console.log(`   4. Acceder: http://localhost:5173/${data.name}\n`);
          return '';
        }
      ];
    }
  });

  // ==========================================
  // Generator: selector-panel
  // ==========================================
  plop.setGenerator('selector-panel', {
    description: 'Crear un wrapper de SelectorPanel para un módulo específico',

    prompts: [
      {
        type: 'input',
        name: 'name',
        message: '📦 Nombre del componente (PascalCase, ej: MyModelSelector):',
        validate: (value) => {
          if (!value) return 'El nombre es requerido';
          if (!/^[A-Z][a-zA-Z0-9]*$/.test(value)) return 'Usa PascalCase';
          return true;
        }
      },
      {
        type: 'list',
        name: 'module',
        message: '🔌 Módulo a conectar:',
        choices: [
          { name: '🤖 ai-gateway - Selección de modelo IA', value: 'ai-gateway' },
          { name: '🔑 credential-manager - Gestión de API keys', value: 'credential-manager' },
          { name: '📝 prompt-manager - Selección de prompts', value: 'prompt-manager' },
          { name: '💬 conversation-manager - Historial de conversaciones', value: 'conversation-manager' }
        ]
      },
      {
        type: 'list',
        name: 'panelMode',
        message: '📱 Modo del panel:',
        choices: [
          { name: 'quick - Panel pequeño para selección rápida (30%)', value: 'quick' },
          { name: 'create - Modal para crear nuevo (50%)', value: 'create' },
          { name: 'manage - Vista completa de gestión (85%)', value: 'manage' }
        ],
        default: 'quick'
      },
      {
        type: 'input',
        name: 'title',
        message: '🏷️ Título personalizado (vacío = usar default del módulo):',
        default: ''
      }
    ],

    actions: (data) => {
      // Títulos por defecto según módulo
      const defaultTitles = {
        'ai-gateway': 'Seleccionar Modelo',
        'credential-manager': 'Credenciales',
        'prompt-manager': 'Prompts',
        'conversation-manager': 'Conversaciones'
      };

      data.defaultTitle = defaultTitles[data.module] || 'Selector';
      data.hasCustomTitle = !!data.title;

      const componentPath = 'frontend/src/lib/components/selectors';

      return [
        {
          type: 'add',
          path: `${componentPath}/{{name}}.svelte`,
          template: `<!--
  {{name}}.svelte
  ================
  Wrapper de SelectorPanel para ${data.module}
  Generado con: npx plop selector-panel

  Uso:
    <{{name}}
      bind:open={showPanel}
      bind:selectedValue={currentValue}
      on:select={handleSelect}
    />
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import SelectorPanel from './SelectorPanel.svelte';

  // Props
  export let projectId: string | null = null;
  export let open = false;
  export let selectedValue: string | string[] | null = null;
  export let allowCreate = true;
  export let showStats = true;

  // Events
  const dispatch = createEventDispatcher<{
    select: { itemId: string; item: any; metadata?: Record<string, unknown> };
    create: { groupId?: string };
    edit: { itemId: string; item: any };
    delete: { itemId: string };
    close: void;
  }>();

  function handleSelect(event: CustomEvent) {
    dispatch('select', event.detail);
  }

  function handleCreate(event: CustomEvent) {
    dispatch('create', event.detail);
  }

  function handleEdit(event: CustomEvent) {
    dispatch('edit', event.detail);
  }

  function handleDelete(event: CustomEvent) {
    dispatch('delete', event.detail);
  }

  function handleClose() {
    dispatch('close');
  }
</script>

<SelectorPanel
  module="${data.module}"
  panelMode="${data.panelMode}"
  {projectId}
  bind:open
  bind:selectedValue
  {allowCreate}
  {showStats}
  ${data.hasCustomTitle ? `title="${data.title}"` : ''}
  on:select={handleSelect}
  on:create={handleCreate}
  on:edit={handleEdit}
  on:delete={handleDelete}
  on:close={handleClose}
/>
`
        },
        // Agregar export al index.ts
        {
          type: 'append',
          path: `${componentPath}/index.ts`,
          template: "export { default as {{name}} } from './{{name}}.svelte';\n"
        },
        () => {
          console.log('\\n✅ Componente selector creado exitosamente');
          console.log(`\\n📁 Archivo: ${componentPath}/${data.name}.svelte`);
          console.log('\\n📦 Uso:');
          console.log(`   import { ${data.name} } from '$lib/components/selectors';`);
          console.log('');
          console.log(`   <${data.name}`);
          console.log('     bind:open={showPanel}');
          console.log('     bind:selectedValue={currentValue}');
          console.log('     on:select={handleSelect}');
          console.log('   />');
          console.log('');
          return '';
        }
      ];
    }
  });

  // ==========================================
  // Generator: from-blueprint
  // ==========================================
  plop.setGenerator('from-blueprint', {
    description: 'Generar módulo completo desde un archivo blueprint YAML',

    prompts: [
      {
        type: 'input',
        name: 'blueprintPath',
        message: '📋 Ruta al blueprint (ej: blueprints/tareas.yaml):',
        default: 'blueprints/',
        validate: (value) => value ? true : 'La ruta es requerida'
      }
    ],

    actions: (data) => {
      const fs = require('fs');
      const path = require('path');
      const yaml = require('yaml');

      // Leer y parsear blueprint
      let blueprint;
      try {
        const fullPath = path.resolve(data.blueprintPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        blueprint = yaml.parse(content);
      } catch (err) {
        console.error(`\n❌ Error leyendo blueprint: ${err.message}`);
        console.log('\n💡 Asegúrate de:');
        console.log('   1. La ruta es correcta (ej: blueprints/tareas.yaml)');
        console.log('   2. El archivo YAML es válido');
        console.log('   3. Tienes instalado el paquete yaml: npm install yaml\n');
        return [];
      }

      // Detectar tipo de blueprint
      const isScreen = blueprint.type === 'screen';
      const hasPanels = blueprint.panels && blueprint.panels.length > 0;

      // Validar campos requeridos según tipo
      if (isScreen) {
        if (!blueprint.name) {
          console.error('\n❌ Blueprint de pantalla inválido. Campo requerido: name');
          return [];
        }
      } else {
        if (!blueprint.name || !blueprint.entity || !blueprint.fields) {
          console.error('\n❌ Blueprint inválido. Campos requeridos: name, entity, fields');
          return [];
        }
      }

      // Transferir datos del blueprint
      data.name = blueprint.name;
      data.description = blueprint.description || 'Módulo Event-Core';
      data.author = blueprint.author || 'Event Core Team';
      data.icon = blueprint.icon || '📦';
      data.chatPlaceholder = blueprint.input?.placeholder || 'Escribe aquí...';

      // ========================================
      // PROCESAR PANELES (CONTEXT_UI)
      // ========================================
      if (hasPanels) {
        data.panels = blueprint.panels.map(p => ({
          id: p.id,
          component: p.component,
          selectList: p.selectList,
          toggleList: p.toggleList,
          actionForm: p.actionForm,
          events: p.events || {}
        }));

        // Extraer data sources de los paneles
        const dataSources = new Map();
        blueprint.panels.forEach(p => {
          if (p.selectList) {
            if (p.selectList.itemsSource) dataSources.set(p.selectList.itemsSource, { type: 'SelectItem[]', default: '[]' });
            if (p.selectList.groupsSource) dataSources.set(p.selectList.groupsSource, { type: 'SelectGroup[]', default: '[]' });
            if (p.selectList.valueField) dataSources.set(p.selectList.valueField, { type: 'string', default: "''" });
          }
          if (p.toggleList) {
            if (p.toggleList.itemsSource) dataSources.set(p.toggleList.itemsSource, { type: 'ToggleItem[]', default: '[]' });
            if (p.toggleList.groupsSource) dataSources.set(p.toggleList.groupsSource, { type: 'ToggleGroup[]', default: '[]' });
            if (p.toggleList.valuesField) dataSources.set(p.toggleList.valuesField, { type: 'string[]', default: '[]' });
          }
        });
        data.dataSources = Array.from(dataSources.entries()).map(([name, info]) => ({
          name,
          type: info.type,
          default: info.default,
          comment: `Data source for panels`
        }));

        // Extraer event handlers de los paneles
        const eventHandlers = new Set();
        blueprint.panels.forEach(p => {
          if (p.events) {
            Object.values(p.events).forEach(handler => {
              if (typeof handler === 'string') eventHandlers.add(handler);
            });
          }
        });
        data.eventHandlers = Array.from(eventHandlers).map(name => ({
          name,
          param: 'data',
          paramType: 'unknown',
          toastMessage: null
        }));
      } else {
        data.panels = [];
        data.dataSources = [];
        data.eventHandlers = [];
      }

      // ========================================
      // PROCESAR TOOLBARS
      // ========================================
      data.toolbars = {
        top: { icons: [] },
        right: { icons: [] },
        chatTop: { icons: [] },
        chatBottom: { icons: [] }
      };

      if (blueprint.toolbar_top?.icons) {
        data.toolbars.top.icons = blueprint.toolbar_top.icons;
      }
      if (blueprint.toolbar_right?.icons) {
        data.toolbars.right.icons = blueprint.toolbar_right.icons;
      }
      if (blueprint.toolbar_chat?.top?.icons) {
        data.toolbars.chatTop.icons = blueprint.toolbar_chat.top.icons;
      }
      if (blueprint.toolbar_chat?.bottom?.icons) {
        data.toolbars.chatBottom.icons = blueprint.toolbar_chat.bottom.icons;
      }

      // ========================================
      // PROCESAR ENTIDAD Y CAMPOS (módulos CRUD)
      // ========================================
      if (blueprint.entity) {
        data.entityName = blueprint.entity.name;
        data.pluralName = blueprint.entity.plural || blueprint.entity.name + 's';
        data.titleField = blueprint.entity.titleField;
        data.descriptionField = blueprint.entity.descriptionField || '';
      }

      if (blueprint.fields) {
        data.fields = blueprint.fields.map(f => ({
          name: f.name,
          type: f.type || 'string',
          label: f.label || f.name,
          placeholder: f.ui?.placeholder || `Ingresa ${f.label || f.name}`,
          inputType: f.ui?.inputType || (f.type === 'number' ? 'number' : 'text'),
          required: f.required || false,
          default: f.default,
          options: f.ui?.options
        }));
        data.hasForm = data.fields.length > 0;
      } else {
        data.fields = [];
        data.hasForm = false;
      }

      // ========================================
      // PROCESAR EVENTOS
      // ========================================
      data.publishEvents = (blueprint.events?.publish || []).map(e => e.name);

      // Suscripciones
      data.subscriptions = (blueprint.events?.subscribe || []).map(s => ({
        event: s.name,
        handler: s.handler || 'on' + s.name.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('')
      }));
      data.hasSubscriptions = data.subscriptions.length > 0;

      // ========================================
      // PROCESAR APIS
      // ========================================
      if (blueprint.entity) {
        const entity = data.entityName.charAt(0).toUpperCase() + data.entityName.slice(1);
        data.apis = [
          { method: 'GET', path: `/${data.pluralName}`, handler: `handleList${entity}s`, description: 'Listar todos' },
          { method: 'GET', path: `/${data.pluralName}/:id`, handler: `handleGet${entity}`, description: 'Obtener por ID' },
          { method: 'POST', path: `/${data.pluralName}`, handler: `handleCreate${entity}`, description: 'Crear nuevo' },
          { method: 'PATCH', path: `/${data.pluralName}/:id`, handler: `handleUpdate${entity}`, description: 'Actualizar' },
          { method: 'DELETE', path: `/${data.pluralName}/:id`, handler: `handleDelete${entity}`, description: 'Eliminar' },
          { method: 'GET', path: '/health', handler: 'handleHealthCheck', description: 'Health check' },
          ...(blueprint.apis || [])
        ];
      } else {
        data.apis = blueprint.apis || [
          { method: 'GET', path: '/health', handler: 'handleHealthCheck', description: 'Health check' }
        ];
      }

      // API calls para el frontend
      data.apiCalls = [];

      // ========================================
      // CONFIGURACIÓN
      // ========================================
      data.persistence = blueprint.config?.persistence || false;
      data.ui = blueprint.ui?.enabled !== false;
      data.layout = blueprint.ui?.layout || blueprint.layout?.type || 'grid';
      data.features = blueprint.ui?.features || ['create', 'edit', 'delete'];
      data.colors = blueprint.ui?.colors || [];
      data.isScreen = isScreen;
      data.hasChatUI = isScreen || hasPanels;

      const modulePath = `modules/${data.name}`;
      const frontendPath = `frontend/src/routes/${data.name}`;

      console.log(`\n📋 Blueprint: ${data.blueprintPath}`);
      console.log(`📦 Tipo: ${isScreen ? 'Screen (Chat UI)' : 'Módulo CRUD'}`);
      console.log(`📦 Nombre: ${data.name}`);
      if (data.entityName) console.log(`📝 Entidad: ${data.entityName} (${data.pluralName})`);
      if (data.fields.length) console.log(`🔧 Campos: ${data.fields.map(f => f.name).join(', ')}`);
      if (data.panels.length) console.log(`📱 Paneles: ${data.panels.length} (${data.panels.map(p => p.component).join(', ')})`);
      console.log(`📤 Eventos: ${data.publishEvents.join(', ') || 'ninguno'}`);

      // Determinar template a usar
      const pageTemplate = data.hasChatUI
        ? 'plop-templates/chat-module/page.svelte.hbs'
        : 'plop-templates/full-module/page.svelte.hbs';

      return [
        { type: 'add', path: `${modulePath}/index.js`, templateFile: 'plop-templates/module/index.js.hbs' },
        { type: 'add', path: `${modulePath}/module.json`, templateFile: 'plop-templates/module/module.json.hbs' },
        { type: 'add', path: `${modulePath}/README.md`, templateFile: 'plop-templates/module/README.md.hbs' },
        { type: 'add', path: `${modulePath}/schemas/events.json`, templateFile: 'plop-templates/module/schemas/events.json.hbs' },
        { type: 'add', path: `${modulePath}/schemas/${data.name}.json`, templateFile: 'plop-templates/module/schemas/main.json.hbs' },
        ...(data.ui ? [{ type: 'add', path: `${frontendPath}/+page.svelte`, templateFile: pageTemplate }] : []),
        // Copiar blueprint al módulo
        {
          type: 'add',
          path: `${modulePath}/blueprint.yaml`,
          template: require('fs').readFileSync(require('path').resolve(data.blueprintPath), 'utf8')
        },
        () => {
          console.log('\n✅ Módulo generado desde blueprint');
          console.log(`\n📁 Backend: ${modulePath}/`);
          if (data.ui) console.log(`🎨 Frontend: ${frontendPath}/+page.svelte`);
          if (data.hasChatUI) {
            console.log('\n📦 Incluye:');
            console.log('   - Componentes base (SelectList, ToggleList, ActionForm)');
            console.log('   - FloatingPanel para paneles');
            console.log('   - ToolbarIcon con triple interacción');
          }
          console.log('\n🚀 Próximos pasos:');
          console.log(`   1. Agregar "${data.name}" a config.json → modules.enabled`);
          console.log('   2. Personalizar la lógica en index.js');
          console.log('   3. Reiniciar Event-Core\n');
          return '';
        }
      ];
    }
  });

  // ==========================================
  // Generator: service-module
  // ==========================================
  plop.setGenerator('service-module', {
    description: 'Crear un módulo de servicio con arquitectura de plugins (OCR, Translate, etc.)',

    prompts: [
      {
        type: 'input',
        name: 'name',
        message: '🔧 Nombre del servicio (sin "-service", ej: ocr, translate, speech):',
        validate: (value) => {
          if (!value) return 'El nombre es requerido';
          if (!/^[a-z][a-z0-9-]*$/.test(value)) {
            return 'Usa kebab-case (ej: ocr, image-gen)';
          }
          return true;
        }
      },
      {
        type: 'input',
        name: 'description',
        message: '📝 Descripción del servicio:',
        default: (answers) => `Servicio de ${answers.name} con soporte multi-engine`
      },
      {
        type: 'input',
        name: 'author',
        message: '👤 Autor:',
        default: 'Event Core Team'
      },
      {
        type: 'input',
        name: 'inputType',
        message: '📥 Tipo de entrada principal (ej: image, audio, text, pdf):',
        default: 'image'
      },
      {
        type: 'input',
        name: 'outputType',
        message: '📤 Tipo de salida principal (ej: text, audio, image):',
        default: 'text'
      },
      {
        type: 'input',
        name: 'builtinEngine',
        message: '🏠 Engine builtin por defecto (ej: tesseract, basic):',
        default: 'default'
      },
      {
        type: 'confirm',
        name: 'createPlugin',
        message: '📦 ¿Crear directorio de plugins vacío?',
        default: true
      }
    ],

    actions: (data) => {
      const modulePath = `modules/${data.name}-service`;
      const pluginsPath = `plugins/${data.name}`;

      const actions = [
        // Crear index.js
        {
          type: 'add',
          path: `${modulePath}/index.js`,
          templateFile: 'plop-templates/service-module/index.js.hbs'
        },
        // Crear module.json
        {
          type: 'add',
          path: `${modulePath}/module.json`,
          templateFile: 'plop-templates/service-module/module.json.hbs'
        },
        // Crear README.md
        {
          type: 'add',
          path: `${modulePath}/README.md`,
          templateFile: 'plop-templates/service-module/README.md.hbs'
        },
        // Crear lib/plugin-loader.js
        {
          type: 'add',
          path: `${modulePath}/lib/plugin-loader.js`,
          templateFile: 'plop-templates/service-module/lib/plugin-loader.js.hbs'
        },
        // Crear lib/api-executor.js
        {
          type: 'add',
          path: `${modulePath}/lib/api-executor.js`,
          templateFile: 'plop-templates/service-module/lib/api-executor.js.hbs'
        },
        // Crear builtin/default.js
        {
          type: 'add',
          path: `${modulePath}/builtin/${data.builtinEngine}.js`,
          templateFile: 'plop-templates/service-module/builtin/default.js.hbs'
        },
        // Crear schemas/events.json
        {
          type: 'add',
          path: `${modulePath}/schemas/events.json`,
          templateFile: 'plop-templates/service-module/schemas/events.json.hbs'
        },
        // Crear .generated
        {
          type: 'add',
          path: `${modulePath}/.generated`,
          template: `Service Module generado el {{currentDate}}\nGenerador: plop service-module\nBuiltin: ${data.builtinEngine}\n`
        }
      ];

      // Crear directorio de plugins si se solicita
      if (data.createPlugin) {
        actions.push({
          type: 'add',
          path: `${pluginsPath}/.gitkeep`,
          template: '# Plugins para {{name}}-service\n# Cada plugin debe estar en su propio directorio con engine.json\n'
        });
      }

      // Mensaje final
      actions.push(() => {
        console.log('\n✅ Service Module creado exitosamente');
        console.log(`\n📁 Módulo: ${modulePath}/`);
        console.log('   ├── index.js           (orquestador)');
        console.log('   ├── module.json        (configuración)');
        console.log('   ├── README.md          (documentación)');
        console.log('   ├── lib/');
        console.log('   │   ├── plugin-loader.js');
        console.log('   │   └── api-executor.js');
        console.log('   ├── builtin/');
        console.log(`   │   └── ${data.builtinEngine}.js`);
        console.log('   └── schemas/');
        console.log('       └── events.json');
        if (data.createPlugin) {
          console.log(`\n📦 Plugins: ${pluginsPath}/`);
        }
        console.log('\n🚀 Próximos pasos:');
        console.log(`   1. Implementar builtin/${data.builtinEngine}.js con la lógica real`);
        console.log(`   2. Agregar "${data.name}-service" a config.json → modules.enabled`);
        console.log('   3. Reiniciar Event-Core: npm start');
        console.log(`   4. Probar: curl http://localhost:3000/modules/${data.name}-service/engines`);
        console.log('\n📖 Para añadir plugins externos:');
        console.log(`   1. Crear directorio: ${pluginsPath}/mi-engine/`);
        console.log('   2. Añadir engine.json con la configuración');
        console.log('   3. Para locales: añadir handler.js');
        console.log('   4. Reiniciar el servidor\n');
        return '';
      });

      return actions;
    }
  });
};
