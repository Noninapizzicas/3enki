<script lang="ts">
  import { aplicarPiel, cambiarCara, quitarPiel, caraActiva } from '../skin-engine';
  import type { PielJSON } from '../piel-json';

  const pieles: Record<string, PielJSON> = {
    nonina: {
      esquema: 'piel-v1',
      project_id: 'nonina',
      marketing: {
        color: {
          primary: { hue: 25, chroma: 0.15 },
          accent:  { hue: 85, chroma: 0.12 },
          neutral: { hue: 30, chroma: 0.008 },
        },
        tipografia: {
          display: "'Playfair Display', 'Georgia', serif",
          body: "'Inter', system-ui, sans-serif",
          pesoTitulos: 800,
          escala: 1.333,
        },
        radii: { factor: 1.2 },
        motion: { expresividad: 0.8 },
        sombras: { difuminado: 0.7 },
        espaciado: { factor: 1.4 },
        superficie: { gradiente: 0.8, glass: 0.6 },
        borde: { peso: 0.6, acento: 'top' },
        forma: { botonProportion: 1.3, heroAlign: 'center', cardHover: 'lift' },
        separadores: { estilo: 'gradient' },
      },
      trabajo: {
        color: {
          primary: { hue: 25, chroma: 0.05 },
          accent:  { hue: 85, chroma: 0.04 },
          neutral: { hue: 30, chroma: 0.003 },
        },
        tipografia: {
          display: "system-ui, sans-serif",
          body: "system-ui, sans-serif",
          pesoTitulos: 600,
          escala: 1.2,
        },
        radii: { factor: 0.5 },
        motion: { expresividad: 0.15 },
        sombras: { difuminado: 0.3 },
        espaciado: { factor: 0.8 },
        superficie: { gradiente: 0, glass: 0 },
        borde: { peso: 0.3, acento: 'none' },
        forma: { botonProportion: 1.0, heroAlign: 'center', cardHover: 'lift' },
        separadores: { estilo: 'line' },
      },
    },
    fintech: {
      esquema: 'piel-v1',
      project_id: 'fintech',
      marketing: {
        color: {
          primary: { hue: 240, chroma: 0.14 },
          accent:  { hue: 170, chroma: 0.10 },
          neutral: { hue: 240, chroma: 0.005 },
        },
        tipografia: {
          display: "'Inter', system-ui, sans-serif",
          body: "'Inter', system-ui, sans-serif",
          pesoTitulos: 700,
          escala: 1.2,
        },
        radii: { factor: 0.6 },
        motion: { expresividad: 0.3 },
        sombras: { difuminado: 0.5 },
        espaciado: { factor: 0.7 },
        superficie: { gradiente: 0.3, glass: 0.8 },
        borde: { peso: 0, acento: 'none' },
        forma: { botonProportion: 0.8, heroAlign: 'left', cardHover: 'glow' },
        separadores: { estilo: 'line' },
      },
      trabajo: {
        color: {
          primary: { hue: 240, chroma: 0.05 },
          accent:  { hue: 170, chroma: 0.03 },
          neutral: { hue: 240, chroma: 0.003 },
        },
        tipografia: {
          display: "system-ui, sans-serif",
          body: "system-ui, sans-serif",
          pesoTitulos: 600,
          escala: 1.125,
        },
        radii: { factor: 0.4 },
        motion: { expresividad: 0.1 },
        sombras: { difuminado: 0.2 },
        espaciado: { factor: 0.6 },
        superficie: { gradiente: 0, glass: 0 },
        borde: { peso: 0.3, acento: 'none' },
        forma: { botonProportion: 0.8, heroAlign: 'left', cardHover: 'lift' },
        separadores: { estilo: 'line' },
      },
    },
    infantil: {
      esquema: 'piel-v1',
      project_id: 'infantil',
      marketing: {
        color: {
          primary: { hue: 320, chroma: 0.18 },
          accent:  { hue: 60, chroma: 0.16 },
          neutral: { hue: 320, chroma: 0.006 },
        },
        tipografia: {
          display: "'Fredoka', 'Comic Sans MS', cursive",
          body: "'Nunito', 'Quicksand', system-ui, sans-serif",
          pesoTitulos: 700,
          escala: 1.333,
        },
        radii: { factor: 2.0 },
        motion: { expresividad: 1.0 },
        sombras: { difuminado: 0.9 },
        espaciado: { factor: 1.1 },
        superficie: { gradiente: 1.0, glass: 0.4 },
        borde: { peso: 1.8, acento: 'left' },
        forma: { botonProportion: 1.5, heroAlign: 'center', cardHover: 'lift' },
        separadores: { estilo: 'accent' },
      },
      trabajo: {
        color: {
          primary: { hue: 320, chroma: 0.06 },
          accent:  { hue: 60, chroma: 0.04 },
          neutral: { hue: 320, chroma: 0.003 },
        },
        tipografia: {
          display: "system-ui, sans-serif",
          body: "system-ui, sans-serif",
          pesoTitulos: 600,
          escala: 1.2,
        },
        radii: { factor: 0.8 },
        motion: { expresividad: 0.2 },
        sombras: { difuminado: 0.4 },
        espaciado: { factor: 0.8 },
        superficie: { gradiente: 0, glass: 0 },
        borde: { peso: 0.5, acento: 'none' },
        forma: { botonProportion: 1.0, heroAlign: 'center', cardHover: 'lift' },
        separadores: { estilo: 'line' },
      },
    },
    pirata: {
      esquema: 'piel-v1',
      project_id: 'the-pirate',
      marketing: {
        color: {
          primary: { hue: 45, chroma: 0.16 },
          accent:  { hue: 40, chroma: 0.06 },
          neutral: { hue: 45, chroma: 0.005 },
        },
        tipografia: {
          display: "'Playfair Display', 'Georgia', serif",
          body: "'Inter', 'Lato', system-ui, sans-serif",
          pesoTitulos: 900,
          escala: 1.25,
        },
        radii: { factor: 0.15 },
        motion: { expresividad: 0.2 },
        sombras: { difuminado: 0.05 },
        espaciado: { factor: 1.0 },
        superficie: { gradiente: 0.3, glass: 0 },
        borde: { peso: 1.6, acento: 'left' },
        forma: { botonProportion: 0.7, heroAlign: 'left', cardHover: 'border' },
        separadores: { estilo: 'accent' },
      },
      trabajo: {
        color: {
          primary: { hue: 45, chroma: 0.05 },
          accent:  { hue: 40, chroma: 0.03 },
          neutral: { hue: 45, chroma: 0.003 },
        },
        tipografia: {
          display: "system-ui, sans-serif",
          body: "system-ui, sans-serif",
          pesoTitulos: 600,
          escala: 1.2,
        },
        radii: { factor: 0.3 },
        motion: { expresividad: 0.15 },
        sombras: { difuminado: 0.2 },
        espaciado: { factor: 0.8 },
        superficie: { gradiente: 0, glass: 0 },
        borde: { peso: 0.5, acento: 'none' },
        forma: { botonProportion: 0.9, heroAlign: 'left', cardHover: 'border' },
        separadores: { estilo: 'line' },
      },
    },
    brutalist: {
      esquema: 'piel-v1',
      project_id: 'brutalist',
      marketing: {
        color: {
          primary: { hue: 0, chroma: 0.25 },
          accent:  { hue: 60, chroma: 0.22 },
          neutral: { hue: 0, chroma: 0.0 },
        },
        tipografia: {
          display: "'Impact', 'Arial Black', sans-serif",
          body: "'Courier New', 'Courier', monospace",
          pesoTitulos: 900,
          escala: 1.618,
        },
        radii: { factor: 0 },
        motion: { expresividad: 0.05 },
        sombras: { difuminado: 0 },
        espaciado: { factor: 1.8 },
        superficie: { gradiente: 0, glass: 0 },
        borde: { peso: 2.0, acento: 'left' },
        forma: { botonProportion: 0.5, heroAlign: 'left', cardHover: 'border' },
        separadores: { estilo: 'accent' },
        expresion: {
          heroEstilo: 'stroke',
          sectionSkew: 0,
          textura: 'stripes',
          texturaOpacidad: 0.06,
          escalaHero: 1.8,
          cardRotacion: 0,
          navInvertida: true,
          heroSombraTexto: false,
        },
      },
      trabajo: {
        color: {
          primary: { hue: 0, chroma: 0.0 },
          accent:  { hue: 0, chroma: 0.0 },
          neutral: { hue: 0, chroma: 0.0 },
        },
        tipografia: {
          display: "'Courier New', monospace",
          body: "'Courier New', monospace",
          pesoTitulos: 700,
          escala: 1.2,
        },
        radii: { factor: 0 },
        motion: { expresividad: 0 },
        sombras: { difuminado: 0 },
        espaciado: { factor: 0.7 },
        superficie: { gradiente: 0, glass: 0 },
        borde: { peso: 1.5, acento: 'none' },
        forma: { botonProportion: 0.5, heroAlign: 'left', cardHover: 'border' },
        separadores: { estilo: 'line' },
      },
    },
    carnival: {
      esquema: 'piel-v1',
      project_id: 'carnival',
      marketing: {
        color: {
          primary: { hue: 330, chroma: 0.28 },
          accent:  { hue: 170, chroma: 0.20 },
          neutral: { hue: 280, chroma: 0.008 },
        },
        tipografia: {
          display: "'Fredoka', 'Comic Sans MS', cursive",
          body: "'Nunito', system-ui, sans-serif",
          pesoTitulos: 700,
          escala: 1.5,
        },
        radii: { factor: 2.5 },
        motion: { expresividad: 1.0 },
        sombras: { difuminado: 0.9 },
        espaciado: { factor: 1.5 },
        superficie: { gradiente: 1.0, glass: 0.3 },
        borde: { peso: 1.5, acento: 'top' },
        forma: { botonProportion: 1.8, heroAlign: 'center', cardHover: 'glow' },
        separadores: { estilo: 'gradient' },
        expresion: {
          heroEstilo: 'shadow-brutal',
          sectionSkew: 3,
          textura: 'dots',
          texturaOpacidad: 0.08,
          escalaHero: 1.5,
          cardRotacion: 2.5,
          navInvertida: false,
          heroSombraTexto: true,
        },
      },
      trabajo: {
        color: {
          primary: { hue: 330, chroma: 0.05 },
          accent:  { hue: 170, chroma: 0.03 },
          neutral: { hue: 280, chroma: 0.003 },
        },
        tipografia: {
          display: "system-ui, sans-serif",
          body: "system-ui, sans-serif",
          pesoTitulos: 600,
          escala: 1.2,
        },
        radii: { factor: 0.8 },
        motion: { expresividad: 0.2 },
        sombras: { difuminado: 0.4 },
        espaciado: { factor: 0.8 },
        superficie: { gradiente: 0, glass: 0 },
        borde: { peso: 0.5, acento: 'none' },
        forma: { botonProportion: 1.0, heroAlign: 'center', cardHover: 'lift' },
        separadores: { estilo: 'line' },
      },
    },
  };

  let pielActiva = $state<string | null>(null);
  let cara = $state<'marketing' | 'trabajo'>('marketing');

  function seleccionarPiel(nombre: string) {
    const piel = pieles[nombre];
    if (!piel) return;
    pielActiva = nombre;
    aplicarPiel(piel, cara);
  }

  function toggleCara() {
    cara = cara === 'marketing' ? 'trabajo' : 'marketing';
    if (pielActiva) {
      cambiarCara(cara);
    }
  }

  function reset() {
    quitarPiel();
    pielActiva = null;
    cara = 'marketing';
  }
