import { test } from 'uvu'
import * as assert from 'uvu/assert'

import * as http from 'http'

import stoppable from '../src/stoppable.mjs'

test('basic sequential usage', async () => {
  const server = stoppable(ponger(200))
  server.listen()
  const { port } = server.address()
  const result = await ping({ port })
  assert.is(result, 'pong')
  await server.stop()
})

test('close whilst being served', async () => {
  const server = stoppable(ponger(300))
  server.listen()
  const { port } = server.address()
  const pResult1 = ping({ port })
  await delay(100)
  const pResult2 = ping({ port })
  await delay(100)
  const pStop = server.stop(300)
  assert.is(await pResult1, 'pong')
  assert.is(await pResult2, 'pong')
  assert.ok(await pStop)
})

test('force close a slow server', async () => {
  const server = stoppable(ponger(500))
  server.listen()
  const { port } = server.address()
  const pResult = ping({ port })
  server.on('error', console.log)
  await delay(100)
  const pStop = server.stop(200)
  assert.not.ok(await pStop)
  await pResult.then(assert.unreachable, err => assert.instance(err, Error))
})

test('close server twice', async () => {
  const server = stoppable(ponger(200))
  server.listen()
  const { port } = server.address()
  const pResult = ping({ port })
  await delay(100)
  const pStop1 = server.stop(300)
  const pStop2 = server.stop(300)
  assert.is(await pResult, 'pong')
  assert.ok(await pStop1)
  assert.is(await pStop2, undefined)
})

const ponger = delay =>
  http.createServer((req, res) => setTimeout(() => res.end('pong'), delay))

const ping = opts =>
  new Promise((resolve, reject) => {
    const req = http.request({ ...opts, path: '/ping' }, res => {
      let data = ''
      res.setEncoding('utf8')
      res
        .on('data', chunk => {
          data += chunk
        })
        .on('end', () => resolve(data))
        .on('error', reject)
    })
    req.end()
    req.once('error', reject)
  })

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

test.run()
