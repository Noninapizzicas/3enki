<script lang="ts">
  /**
   * ComponentRenderer - Renderiza dinámicamente componentes del UI Designer
   * Usa HTML/CSS puro para evitar problemas de props incompatibles
   */

  export let component: {
    id: string;
    component: string;
    props: Record<string, any>;
    children?: any[];
  };

  export let isPreview = true;

  // Props del componente
  $: props = component.props || {};
  $: componentType = component.component;
</script>

{#if componentType === 'header'}
  <header class="border-b border-border pb-4 mb-4">
    <h1 class="text-xl font-semibold">{props.title || 'Título'}</h1>
    {#if props.subtitle}
      <p class="text-text-muted text-sm mt-1">{props.subtitle}</p>
    {/if}
  </header>

{:else if componentType === 'card'}
  <div class="bg-bg-card border border-border rounded-lg p-4 {props.class || ''}">
    {#if props.title}
      <h3 class="font-medium mb-2">{props.title}</h3>
    {/if}
    {#if props.content}
      <p class="text-text-muted">{props.content}</p>
    {:else}
      <p class="text-text-muted text-sm">Contenido de la card...</p>
    {/if}
  </div>

{:else if componentType === 'section'}
  <section class="border border-border rounded-lg p-4 {props.class || ''}">
    {#if props.title}
      <h3 class="font-medium mb-3">{props.title}</h3>
    {/if}
    <div class="text-text-muted text-sm">
      {props.content || 'Contenido de la sección...'}
    </div>
  </section>

{:else if componentType === 'stat-card'}
  <div class="bg-bg-card border border-border rounded-lg p-4">
    <div class="flex items-start justify-between">
      <div>
        <p class="text-sm text-text-muted">{props.label || 'Estadística'}</p>
        <p class="text-2xl font-semibold mt-1">{props.value || '0'}</p>
        {#if props.trend}
          <p class="text-sm mt-2 text-success">{props.trend}</p>
        {/if}
      </div>
      {#if props.icon}
        <span class="text-2xl">{props.icon}</span>
      {/if}
    </div>
  </div>

{:else if componentType === 'table'}
  <div class="border border-border rounded-lg overflow-hidden">
    <table class="w-full">
      <thead class="bg-bg-secondary">
        <tr>
          {#each (props.columns || ['Columna 1', 'Columna 2', 'Columna 3']) as col}
            <th class="px-4 py-3 text-left text-sm font-medium">{col}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each Array(props.rows || 3) as _, i}
          <tr class="border-t border-border">
            {#each (props.columns || ['Columna 1', 'Columna 2', 'Columna 3']) as _, j}
              <td class="px-4 py-3 text-sm">Dato {i + 1}-{j + 1}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
    {#if props.paginated}
      <div class="px-4 py-2 bg-bg-secondary border-t border-border text-sm text-text-muted">
        Mostrando 1-{props.rows || 3} de {props.total || 10}
      </div>
    {/if}
  </div>

{:else if componentType === 'list'}
  <div class="space-y-2">
    {#each (props.items || ['Item 1', 'Item 2', 'Item 3']) as item}
      <div class="flex items-center gap-3 p-3 bg-bg-secondary rounded-lg">
        <span>•</span>
        <span>{typeof item === 'string' ? item : item.label || 'Item'}</span>
      </div>
    {/each}
  </div>

{:else if componentType === 'grid'}
  <div class="grid gap-4" style="grid-template-columns: repeat({props.columns || 3}, 1fr)">
    {#each Array(props.items || 6) as _, i}
      <div class="bg-bg-secondary rounded-lg p-4 text-center">
        <span class="text-2xl block mb-2">📦</span>
        <span class="text-sm">Item {i + 1}</span>
      </div>
    {/each}
  </div>

{:else if componentType === 'form'}
  <form class="space-y-4 p-4 border border-border rounded-lg" on:submit|preventDefault>
    <p class="text-sm text-text-muted mb-4">Formulario: {props.title || 'Sin título'}</p>
    <div class="flex gap-2 justify-end pt-4 border-t border-border">
      <button type="button" class="px-4 py-2 rounded-lg border border-border hover:bg-bg-hover transition-colors">
        {props.cancelLabel || 'Cancelar'}
      </button>
      <button type="submit" class="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors">
        {props.submitLabel || 'Guardar'}
      </button>
    </div>
  </form>

{:else if componentType === 'input'}
  <div>
    {#if props.label}
      <label class="block text-sm font-medium mb-1">{props.label}</label>
    {/if}
    <input
      type={props.type || 'text'}
      placeholder={props.placeholder || ''}
      disabled={isPreview}
      value={props.value || ''}
      class="w-full px-3 py-2 bg-bg-input border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50"
    />
    {#if props.helpText}
      <p class="text-xs text-text-muted mt-1">{props.helpText}</p>
    {/if}
  </div>

{:else if componentType === 'textarea'}
  <div>
    {#if props.label}
      <label class="block text-sm font-medium mb-1">{props.label}</label>
    {/if}
    <textarea
      placeholder={props.placeholder || ''}
      rows={props.rows || 4}
      disabled={isPreview}
      class="w-full px-3 py-2 bg-bg-input border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50"
    >{props.value || ''}</textarea>
  </div>

{:else if componentType === 'select'}
  <div>
    {#if props.label}
      <label class="block text-sm font-medium mb-1">{props.label}</label>
    {/if}
    <select
      disabled={isPreview}
      class="w-full px-3 py-2 bg-bg-input border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50"
    >
      <option value="">{props.placeholder || 'Seleccionar...'}</option>
      {#each (props.options || [{value: '1', label: 'Opción 1'}, {value: '2', label: 'Opción 2'}]) as opt}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>
  </div>

{:else if componentType === 'checkbox'}
  <label class="flex items-center gap-2 cursor-pointer">
    <input
      type="checkbox"
      checked={props.checked || false}
      disabled={isPreview}
      class="w-4 h-4 rounded border-border"
    />
    <span>{props.label || 'Checkbox'}</span>
  </label>

{:else if componentType === 'radio'}
  <div>
    {#if props.label}
      <label class="block text-sm font-medium mb-2">{props.label}</label>
    {/if}
    <div class="space-y-2">
      {#each (props.options || [{value: '1', label: 'Opción 1'}, {value: '2', label: 'Opción 2'}]) as opt}
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" name={component.id} value={opt.value} disabled={isPreview} class="w-4 h-4" />
          <span>{opt.label}</span>
        </label>
      {/each}
    </div>
  </div>

{:else if componentType === 'button'}
  <button
    disabled={isPreview}
    class="px-4 py-2 rounded-lg transition-colors disabled:opacity-50
      {props.variant === 'primary' ? 'bg-primary text-white hover:bg-primary/90' : ''}
      {props.variant === 'secondary' ? 'bg-bg-secondary border border-border hover:bg-bg-hover' : ''}
      {props.variant === 'danger' ? 'bg-danger text-white hover:bg-danger/90' : ''}
      {props.variant === 'ghost' ? 'hover:bg-bg-hover' : ''}
      {!props.variant || props.variant === 'default' ? 'bg-primary text-white hover:bg-primary/90' : ''}
    "
  >
    {#if props.icon}
      <span class="mr-1">{props.icon}</span>
    {/if}
    {props.label || 'Botón'}
  </button>

{:else if componentType === 'button-group'}
  <div class="flex gap-2">
    {#each (props.buttons || [{label: 'Btn 1'}, {label: 'Btn 2'}]) as btn}
      <button
        disabled={isPreview}
        class="px-3 py-1.5 text-sm rounded-lg bg-bg-secondary border border-border hover:bg-bg-hover disabled:opacity-50"
      >
        {btn.label}
      </button>
    {/each}
  </div>

{:else if componentType === 'alert'}
  <div class="p-4 rounded-lg border
    {props.variant === 'info' ? 'bg-blue-50 border-blue-200 text-blue-800' : ''}
    {props.variant === 'success' ? 'bg-green-50 border-green-200 text-green-800' : ''}
    {props.variant === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : ''}
    {props.variant === 'danger' ? 'bg-red-50 border-red-200 text-red-800' : ''}
    {!props.variant ? 'bg-blue-50 border-blue-200 text-blue-800' : ''}
  ">
    {#if props.title}
      <h4 class="font-medium mb-1">{props.title}</h4>
    {/if}
    <p class="text-sm">{props.message || 'Mensaje de alerta'}</p>
  </div>

{:else if componentType === 'spinner'}
  <div class="flex items-center justify-center p-4">
    <div class="animate-spin rounded-full border-2 border-primary border-t-transparent
      {props.size === 'sm' ? 'w-4 h-4' : ''}
      {props.size === 'md' || !props.size ? 'w-8 h-8' : ''}
      {props.size === 'lg' ? 'w-12 h-12' : ''}
    "></div>
  </div>

{:else if componentType === 'modal'}
  <div class="border-2 border-dashed border-border rounded-lg p-4 bg-bg-secondary">
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-medium">{props.title || 'Modal'}</h3>
      <span class="text-text-muted cursor-pointer">✕</span>
    </div>
    <p class="text-sm text-text-muted">Contenido del modal...</p>
    <div class="flex gap-2 justify-end mt-4 pt-3 border-t border-border">
      <button class="px-3 py-1.5 text-sm rounded-lg hover:bg-bg-hover">Cancelar</button>
      <button class="px-3 py-1.5 text-sm rounded-lg bg-primary text-white">Aceptar</button>
    </div>
  </div>

{:else if componentType === 'tabs'}
  <div>
    <div class="flex border-b border-border">
      {#each (props.items || [{id: '1', label: 'Tab 1'}, {id: '2', label: 'Tab 2'}]) as tab, i}
        <button
          class="px-4 py-2 text-sm font-medium border-b-2 transition-colors
            {i === 0 ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'}
          "
        >
          {tab.label}
        </button>
      {/each}
    </div>
    <div class="p-4 text-sm text-text-muted">
      Contenido del tab activo...
    </div>
  </div>

{:else if componentType === 'breadcrumb'}
  <nav class="flex items-center gap-2 text-sm">
    {#each (props.items || [{label: 'Inicio'}, {label: 'Sección'}, {label: 'Página'}]) as item, i}
      {#if i > 0}
        <span class="text-text-muted">/</span>
      {/if}
      <span class="{i < (props.items?.length || 3) - 1 ? 'text-text-muted hover:text-text cursor-pointer' : ''}">
        {item.label}
      </span>
    {/each}
  </nav>

{:else if componentType === 'menu'}
  <nav class="space-y-1">
    {#each (props.items || [{label: 'Inicio', icon: '🏠'}, {label: 'Configuración', icon: '⚙️'}]) as item}
      <a href="#" class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors text-sm">
        {#if item.icon}<span>{item.icon}</span>{/if}
        <span>{item.label}</span>
      </a>
    {/each}
  </nav>

{:else if componentType === 'pagination'}
  <div class="flex items-center justify-center gap-1">
    <button disabled={isPreview} class="px-3 py-1.5 text-sm rounded-lg hover:bg-bg-hover disabled:opacity-50">←</button>
    {#each Array(Math.min(props.pages || 5, 5)) as _, i}
      <button
        disabled={isPreview}
        class="px-3 py-1.5 text-sm rounded-lg disabled:opacity-50
          {i === 0 ? 'bg-primary text-white' : 'hover:bg-bg-hover'}
        "
      >
        {i + 1}
      </button>
    {/each}
    <button disabled={isPreview} class="px-3 py-1.5 text-sm rounded-lg hover:bg-bg-hover disabled:opacity-50">→</button>
  </div>

{:else if componentType === 'sidebar'}
  <aside class="bg-bg-secondary border-r border-border p-4 min-h-[200px]">
    <h3 class="font-medium text-sm mb-3">{props.title || 'Sidebar'}</h3>
    <nav class="space-y-1">
      {#each (props.items || [{label: 'Item 1'}, {label: 'Item 2'}]) as item}
        <a href="#" class="block px-3 py-2 rounded-lg hover:bg-bg-hover text-sm">{item.label}</a>
      {/each}
    </nav>
  </aside>

{:else if componentType === 'footer'}
  <footer class="border-t border-border p-4 text-center text-sm text-text-muted">
    {props.text || '© 2024 Event-Core. Todos los derechos reservados.'}
  </footer>

{:else if componentType === 'panel'}
  <div class="bg-bg-card border border-border rounded-lg overflow-hidden">
    {#if props.title}
      <div class="px-4 py-3 border-b border-border bg-bg-secondary">
        <h3 class="font-medium">{props.title}</h3>
      </div>
    {/if}
    <div class="p-4">
      {props.content || 'Contenido del panel...'}
    </div>
  </div>

{:else if componentType === 'tree'}
  <div class="space-y-1">
    {#each (props.items || [{label: 'Raíz', children: [{label: 'Hijo 1'}, {label: 'Hijo 2'}]}]) as item}
      <div class="pl-2">
        <div class="flex items-center gap-1 py-1 hover:bg-bg-hover rounded px-2 cursor-pointer">
          <span class="text-text-muted">{item.children?.length ? '▼' : '•'}</span>
          <span class="text-sm">{item.label}</span>
        </div>
        {#if item.children}
          <div class="ml-4 border-l border-border pl-2">
            {#each item.children as child}
              <div class="py-1 px-2 hover:bg-bg-hover rounded text-sm cursor-pointer">• {child.label}</div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>

{:else if componentType === 'chart'}
  <div class="bg-bg-card border border-border rounded-lg p-4">
    <h4 class="font-medium mb-3">{props.title || 'Gráfico'}</h4>
    <div class="h-48 flex items-end justify-around gap-2 border-b border-l border-border p-2">
      {#each (props.data || [60, 80, 45, 90, 70]) as value, i}
        <div
          class="bg-primary rounded-t flex-1 transition-all hover:opacity-80"
          style="height: {value}%"
          title="Valor: {value}"
        ></div>
      {/each}
    </div>
    <p class="text-xs text-text-muted mt-2 text-center">{props.type || 'bar'} chart</p>
  </div>

{:else if componentType === 'event-stream'}
  <div class="bg-bg-secondary border border-border rounded-lg overflow-hidden">
    <div class="px-3 py-2 border-b border-border flex items-center gap-2">
      <span class="w-2 h-2 bg-success rounded-full animate-pulse"></span>
      <span class="text-sm font-medium">{props.title || 'Event Stream'}</span>
    </div>
    <div class="p-2 space-y-1 max-h-48 overflow-auto font-mono text-xs">
      {#each (props.events || ['event.received', 'data.updated', 'status.changed']) as event, i}
        <div class="flex items-center gap-2 px-2 py-1 bg-bg-primary rounded">
          <span class="text-text-muted">{String(Date.now()).slice(-4)}</span>
          <span class="text-primary">{event}</span>
        </div>
      {/each}
    </div>
  </div>

{:else if componentType === 'file-upload'}
  <div>
    {#if props.label}
      <label class="block text-sm font-medium mb-1">{props.label}</label>
    {/if}
    <div class="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer">
      <span class="text-3xl block mb-2">📁</span>
      <p class="text-sm text-text-muted">{props.placeholder || 'Arrastra archivos aquí o haz clic para seleccionar'}</p>
      <p class="text-xs text-text-muted mt-1">{props.accept || 'Cualquier archivo'}</p>
    </div>
  </div>

{:else if componentType === 'date-picker'}
  <div>
    {#if props.label}
      <label class="block text-sm font-medium mb-1">{props.label}</label>
    {/if}
    <input
      type="date"
      disabled={isPreview}
      value={props.value || ''}
      class="w-full px-3 py-2 bg-bg-input border border-border rounded-lg focus:ring-2 focus:ring-primary disabled:opacity-50"
    />
  </div>

{:else if componentType === 'toast'}
  <div class="fixed bottom-4 right-4 max-w-sm bg-bg-card border border-border rounded-lg shadow-lg p-4 flex items-start gap-3">
    <span class="text-xl">{props.icon || 'ℹ️'}</span>
    <div class="flex-1">
      {#if props.title}
        <h4 class="font-medium text-sm">{props.title}</h4>
      {/if}
      <p class="text-sm text-text-muted">{props.message || 'Notificación de ejemplo'}</p>
    </div>
    <button class="text-text-muted hover:text-text">✕</button>
  </div>

{:else if componentType === 'progress'}
  <div>
    {#if props.label}
      <div class="flex justify-between text-sm mb-1">
        <span>{props.label}</span>
        <span class="text-text-muted">{props.value || 50}%</span>
      </div>
    {/if}
    <div class="h-2 bg-bg-secondary rounded-full overflow-hidden">
      <div
        class="h-full bg-primary rounded-full transition-all"
        style="width: {props.value || 50}%"
      ></div>
    </div>
  </div>

{:else if componentType === 'skeleton'}
  <div class="animate-pulse space-y-3">
    <div class="h-4 bg-bg-secondary rounded w-3/4"></div>
    <div class="h-4 bg-bg-secondary rounded w-1/2"></div>
    <div class="h-4 bg-bg-secondary rounded w-5/6"></div>
    {#if props.avatar}
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-bg-secondary rounded-full"></div>
        <div class="flex-1 space-y-2">
          <div class="h-3 bg-bg-secondary rounded w-1/3"></div>
          <div class="h-3 bg-bg-secondary rounded w-1/4"></div>
        </div>
      </div>
    {/if}
  </div>

{:else if componentType === 'dropdown'}
  <div class="relative inline-block">
    <button
      disabled={isPreview}
      class="px-4 py-2 bg-bg-secondary border border-border rounded-lg flex items-center gap-2 hover:bg-bg-hover disabled:opacity-50"
    >
      {props.label || 'Opciones'}
      <span class="text-xs">▼</span>
    </button>
    {#if !isPreview}
      <div class="absolute top-full left-0 mt-1 w-48 bg-bg-card border border-border rounded-lg shadow-lg py-1 z-10">
        {#each (props.items || [{label: 'Opción 1'}, {label: 'Opción 2'}]) as item}
          <button class="w-full text-left px-4 py-2 text-sm hover:bg-bg-hover">
            {item.icon || ''} {item.label}
          </button>
        {/each}
      </div>
    {/if}
  </div>

{:else if componentType === 'chat-input'}
  <div class="flex gap-2">
    <input
      type="text"
      placeholder={props.placeholder || 'Escribe un mensaje...'}
      disabled={isPreview}
      class="flex-1 px-4 py-2 bg-bg-input border border-border rounded-lg focus:ring-2 focus:ring-primary disabled:opacity-50"
    />
    <button
      disabled={isPreview}
      class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
    >
      {props.sendLabel || '➤'}
    </button>
  </div>

{:else if componentType === 'conversation-panel'}
  <div class="border border-border rounded-lg overflow-hidden bg-bg-card">
    <div class="px-4 py-3 border-b border-border bg-bg-secondary flex items-center gap-2">
      <span class="text-xl">💬</span>
      <span class="font-medium">{props.title || 'Conversación'}</span>
    </div>
    <div class="p-4 space-y-4 max-h-64 overflow-auto">
      <div class="flex gap-3">
        <div class="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-sm">🤖</div>
        <div class="flex-1 bg-bg-secondary rounded-lg p-3 text-sm">
          {props.welcomeMessage || '¡Hola! ¿En qué puedo ayudarte?'}
        </div>
      </div>
      <div class="flex gap-3 flex-row-reverse">
        <div class="w-8 h-8 bg-bg-secondary rounded-full flex items-center justify-center text-sm">👤</div>
        <div class="flex-1 bg-primary/10 rounded-lg p-3 text-sm">
          Mensaje de ejemplo del usuario...
        </div>
      </div>
    </div>
  </div>

{:else if componentType === 'prompt-selector'}
  <div class="space-y-2">
    <label class="block text-sm font-medium">{props.label || 'Seleccionar Prompt'}</label>
    <div class="grid grid-cols-2 gap-2">
      {#each (props.prompts || [{name: 'Resumen', icon: '📝'}, {name: 'Análisis', icon: '🔍'}]) as prompt}
        <button
          disabled={isPreview}
          class="p-3 border border-border rounded-lg hover:border-primary hover:bg-primary/5 text-left transition-colors disabled:opacity-50"
        >
          <span class="text-xl block mb-1">{prompt.icon}</span>
          <span class="text-sm font-medium">{prompt.name}</span>
        </button>
      {/each}
    </div>
  </div>

{:else if componentType === 'custom'}
  <div class="border-2 border-dashed border-primary/50 rounded-lg p-4 bg-primary/5">
    <div class="flex items-center gap-2 mb-2">
      <span class="text-xl">🧩</span>
      <span class="font-medium text-sm">Componente Custom</span>
    </div>
    <p class="text-xs text-text-muted">{props.description || 'Componente personalizado - implementar según necesidades'}</p>
    {#if props.code}
      <pre class="mt-2 text-xs bg-bg-secondary p-2 rounded overflow-auto">{props.code}</pre>
    {/if}
  </div>

{:else if componentType === 'slot'}
  <div class="border border-dashed border-border rounded-lg p-4 min-h-[100px] flex items-center justify-center">
    <div class="text-center text-text-muted">
      <span class="text-2xl block mb-1">📥</span>
      <p class="text-sm">{props.name || 'Slot'}</p>
      <p class="text-xs">Área para contenido dinámico</p>
    </div>
  </div>

{:else}
  <!-- Componente desconocido -->
  <div class="border border-dashed border-yellow-500 rounded-lg p-4 bg-yellow-50">
    <p class="text-sm text-yellow-700">
      ⚠️ Componente no reconocido: <code class="bg-yellow-100 px-1 rounded">{componentType}</code>
    </p>
  </div>
{/if}
