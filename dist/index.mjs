import http, { request } from 'http';
import EventEmitter from 'events';

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

const priv = Symbol('jsrpc');
const JSONRPC = '2.0';
class RpcServer extends EventEmitter {
  constructor (opts) {
    super();
    const { callTimeout, ...options } = opts;
    const methods = {};
    const server = stoppable(http.createServer(handleRequest.bind(this)));
    const started = false;
    Object.defineProperty(this, priv, {
      configurable: true,
      value: { callTimeout, options, methods, server, started }
    });
  }
  static create (options) {
    return new RpcServer(options)
  }
  handle (method, handler) {
    this[priv].methods[method] = handler;
    return this
  }
  start () {
    return new Promise((resolve, reject) => {
      const { started, server, options } = this[priv];
      if (started) return resolve(this)
      server.once('error', reject);
      server.listen(options, err => {
        if (err) return reject(err)
        this[priv].started = true;
        this.emit('start');
        resolve(this);
      });
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
    this[priv].started = false;
    await this[priv].server.stop(5000);
    this.emit('stop');
  }
}
async function handleRequest (req, res) {
  let id;
  try {
    const { methods, callTimeout } = this[priv];
    const body = await readBody(req);
    const { id: _id, jsonrpc, method, params: serializedParams } = body;
    id = _id;
    if (jsonrpc !== JSONRPC) throw new BadRequest(body)
    const handler = methods[method];
    if (!handler) throw new MethodNotFound(body)
    if (!Array.isArray(serializedParams)) throw new BadRequest(body)
    const params = deserialize(serializedParams);
    this.emit('call', { method, params });
    let p = Promise.resolve(handler.apply(this, params));
    if (callTimeout) p = timeout(p, callTimeout);
    const result = serialize(await p);
    send(res, 200, { jsonrpc: JSONRPC, result, id });
  } catch (err) {
    const { name, message } = err;
    const error = serialize({ name, message, ...err });
    send(res, err.status || 500, { jsonrpc: JSONRPC, error, id });
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
          reject(new BadRequest(data));
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
const knownErrors = {};
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
      const errDetails = deserialize(data.error);
      const Factory = RpcClient.error(errDetails.name);
      throw new Factory(errDetails)
    }
    return deserialize(data.result)
  }
  static error (name) {
    let constructor = knownErrors[name];
    if (constructor) return constructor
    constructor = makeErrorClass(name);
    knownErrors[name] = constructor;
    return constructor
  }
}
function makeRequest (options, body) {
  return new Promise((resolve, reject) => {
    const req = request(options, resolve);
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
function makeErrorClass (name) {
  function fn (data) {
    const { name, ...rest } = data;
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);
    Object.assign(this, rest);
  }
  Object.defineProperties(fn, {
    name: { value: name, configurable: true }
  });
  fn.prototype = Object.create(Error.prototype, {
    name: { value: name, configurable: true },
    constructor: { value: fn, configurable: true }
  });
  return fn
}

export { RpcClient, RpcServer };
