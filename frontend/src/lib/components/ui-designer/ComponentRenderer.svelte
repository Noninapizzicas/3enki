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

{:else}
  <!-- Componente desconocido -->
  <div class="border border-dashed border-yellow-500 rounded-lg p-4 bg-yellow-50">
    <p class="text-sm text-yellow-700">
      ⚠️ Componente no reconocido: <code class="bg-yellow-100 px-1 rounded">{componentType}</code>
    </p>
  </div>
{/if}
