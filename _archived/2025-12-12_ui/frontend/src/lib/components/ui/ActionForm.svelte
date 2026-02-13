<script context="module" lang="ts">
  export interface FormField {
    name: string;
    type: 'text' | 'textarea' | 'select' | 'checkbox' | 'password' | 'number';
    label: string;
    placeholder?: string;
    required?: boolean;
    options?: { value: string; label: string }[];
    value?: string | number | boolean;
  }

  export interface FormAction {
    label: string;
    emit: string;                    // Nombre del evento a emitir
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    icon?: string;
    validate?: boolean;              // Si debe validar antes de emitir (default: true para primary)
    disabled?: boolean;
  }
</script>

<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  /**
   * ActionForm - Formulario con acciones
   *
   * FILOSOFÍA (CONTEXT_UI.md):
   * - Padre controla TODO vía CSS variables
   * - Campos dinámicos via props
   * - Acciones flexibles (1 o múltiples botones)
   *
   * CSS VARIABLES (padre las define):
   * --form-gap: espacio entre campos (default: 0.75rem)
   * --form-padding: padding interno (default: 0)
   * --form-label-size: tamaño label (default: 0.75rem)
   * --form-input-size: tamaño input (default: 0.875rem)
   */

  export let fields: FormField[] = [];
  export let actions: FormAction[] = [];  // Nueva prop para múltiples acciones

  // Props legacy (retrocompatibilidad)
  export let submitLabel: string = 'Guardar';
  export let cancelLabel: string = 'Cancelar';
  export let submitIcon: string = '';
  export let showCancel: boolean = true;

  export let loading: boolean = false;
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher();

  // Estado del formulario
  let formData: Record<string, unknown> = {};
  let errors: Record<string, string> = {};

  // Construir acciones: si no se pasan, usar props legacy
  $: computedActions = actions.length > 0 ? actions : buildLegacyActions();

  function buildLegacyActions(): FormAction[] {
    const result: FormAction[] = [];
    if (showCancel) {
      result.push({ label: cancelLabel, emit: 'cancel', variant: 'ghost', validate: false });
    }
    result.push({ label: submitLabel, emit: 'submit', variant: 'primary', icon: submitIcon, validate: true });
    return result;
  }

  // Inicializar valores
  $: {
    fields.forEach(field => {
      if (formData[field.name] === undefined) {
        formData[field.name] = field.value ?? (field.type === 'checkbox' ? false : '');
      }
    });
  }

  function validate(): boolean {
    errors = {};
    let valid = true;

    fields.forEach(field => {
      if (field.required && !formData[field.name]) {
        errors[field.name] = 'Requerido';
        valid = false;
      }
    });

    return valid;
  }

  function handleAction(action: FormAction) {
    if (disabled || loading || action.disabled) return;

    const shouldValidate = action.validate ?? (action.variant === 'primary');

    if (shouldValidate && !validate()) return;

    dispatch(action.emit, { ...formData });
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    // Buscar la acción primary y ejecutarla
    const primaryAction = computedActions.find(a => a.variant === 'primary');
    if (primaryAction) {
      handleAction(primaryAction);
    }
  }
</script>

