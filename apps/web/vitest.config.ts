import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = path.dirname(fileURLToPath(import.meta.url))

// Next.js resolves bare specifiers like `types` and `utils/captcha-verify`
// through `baseUrl: "."` in tsconfig.json. Vitest does not read baseUrl, so the
// same roots are mapped explicitly here.
const baseUrlDirs = ['components', 'config', 'types', 'utils']

export default defineConfig({
  resolve: {
    alias: baseUrlDirs.flatMap((dir) => [
      { find: new RegExp(`^${dir}$`), replacement: path.resolve(root, dir) },
      {
        find: new RegExp(`^${dir}/`),
        replacement: `${path.resolve(root, dir)}/`,
      },
    ]),
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules/**', '.next/**'],
  },
})
