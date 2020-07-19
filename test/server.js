'use strict'

import test from 'ava'

import { RpcServer } from '../src'
import { post } from 'httpie'

test.beforeEach(async t => {
  const server = RpcServer.create({ port: 0 })
  await server.start()
  const { port } = server.httpServer.address()
  const address = `http://localhost:${port}`
  t.context = { server, port, address }
})

test.afterEach(async t => {
  await t.context.server.stop()
})

test('stop and start', async t => {
  t.pass()
})

test('over-starting and over-stopping', async t => {
  let { server, port } = t.context
  await server.stop()
  server = RpcServer.create({ port })
  t.false(server.started)

  await server.start()
  t.true(server.started)
  await server.start()
  t.true(server.started)

  await server.stop()
  t.false(server.started)
  await server.stop()
  t.false(server.started)
})

test('basic call', async t => {
  const { server, address } = t.context
  server.handle('foo', async bar => {
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

  body = { jsonrpc: '3.0', id: 'foo' }
  await post(address, { body }).then(
    () => t.fail(),
    err => t.snapshot(err.data)
  )

  body = { jsonrpc: '2.0', method: 'foo' }
  await post(address, { body }).then(
    () => t.fail(),
    err => t.snapshot(err.data)
  )

  server.handle('foo', async () => 17)
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
  server.handle('foo', () => {
    throw err
  })
  const body = { jsonrpc: '2.0', method: 'foo', params: [] }

  await post(address, { body }).then(
    () => t.fail(),
    err => t.snapshot(err.data)
  )
})

test('handler that times out', async t => {
  let { server, port, address } = t.context
  await server.stop()
  server = RpcServer.create({ port, callTimeout: 200 })
  await server.start()

  server.handle('foo100', async () => {
    await delay(100)
    return 'bar'
  })
  server.handle('foo300', async () => {
    await delay(300)
    return 'bar'
  })
  let body = { jsonrpc: '2.0', method: 'foo300', params: [] }
  await post(address, { body }).then(
    () => t.fail(),
    err => t.snapshot(err.data)
  )

  body = { jsonrpc: '2.0', method: 'foo100', params: [] }
  await post(address, { body }).then(res => t.snapshot(res.data))
})

test('events', async t => {
  let { server, port, address } = t.context
  await server.stop()
  server = RpcServer.create({ port })

  server.handle('foo', () => true)
  const log = []
  server
    .on('start', data => log.push(['start', data]))
    .on('stop', data => log.push(['stop', data]))
    .on('call', data => log.push(['call', data]))
  await server.start()
  const body = { jsonrpc: '2.0', method: 'foo', params: ['bar', 123] }
  await post(address, { body })
  await server.stop()

  t.snapshot(log)
})

function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
