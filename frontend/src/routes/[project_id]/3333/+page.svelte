<script lang="ts">
  /**
   * Certificate Authority — ruta numérica (no predecible)
   * URL: /[project_id]/3333
   */
  import { onMount, onDestroy, getContext } from 'svelte';
  import { page } from '$app/stores';
  import { LazyShell } from '$lib/components/layout';
  import { setPageContext, clearPageContext } from '$lib/stores/page-context';

  $: project_id = $page.params.project_id;

  const projectStore = getContext<any>('project');

  onMount(() => {
    setPageContext({
      route: '/3333',
      title: 'Certificate Authority',
      description: 'Gestión de certificados digitales: emisión, revocación, renovación de certificados para clientes y dispositivos.',
      instructions: `El usuario está en la gestión de certificados digitales para el proyecto "${project_id}".
Puede usar el panel de la barra lateral o pedirte las cosas por el chat.

Cuando el usuario dice "certificado", "emitir", "crear certificado" se refiere a emitir un nuevo certificado.
Cuando menciona "revocar", "anular" se refiere a revocar un certificado existente.
Cuando dice "renovar" se refiere a renovar un certificado (revoca el viejo y emite uno nuevo).
Cuando dice "descargar", "P12", "bundle" se refiere a descargar el bundle .p12 para instalar en navegador/dispositivo.

Tipos de certificado:
- client: Para clientes del portal de facturación
- device: Para dispositivos de trabajo

Tools disponibles para esta página:
- certificate-authority.status: estado de la CA y estadísticas
- certificate-authority.list: lista certificados con filtros (type, status, identifier)
- certificate-authority.issue: emite nuevo certificado (commonName, type, identifier)
- certificate-authority.revoke: revoca certificado (serialNumber, reason)
- certificate-authority.renew: renueva certificado (serialNumber)
- certificate-authority.crl: lista de revocación`,
      state: {
        projectId: project_id
      }
    });
  });

  onDestroy(() => {
    clearPageContext();
  });
</script>

<LazyShell />
