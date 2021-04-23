'use strict'

import http from 'http'
import EventEmitter from 'events'
import stoppable from './stoppable'
import { deserialize, serialize } from './util'

const priv = Symbol('jsrpc')

const JSONRPC = '2.0'

export default class RpcServer extends EventEmitter {
  constructor (opts) {
    super()
    const { callTimeout, ...options } = opts
    const methods = {}
    const server = stoppable(http.createServer(handleRequest.bind(this)))
    const started = false
    Object.defineProperty(this, priv, {
      configurable: true,
      value: { callTimeout, options, methods, server, started }
    })
  }

  static create (options) {
    return new RpcServer(options)
  }

  handle (method, handler) {
    this[priv].methods[method] = handler
    return this
  }

  start () {
    return new Promise((resolve, reject) => {
      const { started, server, options } = this[priv]
      if (started) return resolve(this)
      server.once('error', reject)
      server.listen(options, err => {
        // istanbul ignore if
        if (err) return reject(err)
        this[priv].started = true
        this.emit('start')
        resolve(this)
      })
    })
  }

  get started () {
    return this[priv].started
  }

  get httpServer () {
    return this[priv].server
  }

  async stop () {
    if (!this[priv].started) return
    this[priv].started = false
    await this[priv].server.stop(5000)
    this.emit('stop')
  }
}

async function handleRequest (req, res) {
  let id
  try {
    const { methods, callTimeout } = this[priv]
    // read in the request body and validate
    const body = await readBody(req)
    const { id: _id, jsonrpc, method, params: serializedParams } = body
    id = _id
    if (jsonrpc !== JSONRPC) throw new BadRequest(body)
    const handler = methods[method]
    if (!handler) throw new MethodNotFound(body)
    if (!Array.isArray(serializedParams)) throw new BadRequest(body)
    const params = deserialize(serializedParams)

    // now call then underlying handler
    this.emit('call', { method, params })
    let p = Promise.resolve(handler.apply(this, params))
    if (callTimeout) p = timeout(p, callTimeout)
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
          reject(new BadRequest(data))
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
