'use strict'

import test from 'ava'
import { serialize, deserialize } from '../src/util'

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
  t.snapshot(serialized)

  const data2 = deserialize(serialized)
  t.deepEqual(data, data2)

  t.true(Object.isFrozen(data2))
  t.true(Object.isFrozen(data2.sub.date))
})
