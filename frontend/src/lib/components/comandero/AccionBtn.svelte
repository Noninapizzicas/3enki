<script lang="ts">
  /**
   * AccionBtn — Botón de acción en sidebar (Cuenta, Enviar, Cobro, Salir)
   */
  import { createEventDispatcher } from 'svelte';

  export let id: string;
  export let label: string;
  export let icon: string = '';
  export let color: string = '#666';
  export let variant: 'default' | 'primary' | 'danger' = 'default';
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher<{
    click: { id: string };
  }>();

  function handleClick() {
    if (!disabled) {
      dispatch('click', { id });
    }
  }

  $: variantColor = variant === 'primary' ? '#22c55e' :
                    variant === 'danger' ? '#ef4444' : color;
</script>

<button
  class="accion-btn"
  class:disabled
  class:primary={variant === 'primary'}
  class:danger={variant === 'danger'}
  style="--btn-color: {variantColor}"
  on:click={handleClick}
  {disabled}
>
  {#if icon}
    <span class="icon">{icon}</span>
  {/if}
  <span class="label">{label}</span>
</button>

<style>
  .accion-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    width: 100%;
    padding: 10px 4px;
    border: 2px solid var(--btn-color);
    border-radius: 8px;
    background: transparent;
    color: var(--btn-color);
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
    -webkit-tap-highlight-color: transparent;
  }

  .accion-btn:active:not(.disabled) {
    transform: scale(0.95);
    background: color-mix(in srgb, var(--btn-color) 15%, transparent);
  }

  .accion-btn.primary {
    background: var(--btn-color);
    color: #fff;
  }

  .accion-btn.danger {
    border-style: dashed;
  }

  .accion-btn.disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .icon {
    font-size: 1.1rem;
    line-height: 1;
  }

  .label {
    line-height: 1;
  }

  @media (max-width: 600px) {
    .accion-btn {
      padding: 7px 2px;
      border-radius: 5px;
      border-width: 1.5px;
      font-size: 0.58rem;
    }
    .icon { font-size: 0.8rem; }
  }
</style>
