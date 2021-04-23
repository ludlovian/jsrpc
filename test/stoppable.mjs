'use strict'

import test from 'ava'
import * as http from 'http'

import stoppable from '../src/stoppable.mjs'

test('basic sequential usage', async t => {
  const server = stoppable(ponger(200))
  server.listen()
  const { port } = server.address()
  const result = await ping({ port })
  t.is(result, 'pong')
  await server.stop()
})

test('close whilst being served', async t => {
  const server = stoppable(ponger(300))
  server.listen()
  const { port } = server.address()
  const pResult1 = ping({ port })
  await delay(100)
  const pResult2 = ping({ port })
  await delay(100)
  const pStop = server.stop(300)
  t.is(await pResult1, 'pong')
  t.is(await pResult2, 'pong')
  t.true(await pStop)
})

test('force close a slow server', async t => {
  const server = stoppable(ponger(500))
  server.listen()
  const { port } = server.address()
  const pResult = ping({ port })
  server.on('error', console.log)
  await delay(100)
  const pStop = server.stop(200)
  t.false(await pStop)
  await t.throwsAsync(pResult)
})

test('close server twice', async t => {
  const server = stoppable(ponger(200))
  server.listen()
  const { port } = server.address()
  const pResult = ping({ port })
  await delay(100)
  const pStop1 = server.stop(300)
  const pStop2 = server.stop(300)
  t.is(await pResult, 'pong')
  t.true(await pStop1)
  t.is(await pStop2, undefined)
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