<form class="action-form" on:submit={handleSubmit}>
  <div class="action-form__fields">
    {#each fields as field (field.name)}
      <div class="action-form__field" class:action-form__field--error={errors[field.name]}>
        {#if field.type !== 'checkbox'}
          <label class="action-form__label" for={field.name}>
            {field.label}
            {#if field.required}<span class="action-form__required">*</span>{/if}
          </label>
        {/if}

        {#if field.type === 'text' || field.type === 'password' || field.type === 'number'}
          <input
            class="action-form__input"
            type={field.type}
            id={field.name}
            name={field.name}
            placeholder={field.placeholder}
            bind:value={formData[field.name]}
            {disabled}
          />
        {:else if field.type === 'textarea'}
          <textarea
            class="action-form__input action-form__textarea"
            id={field.name}
            name={field.name}
            placeholder={field.placeholder}
            bind:value={formData[field.name]}
            {disabled}
          ></textarea>
        {:else if field.type === 'select'}
          <select
            class="action-form__input"
            id={field.name}
            name={field.name}
            bind:value={formData[field.name]}
            {disabled}
          >
            <option value="">{field.placeholder || 'Seleccionar...'}</option>
            {#each field.options || [] as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        {:else if field.type === 'checkbox'}
          <label class="action-form__checkbox">
            <input
              type="checkbox"
              id={field.name}
              name={field.name}
              checked={Boolean(formData[field.name])}
              on:change={(e) => formData[field.name] = e.currentTarget.checked}
              {disabled}
            />
            <span>{field.label}</span>
            {#if field.required}<span class="action-form__required">*</span>{/if}
          </label>
        {/if}

        {#if errors[field.name]}
          <span class="action-form__error">{errors[field.name]}</span>
        {/if}
      </div>
    {/each}
  </div>

  <div class="action-form__actions">
    {#each computedActions as action}
      <button
        type={action.variant === 'primary' ? 'submit' : 'button'}
        class="action-form__btn action-form__btn--{action.variant || 'secondary'}"
        on:click={() => action.variant !== 'primary' && handleAction(action)}
        disabled={disabled || loading || action.disabled}
      >
        {#if loading && action.variant === 'primary'}
          <span class="action-form__spinner"></span>
        {:else if action.icon}
          <span>{action.icon}</span>
        {/if}
        {action.label}
      </button>
    {/each}
  </div>
</form>

<style>
  .action-form {
    --_gap: var(--form-gap, 0.75rem);
    --_padding: var(--form-padding, 0);
    --_label-size: var(--form-label-size, 0.75rem);
    --_input-size: var(--form-input-size, 0.875rem);

    display: flex;
    flex-direction: column;
    gap: var(--_gap);
    padding: var(--_padding);
  }

  .action-form__fields {
    display: flex;
    flex-direction: column;
    gap: var(--_gap);
  }

  .action-form__field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .action-form__label {
    font-size: var(--_label-size);
    font-weight: 500;
    color: var(--color-text-muted, #666);
  }

  .action-form__required {
    color: var(--color-danger, #ef4444);
  }

  .action-form__input {
    font-size: var(--_input-size);
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 6px;
    background: var(--color-bg, #fff);
    color: var(--color-text, inherit);
    transition: border-color 0.15s;
  }

  .action-form__input:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
  }

  .action-form__input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .action-form__textarea {
    min-height: 80px;
    resize: vertical;
  }

  .action-form__field--error .action-form__input {
    border-color: var(--color-danger, #ef4444);
  }

  .action-form__error {
    font-size: 0.7rem;
    color: var(--color-danger, #ef4444);
  }

  .action-form__checkbox {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: var(--_input-size);
    cursor: pointer;
  }

  .action-form__checkbox input {
    width: 1rem;
    height: 1rem;
  }

  .action-form__actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .action-form__btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    transition: opacity 0.15s;
  }

  .action-form__btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .action-form__btn--ghost {
    background: transparent;
    color: var(--color-text-muted, #666);
  }

  .action-form__btn--ghost:hover:not(:disabled) {
    background: var(--color-bg-hover, rgba(0,0,0,0.05));
  }

  .action-form__btn--secondary {
    background: var(--color-bg-muted, #f3f4f6);
    color: var(--color-text, #374151);
  }

  .action-form__btn--secondary:hover:not(:disabled) {
    background: var(--color-bg-hover, #e5e7eb);
  }

  .action-form__btn--primary {
    background: var(--color-primary, #3b82f6);
    color: white;
  }

  .action-form__btn--primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .action-form__btn--danger {
    background: var(--color-danger, #ef4444);
    color: white;
  }

  .action-form__btn--danger:hover:not(:disabled) {
    opacity: 0.9;
  }

  .action-form__spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
