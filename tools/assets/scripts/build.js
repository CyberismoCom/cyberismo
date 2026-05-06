import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import ImportGlobPlugin from 'esbuild-plugin-import-glob';

await esbuild.build({
  minify: true,
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  format: 'esm',
  platform: 'neutral',
  target: 'es2023',
  plugins: [
    ImportGlobPlugin.default(),
    {
      name: 'lp-loader',
      setup(build) {
        build.onLoad({ filter: /\.lp$/ }, async (args) => {
          const contents = await fs.readFile(args.path, 'utf8');
          // Remove all comments
          let cleanedContents = contents.replace(/%.*$/gm, '');
          // Remove all empty lines and normalize newlines
          cleanedContents = cleanedContents.replace(/^\s*[\r\n]+/gm, '');
          return {
            contents: `export default ${JSON.stringify(cleanedContents)}`,
            loader: 'js',
          };
        });
      },
    },
  ],
  external: ['node:path', 'node:url'],
});
