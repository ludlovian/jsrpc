import { test } from 'uvu'
import * as assert from 'uvu/assert'

import { RpcClient, RpcServer } from '../src/index.mjs'

test('call which returns', async () => {
  const data = {
    sub: {
      arr: [undefined, 'foo'],
      bar: true
    },
    num: 17,
    undef: undefined
  }
  const server = await RpcServer.create({ port: 0 })
    .handle('foo', async () => data)
    .start()

  const { port } = server.httpServer.address()
  const client = new RpcClient({ port })
  const result = await client.call('foo')

  assert.equal(result, data)
  await server.stop()
})

test('call which throws', async () => {
  const err = Object.assign(new Error('foo'), { name: 'bar', code: 'baz' })

  const server = await RpcServer.create({ port: 0 })
    .handle('foo', async () => {
      throw err
    })
    .start()

  const { port } = server.httpServer.address()
  const client = new RpcClient({ port })
  await client.call('foo').then(assert.unreachable, err => {
    assert.is(err.name, 'bar')
    assert.is(err.message, 'foo')
    assert.is(err.code, 'baz')

    let Type = RpcClient.error('bar')
    assert.instance(err, Type)
    assert.is(err.constructor, Type)

    Type = RpcClient.error('quux')
    assert.not.instance(err, Type)
  })

  await server.stop()
})

test.run()
