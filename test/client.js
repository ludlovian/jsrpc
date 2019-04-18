'use strict'

import test from 'ava'

import RpcClient from '../src/client'
import RpcServer from '../src/server'

test('call which returns', async t => {
  const data = {
    sub: {
      arr: [undefined, 'foo'],
      bar: true
    },
    num: 17,
    undef: undefined
  }
  const server = await RpcServer.create({ port: 0 })
    .on('foo', async () => data)
    .start()

  const { port } = server.server.address()
  const client = new RpcClient({ port })
  const result = await client.call('foo')

  t.deepEqual(result, data)
  await server.stop()
})

test('call which throws', async t => {
  const err = Object.assign(new Error('foo'), { name: 'bar', code: 'baz' })

  const server = await RpcServer.create({ port: 0 })
    .on('foo', async () => {
      throw err
    })
    .start()

  const { port } = server.server.address()
  const client = new RpcClient({ port })
  await client.call('foo').then(
    () => t.fail(),
    err => {
      t.is(err.name, 'bar')
      t.is(err.message, 'foo')
      t.is(err.code, 'baz')
    }
  )

  await server.stop()
})
