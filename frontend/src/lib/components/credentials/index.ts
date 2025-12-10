// credential-manager UI components (uisis = UI System compliant)
// Triple interaction: tap (select) / double tap (add) / long press (config)

export { default as CredentialButton } from './uisis-CredentialButton.svelte';
export { default as CredentialAddPanel } from './uisis-CredentialAddPanel.svelte';
export { default as CredentialConfigPanel } from './uisis-CredentialConfigPanel.svelte';

// Re-export types
export type { Credential } from './uisis-CredentialConfigPanel.svelte';
