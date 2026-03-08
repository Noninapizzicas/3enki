<script lang="ts">
  /**
   * TipoButton — Botón lateral para crear nueva cuenta
   *
   * Un toque: crea cuenta del tipo + abre comandero
   *   - local → mesa strategy (cuentas-canales): auto-nombre "Mesa 1", "Mesa 2"...
   *   - llevar → llevar strategy (cuentas-canales): ticket numerado "llevar_20260308_001"
   *   - delivery → cuentas genérico
   *
   * Colores identificativos por tipo
   * Scoped por proyecto
   */
  import { createEventDispatcher } from 'svelte';
  import type { TipoCuenta } from '$lib/stores/cuentas';
  import { TIPO_COLORS, TIPO_ICONS, TIPO_LABELS, createCuenta, createMesa, createLlevar } from '$lib/stores/cuentas';
  import { status as mqttStatus } from '$lib/ui-core';

  export let tipo: TipoCuenta;
  export let projectId: string = '';

  const dispatch = createEventDispatcher<{
    created: { cuenta_id: string; tipo: TipoCuenta };
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

    creating = true;
    error = '';

    try {
      let cuenta_id: string | null = null;

      if (tipo === 'local') {
        // Mesa → usa cuentas-canales mesa strategy (auto-nombre)
        cuenta_id = await createMesa(projectId);
      } else if (tipo === 'llevar') {
        // Llevar → usa cuentas-canales llevar strategy (ticket numerado)
        cuenta_id = await createLlevar(projectId);
      } else {
        // Delivery/otros → cuentas genérico
        const cuenta = await createCuenta(projectId, tipo);
        cuenta_id = cuenta?.id || null;
      }

      if (cuenta_id) {
        console.log('[TipoButton] Created:', tipo, cuenta_id);
        dispatch('created', { cuenta_id, tipo });
      } else {
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
  <span class="icon">{error ? '\u26A0' : icon}</span>
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
