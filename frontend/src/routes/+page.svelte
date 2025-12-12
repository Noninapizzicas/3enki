<script lang="ts">
  /**
   * Página principal - Inicializa MQTT y registra módulos
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    Shell,
    connect,
    disconnect,
    register,
    unregister,
    subscribe,
    status,
    connected
  } from '$ui-core';
  import { providerModule, PROVIDER_TOPICS } from '$modules/provider';

  // ===========================================================================
  // ESTADO
  // ===========================================================================

  let currentProvider = 'deepseek';
  let currentModel = 'deepseek-chat';

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  let unsubState: (() => void) | null = null;

  onMount(() => {
    // 1. Conectar al broker MQTT
    connect({
      url: 'ws://localhost:9001',
      clientId: `ui-${Date.now().toString(36)}`
    });

    // 2. Registrar módulos
    register(providerModule);

    // 3. Escuchar cambios de estado del provider
    unsubState = subscribe(PROVIDER_TOPICS.STATE, (_topic, payload) => {
      const data = payload as { providerId: string; modelId: string };
      currentProvider = data.providerId;
      currentModel = data.modelId;
    });
  });

  onDestroy(() => {
    unsubState?.();
    unregister('provider');
    disconnect();
  });
</script>

<Shell showChat={true}>
  <div class="home">
    <header class="hero">
      <h1>Event Core</h1>
      <p class="subtitle">UI Modular sobre MQTT</p>

      <!-- Estado de conexión -->
      <div class="connection" class:connected={$connected}>
        <span class="connection__dot"></span>
        <span class="connection__text">
          {#if $status === 'connected'}
            Conectado al broker
          {:else if $status === 'connecting'}
            Conectando...
          {:else if $status === 'error'}
            Error de conexión
          {:else}
            Desconectado
          {/if}
        </span>
      </div>
    </header>

    <!-- Estado actual -->
    <section class="card">
      <h2>Estado Actual</h2>
      <dl class="state">
        <div class="state__item">
          <dt>Proveedor</dt>
          <dd>{currentProvider}</dd>
        </div>
        <div class="state__item">
          <dt>Modelo</dt>
          <dd>{currentModel}</dd>
        </div>
      </dl>
      <p class="hint">Usa los botones 🔌 y 🤖 en la barra de chat para cambiar</p>
    </section>

    <!-- Arquitectura -->
    <section class="card">
      <h2>Arquitectura</h2>
      <ul class="features">
        <li>
          <strong>MQTT</strong>
          <span>Comunicación real-time con el backend</span>
        </li>
        <li>
          <strong>Shell</strong>
          <span>Renderiza zonas dinámicamente</span>
        </li>
        <li>
          <strong>Registry</strong>
          <span>Gestiona módulos y suscripciones</span>
        </li>
        <li>
          <strong>Módulos</strong>
          <span>Plugins UI auto-registrados</span>
        </li>
      </ul>
    </section>
  </div>
</Shell>

<style>
  .home {
    max-width: 640px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  /* Hero */
  .hero {
    text-align: center;
    margin-bottom: 2rem;
  }

  h1 {
    font-size: 2.5rem;
    font-weight: 700;
    margin: 0;
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .subtitle {
    color: var(--shell-text-secondary, #888);
    margin: 0.5rem 0 1rem;
  }

  /* Connection status */
  .connection {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: var(--shell-btn-bg, #1a1a1a);
    border: 1px solid var(--shell-border, #333);
    border-radius: 20px;
    font-size: 0.8rem;
  }

  .connection__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--shell-badge, #ef4444);
  }

  .connection.connected .connection__dot {
    background: #22c55e;
  }

  .connection__text {
    color: var(--shell-text-secondary, #888);
  }

  /* Cards */
  .card {
    margin-bottom: 1.5rem;
    padding: 1.25rem;
    background: var(--shell-zone-bg, #111);
    border: 1px solid var(--shell-border, #222);
    border-radius: 12px;
  }

  h2 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 1rem;
    color: var(--shell-text-secondary, #888);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* State */
  .state {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    margin: 0;
  }

  .state__item {
    padding: 0.75rem;
    background: var(--shell-btn-bg, #1a1a1a);
    border-radius: 8px;
  }

  .state__item dt {
    font-size: 0.75rem;
    color: var(--shell-text-secondary, #888);
    margin-bottom: 0.25rem;
  }

  .state__item dd {
    margin: 0;
    font-weight: 500;
    font-family: ui-monospace, monospace;
  }

  .hint {
    margin: 1rem 0 0;
    font-size: 0.8rem;
    color: var(--shell-text-secondary, #666);
    text-align: center;
  }

  /* Features list */
  .features {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .features li {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.75rem;
    background: var(--shell-btn-bg, #1a1a1a);
    border-radius: 8px;
  }

  .features li strong {
    color: var(--shell-primary, #3b82f6);
  }

  .features li span {
    font-size: 0.85rem;
    color: var(--shell-text-secondary, #888);
  }
</style>
