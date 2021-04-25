import { test } from 'uvu'
import * as assert from 'uvu/assert'

import snapshot from './helpers/snapshot.mjs'

import { post } from 'httpie'

import { RpcServer } from '../src/index.mjs'

test.before.each(async ctx => {
  const server = RpcServer.create({ port: 0 })
  await server.start()
  const { port } = server.httpServer.address()
  const address = `http://localhost:${port}`
  Object.assign(ctx, { server, port, address })
})

test.after.each(async ctx => {
  await ctx.server.stop()
})

test('stop and start', async t => {
  assert.ok(true)
})

test('over-starting and over-stopping', async ctx => {
  let { server, port } = ctx
  await server.stop()
  server = RpcServer.create({ port })
  assert.not.ok(server.started)

  await server.start()
  assert.ok(server.started)
  await server.start()
  assert.ok(server.started)

  await server.stop()
  assert.not.ok(server.started)
  await server.stop()
  assert.not.ok(server.started)
})

test('basic call', async ctx => {
  const { server, address } = ctx
  server.handle('foo', async bar => {
    assert.is(bar, 'bar')
    return 'baz'
  })

  const { data } = await post(address, {
    body: {
      jsonrpc: '2.0',
      method: 'foo',
      params: ['bar']
    }
  })

  assert.is(data.jsonrpc, '2.0')
  assert.is(data.result, 'baz')
})

test('bad requests', async ctx => {
  const { server, address } = ctx

  let body

  body = { jsonrpc: '3.0', id: 'foo' }
  await post(address, { body }).then(assert.unreachable, err =>
    snapshot('server-errors-1.json', err.data)
  )

  body = { jsonrpc: '2.0', method: 'foo' }
  await post(address, { body }).then(assert.unreachable, err =>
    snapshot('server-errors-2.json', err.data)
  )

  server.handle('foo', async () => 17)
  body = { jsonrpc: '2.0', method: 'foo' }
  await post(address, { body }).then(assert.unreachable, err =>
    snapshot('server-errors-3.json', err.data)
  )

  body = { jsonrpc: '2.0', method: 'foo', params: 'notArray' }
  await post(address, { body }).then(assert.unreachable, err =>
    snapshot('server-errors-4.json', err.data)
  )

  body = 'notJSON'
  await post(address, { body }).then(assert.unreachable, err =>
    snapshot('server-errors-5.json', err.data)
  )
})

test('bad handler', async ctx => {
  const { server, address } = ctx
  const err = new Error('bar')
  server.handle('foo', () => {
    throw err
  })
  const body = { jsonrpc: '2.0', method: 'foo', params: [] }

  await post(address, { body }).then(assert.unreachable, err =>
    snapshot('server-bad-handler.json', err.data)
  )
})

test('handler that times out', async ctx => {
  let { server, port, address } = ctx
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
  await post(address, { body }).then(assert.unreachable, err =>
    snapshot('server-handler-timeout-1.json', err.data)
  )

  body = { jsonrpc: '2.0', method: 'foo100', params: [] }
  await post(address, { body }).then(res =>
    snapshot('server-handler-timeout-2.json', res.data)
  )

  await server.stop()
})

test('events', async ctx => {
  let { server, port, address } = ctx
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

  snapshot('server-events.json', log)
})

function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

test.run()
