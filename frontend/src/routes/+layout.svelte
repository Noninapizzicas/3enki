<script lang="ts">
  import { onMount } from 'svelte';
  import { connect, disconnect } from '$stores/mqtt';
  import { loadModules } from '$stores/modules';
  import { Sidebar } from '$components/layout';
  import { Toast } from '$components/feedback';
  import config from '$lib/config';
  import '../app.css';

  let sidebarCollapsed = false;
  let mobileOpen = false;
  let isMobile = false;

  onMount(() => {
    // Connect to MQTT broker using config
    connect(config.mqttUrl, config.coreId);

    // Load modules from API
    loadModules(config.apiUrl);

    // Check if mobile
    const checkMobile = () => {
      isMobile = window.innerWidth < 768;
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      disconnect();
      window.removeEventListener('resize', checkMobile);
    };
  });

  function handleMobileToggle(e: CustomEvent<boolean>) {
    mobileOpen = e.detail;
  }
</script>

<div class="min-h-screen bg-bg text-text">
  <!-- Mobile header with menu button -->
  {#if isMobile}
    <header class="fixed top-0 left-0 right-0 h-14 bg-bg-card border-b border-border flex items-center px-4 z-50">
      <button
        class="p-2 hover:bg-bg-hover rounded-md transition-colors"
        on:click={() => mobileOpen = !mobileOpen}
        aria-label="Abrir menú"
      >
        <span class="text-xl">☰</span>
      </button>
      <div class="flex items-center gap-2 ml-3">
        <span class="text-xl">⚡</span>
        <span class="font-bold">Event-Core</span>
      </div>
    </header>
  {/if}

  <!-- Sidebar -->
  <Sidebar bind:collapsed={sidebarCollapsed} bind:mobileOpen on:mobileToggle={handleMobileToggle} />

  <!-- Main content -->
  <main
    class="transition-all duration-normal min-h-screen"
    class:ml-sidebar={!sidebarCollapsed && !isMobile}
    class:ml-sidebar-collapsed={sidebarCollapsed && !isMobile}
    class:pt-14={isMobile}
  >
    <slot />
  </main>

  <!-- Toast notifications -->
  <Toast />
</div>
