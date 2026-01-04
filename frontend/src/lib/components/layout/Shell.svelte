<script lang="ts">
  /**
   * Shell - Página de Chat Principal
   *
   * Usa AppShell que ya incluye:
   * - ChatConfig (📁 🤖 🧘 💬 🔐)
   * - ChatInput
   * - ChatTools (🗂️)
   *
   * Solo añade ChatArea como contenido.
   */

  import AppShell from './AppShell.svelte';
  import ChatArea from './ChatArea.svelte';
</script>

<AppShell>
  <!-- Chat messages area -->
  <ChatArea slot="content" />
</AppShell>
