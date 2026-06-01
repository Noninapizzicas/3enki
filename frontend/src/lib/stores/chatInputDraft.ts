import { writable } from 'svelte/store';

export const chatInputDraft = writable('');

export function prefillChatInput(text: string) {
	chatInputDraft.set(text);
}
