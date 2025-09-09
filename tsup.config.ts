import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

// Read package info from package.json at build time
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))
const VERSION = packageJson.version
const DESCRIPTION = packageJson.description

export default defineConfig({
  entry: {
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: true,
  minify: process.env.NODE_ENV === 'production',
  target: 'node18',
  noExternal: ['jsonpath-plus'], // jsonpath-plusをバンドルに含める
  esbuildOptions(options) {
    options.platform = 'node'
  },
  // Inject version as environment variable at build time
  env: {
    PKG_VERSION: VERSION,
  },
  // Or use define to replace constants at build time
  define: {
    __VERSION__: JSON.stringify(VERSION),
    __DESCRIPTION__: JSON.stringify(DESCRIPTION),
  },
})
