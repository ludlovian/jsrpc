import http from 'http';
import stoppable from 'stoppable';

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

const jsonrpc = '2.0';
class RpcServer {
  constructor (options) {
    const {
      callTimeout = 10 * 1000,
      idleTimeout = 5 * 60 * 1000,
      ...otherOptions
    } = options;
    this.callTimeout = callTimeout;
    this.idleTimeout = idleTimeout;
    this.options = otherOptions;
    this.methods = {};
    this.server = stoppable(
      http.createServer((req, res) => this._handle(req, res)),
      5000
    );
    this._touch();
  }
  static create (options) {
    return new RpcServer(options)
  }
  on (method, handler) {
    this.methods[method] = handler;
    return this
  }
  async start () {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.options, err => {
        if (err) return reject(err)
        this.log('start');
        resolve(this);
      });
    })
  }
  stop () {
    return new Promise((resolve, reject) => {
      this.idleTimeout = undefined;
      this._touch();
      this.server.stop(err => {
        if (err) return reject(err)
        this.log('stop');
        resolve(this);
      });
    })
  }
  log () {}
  _touch () {
    if (this._idleTimeout) {
      clearTimeout(this._idleTimeout);
      this._idleTimeout = undefined;
    }
    if (this.idleTimeout) {
      this._idleTimeout = setTimeout(this.stop.bind(this), this.idleTimeout);
    }
  }
  async _handle (req, res) {
    let id;
    try {
      this._touch();
      const body = await readBody(req);
      id = body.id;
      if (body.jsonrpc !== jsonrpc) throw new BadRequest()
      const handler = this.methods[body.method];
      if (!handler) throw new MethodNotFound()
      if (!Array.isArray(body.params)) throw new BadRequest()
      const params = deserialize(body.params);
      this.log('handle', body.method, ...params);
      let p = Promise.resolve(handler(...params));
      if (this.callTimeout) p = timeout(p, this.callTimeout);
      const result = serialize(await p);
      send(res, 200, { jsonrpc, result, id });
    } catch (err) {
      const { name, message } = err;
      const error = serialize({ name, message, ...err });
      send(res, err.status || 500, { jsonrpc, error, id });
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
    let tm = setTimeout(() => reject(new TimedOut()), interval);
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
  constructor () {
    super('Method not found', { status: 404 });
  }
}
class BadRequest extends CustomError {
  constructor () {
    super('Bad request', { status: 400 });
  }
}
class TimedOut extends CustomError {
  constructor () {
    super('Timed out', { status: 504 });
  }
}

export default RpcServer;
