<script lang="ts">
  import { onMount } from 'svelte';
  import { Shell, registry, eventBus } from '$ui-core';
  import { providerModule } from '$modules/provider';

  // Registrar módulos al montar
  onMount(() => {
    registry.register(providerModule);

    // Debug: escuchar todos los eventos
    const unsub = eventBus.on('provider.selected', (e) => {
      console.log('Provider seleccionado:', e.data);
    });

    const unsub2 = eventBus.on('model.selected', (e) => {
      console.log('Modelo seleccionado:', e.data);
    });

    return () => {
      unsub();
      unsub2();
      registry.unregister('provider');
    };
  });
</script>

<Shell showChat={true}>
  <div class="home">
    <h1>Event Core</h1>
    <p>UI Modular - Prototipo</p>

    <div class="info">
      <h2>Arquitectura</h2>
      <ul>
        <li><strong>Shell</strong> - Renderiza zonas dinámicamente</li>
        <li><strong>Módulos</strong> - Plugins UI auto-registrados</li>
        <li><strong>EventBus</strong> - Comunicación 100% por eventos</li>
        <li><strong>Registry</strong> - Autodescubrimiento</li>
      </ul>

      <h2>Módulo Provider</h2>
      <p>Usa los botones en la barra inferior del chat:</p>
      <ul>
        <li><code>🔌 Provider</code> - 1 toque: seleccionar proveedor</li>
        <li><code>🤖 Model</code> - 1 toque: seleccionar modelo</li>
      </ul>
    </div>
  </div>
</Shell>

<style>
  .home {
    max-width: 600px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  h1 {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }

  h2 {
    font-size: 1.25rem;
    margin-top: 1.5rem;
    margin-bottom: 0.5rem;
    color: #888;
  }

  p {
    color: #666;
  }

  .info {
    margin-top: 2rem;
    padding: 1rem;
    background: #111;
    border: 1px solid #222;
    border-radius: 8px;
  }

  ul {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }

  li {
    margin: 0.25rem 0;
    color: #aaa;
  }

  code {
    background: #1a1a1a;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-size: 0.875rem;
  }
</style>
