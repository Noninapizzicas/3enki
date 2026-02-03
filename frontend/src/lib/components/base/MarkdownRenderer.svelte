<script lang="ts">
  /**
   * MarkdownRenderer - Renderiza markdown con syntax highlighting
   *
   * Features:
   * - Markdown completo (headers, bold, italic, listas, tablas, links)
   * - Code blocks con syntax highlighting (highlight.js)
   * - Boton "Copiar" en cada code block
   * - Inline code con estilo diferenciado
   * - Tema oscuro integrado
   */

  import { onMount } from 'svelte';
  import { Marked } from 'marked';
  import hljs from 'highlight.js/lib/core';

  // Registrar solo los lenguajes mas comunes (tree-shakeable)
  import javascript from 'highlight.js/lib/languages/javascript';
  import typescript from 'highlight.js/lib/languages/typescript';
  import python from 'highlight.js/lib/languages/python';
  import json from 'highlight.js/lib/languages/json';
  import bash from 'highlight.js/lib/languages/bash';
  import css from 'highlight.js/lib/languages/css';
  import xml from 'highlight.js/lib/languages/xml';
  import sql from 'highlight.js/lib/languages/sql';
  import yaml from 'highlight.js/lib/languages/yaml';
  import markdown from 'highlight.js/lib/languages/markdown';

  hljs.registerLanguage('javascript', javascript);
  hljs.registerLanguage('js', javascript);
  hljs.registerLanguage('typescript', typescript);
  hljs.registerLanguage('ts', typescript);
  hljs.registerLanguage('python', python);
  hljs.registerLanguage('py', python);
  hljs.registerLanguage('json', json);
  hljs.registerLanguage('bash', bash);
  hljs.registerLanguage('sh', bash);
  hljs.registerLanguage('shell', bash);
  hljs.registerLanguage('css', css);
  hljs.registerLanguage('html', xml);
  hljs.registerLanguage('xml', xml);
  hljs.registerLanguage('sql', sql);
  hljs.registerLanguage('yaml', yaml);
  hljs.registerLanguage('yml', yaml);
  hljs.registerLanguage('markdown', markdown);
  hljs.registerLanguage('md', markdown);

  export let content: string = '';

  let containerEl: HTMLDivElement;

  // Configurar marked con highlight.js
  const marked = new Marked({
    gfm: true,
    breaks: true,
    renderer: {
      code({ text, lang }: { text: string; lang?: string }) {
        const language = lang && hljs.getLanguage(lang) ? lang : null;
        let highlighted: string;

        if (language) {
          highlighted = hljs.highlight(text, { language }).value;
        } else {
          // Auto-detect o plaintext
          try {
            highlighted = hljs.highlightAuto(text).value;
          } catch {
            highlighted = escapeHtml(text);
          }
        }

        const langLabel = language || 'text';
        return `<div class="code-block">
          <div class="code-header">
            <span class="code-lang">${langLabel}</span>
            <button class="copy-btn" data-code="${escapeAttr(text)}">Copiar</button>
          </div>
          <pre><code class="hljs language-${langLabel}">${highlighted}</code></pre>
        </div>`;
      },
      codespan({ text }: { text: string }) {
        return `<code class="inline-code">${text}</code>`;
      },
      link({ href, text }: { href: string; text: string }) {
        return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      },
      table({ header, rows }: { header: string; rows: string }) {
        return `<div class="table-wrapper"><table>${header}${rows}</table></div>`;
      }
    }
  });

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '&#10;');
  }

  // Renderizar markdown
  $: rendered = renderMarkdown(content);

  function renderMarkdown(text: string): string {
    if (!text) return '';
    try {
      return marked.parse(text) as string;
    } catch {
      return escapeHtml(text);
    }
  }

  // Delegated click handler para botones de copiar
  function handleClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.classList.contains('copy-btn')) {
      const code = target.getAttribute('data-code') || '';
      // Decode HTML entities back
      const decoded = code
        .replace(/&#10;/g, '\n')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');

      navigator.clipboard.writeText(decoded).then(() => {
        target.textContent = 'Copiado!';
        target.classList.add('copied');
        setTimeout(() => {
          target.textContent = 'Copiar';
          target.classList.remove('copied');
        }, 2000);
      }).catch(() => {
        // Fallback para contextos sin clipboard API
        target.textContent = 'Error';
        setTimeout(() => { target.textContent = 'Copiar'; }, 1500);
      });
    }
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="markdown-body"
  bind:this={containerEl}
  on:click={handleClick}
>
  {@html rendered}
</div>

<style>
  /* === BASE === */
  .markdown-body {
    line-height: 1.6;
    word-break: break-word;
    overflow-wrap: break-word;
    font-size: 0.9375rem;
  }

  .markdown-body :global(p) {
    margin: 0.5em 0;
  }

  .markdown-body :global(p:first-child) {
    margin-top: 0;
  }

  .markdown-body :global(p:last-child) {
    margin-bottom: 0;
  }

  /* === HEADINGS === */
  .markdown-body :global(h1),
  .markdown-body :global(h2),
  .markdown-body :global(h3),
  .markdown-body :global(h4) {
    margin: 1em 0 0.5em;
    font-weight: 600;
    line-height: 1.3;
  }

  .markdown-body :global(h1:first-child),
  .markdown-body :global(h2:first-child),
  .markdown-body :global(h3:first-child) {
    margin-top: 0;
  }

  .markdown-body :global(h1) { font-size: 1.4em; }
  .markdown-body :global(h2) { font-size: 1.2em; }
  .markdown-body :global(h3) { font-size: 1.1em; }
  .markdown-body :global(h4) { font-size: 1em; }

  /* === EMPHASIS === */
  .markdown-body :global(strong) {
    font-weight: 700;
    color: rgba(255, 255, 255, 0.95);
  }

  .markdown-body :global(em) {
    font-style: italic;
    color: rgba(255, 255, 255, 0.85);
  }

  /* === LISTS === */
  .markdown-body :global(ul),
  .markdown-body :global(ol) {
    margin: 0.5em 0;
    padding-left: 1.5em;
  }

  .markdown-body :global(li) {
    margin: 0.25em 0;
  }

  .markdown-body :global(li > ul),
  .markdown-body :global(li > ol) {
    margin: 0.15em 0;
  }

  /* === CODE BLOCKS === */
  .markdown-body :global(.code-block) {
    margin: 0.75em 0;
    border-radius: 0.5rem;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .markdown-body :global(.code-header) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.375rem 0.75rem;
    background: rgba(0, 0, 0, 0.3);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .markdown-body :global(.code-lang) {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.45);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 500;
  }

  .markdown-body :global(.copy-btn) {
    font-size: 0.7rem;
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
  }

  .markdown-body :global(.copy-btn:hover) {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
    border-color: rgba(255, 255, 255, 0.25);
  }

  .markdown-body :global(.copy-btn.copied) {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
    border-color: rgba(34, 197, 94, 0.3);
  }

  .markdown-body :global(pre) {
    margin: 0;
    padding: 0.75rem 1rem;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .markdown-body :global(pre code) {
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
    font-size: 0.8125rem;
    line-height: 1.5;
    white-space: pre;
    tab-size: 2;
  }

  /* Scrollbar para code blocks */
  .markdown-body :global(pre::-webkit-scrollbar) {
    height: 4px;
  }

  .markdown-body :global(pre::-webkit-scrollbar-track) {
    background: transparent;
  }

  .markdown-body :global(pre::-webkit-scrollbar-thumb) {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
  }

  /* === INLINE CODE === */
  .markdown-body :global(.inline-code) {
    font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
    font-size: 0.85em;
    padding: 0.15em 0.35em;
    border-radius: 0.25rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #e06c75;
  }

  /* === BLOCKQUOTE === */
  .markdown-body :global(blockquote) {
    margin: 0.5em 0;
    padding: 0.25em 0.75em;
    border-left: 3px solid rgba(59, 130, 246, 0.5);
    color: rgba(255, 255, 255, 0.7);
    background: rgba(59, 130, 246, 0.05);
    border-radius: 0 0.25rem 0.25rem 0;
  }

  .markdown-body :global(blockquote p) {
    margin: 0.25em 0;
  }

  /* === TABLE === */
  .markdown-body :global(.table-wrapper) {
    overflow-x: auto;
    margin: 0.75em 0;
    border-radius: 0.375rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .markdown-body :global(table) {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  .markdown-body :global(th) {
    background: rgba(0, 0, 0, 0.3);
    padding: 0.5rem 0.75rem;
    text-align: left;
    font-weight: 600;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    white-space: nowrap;
  }

  .markdown-body :global(td) {
    padding: 0.4rem 0.75rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .markdown-body :global(tr:last-child td) {
    border-bottom: none;
  }

  .markdown-body :global(tr:hover td) {
    background: rgba(255, 255, 255, 0.03);
  }

  /* === HR === */
  .markdown-body :global(hr) {
    margin: 1em 0;
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  /* === LINKS === */
  .markdown-body :global(a) {
    color: #60a5fa;
    text-decoration: none;
  }

  .markdown-body :global(a:hover) {
    text-decoration: underline;
  }

  /* === IMAGES === */
  .markdown-body :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 0.375rem;
  }

  /* ========================================
     HIGHLIGHT.JS THEME (One Dark inspired)
     ======================================== */
  .markdown-body :global(.hljs) {
    color: #abb2bf;
    background: transparent;
  }

  .markdown-body :global(.hljs-keyword),
  .markdown-body :global(.hljs-selector-tag) {
    color: #c678dd;
  }

  .markdown-body :global(.hljs-literal),
  .markdown-body :global(.hljs-number),
  .markdown-body :global(.hljs-type) {
    color: #d19a66;
  }

  .markdown-body :global(.hljs-string),
  .markdown-body :global(.hljs-template-variable) {
    color: #98c379;
  }

  .markdown-body :global(.hljs-built_in),
  .markdown-body :global(.hljs-title) {
    color: #61afef;
  }

  .markdown-body :global(.hljs-attr),
  .markdown-body :global(.hljs-variable),
  .markdown-body :global(.hljs-params) {
    color: #e06c75;
  }

  .markdown-body :global(.hljs-comment) {
    color: #5c6370;
    font-style: italic;
  }

  .markdown-body :global(.hljs-regexp) {
    color: #56b6c2;
  }

  .markdown-body :global(.hljs-meta) {
    color: #61afef;
  }

  .markdown-body :global(.hljs-tag) {
    color: #e06c75;
  }

  .markdown-body :global(.hljs-name) {
    color: #e06c75;
  }

  .markdown-body :global(.hljs-attribute) {
    color: #d19a66;
  }

  .markdown-body :global(.hljs-selector-id),
  .markdown-body :global(.hljs-selector-class) {
    color: #61afef;
  }

  .markdown-body :global(.hljs-symbol),
  .markdown-body :global(.hljs-bullet) {
    color: #56b6c2;
  }

  .markdown-body :global(.hljs-addition) {
    color: #98c379;
    background: rgba(152, 195, 121, 0.1);
  }

  .markdown-body :global(.hljs-deletion) {
    color: #e06c75;
    background: rgba(224, 108, 117, 0.1);
  }
</style>
