<script lang="ts">
  import { onMount, afterUpdate } from 'svelte';
  import Badge from '$components/ui/Badge.svelte';
  import Spinner from '$components/feedback/Spinner.svelte';

  type Message = {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    status?: 'sending' | 'sent' | 'error';
    metadata?: Record<string, unknown>;
  };

  export let messages: Message[] = [];
  export let loading = false;
  export let streamingContent = '';
  export let autoScroll = true;

  let container: HTMLDivElement;

  function scrollToBottom() {
    if (autoScroll && container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  onMount(scrollToBottom);
  afterUpdate(scrollToBottom);

  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getRoleIcon(role: string): string {
    switch (role) {
      case 'user': return '👤';
      case 'assistant': return '🤖';
      case 'system': return '⚙️';
      default: return '💬';
    }
  }

  function getRoleColor(role: string): 'primary' | 'success' | 'default' {
    switch (role) {
      case 'user': return 'primary';
      case 'assistant': return 'success';
      default: return 'default';
    }
  }
</script>

<div
  bind:this={container}
  class="flex flex-col gap-4 overflow-y-auto p-4"
  style="max-height: 100%"
>
  {#if messages.length === 0 && !loading}
    <div class="flex-1 flex items-center justify-center text-text-muted">
      <div class="text-center">
        <span class="text-4xl mb-4 block">💬</span>
        <p>No hay mensajes aún</p>
        <p class="text-sm">Comienza una conversación</p>
      </div>
    </div>
  {:else}
    {#each messages as message (message.id)}
      <div
        class="flex gap-3"
        class:flex-row-reverse={message.role === 'user'}
      >
        <!-- Avatar -->
        <div
          class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm"
          class:bg-primary={message.role === 'user'}
          class:bg-success={message.role === 'assistant'}
          class:bg-bg-hover={message.role === 'system'}
        >
          {getRoleIcon(message.role)}
        </div>

        <!-- Message content -->
        <div
          class="flex-1 max-w-[80%]"
          class:text-right={message.role === 'user'}
        >
          <div
            class="inline-block px-4 py-2 rounded-lg"
            class:bg-primary={message.role === 'user'}
            class:text-white={message.role === 'user'}
            class:bg-bg-card={message.role !== 'user'}
            class:border={message.role !== 'user'}
            class:border-border={message.role !== 'user'}
          >
            <p class="whitespace-pre-wrap break-words">{message.content}</p>
          </div>

          <!-- Metadata -->
          <div
            class="flex items-center gap-2 mt-1 text-xs text-text-muted"
            class:justify-end={message.role === 'user'}
          >
            <time>{formatTime(message.timestamp)}</time>
            {#if message.status === 'sending'}
              <span>Enviando...</span>
            {:else if message.status === 'error'}
              <Badge variant="danger" size="sm">Error</Badge>
            {/if}
          </div>
        </div>
      </div>
    {/each}

    <!-- Streaming response -->
    {#if streamingContent}
      <div class="flex gap-3">
        <div class="flex-shrink-0 w-8 h-8 rounded-full bg-success flex items-center justify-center text-sm">
          🤖
        </div>
        <div class="flex-1 max-w-[80%]">
          <div class="inline-block px-4 py-2 rounded-lg bg-bg-card border border-border">
            <p class="whitespace-pre-wrap break-words">{streamingContent}</p>
            <span class="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
          </div>
        </div>
      </div>
    {/if}

    <!-- Loading indicator -->
    {#if loading && !streamingContent}
      <div class="flex gap-3">
        <div class="flex-shrink-0 w-8 h-8 rounded-full bg-success flex items-center justify-center text-sm">
          🤖
        </div>
        <div class="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border rounded-lg">
          <Spinner size="sm" />
          <span class="text-text-muted">Pensando...</span>
        </div>
      </div>
    {/if}
  {/if}
</div>
