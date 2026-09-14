import { transform } from 'esbuild';
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { fileURLToPath } from 'node:url';
const bundle = await rollup({
  input: fileURLToPath(new URL('app.jsx', import.meta.url)),
  plugins: [
    { name: 'jsx-and-production', async transform(code, id) {
      if (!/\.[cm]?jsx?$/.test(id)) return null;
      const result = await transform(code, { loader: id.endsWith('.jsx') ? 'jsx' : 'js', define: { 'process.env.NODE_ENV': '"production"' }, target: 'es2020' });
      return { code: result.code, map: null };
    } },
    nodeResolve({ browser: true }), commonjs()
  ]
});
await bundle.write({ file: fileURLToPath(new URL('dist/app.js', import.meta.url)), format: 'iife' });
await bundle.close();
console.log('Frontend built.');
