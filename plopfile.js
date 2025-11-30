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
  // Generator: ui-view (Auto-UI)
  // ==========================================
  plop.setGenerator('ui-view', {
    description: 'Crear una vista Auto-UI para un módulo',

    prompts: [
      {
        type: 'input',
        name: 'name',
        message: '📦 Nombre del módulo:',
        validate: (value) => {
          if (!value) return 'El nombre es requerido';
          if (!/^[a-z][a-z0-9-]*$/.test(value)) {
            return 'Usa kebab-case (ej: my-module)';
          }
          return true;
        }
      },
      {
        type: 'list',
        name: 'viewType',
        message: '🎨 Tipo de vista:',
        choices: [
          { name: 'Dashboard con dos columnas', value: 'dashboard-two-column' },
          { name: 'Dashboard con tabs', value: 'dashboard-tabs' },
          { name: 'Formulario (crear/editar)', value: 'form-view' },
          { name: 'Vista de detalle', value: 'detail-view' }
        ]
      },
      {
        type: 'input',
        name: 'icon',
        message: '🔸 Icono (emoji):',
        default: '📋'
      },
      {
        type: 'input',
        name: 'author',
        message: '👤 Autor:',
        default: 'Event Core Team'
      }
    ],

    actions: (data) => {
      const modulePath = `modules/${data.name}/views`;
      const templateFile = `plop-templates/view/${data.viewType}.json.hbs`;

      return [
        {
          type: 'add',
          path: `${modulePath}/${data.viewType}.json`,
          templateFile: templateFile
        },
        () => {
          console.log('\n✅ Vista creada exitosamente');
          console.log('\n📁 Archivo generado:');
          console.log(`   └── ${modulePath}/${data.viewType}.json`);
          console.log('\n🚀 Próximos pasos:');
          console.log('   1. Revisar y personalizar la vista generada');
          console.log('   2. Integrar en module.json del módulo:');
          console.log('      "views": {');
          console.log(`        "main": { ... configuración desde ${data.viewType}.json ... }`);
          console.log('      }');
          console.log('   3. Reiniciar el servidor para ver los cambios\n');
          return '';
        }
      ];
    }
  });

  // ==========================================
  // Generator: ai-workspace (Auto-UI)
  // ==========================================
  plop.setGenerator('ai-workspace', {
    description: 'Crear una vista AI Workspace (chat + prompts + upload + preview)',

    prompts: [
      {
        type: 'input',
        name: 'name',
        message: '📦 Nombre del módulo (kebab-case):',
        validate: (value) => {
          if (!value) return 'El nombre es requerido';
          if (!/^[a-z][a-z0-9-]*$/.test(value)) {
            return 'Usa kebab-case (ej: menu-generator)';
          }
          return true;
        }
      },
      {
        type: 'input',
        name: 'description',
        message: '📝 Descripción:',
        default: 'Vista AI Workspace con chat, prompts y generación'
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
        name: 'placeholder',
        message: '💬 Placeholder del chat:',
        default: 'Escribe tu mensaje...'
      },
      {
        type: 'list',
        name: 'defaultProvider',
        message: '🤖 Proveedor AI por defecto:',
        choices: ['deepseek', 'openai', 'claude', 'ollama'],
        default: 'deepseek'
      },
      {
        type: 'confirm',
        name: 'enableFileUpload',
        message: '📷 ¿Habilitar subida de archivos?',
        default: true
      },
      {
        type: 'list',
        name: 'uploadVariant',
        message: '📁 Tipo de archivos:',
        choices: [
          { name: 'Solo imágenes', value: 'image-only' },
          { name: 'Documentos (PDF, Word)', value: 'document' },
          { name: 'Media (imágenes y videos)', value: 'media' },
          { name: 'Cualquier archivo', value: 'any' }
        ],
        default: 'image-only',
        when: (answers) => answers.enableFileUpload
      },
      {
        type: 'input',
        name: 'uploadLabel',
        message: '📷 Etiqueta botón upload:',
        default: 'Subir archivo',
        when: (answers) => answers.enableFileUpload
      },
      {
        type: 'confirm',
        name: 'enableVoice',
        message: '🎤 ¿Habilitar entrada de voz?',
        default: false
      },
      {
        type: 'input',
        name: 'resultTitle',
        message: '📋 Título del resultado:',
        default: 'Resultado Generado'
      },
      {
        type: 'list',
        name: 'resultVariant',
        message: '📊 Tipo de preview:',
        choices: [
          { name: 'Preview de menú', value: 'menu-preview' },
          { name: 'Preview de producto', value: 'product-preview' },
          { name: 'Resumen de pedido', value: 'order-summary' },
          { name: 'Genérico', value: 'generic' }
        ],
        default: 'generic'
      },
      {
        type: 'list',
        name: 'resultFormat',
        message: '📑 Formato de datos:',
        choices: ['cards', 'table', 'list', 'json'],
        default: 'cards'
      }
    ],

    actions: (data) => {
      // Configurar valores por defecto
      data.currentDate = new Date().toISOString().split('T')[0];
      data.enableAttachments = data.enableFileUpload;
      data.uploadMaxFiles = 5;
      data.uploadEnableCrop = data.uploadVariant === 'image-only';
      data.uploadTitle = data.uploadLabel ? `📷 ${data.uploadLabel}` : '📷 Subir Archivo';
      data.uploadDropMessage = `Arrastra archivos aquí o haz click para seleccionar`;
      data.uploadType = 'uploaded-file';
      data.uploadActionLabel = 'Analizar';
      data.editorType = 'generic-editor';

      // Prompt categories
      data.promptCategories = ['general', data.name.split('-')[0]];

      // Example prompts
      data.examplePrompts = [
        {
          emoji: '💡',
          title: 'Ejemplo básico',
          prompt: `Genera un ejemplo básico para ${data.name}`
        },
        {
          emoji: '✨',
          title: 'Ejemplo avanzado',
          prompt: `Genera un ejemplo avanzado con opciones detalladas para ${data.name}`
        }
      ];

      // Style fields
      data.styleFields = [
        {
          name: 'outputFormat',
          component: 'select',
          props: {
            label: 'Formato de salida',
            options: [
              { value: 'detailed', label: 'Detallado' },
              { value: 'compact', label: 'Compacto' },
              { value: 'minimal', label: 'Mínimo' }
            ],
            default: 'detailed'
          }
        },
        {
          name: 'language',
          component: 'select',
          props: {
            label: 'Idioma',
            options: [
              { value: 'es', label: '🇪🇸 Español' },
              { value: 'en', label: '🇬🇧 English' }
            ],
            default: 'es'
          }
        }
      ];

      // Default style config
      data.defaultStyleConfig = {
        outputFormat: 'detailed',
        language: 'es'
      };

      // Editor features
      data.editorFeatures = {
        edit: true,
        delete: true,
        reorder: true
      };

      const viewPath = `auto-ui/views`;

      return [
        {
          type: 'add',
          path: `${viewPath}/{{name}}.json`,
          templateFile: 'plop-templates/view/ai-workspace.json.hbs'
        },
        () => {
          console.log('\n✅ AI Workspace creado exitosamente');
          console.log('\n📁 Archivo generado:');
          console.log(`   └── ${viewPath}/${data.name}.json`);
          console.log('\n🎯 Componentes integrados:');
          console.log('   ├── conversation-panel (chat AI)');
          console.log('   ├── chat-input (con barras configurables)');
          console.log('   ├── result-preview-card');
          console.log('   ├── floating-panel (9 paneles)');
          console.log('   ├── ai-control-bar');
          console.log('   ├── prompt-selector');
          console.log('   ├── credential-indicator');
          if (data.enableFileUpload) {
            console.log('   └── file-drop-zone');
          }
          console.log('\n🚀 Próximos pasos:');
          console.log(`   1. Personalizar prompts de ejemplo en ${data.name}.json`);
          console.log('   2. Ajustar campos de estilo según necesidades');
          console.log('   3. Configurar endpoints del módulo backend');
          console.log(`   4. Acceder: /auto-ui/${data.name}\n`);
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

      // Validar campos requeridos
      if (!blueprint.name || !blueprint.entity || !blueprint.fields) {
        console.error('\n❌ Blueprint inválido. Campos requeridos: name, entity, fields');
        return [];
      }

      // Transferir datos del blueprint
      data.name = blueprint.name;
      data.description = blueprint.description || 'Módulo Event-Core';
      data.author = blueprint.author || 'Event Core Team';
      data.icon = blueprint.icon || '📦';
      data.entityName = blueprint.entity.name;
      data.pluralName = blueprint.entity.plural || blueprint.entity.name + 's';
      data.titleField = blueprint.entity.titleField;
      data.descriptionField = blueprint.entity.descriptionField || '';

      // Procesar campos
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

      // Procesar eventos
      data.publishEvents = (blueprint.events?.publish || []).map(e => e.name);

      // Procesar APIs
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

      // Suscripciones
      data.subscriptions = (blueprint.events?.subscribe || []).map(s => ({
        event: s.name,
        handler: s.handler || 'on' + s.name.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('')
      }));
      data.hasSubscriptions = data.subscriptions.length > 0;

      // Config
      data.persistence = blueprint.config?.persistence || false;
      data.ui = blueprint.ui?.enabled !== false;
      data.layout = blueprint.ui?.layout || 'grid';
      data.features = blueprint.ui?.features || ['create', 'edit', 'delete'];
      data.colors = blueprint.ui?.colors || [];

      const modulePath = `modules/${data.name}`;
      const frontendPath = `frontend/src/routes/${data.name}`;

      console.log(`\n📋 Blueprint: ${data.blueprintPath}`);
      console.log(`📦 Módulo: ${data.name}`);
      console.log(`📝 Entidad: ${data.entityName} (${data.pluralName})`);
      console.log(`🔧 Campos: ${data.fields.map(f => f.name).join(', ')}`);
      console.log(`📤 Eventos: ${data.publishEvents.join(', ') || 'ninguno'}`);

      return [
        { type: 'add', path: `${modulePath}/index.js`, templateFile: 'plop-templates/module/index.js.hbs' },
        { type: 'add', path: `${modulePath}/module.json`, templateFile: 'plop-templates/module/module.json.hbs' },
        { type: 'add', path: `${modulePath}/README.md`, templateFile: 'plop-templates/module/README.md.hbs' },
        { type: 'add', path: `${modulePath}/schemas/events.json`, templateFile: 'plop-templates/module/schemas/events.json.hbs' },
        { type: 'add', path: `${modulePath}/schemas/${data.name}.json`, templateFile: 'plop-templates/module/schemas/main.json.hbs' },
        ...(data.ui ? [{ type: 'add', path: `${frontendPath}/+page.svelte`, templateFile: 'plop-templates/full-module/page.svelte.hbs' }] : []),
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
          console.log('\n🚀 Próximos pasos:');
          console.log(`   1. Agregar "${data.name}" a config.json → modules.enabled`);
          console.log('   2. Personalizar la lógica en index.js');
          console.log('   3. Reiniciar Event-Core\n');
          return '';
        }
      ];
    }
  });
};
