<script lang="ts">
  import { Header } from '$components/layout';
  import { Card, Button } from '$components/ui';
  import { StatCard, EventStream } from '$components/data';
  import { modules, mqttState, events } from '$stores';
  import { toast } from '$stores/toast';

  // Stats derivados
  $: totalModules = $modules.length;
  $: activeModules = $modules.filter(m => m.status === 'loaded').length;
  $: totalEvents = $events.length;

  function handleTestToast() {
    toast.success('Conexión establecida correctamente');
  }
</script>

<svelte:head>
  <title>Dashboard - Event-Core</title>
</svelte:head>

<Header title="Dashboard" subtitle="Vista general del sistema Event-Core" />

<div class="p-6 space-y-6">
  <!-- Stats Row -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    <StatCard
      title="Módulos Activos"
      value={activeModules}
      icon="📦"
      change={0}
      trend="neutral"
    />
    <StatCard
      title="Total Módulos"
      value={totalModules}
      icon="📊"
    />
    <StatCard
      title="Eventos Recientes"
      value={totalEvents}
      icon="⚡"
      trend="up"
    />
    <StatCard
      title="Estado MQTT"
      value={$mqttState.connected ? 'Online' : 'Offline'}
      icon={$mqttState.connected ? '🟢' : '🔴'}
    />
  </div>

  <!-- Main Content Grid -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Event Stream -->
    <div class="lg:col-span-2">
      <EventStream maxEvents={20} />
    </div>

    <!-- Quick Actions -->
    <div class="space-y-4">
      <Card title="Acciones Rápidas">
        <div class="space-y-2">
          <Button variant="primary" class="w-full" on:click={handleTestToast}>
            Test Toast
          </Button>
          <Button variant="secondary" href="/modules" class="w-full">
            Ver Módulos
          </Button>
          <Button variant="outline" href="/events" class="w-full">
            Ver Eventos
          </Button>
        </div>
      </Card>

      <Card title="Conexión">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm text-text-muted">Core ID</span>
            <span class="text-sm font-mono">{$mqttState.coreId || '-'}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-text-muted">Estado</span>
            <span class="text-sm" class:text-success={$mqttState.connected} class:text-danger={!$mqttState.connected}>
              {$mqttState.connected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
          {#if $mqttState.error}
            <p class="text-sm text-danger">{$mqttState.error}</p>
          {/if}
        </div>
      </Card>
    </div>
  </div>
</div>
