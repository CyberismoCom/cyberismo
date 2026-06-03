import { defineConfig } from 'vitest/config';
import babel, { defineRolldownBabelPreset } from '@rolldown/plugin-babel';

// Vite 8's Oxc transformer does not lower TC39 stage-3 decorators
// (https://github.com/oxc-project/oxc/issues/9170). Transpile them with
// Babel, but only in files that contain decorator syntax to keep the
// performance impact minimal.
const decorators = defineRolldownBabelPreset({
  preset: () => ({
    plugins: [['@babel/plugin-proposal-decorators', { version: '2023-11' }]],
  }),
  rolldown: {
    filter: {
      code: /^\s*@\w/m,
    },
  },
});

export default defineConfig({
  plugins: [babel({ presets: [decorators] })],
});
