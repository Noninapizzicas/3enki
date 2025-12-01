<script lang="ts">
  /**
   * ComponentRenderer - Renderiza dinámicamente componentes del UI Designer
   * Mapea los componentes del template a componentes Svelte reales
   */
  import { Card, Button, Badge, Input, Select, Textarea, Checkbox, Radio } from '$components/ui';
  import { Alert, Spinner, Modal } from '$components/feedback';
  import { Header } from '$components/layout';
  import { StatCard, Table, List, Grid } from '$components/data';
  import { Tabs, Breadcrumb, Pagination } from '$components/navigation';

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
  <Header
    title={props.title || 'Título'}
    subtitle={props.subtitle || ''}
  />

{:else if componentType === 'card'}
  <Card class={props.class || ''}>
    {#if props.title}
      <h3 class="font-medium mb-2">{props.title}</h3>
    {/if}
    {#if props.content}
      <p class="text-text-muted">{props.content}</p>
    {:else}
      <p class="text-text-muted text-sm">Contenido de la card...</p>
    {/if}
  </Card>

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
  <StatCard
    label={props.label || 'Estadística'}
    value={props.value || '0'}
    icon={props.icon || '📊'}
    trend={props.trend || ''}
    color={props.color || 'primary'}
  />

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
            {#each (props.columns || ['Columna 1', 'Columna 2', 'Columna 3']) as col, j}
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
  <form class="space-y-4 p-4 border border-border rounded-lg">
    <p class="text-sm text-text-muted mb-4">Formulario: {props.title || 'Sin título'}</p>
    <div class="flex gap-2 justify-end pt-4 border-t border-border">
      <Button variant="ghost">{props.cancelLabel || 'Cancelar'}</Button>
      <Button variant="primary">{props.submitLabel || 'Guardar'}</Button>
    </div>
  </form>

{:else if componentType === 'input'}
  <div>
    {#if props.label}
      <label class="block text-sm font-medium mb-1">{props.label}</label>
    {/if}
    <Input
      type={props.type || 'text'}
      placeholder={props.placeholder || ''}
      disabled={isPreview}
      value={props.value || ''}
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
    <Textarea
      placeholder={props.placeholder || ''}
      rows={props.rows || 4}
      disabled={isPreview}
      value={props.value || ''}
    />
  </div>

{:else if componentType === 'select'}
  <div>
    {#if props.label}
      <label class="block text-sm font-medium mb-1">{props.label}</label>
    {/if}
    <Select disabled={isPreview}>
      <option value="">{props.placeholder || 'Seleccionar...'}</option>
      {#each (props.options || [{value: '1', label: 'Opción 1'}, {value: '2', label: 'Opción 2'}]) as opt}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </Select>
  </div>

{:else if componentType === 'checkbox'}
  <label class="flex items-center gap-2">
    <Checkbox checked={props.checked || false} disabled={isPreview} />
    <span>{props.label || 'Checkbox'}</span>
  </label>

{:else if componentType === 'radio'}
  <div>
    {#if props.label}
      <label class="block text-sm font-medium mb-2">{props.label}</label>
    {/if}
    <div class="space-y-2">
      {#each (props.options || [{value: '1', label: 'Opción 1'}, {value: '2', label: 'Opción 2'}]) as opt}
        <label class="flex items-center gap-2">
          <input type="radio" name={component.id} value={opt.value} disabled={isPreview} />
          <span>{opt.label}</span>
        </label>
      {/each}
    </div>
  </div>

{:else if componentType === 'button'}
  <Button
    variant={props.variant || 'primary'}
    size={props.size || 'md'}
    disabled={isPreview}
  >
    {#if props.icon}
      <span>{props.icon}</span>
    {/if}
    {props.label || 'Botón'}
  </Button>

{:else if componentType === 'button-group'}
  <div class="flex gap-2">
    {#each (props.buttons || [{label: 'Btn 1'}, {label: 'Btn 2'}]) as btn}
      <Button variant={btn.variant || 'secondary'} size="sm" disabled={isPreview}>
        {btn.label}
      </Button>
    {/each}
  </div>

{:else if componentType === 'alert'}
  <Alert
    variant={props.variant || 'info'}
    title={props.title || ''}
  >
    {props.message || 'Mensaje de alerta'}
  </Alert>

{:else if componentType === 'spinner'}
  <div class="flex items-center justify-center p-4">
    <Spinner size={props.size || 'md'} />
  </div>

{:else if componentType === 'modal'}
  <div class="border-2 border-dashed border-border rounded-lg p-4 bg-bg-secondary">
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-medium">{props.title || 'Modal'}</h3>
      <span class="text-text-muted">✕</span>
    </div>
    <p class="text-sm text-text-muted">Contenido del modal...</p>
    <div class="flex gap-2 justify-end mt-4 pt-3 border-t border-border">
      <Button variant="ghost" size="sm">Cancelar</Button>
      <Button variant="primary" size="sm">Aceptar</Button>
    </div>
  </div>

{:else if componentType === 'tabs'}
  <div>
    <div class="flex border-b border-border">
      {#each (props.items || [{id: '1', label: 'Tab 1'}, {id: '2', label: 'Tab 2'}]) as tab, i}
        <button
          class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
          class:border-primary={i === 0}
          class:text-primary={i === 0}
          class:border-transparent={i !== 0}
          class:text-text-muted={i !== 0}
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
      <span class:text-text-muted={i < (props.items?.length || 3) - 1}>
        {item.label}
      </span>
    {/each}
  </nav>

{:else if componentType === 'pagination'}
  <div class="flex items-center justify-center gap-2">
    <Button variant="ghost" size="sm" disabled={isPreview}>←</Button>
    {#each Array(Math.min(props.pages || 5, 5)) as _, i}
      <Button
        variant={i === 0 ? 'primary' : 'ghost'}
        size="sm"
        disabled={isPreview}
      >
        {i + 1}
      </Button>
    {/each}
    <Button variant="ghost" size="sm" disabled={isPreview}>→</Button>
  </div>

{:else}
  <!-- Componente desconocido -->
  <div class="border border-dashed border-warning rounded-lg p-4 bg-warning/10">
    <p class="text-sm text-warning">
      ⚠️ Componente no reconocido: <code>{componentType}</code>
    </p>
  </div>
{/if}
