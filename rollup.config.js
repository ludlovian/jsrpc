import { terser } from 'rollup-plugin-terser'
import cleanup from 'rollup-plugin-cleanup'

export default [
  {
    input: 'src/client.js',
    external: [ 'http' ],
    plugins: [
      cleanup(),
      process.env.NODE_ENV === 'production' && terser()
    ],
    output: [
      {
        file: 'dist/client.js',
        format: 'cjs',
        sourcemap: false,
      },
      {
        file: 'dist/client.mjs',
        format: 'esm',
        sourcemap: false
      }
    ]
  },
  {
    input: 'src/server.js',
    external: [ 'http', 'stoppable' ],
    plugins: [
      cleanup(),
      process.env.NODE_ENV === 'production' && terser()
    ],
    output: [
      {
        file: 'dist/server.js',
        format: 'cjs',
        sourcemap: false,
      },
      {
        file: 'dist/server.mjs',
        format: 'esm',
        sourcemap: false
      }
    ]
  },
  {
    input: 'src/index.js',
    external: [ 'http', 'stoppable' ],
    plugins: [
      cleanup(),
      process.env.NODE_ENV === 'production' && terser()
    ],
    output: [
      {
        file: 'dist/index.js',
        format: 'cjs',
        sourcemap: false,
      },
      {
        file: 'dist/index.mjs',
        format: 'esm',
        sourcemap: false
      }
    ]
  }
]

