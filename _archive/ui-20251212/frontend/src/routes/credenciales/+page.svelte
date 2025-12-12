<script lang="ts">
  import { onMount } from 'svelte';
  import { Header } from '$components/layout';
  import { Card, Button, Badge, Input, Select } from '$components/ui';
  import { Modal, Spinner } from '$components/feedback';
  import { StatCard, Table } from '$components/data';
  import { subscribe, events } from '$stores/mqtt';
  import { toast } from '$stores/toast';
  import config from '$lib/config';

  // Types
  interface Credential {
    key: string;
    provider: 'OPENAI' | 'DEEPSEEK' | 'ANTHROPIC' | 'OLLAMA';
    level: 'GLOBAL' | 'PROJECT' | 'CLIENT' | 'CUSTOM';
    identifier?: string;
    api_key_preview: string;
  }

  // State
  let credentials: Credential[] = [];
  let loading = true;
  let error: string | null = null;

  // Modal state
  let modalOpen = false;
  let editingCredential: Credential | null = null;
  let formData = {
    provider: 'OPENAI' as Credential['provider'],
    level: 'GLOBAL' as Credential['level'],
    identifier: '',
    api_key: ''
  };
  let saving = false;

  // Options
  const providers = [
    { value: 'OPENAI', label: '🤖 OpenAI' },
    { value: 'DEEPSEEK', label: '🔮 DeepSeek' },
    { value: 'ANTHROPIC', label: '🧠 Anthropic' },
    { value: 'OLLAMA', label: '🦙 Ollama' }
  ];

  const levels = [
    { value: 'GLOBAL', label: '🌐 GLOBAL' },
    { value: 'PROJECT', label: '📁 PROJECT' },
    { value: 'CLIENT', label: '👤 CLIENT' },
    { value: 'CUSTOM', label: '⚙️ CUSTOM' }
  ];

  // Badge colors
  const providerColors: Record<string, string> = {
    OPENAI: 'primary',
    DEEPSEEK: 'info',
    ANTHROPIC: 'success',
    OLLAMA: 'warning'
  };

  const levelColors: Record<string, string> = {
    GLOBAL: 'success',
    PROJECT: 'info',
    CLIENT: 'warning',
    CUSTOM: 'danger'
  };

  // API
  const apiBase = `${config.apiUrl}/modules/credential-manager`;

  async function fetchCredentials() {
    loading = true;
    error = null;
    try {
      const res = await fetch(`${apiBase}/credentials`);
      if (!res.ok) throw new Error('Error al cargar credenciales');
      const data = await res.json();
      credentials = data.credentials || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error desconocido';
    } finally {
      loading = false;
    }
  }

  async function saveCredential() {
    saving = true;
    try {
      const res = await fetch(`${apiBase}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al guardar');
      }
      closeModal();
      toast.success('Credencial guardada correctamente');
      await fetchCredentials(); // Refresh list
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      saving = false;
    }
  }

  async function updateCredential() {
    if (!editingCredential) return;
    saving = true;
    try {
      const res = await fetch(`${apiBase}/credentials/${encodeURIComponent(editingCredential.key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: formData.api_key })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al actualizar');
      }
      closeModal();
      toast.success('Credencial actualizada');
      await fetchCredentials(); // Refresh list
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      saving = false;
    }
  }

  async function deleteCredential(cred: Credential) {
    if (!confirm(`¿Eliminar credencial ${cred.key}?`)) return;
    try {
      const res = await fetch(`${apiBase}/credentials/${encodeURIComponent(cred.key)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Error al eliminar');
      toast.success('Credencial eliminada');
      await fetchCredentials(); // Refresh list
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  // Modal handlers
  function openCreateModal() {
    editingCredential = null;
    formData = { provider: 'OPENAI', level: 'GLOBAL', identifier: '', api_key: '' };
    modalOpen = true;
  }

  function openEditModal(cred: Credential) {
    editingCredential = cred;
    formData = {
      provider: cred.provider,
      level: cred.level,
      identifier: cred.identifier || '',
      api_key: ''
    };
    modalOpen = true;
  }

  function closeModal() {
    modalOpen = false;
    editingCredential = null;
  }

  function handleSubmit() {
    if (editingCredential) {
      updateCredential();
    } else {
      saveCredential();
    }
  }

  // Action handler for table
  function handleAction(event: CustomEvent<{ action: string; row: Record<string, unknown> }>) {
    const { action, row } = event.detail;
    const cred = row as unknown as Credential;
    if (action === 'edit') {
      openEditModal(cred);
    } else if (action === 'delete') {
      deleteCredential(cred);
    }
  }

  // Stats computed
  $: totalCredentials = credentials.length;
  $: globalCount = credentials.filter(c => c.level === 'GLOBAL').length;
  $: projectCount = credentials.filter(c => c.level === 'PROJECT').length;
  $: clientCount = credentials.filter(c => c.level === 'CLIENT').length;

  // Real-time updates via MQTT
  $: {
    const lastEvent = $events[$events.length - 1];
    if (lastEvent) {
      if (lastEvent.type.includes('credential.saved') ||
          lastEvent.type.includes('credential.updated') ||
          lastEvent.type.includes('credential.deleted')) {
        fetchCredentials();
      }
    }
  }

  // Table configuration
  const columns = [
    { field: 'key', label: 'Key', sortable: true },
    { field: 'provider', label: 'Provider', type: 'badge' as const },
    { field: 'level', label: 'Nivel', type: 'badge' as const },
    { field: 'api_key_preview', label: 'Preview' },
    { field: 'identifier', label: 'Identifier' }
  ];

  const actions = [
    { label: '✏️', handler: 'edit', variant: 'ghost' as const },
    { label: '🗑️', handler: 'delete', variant: 'danger' as const }
  ];

  onMount(() => {
    fetchCredentials();
    subscribe(['core/+/events/credential/#']);
  });
</script>

<svelte:head>
  <title>Credenciales - Event-Core</title>
</svelte:head>

<Header title="🔐 Credential Manager" subtitle="Gestión de credenciales para proveedores de IA" />

<div class="p-4 md:p-6 space-y-6">
  <!-- Stats Row -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
    <StatCard
      title="Total"
      value={totalCredentials}
      icon="🔑"
    />
    <StatCard
      title="GLOBAL"
      value={globalCount}
      icon="🌐"
    />
    <StatCard
      title="PROJECT"
      value={projectCount}
      icon="📁"
    />
    <StatCard
      title="CLIENT"
      value={clientCount}
      icon="👤"
    />
  </div>

  <!-- Actions Bar -->
  <div class="flex items-center justify-between">
    <Badge variant="primary">{credentials.length} credenciales</Badge>
    <Button variant="primary" on:click={openCreateModal}>
      + Nueva Credencial
    </Button>
  </div>

  <!-- Main Content: Two columns on desktop -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Left: Table (2/3) -->
    <div class="lg:col-span-2">
      {#if loading}
        <Card class="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </Card>
      {:else if error}
        <Card class="text-center py-8">
          <p class="text-danger mb-4">{error}</p>
          <Button variant="secondary" on:click={fetchCredentials}>Reintentar</Button>
        </Card>
      {:else if credentials.length === 0}
        <Card class="text-center py-12">
          <span class="text-4xl mb-4 block">🔐</span>
          <p class="text-text-muted mb-4">No hay credenciales configuradas</p>
          <Button variant="primary" on:click={openCreateModal}>Crear primera credencial</Button>
        </Card>
      {:else}
        <!-- Mobile: Cards view -->
        <div class="block md:hidden space-y-3">
          {#each credentials as cred (cred.key)}
            <Card hover on:click={() => openEditModal(cred)}>
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-2">
                    <Badge variant={providerColors[cred.provider]}>{cred.provider}</Badge>
                    <Badge variant={levelColors[cred.level]}>{cred.level}</Badge>
                  </div>
                  <p class="font-mono text-sm truncate">{cred.key}</p>
                  <p class="text-xs text-text-muted mt-1">{cred.api_key_preview}</p>
                  {#if cred.identifier}
                    <p class="text-xs text-text-muted">ID: {cred.identifier}</p>
                  {/if}
                </div>
                <button
                  class="p-2 text-danger hover:bg-danger hover:bg-opacity-10 rounded"
                  on:click|stopPropagation={() => deleteCredential(cred)}
                >
                  🗑️
                </button>
              </div>
            </Card>
          {/each}
        </div>

        <!-- Desktop: Table view -->
        <div class="hidden md:block">
          <Table
            {columns}
            data={credentials}
            {actions}
            idField="key"
            on:action={handleAction}
          />
        </div>
      {/if}
    </div>

    <!-- Right: Info cards (1/3) -->
    <div class="space-y-4">
      <Card title="🔄 Cascada de Resolución">
        <div class="text-sm space-y-2 text-text-muted">
          <p>El sistema busca credenciales en orden:</p>
          <ol class="list-decimal list-inside space-y-1 mt-2">
            <li><Badge variant="danger" size="sm">CUSTOM</Badge> Prioridad 1</li>
            <li><Badge variant="warning" size="sm">CLIENT</Badge> Prioridad 2</li>
            <li><Badge variant="info" size="sm">PROJECT</Badge> Prioridad 3</li>
            <li><Badge variant="success" size="sm">GLOBAL</Badge> Fallback</li>
          </ol>
        </div>
      </Card>

      <Card title="🤖 Proveedores de IA">
        <div class="space-y-3">
          {#each providers as p}
            <div class="flex items-center justify-between text-sm">
              <span>{p.label}</span>
              <Badge variant={providerColors[p.value]} size="sm">
                {credentials.filter(c => c.provider === p.value).length}
              </Badge>
            </div>
          {/each}
        </div>
      </Card>
    </div>
  </div>
</div>

<!-- Create/Edit Modal -->
<Modal
  bind:open={modalOpen}
  title={editingCredential ? 'Editar Credencial' : 'Nueva Credencial'}
  size="md"
  on:close={closeModal}
>
  <form on:submit|preventDefault={handleSubmit} class="space-y-4">
    {#if !editingCredential}
      <Select
        label="Proveedor"
        bind:value={formData.provider}
        options={providers}
        required
      />

      <Select
        label="Nivel"
        bind:value={formData.level}
        options={levels}
        required
      />

      {#if formData.level !== 'GLOBAL'}
        <Input
          label="Identificador"
          bind:value={formData.identifier}
          placeholder="proyecto-1 o cliente-xyz"
          required={formData.level !== 'GLOBAL'}
        />
      {/if}
    {:else}
      <div class="p-3 bg-bg-hover rounded-lg space-y-2">
        <div class="flex justify-between text-sm">
          <span class="text-text-muted">Key:</span>
          <span class="font-mono">{editingCredential.key}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-text-muted">Provider:</span>
          <Badge variant={providerColors[editingCredential.provider]}>{editingCredential.provider}</Badge>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-text-muted">Nivel:</span>
          <Badge variant={levelColors[editingCredential.level]}>{editingCredential.level}</Badge>
        </div>
      </div>
    {/if}

    <Input
      label="API Key"
      type="password"
      bind:value={formData.api_key}
      placeholder="sk-..."
      required
    />
  </form>

  <svelte:fragment slot="footer">
    <Button variant="ghost" on:click={closeModal} disabled={saving}>
      Cancelar
    </Button>
    <Button variant="primary" on:click={handleSubmit} loading={saving}>
      {editingCredential ? 'Actualizar' : 'Guardar'}
    </Button>
  </svelte:fragment>
</Modal>
