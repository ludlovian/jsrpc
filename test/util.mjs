import { test } from 'uvu'
import * as assert from 'uvu/assert'
import snapshot from './helpers/snapshot.mjs'

import { serialize, deserialize } from '../src/util.mjs'

test('serialize', t => {
  const data = {
    foo: 'bar',
    arr: [1, 2, 3],
    sub: {
      date: new Date(2018, 6, 23, 17, 43, 21),
      biz: 'baz'
    },
    arr2: [undefined, 'ping', 17]
  }

  const serialized = serialize(data)
  snapshot('util-serialize.json', serialized)

  const data2 = deserialize(serialized)
  assert.equal(data, data2)

  assert.ok(Object.isFrozen(data2))
  assert.ok(Object.isFrozen(data2.sub.date))
})

test.run()
