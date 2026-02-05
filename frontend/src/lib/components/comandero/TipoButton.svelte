<script lang="ts">
  /**
   * TipoButton — Botón lateral para crear nueva cuenta
   *
   * Un toque: crea cuenta del tipo + abre comandero
   * Colores identificativos por tipo
   */
  import { createEventDispatcher } from 'svelte';
  import type { TipoCuenta } from '$lib/stores/cuentas';
  import { TIPO_COLORS, TIPO_ICONS, TIPO_LABELS, createCuenta } from '$lib/stores/cuentas';

  export let tipo: TipoCuenta;

  const dispatch = createEventDispatcher<{
    created: { cuenta_id: string; tipo: TipoCuenta };
  }>();

  let creating = false;

  async function handleClick() {
    if (creating) return;
    creating = true;

    try {
      const cuenta = await createCuenta(tipo);
      if (cuenta) {
        dispatch('created', { cuenta_id: cuenta.id, tipo: cuenta.tipo });
      }
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
  style="--tipo-color: {color}"
  on:click={handleClick}
  disabled={creating}
  title="Nueva cuenta {label}"
>
  <span class="icon">{icon}</span>
  <span class="label">{label}</span>
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
