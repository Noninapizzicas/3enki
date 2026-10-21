<script>
  import '$lib/ui-skin/pieles/the-pirate.css';
</script>

<div data-piel="the-pirate">
  <!-- NAV -->
  <nav class="nav">
    <span class="nav-brand">THE PIRATE</span>
    <div class="nav-links">
      <a href="#carta">Carta</a>
      <a href="#historia">Historia</a>
      <a href="#contacto">Contacto</a>
    </div>
  </nav>

  <!-- HERO -->
  <section class="hero">
    <h1 class="hero-title">La libertad no se pide. Se muerde.</h1>
    <p class="hero-subtitle">Abierto ante la ley &middot; Saqueado con gusto</p>
    <div class="hero-actions">
      <button class="btn-primary">Ver la carta</button>
      <button class="btn-secondary">Reservar mesa</button>
    </div>
  </section>

  <hr class="divider" />

  <!-- SECCIÓN: MANIFIESTO -->
  <section class="section">
    <h2 class="section-title">No venimos de Nápoles</h2>
    <p class="section-body">
      Venimos de alta mar, y eso se nota en cada bocado. Aquí la masa reposa 48 horas,
      las salsas las cocemos hasta que sueltan lo que tienen que soltar, y los ingredientes
      los elegimos por sabor, no por etiqueta.
    </p>
  </section>

  <!-- SECCIÓN: CARDS -->
  <section class="section section-alt">
    <h2 class="section-title">Lo que hay hoy</h2>
    <div class="card-grid">
      <div class="card">
        <h3 class="card-title">La Capitana</h3>
        <p class="card-body">
          Mozzarella di bufala, 'nduja calabresa, cebolla caramelizada al Pedro Ximénez,
          rúcula salvaje. La que manda en la carta.
        </p>
        <span class="card-price">14.50 &euro;</span>
      </div>
      <div class="card">
        <h3 class="card-title">Stracchino & Miel</h3>
        <p class="card-body">
          Base blanca, stracchino fundido, nueces tostadas, miel de romero,
          pimienta negra molida al momento. Lo dulce y lo salado, sin pedir permiso.
        </p>
        <span class="card-price">13.00 &euro;</span>
      </div>
      <div class="card">
        <h3 class="card-title">La Sobrasada</h3>
        <p class="card-body">
          Sobrasada mallorquina, queso de cabra, cebolla morada, miel de azahar.
          Mediterráneo sin fronteras.
        </p>
        <span class="card-price">13.50 &euro;</span>
      </div>
    </div>
  </section>

  <hr class="divider" />

  <!-- SECCIÓN: CTA -->
  <section class="section">
    <h2 class="section-title">¿Vienes o te lo cuentan?</h2>
    <p class="section-body">
      Juan Carlos I, 49 &middot; Lorca<br/>
      Martes a domingo, 19:30 — 23:30<br/>
      <a href="tel:643283034">643 283 034</a>
    </p>
    <div class="section-actions">
      <button class="btn-primary">Pedir por WhatsApp</button>
    </div>
  </section>
</div>

<style>
  /* === Layout del demo — NO es parte de la piel === */
  [data-piel="the-pirate"] {
    min-height: 100vh;
    background: var(--surface-base, #0d0d0d);
    color: var(--text-primary, #f5e6c8);
  }

  /* Nav layout */
  .nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .nav-brand {
    font-family: var(--font-display);
    font-size: var(--fs-lg);
    font-weight: var(--fw-display);
    color: var(--tesoro);
    letter-spacing: var(--ls-caps);
  }

  .nav-links {
    display: flex;
    gap: var(--space-element);
  }

  /* Hero layout */
  .hero-actions {
    display: flex;
    gap: var(--space-element);
    justify-content: center;
    margin-top: calc(var(--space-element) * 2);
    flex-wrap: wrap;
  }

  /* Section layout */
  .section-body {
    font-family: var(--font-body);
    font-size: var(--fs-lg);
    line-height: var(--lh-loose);
    color: var(--text-secondary);
    max-width: 65ch;
  }

  .section-alt {
    background: var(--surface-raised);
  }

  .section-actions {
    margin-top: calc(var(--space-element) * 2);
  }

  /* Card grid */
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
    gap: var(--space-gap);
    margin-top: var(--space-element);
  }

  /* Card price */
  .card-price {
    display: block;
    margin-top: var(--space-element);
    font-family: var(--font-display);
    font-size: var(--fs-xl);
    font-weight: var(--fw-display);
    color: var(--tesoro);
  }

  /* Responsive */
  @media (max-width: 640px) {
    .nav-links {
      display: none;
    }
  }
</style>
