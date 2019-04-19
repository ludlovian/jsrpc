'use strict'

import test from 'ava'

import RpcServer from '../src/server'
import { post } from 'httpie'

test.beforeEach(async t => {
  const server = RpcServer.create({ port: 0 })
  await server.start()
  const { port } = server.server.address()
  const address = `http://localhost:${port}`
  t.context = { server, port, address }
  server.options.port = port
})

test.afterEach(async t => {
  if (t.context.stopped) return
  await t.context.server.stop()
})

test('stop and start', async t => {
  t.pass()
})

test('basic call', async t => {
  const { server, address } = t.context
  server.idleTimeout = undefined
  server.callTimeout = undefined
  server.on('foo', async bar => {
    t.is(bar, 'bar')
    return 'baz'
  })

  const { data } = await post(address, {
    body: {
      jsonrpc: '2.0',
      method: 'foo',
      params: ['bar']
    }
  })

  t.is(data.jsonrpc, '2.0')
  t.is(data.result, 'baz')
})

test('bad requests', async t => {
  const { server, address } = t.context

  let body

  body = { jsonrpc: '3.0' }
  await post(address, { body }).then(
    () => t.fail(),
    err => t.snapshot(err.data)
  )

  body = { jsonrpc: '2.0', method: 'foo' }
  await post(address, { body }).then(
    () => t.fail(),
    err => t.snapshot(err.data)
  )

  server.on('foo', async () => 17)
  body = { jsonrpc: '2.0', method: 'foo' }
  await post(address, { body }).then(
    () => t.fail(),
    err => t.snapshot(err.data)
  )

  body = { jsonrpc: '2.0', method: 'foo', params: 'notArray' }
  await post(address, { body }).then(
    () => t.fail(),
    err => t.snapshot(err.data)
  )

  body = 'notJSON'
  await post(address, { body }).then(
    () => t.fail(),
    err => t.snapshot(err.data)
  )
})

test('bad handler', async t => {
  const { server, address } = t.context
  const err = new Error('bar')
  server.on('foo', () => {
    throw err
  })
  let body = { jsonrpc: '2.0', method: 'foo', params: [] }

  await post(address, { body }).then(
    () => t.fail(),
    err => t.snapshot(err.data)
  )
})

test('handler that times out', async t => {
  const { server, address } = t.context
  server.callTimeout = 100
  server.idleTimeout = 5000
  server.on('foo', async () => {
    await delay(200)
    return 'bar'
  })
  let body = { jsonrpc: '2.0', method: 'foo', params: [] }
  await post(address, { body }).then(
    () => t.fail(),
    err => t.snapshot(err.data)
  )

  server.callTimeout = 300
  await post(address, { body }).then(res => t.snapshot(res.data))
})

test('server that times out', async t => {
  const { server, address } = t.context
  server.idleTimeout = 300
  server.on('foo', async () => 'bar')
  let body = { jsonrpc: '2.0', method: 'foo', params: [] }

  await delay(200)
  await post(address, { body }).then(res => t.snapshot(res.data))

  await delay(200)
  t.true(server.server.listening)

  await delay(200)
  t.false(server.server.listening)
  t.context.stopped = true
})

test('logging', async t => {
  const { server, address } = t.context
  await server.stop()
  server.on('foo', () => true)
  const log = []
  server.log = (...args) => log.push(args)
  await server.start()
  const body = { jsonrpc: '2.0', method: 'foo', params: ['bar', 123] }
  await post(address, { body })
  await server.stop()
  t.context.stopped = true

  t.snapshot(log)
})

function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
