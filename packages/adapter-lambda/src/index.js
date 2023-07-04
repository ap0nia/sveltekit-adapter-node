import fs from 'node:fs'
import url from 'node:url'
import path from 'node:path'
import { defu } from 'defu'
import esbuild from 'esbuild'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/**
 * Custom banner to support `dynamic require of ...`
 * @see https://github.com/evanw/esbuild/issues/1921#issuecomment-1491470829
 */
const js = `\
import topLevelModule from 'node:module';
const require = topLevelModule.createRequire(import.meta.url);
`;

const defaultS3Directory = 's3'

const defaultLambdaDirectory = 'lambda'

/**
 * Custom namespace for resolving virtual files.
 */
const namespace = 'sveltekit-virtual';

/**
 * @type {import('.').AdapterOptions}
 */
const defaultOptions = {
  precompress: false,
  out: 'build',
  polyfill: true,
  envPrefix: '',
  s3Directory: defaultS3Directory,
  lambdaDirectory: defaultLambdaDirectory,
}

/** 
 * @type {import('.').default} 
 */
function createAdapter(options = {}) {
  const optionsWithDefaults = defu(options, defaultOptions)
  const { precompress, out, polyfill } = optionsWithDefaults

  /**
   * @type {import('.').ExtendedAdapter}
   */
  const adapter = {
    ...optionsWithDefaults,

    name: '@ap0nia/sveltekit-adapter-lambda',

    /** 
     * @param {import('@sveltejs/kit').Builder} builder
     */
    async adapt(builder) {
      /**
       * Temporary directory is created in the default SvelteKit outputs directory.
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

      /**
       * - Components pre-rendered as HTML files.
       * - JS files referenced by the pre-rendered HTML files.
       * @example build/s3
       */
      const staticDirectory = path.join(out, defaultS3Directory, builder.config.kit.paths.base)

      /**
       * Files needed to handle lambda events.
       * @example build/lambda
       */
      const serverDirectory = path.join(out, defaultLambdaDirectory, builder.config.kit.paths.base)

      builder.log.minor(`Cleaning ${out} and ${temporaryDirectory}`);

      builder.rimraf(out);
      builder.mkdirp(out);
      builder.rimraf(temporaryDirectory);
      builder.mkdirp(temporaryDirectory);

      builder.log.minor('Copying assets');

      builder.writeClient(staticDirectory);
      builder.writePrerendered(staticDirectory);

      if (precompress) {
        builder.log.minor('Compressing assets');
        await Promise.all([
          builder.compress(staticDirectory),
          builder.compress(staticDirectory)
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
          index: path.join(__dirname, 'build', 'index.js'),
        },
        bundle: true,
        format: 'esm',
        platform: 'node',
        outdir: path.join(serverDirectory),
        banner: { js },
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
