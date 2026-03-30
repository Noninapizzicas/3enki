<script lang="ts">
  /**
   * BotonEspecial — Botón de barra superior con lógica especial
   * Ejemplos: Mitad y mitad, Pizza al gusto, Porción
   */
  import { createEventDispatcher } from 'svelte';

  export let id: string;
  export let label: string;
  export let icon: string = '';
  export let color: string = '#6366f1';
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher<{
    click: { id: string };
  }>();

  function handleClick() {
    if (!disabled) {
      dispatch('click', { id });
    }
  }
</script>

<button
  class="boton-especial"
  class:disabled
  style="--btn-color: {color}"
  on:click={handleClick}
  {disabled}
>
  {#if icon}
    <span class="icon">{icon}</span>
  {/if}
  <span class="label">{label}</span>
</button>

<style>
  .boton-especial {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border: none;
    border-radius: 8px;
    background: var(--btn-color);
    color: #fff;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.1s, opacity 0.2s;
    white-space: nowrap;
    -webkit-tap-highlight-color: transparent;
  }

  .boton-especial:active:not(.disabled) {
    transform: scale(0.95);
  }

  .boton-especial.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .icon {
    font-size: 1rem;
    line-height: 1;
  }

  .label {
    line-height: 1;
  }

  @media (max-width: 600px) {
    .boton-especial {
      padding: 5px 10px;
      font-size: 0.75rem;
      gap: 4px;
      border-radius: 6px;
    }
    .icon { font-size: 0.85rem; }
  }
</style>
