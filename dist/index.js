'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var http = require('http');
var http__default = _interopDefault(http);
var EventEmitter = _interopDefault(require('events'));

function stoppable (server) {
  const openRequests = new Map();
  let stopping = false;
  server.on('connection', socket => {
    openRequests.set(socket, 0);
    socket.once('close', () => openRequests.delete(socket));
  });
  server.on('request', (req, res) => {
    const { socket } = req;
    openRequests.set(socket, openRequests.get(socket) + 1);
    res.once('finish', () => {
      const others = openRequests.get(socket) - 1;
      openRequests.set(socket, others);
      if (stopping && others === 0) {
        socket.end();
      }
    });
  });
  server.stop = timeout =>
    new Promise((resolve, reject) => {
      if (stopping) return resolve()
      stopping = true;
      let graceful = true;
      let tm;
      Array.from(openRequests).map(([socket, n]) => n || socket.end());
      server.close(err => {
        if (err) return reject(err)
        if (tm) clearTimeout(tm);
        resolve(graceful);
      });
      if (timeout) {
        tm = setTimeout(() => {
          tm = null;
          graceful = false;
          Array.from(openRequests.keys()).map(socket => socket.end());
          setImmediate(() =>
            Array.from(openRequests.keys()).map(socket => socket.destroy())
          );
        }, timeout);
      }
    });
  return server
}

function deserialize (obj) {
  if (Array.isArray(obj)) return obj.map(deserialize)
  if (obj === null || typeof obj !== 'object') return obj
  if ('$$date$$' in obj) return new Date(obj.$$date$$)
  if ('$$undefined$$' in obj) return undefined
  return Object.entries(obj).reduce(
    (o, [k, v]) => ({ ...o, [k]: deserialize(v) }),
    {}
  )
}
function serialize (obj) {
  if (Array.isArray(obj)) return obj.map(serialize)
  if (obj === undefined) return { $$undefined$$: true }
  if (obj instanceof Date) return { $$date$$: obj.getTime() }
  if (obj === null || typeof obj !== 'object') return obj
  return Object.entries(obj).reduce(
    (o, [k, v]) => ({ ...o, [k]: serialize(v) }),
    {}
  )
}

const JSONRPC = '2.0';
class RpcServer extends EventEmitter {
  constructor (options) {
    super();
    const { callTimeout = 10 * 1000, ...otherOptions } = options;
    this.callTimeout = callTimeout;
    this.options = otherOptions;
    this.methods = {};
    this.server = stoppable(
      http__default.createServer((req, res) => this._handleRequest(req, res))
    );
  }
  static create (options) {
    return new RpcServer(options)
  }
  handle (method, handler) {
    this.methods[method] = handler;
    return this
  }
  start () {
    return new Promise((resolve, reject) => {
      if (this.started) return resolve(this)
      this.server.once('error', reject);
      this.server.listen(this.options, err => {
        if (err) return reject(err)
        this.started = true;
        this.emit('start');
        resolve(this);
      });
    })
  }
  async stop () {
    if (!this.started) return
    this.started = false;
    await this.server.stop(5000);
    this.emit('stop');
  }
  async _handleRequest (req, res) {
    let id;
    try {
      const body = await readBody(req);
      const { id, jsonrpc, method, params: serializedParams } = body;
      if (jsonrpc !== JSONRPC) throw new BadRequest(body)
      const handler = this.methods[method];
      if (!handler) throw new MethodNotFound(body)
      if (!Array.isArray(serializedParams)) throw new BadRequest(body)
      const params = deserialize(serializedParams);
      this.emit('call', { method, params });
      let p = Promise.resolve(handler.apply(this, params));
      if (this.callTimeout) p = timeout(p, this.callTimeout);
      const result = serialize(await p);
      send(res, 200, { jsonrpc: JSONRPC, result, id });
    } catch (err) {
      const { name, message } = err;
      const error = serialize({ name, message, ...err });
      send(res, err.status || 500, { jsonrpc: JSONRPC, error, id });
    }
  }
}
function send (res, code, data) {
  data = JSON.stringify(data);
  res.writeHead(code, {
    'content-type': 'application/json;charset=utf-8',
    'content-length': Buffer.byteLength(data)
  });
  res.end(data);
}
function readBody (req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req
      .on('error', reject)
      .on('data', chunk => {
        data += chunk;
      })
      .on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new BadRequest());
        }
      });
  })
}
function timeout (promise, interval) {
  return new Promise((resolve, reject) => {
    const tm = setTimeout(() => reject(new TimedOut()), interval);
    promise.then(result => {
      clearTimeout(tm);
      resolve(result);
    }, reject);
  })
}
class CustomError extends Error {
  constructor (message, rest) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
    Object.assign(this, rest);
  }
}
class MethodNotFound extends CustomError {
  constructor (body) {
    super('Method not found', { status: 404, body });
  }
}
class BadRequest extends CustomError {
  constructor (body) {
    super('Bad request', { status: 400, body });
  }
}
class TimedOut extends CustomError {
  constructor (body) {
    super('Timed out', { status: 504, body });
  }
}

const jsonrpc = '2.0';
class RpcClient {
  constructor (options) {
    this.options = options;
  }
  async call (method, ...params) {
    const body = JSON.stringify({
      jsonrpc,
      method,
      params: serialize(params)
    });
    const options = {
      ...this.options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        Connection: 'keep-alive'
      }
    };
    const res = await makeRequest(options, body);
    const data = await readResponse(res);
    if (data.error) {
      const err = new Error();
      Object.assign(err, deserialize(data.error));
      throw err
    }
    return deserialize(data.result)
  }
}
function makeRequest (options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, resolve);
    req.once('error', reject);
    req.write(body);
    req.end();
  })
}
async function readResponse (res) {
  res.setEncoding('utf8');
  let data = '';
  for await (const chunk of res) {
    data += chunk;
  }
  return JSON.parse(data)
}

exports.RpcClient = RpcClient;
exports.RpcServer = RpcServer;
