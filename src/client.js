'use strict'

import { request } from 'http'
import { serialize, deserialize } from './util'
const jsonrpc = '2.0'

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
      const err = new Error()
      Object.assign(err, deserialize(data.error))
      throw err
    }

    return deserialize(data.result)
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

function readResponse (res) {
  return new Promise((resolve, reject) => {
    let data = ''
    res.setEncoding('utf8')
    res
      .once('error', reject)
      .on('data', chunk => {
        data += chunk
      })
      .on('end', () => resolve(data))
  }).then(data => JSON.parse(data))
}
