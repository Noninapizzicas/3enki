import adapter from '@sveltejs/adapter-auto';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
    alias: {
      '$ui-core': 'src/lib/ui-core',
      '$modules': 'src/lib/modules'
    }
  }
};

export default config;
