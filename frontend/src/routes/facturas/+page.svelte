<script lang="ts">
  /**
   * Página de Facturas
   *
   * Mismo layout que el chat principal.
   * Facturas se gestiona como un panel, no como contenido de página.
   */
  import { AppShell, ChatArea } from '$lib/components/layout';
</script>

<AppShell>
  <ChatArea slot="content" />
</AppShell>
