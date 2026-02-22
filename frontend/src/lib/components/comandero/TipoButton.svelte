<script lang="ts">
  /**
   * TipoButton — Botón lateral para crear nueva cuenta
   *
   * Un toque: crea cuenta del tipo + abre comandero
   * Colores identificativos por tipo
   * Scoped por proyecto
   */
  import { createEventDispatcher } from 'svelte';
  import type { TipoCuenta } from '$lib/stores/cuentas';
  import { TIPO_COLORS, TIPO_ICONS, TIPO_LABELS, createCuenta } from '$lib/stores/cuentas';
  import { status as mqttStatus } from '$lib/ui-core';

  export let tipo: TipoCuenta;
  export let projectId: string = '';

  const dispatch = createEventDispatcher<{
    created: { cuenta_id: string; tipo: TipoCuenta };
    'select-mesa': void;
  }>();

  let creating = false;
  let error = '';

  async function handleClick() {
    if (creating) return;

    // Verificar conexión MQTT
    if ($mqttStatus !== 'connected') {
      error = 'Sin conexión';
      setTimeout(() => error = '', 2000);
      return;
    }

    // Tipo local → abrir selector de mesas
    if (tipo === 'local') {
      dispatch('select-mesa');
      return;
    }

    // Otros tipos → crear cuenta directamente
    creating = true;
    error = '';

    try {
      console.log('[TipoButton] Creating cuenta tipo:', tipo, 'project:', projectId);
      const cuenta = await createCuenta(projectId, tipo);

      if (cuenta) {
        console.log('[TipoButton] Cuenta created:', cuenta.id);
        dispatch('created', { cuenta_id: cuenta.id, tipo: cuenta.tipo });
      } else {
        console.error('[TipoButton] createCuenta returned null');
        error = 'Error';
        setTimeout(() => error = '', 2000);
      }
    } catch (err: any) {
      console.error('[TipoButton] Error:', err);
      error = 'Error';
      setTimeout(() => error = '', 2000);
    } finally {
      creating = false;
    }
  }

  $: color = TIPO_COLORS[tipo];
  $: icon = TIPO_ICONS[tipo];
  $: label = TIPO_LABELS[tipo];
</script>

<button
  class="tipo-btn"
  class:creating
  class:error={!!error}
  style="--tipo-color: {color}"
  on:click={handleClick}
  disabled={creating}
  title="Nueva cuenta {label}"
>
  <span class="icon">{error ? '⚠' : icon}</span>
  <span class="label">{error || label}</span>
</button>

<style>
  .tipo-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    padding: 12px 8px;
    border: 2px solid var(--tipo-color);
    border-radius: 12px;
    background: color-mix(in srgb, var(--tipo-color) 10%, transparent);
    color: var(--tipo-color);
    cursor: pointer;
    transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }

  .tipo-btn:active:not(:disabled) {
    transform: scale(0.95);
    background: color-mix(in srgb, var(--tipo-color) 25%, transparent);
    box-shadow: 0 0 16px color-mix(in srgb, var(--tipo-color) 30%, transparent);
  }

  .tipo-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .tipo-btn.creating {
    animation: pulse-create 0.6s ease-in-out infinite;
  }

  .tipo-btn.error {
    --tipo-color: #ef4444;
    animation: shake 0.3s ease-in-out;
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    75% { transform: translateX(4px); }
  }

  .icon {
    font-size: 1.5rem;
    line-height: 1;
  }

  .label {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  @keyframes pulse-create {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
</style>