</script>

<div class="switcher">
  <div class="switcher-pieles">
    <span class="switcher-label">Piel:</span>
    <button
      class="chip"
      class:active={pielActiva === null}
      onclick={reset}
    >Default</button>
    {#each Object.keys(pieles) as nombre}
      <button
        class="chip"
        class:active={pielActiva === nombre}
        onclick={() => seleccionarPiel(nombre)}
      >{nombre}</button>
    {/each}
  </div>
  <div class="switcher-cara">
    <span class="switcher-label">Cara:</span>
    <button
      class="chip"
      class:active={cara === 'marketing'}
      onclick={() => { cara = 'marketing'; if (pielActiva) cambiarCara('marketing'); }}
    >Marketing</button>
    <button
      class="chip"
      class:active={cara === 'trabajo'}
      onclick={() => { cara = 'trabajo'; if (pielActiva) cambiarCara('trabajo'); }}
    >Trabajo</button>
  </div>
</div>

<style>
  .switcher {
    position: fixed;
    bottom: var(--sp-4);
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-toast);
    background: oklch(0.15 0 0 / 0.92);
    backdrop-filter: blur(16px);
    border: 1px solid oklch(1 0 0 / 0.1);
    border-radius: 1rem;
    padding: var(--sp-3) var(--sp-4);
    display: flex;
    gap: var(--sp-6);
    align-items: center;
    box-shadow: 0 8px 32px oklch(0 0 0 / 0.4);
  }

  .switcher-pieles,
  .switcher-cara {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .switcher-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: oklch(0.6 0 0);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .chip {
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.25rem 0.65rem;
    border-radius: 9999px;
    border: 1px solid oklch(1 0 0 / 0.15);
    background: oklch(1 0 0 / 0.05);
    color: oklch(0.75 0 0);
    cursor: pointer;
    transition: all 150ms ease;
    text-transform: capitalize;
  }
  .chip:hover {
    background: oklch(1 0 0 / 0.12);
    color: oklch(0.9 0 0);
  }
  .chip.active {
    background: oklch(1 0 0 / 0.2);
    color: oklch(1 0 0);
    border-color: oklch(1 0 0 / 0.35);
  }
</style>
