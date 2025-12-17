<script lang="ts">
  /**
   * CredentialsPanelRouter - Router de paneles de credenciales
   *
   * Enruta al panel correcto basado en panelId:
   * - credentials-list: Lista de credenciales (default)
   * - credentials-add: Agregar credencial
   * - credentials-edit: Editar credencial
   */

  import CredentialsListPanel from './CredentialsListPanel.svelte';
  import CredentialAddPanel from './CredentialAddPanel.svelte';
  import CredentialEditPanel from './CredentialEditPanel.svelte';

  export let panelId: string;

  // Panel components map
  const panels: Record<string, typeof CredentialsListPanel> = {
    'credentials-list': CredentialsListPanel,
    'credentials-add': CredentialAddPanel,
    'credentials-edit': CredentialEditPanel
  };

  // Get component for panelId
  $: PanelComponent = panels[panelId] || CredentialsListPanel;
</script>

<svelte:component this={PanelComponent} {panelId} />
