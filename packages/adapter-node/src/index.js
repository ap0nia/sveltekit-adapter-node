import fs from 'node:fs'
import url from 'node:url'
import path from 'node:path'
import esbuild from 'esbuild'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/**
 * @see https://github.com/evanw/esbuild/issues/1921#issuecomment-1491470829
 */
const js = `\
import topLevelModule from 'node:module';
const require = topLevelModule.createRequire(import.meta.url);
`;

/**
 * Custom namespace for resolving virtual files.
 */
const namespace = 'sveltekit-virtual';

/** @type {import('.').default} */
function createAdapter(opts = {}) {
  const { outdir = 'build', precompress, envPrefix = '', polyfill = true } = opts;

  const adapter = {
    name: '@ap0nia/sveltekit-adapter-node',

    /** 
     * @param {import('@sveltejs/kit').Builder} builder
     */
    async adapt(builder) {
      /**
       * @example .svelte-kit/output/server/adapter-node
       */
      const temporaryDirectory = path.join(builder.getServerDirectory(), 'adapter-node');

      /**
       * Some SvelteKit thing that determines internal routing.
       */
      const manifest = `${temporaryDirectory}/manifest.js`;

      /**
       * The built SvelteKit server.
       */
      const server = `${temporaryDirectory}/index.js`;

      builder.log.minor(`Cleaning ${outdir} and ${temporaryDirectory}`);

      builder.rimraf(outdir);
      builder.mkdirp(outdir);
      builder.rimraf(temporaryDirectory);
      builder.mkdirp(temporaryDirectory);


      builder.log.minor('Copying assets');

      builder.writeClient(`${outdir}/client/${builder.config.kit.paths.base}`);
      builder.writePrerendered(`${outdir}/prerendered/${builder.config.kit.paths.base}`);


      if (precompress) {
        builder.log.minor('Compressing assets');
        await Promise.all([
          builder.compress(`${outdir}/client`),
          builder.compress(`${outdir}/prerendered`)
        ]);
      }


      builder.log.minor('Building server');

      builder.writeServer(temporaryDirectory);

      // Dynamically create a manifest in the temporary directory.
      fs.writeFileSync(
        manifest,
        `export const manifest = ${builder.generateManifest({ relativePath: './' })};\n\n` +
        `export const prerendered = new Set(${JSON.stringify(builder.prerendered.paths)});\n`
      );

      await esbuild.build({
        entryPoints: {
          index: path.join(__dirname, 'templates', 'index.js'),
          handler: path.join(__dirname, 'templates', 'handler.js'),
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        outdir,
        banner: { js },
        define: {
          'import.meta.SERVER_DIR': JSON.stringify(url.pathToFileURL(outdir)),
          'import.meta.ENV_PREFIX': JSON.stringify(envPrefix)
        },
        plugins: [
          {
            name: 'sveltekit-adapter-node-resolver',
            setup(build) {
              build.onResolve({ filter: /SERVER/ }, () => {
                return {
                  path: server,
                }
              })

              build.onResolve({ filter: /MANIFEST/ }, () => {
                return {
                  path: manifest,
                }
              })

              build.onResolve({ filter: /SHIMS/ }, (args) => {
                return {
                  path: args.path,
                  namespace
                }
              })

              build.onLoad({ filter: /SHIMS/, namespace }, () => {
                return {
                  resolveDir: 'node_modules',
                  contents: polyfill
                    ? `import { installPolyfills } from '@sveltejs/kit/node/polyfills'; installPolyfills();`
                    : '',
                }
              })
            }
          }
        ]
      })
    }
  };
  return adapter
}

export default createAdapter
