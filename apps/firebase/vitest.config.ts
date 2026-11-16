import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // tsc -b emits compiled *.test.js into dist/, and Vitest 4 no longer
    // excludes dist/ by default, so CI (build, then test) ran them as CJS.
    include: ['src/**/*.test.ts'],
    // config.ts asserts GCLOUD_PROJECT at module load, so importing anything
    // that reaches it throws unless the variable is present. Setting it here
    // keeps the suite runnable from a clean shell and in CI, rather than only
    // on a machine that happens to have it exported.
    env: {
      GCLOUD_PROJECT: 'celo-faucet',
    },
  },
})
