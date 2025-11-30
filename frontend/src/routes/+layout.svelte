<script lang="ts">
  import { onMount } from 'svelte';
  import { connect, disconnect } from '$stores/mqtt';
  import { loadModules } from '$stores/modules';
  import { Sidebar } from '$components/layout';
  import { Toast } from '$components/feedback';
  import config from '$lib/config';
  import '../app.css';

  let sidebarCollapsed = false;

  onMount(() => {
    // Connect to MQTT broker using config
    connect(config.mqttUrl, config.coreId);

    // Load modules from API
    loadModules(config.apiUrl);

    return () => {
      disconnect();
    };
  });
</script>

<div class="min-h-screen bg-bg text-text">
  <!-- Sidebar -->
  <Sidebar bind:collapsed={sidebarCollapsed} />

  <!-- Main content -->
  <main
    class="transition-all duration-normal"
    class:ml-sidebar={!sidebarCollapsed}
    class:ml-sidebar-collapsed={sidebarCollapsed}
  >
    <slot />
  </main>

  <!-- Toast notifications -->
  <Toast />
</div>
