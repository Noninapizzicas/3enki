<script lang="ts">
  /**
   * Banner de conflictos arriba del Panel (D3). Visible solo si hay conflictos.
   * Boton 'Resolver' pre-rellena el chat (Postura B, frase Q4 detectar_conflictos).
   */
  import { prefillChatInput } from '$lib/stores/chatInputDraft';
  import type { Conflicto } from '$lib/stores/carta-scheduler';

  export let conflictos: Conflicto[];

  function resolver() {
    prefillChatInput('Detecta conflictos entre las reglas activas de programacion.');
  }
</script>

<div class="conflictos-banner">
  <h3>
    ⚠ {conflictos.length} conflicto{conflictos.length > 1 ? 's' : ''} detectado{conflictos.length >
    1
      ? 's'
      : ''} en las reglas
  </h3>
  <ul>
    {#each conflictos as c}
      <li>
        Canal <strong>{c.regla_a.canal}</strong>: regla "{c.regla_a.cron_expression}" colisiona con
        otra (cartas distintas).
      </li>
    {/each}
  </ul>
  <button on:click={resolver}>Resolver conflictos en chat</button>
</div>

<style>
  .conflictos-banner {
    background: rgba(234, 179, 8, 0.12);
    border: 1px solid rgba(234, 179, 8, 0.45);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    color: #eab308;
  }
  .conflictos-banner h3 {
    margin: 0 0 0.4rem;
    font-size: 0.95rem;
  }
  .conflictos-banner ul {
    margin: 0 0 0.6rem;
    padding-left: 1.1rem;
    font-size: 0.82rem;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .conflictos-banner button {
    background: rgba(234, 179, 8, 0.2);
    color: #eab308;
    border: 1px solid rgba(234, 179, 8, 0.45);
    border-radius: 6px;
    padding: 0.4rem 0.8rem;
    cursor: pointer;
    font-size: 0.83rem;
  }
</style>
