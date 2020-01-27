'use strict'

import { request } from 'http'
import { serialize, deserialize } from './util'
const jsonrpc = '2.0'

const knownErrors = {}

export default class RpcClient {
  constructor (options) {
    this.options = options
  }

  async call (method, ...params) {
    const body = JSON.stringify({
      jsonrpc,
      method,
      params: serialize(params)
    })

    const options = {
      ...this.options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        Connection: 'keep-alive'
      }
    }
    const res = await makeRequest(options, body)
    const data = await readResponse(res)

    if (data.error) {
      const errDetails = deserialize(data.error)
      const Factory = RpcClient.error(errDetails.name)
      throw new Factory(errDetails)
    }

    return deserialize(data.result)
  }

  static error (name) {
    let constructor = knownErrors[name]
    if (constructor) return constructor
    constructor = makeErrorClass(name)
    knownErrors[name] = constructor
    return constructor
  }
}

function makeRequest (options, body) {
  return new Promise((resolve, reject) => {
    const req = request(options, resolve)
    req.once('error', reject)
    req.write(body)
    req.end()
  })
}

async function readResponse (res) {
  res.setEncoding('utf8')
  let data = ''
  for await (const chunk of res) {
    data += chunk
  }
  return JSON.parse(data)
}

function makeErrorClass (name) {
  function fn (data) {
    const { name, ...rest } = data
    Error.call(this)
    Error.captureStackTrace(this, this.constructor)
    Object.assign(this, rest)
  }

  // reset the name of the constructor
  Object.defineProperties(fn, {
    name: { value: name, configurable: true }
  })

  // make it inherit from error
  fn.prototype = Object.create(Error.prototype, {
    name: { value: name, configurable: true },
    constructor: { value: fn, configurable: true }
  })

  return fn
}
