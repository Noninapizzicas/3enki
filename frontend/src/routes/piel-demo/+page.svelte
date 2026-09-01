<script lang="ts">
  import '$lib/ui-skin/index.css';
  import SkinNav from '$lib/ui-skin/components/SkinNav.svelte';
  import SkinHero from '$lib/ui-skin/components/SkinHero.svelte';
  import SkinButton from '$lib/ui-skin/components/SkinButton.svelte';
  import SkinCard from '$lib/ui-skin/components/SkinCard.svelte';
  import SkinFooter from '$lib/ui-skin/components/SkinFooter.svelte';
  import SkinSwitcher from '$lib/ui-skin/components/SkinSwitcher.svelte';

  const navItems = [
    { label: 'Inicio', href: '#' },
    { label: 'Servicios', href: '#servicios' },
    { label: 'Nosotros', href: '#nosotros' },
    { label: 'Contacto', href: '#contacto' },
  ];

  const servicios = [
    { title: 'Estrategia Digital', desc: 'Definimos tu presencia online con un plan adaptado a tu marca y audiencia.' },
    { title: 'Contenido Creativo', desc: 'Creamos contenido que conecta con tu cliente ideal y refleja tu identidad.' },
    { title: 'Analítica Avanzada', desc: 'Datos que hablan: cada métrica cuenta la historia de tu crecimiento.' },
  ];

  const testimonios = [
    { nombre: 'Ana M.', texto: 'Transformaron nuestra imagen digital por completo. Los resultados hablan solos.' },
    { nombre: 'Carlos R.', texto: 'Profesionales, creativos y siempre disponibles. Una inversión que vale la pena.' },
  ];
</script>

<div class="page">
  <SkinNav brand="Mi Proyecto" items={navItems} />

  <SkinHero
    title="Tu negocio merece una presencia que inspire"
    subtitle="Construimos experiencias digitales que conectan con tu audiencia. Cada pixel refleja tu marca."
  >
    {#snippet actions()}
      <SkinButton size="lg">Empezar ahora</SkinButton>
      <SkinButton variant="secondary" size="lg">Saber más</SkinButton>
    {/snippet}
  </SkinHero>

  <section class="section" id="servicios">
    <div class="section-inner">
      <h2 class="section-title">Nuestros Servicios</h2>
      <p class="section-subtitle">Todo lo que necesitas para crecer</p>
      <div class="card-grid">
        {#each servicios as srv}
          <SkinCard title={srv.title} subtitle={srv.desc}>
            {#snippet footer()}
              <SkinButton variant="ghost" size="sm">Ver más</SkinButton>
            {/snippet}
          </SkinCard>
        {/each}
      </div>
    </div>
  </section>

  <section class="section section-alt" id="nosotros">
    <div class="section-inner">
      <h2 class="section-title">Lo que dicen nuestros clientes</h2>
      <div class="testimonios">
        {#each testimonios as t}
          <blockquote class="testimonio">
            <p class="testimonio-texto">"{t.texto}"</p>
            <cite class="testimonio-autor">— {t.nombre}</cite>
          </blockquote>
        {/each}
      </div>
    </div>
  </section>

  <section class="section" id="contacto">
    <div class="section-inner section-cta">
      <h2 class="section-title">¿Listo para empezar?</h2>
      <p class="section-subtitle">Hablemos sobre cómo transformar tu presencia digital</p>
      <div class="cta-actions">
        <SkinButton size="lg">Contactar</SkinButton>
        <SkinButton variant="ghost" size="lg">Ver portfolio</SkinButton>
      </div>
    </div>
  </section>

  <SkinFooter brand="Mi Proyecto" tagline="Tu marca, amplificada" />

  <SkinSwitcher />
</div>

<style>
  :global(body) {
    background: var(--surface-base) !important;
    color: var(--text-primary) !important;
  }

  .page {
    min-height: 100vh;
    background: var(--surface-base);
    color: var(--text-primary);
  }

  .section {
    padding: var(--space-section-gap, 5rem) var(--space-page-padding);
  }

  .section-alt {
    background: var(--surface-sunken);
  }

  .section-inner {
    max-width: 64rem;
    margin: 0 auto;
  }

  .section-title {
    font-family: var(--font-display);
    font-size: var(--fs-2xl);
    font-weight: var(--fw-heading, var(--fw-bold));
    line-height: var(--lh-tight);
    color: var(--text-primary);
    text-align: center;
    margin-bottom: var(--sp-2);
  }

  .section-subtitle {
    font-size: var(--fs-md);
    color: var(--text-secondary);
    text-align: center;
    margin-bottom: var(--sp-12);
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--sp-6);
  }

  .testimonios {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--sp-6);
  }

  .testimonio {
    background: var(--surface-raised);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    padding: var(--space-card-padding);
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .testimonio-texto {
    font-family: var(--font-sans);
    font-size: var(--fs-base);
    color: var(--text-secondary);
    line-height: var(--lh-relaxed);
    font-style: italic;
  }

  .testimonio-autor {
    font-family: var(--font-sans);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    color: var(--text-primary);
    font-style: normal;
  }

  .section-cta {
    text-align: center;
  }

  .cta-actions {
    display: flex;
    justify-content: center;
    gap: var(--sp-4);
    flex-wrap: wrap;
  }
</style>
