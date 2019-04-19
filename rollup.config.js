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
        file: 'client/index.js',
        format: 'cjs',
        sourcemap: false,
      },
      {
        file: 'client/index.mjs',
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
        file: 'server/index.js',
        format: 'cjs',
        sourcemap: false,
      },
      {
        file: 'server/index.mjs',
        format: 'esm',
        sourcemap: false
      }
    ]
  }
]

