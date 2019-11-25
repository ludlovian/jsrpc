'use strict'

import http from 'http'
import EventEmitter from 'events'
import stoppable from './stoppable'
import { deserialize, serialize } from './util'
const JSONRPC = '2.0'

export default class RpcServer extends EventEmitter {
  constructor (options) {
    super()
    const { callTimeout = 10 * 1000, ...otherOptions } = options
    this.callTimeout = callTimeout
    this.options = otherOptions
    this.methods = {}
    this.server = stoppable(
      http.createServer((req, res) => this._handleRequest(req, res))
    )
  }

  static create (options) {
    return new RpcServer(options)
  }

  handle (method, handler) {
    this.methods[method] = handler
    return this
  }

  start () {
    return new Promise((resolve, reject) => {
      if (this.started) return resolve(this)
      this.server.once('error', reject)
      this.server.listen(this.options, err => {
        // istanbul ignore if
        if (err) return reject(err)
        this.started = true
        this.emit('start')
        resolve(this)
      })
    })
  }

  async stop () {
    if (!this.started) return
    this.started = false
    await this.server.stop(5000)
    this.emit('stop')
  }

  async _handleRequest (req, res) {
    let id
    try {
      // read in the request body and validate
      const body = await readBody(req)
      const { id, jsonrpc, method, params: serializedParams } = body
      if (jsonrpc !== JSONRPC) throw new BadRequest(body)
      const handler = this.methods[method]
      if (!handler) throw new MethodNotFound(body)
      if (!Array.isArray(serializedParams)) throw new BadRequest(body)
      const params = deserialize(serializedParams)

      // now call then underlying handler
      this.emit('call', { method, params })
      let p = Promise.resolve(handler.apply(this, params))
      if (this.callTimeout) p = timeout(p, this.callTimeout)
      const result = serialize(await p)

      // and return the result
      send(res, 200, { jsonrpc: JSONRPC, result, id })
    } catch (err) {
      // any errors result in a safe error return
      const { name, message } = err
      const error = serialize({ name, message, ...err })
      send(res, err.status || 500, { jsonrpc: JSONRPC, error, id })
    }
  }
}

function send (res, code, data) {
  data = JSON.stringify(data)
  res.writeHead(code, {
    'content-type': 'application/json;charset=utf-8',
    'content-length': Buffer.byteLength(data)
  })
  res.end(data)
}

function readBody (req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req
      .on('error', reject)
      .on('data', chunk => {
        data += chunk
      })
      .on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (err) {
          reject(new BadRequest())
        }
      })
  })
}

function timeout (promise, interval) {
  return new Promise((resolve, reject) => {
    const tm = setTimeout(() => reject(new TimedOut()), interval)
    promise.then(result => {
      clearTimeout(tm)
      resolve(result)
    }, reject)
  })
}

class CustomError extends Error {
  constructor (message, rest) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
    Object.assign(this, rest)
  }
}

class MethodNotFound extends CustomError {
  constructor (body) {
    super('Method not found', { status: 404, body })
  }
}

class BadRequest extends CustomError {
  constructor (body) {
    super('Bad request', { status: 400, body })
  }
}

class TimedOut extends CustomError {
  constructor (body) {
    super('Timed out', { status: 504, body })
  }
}
