import http, { request } from 'http';
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
    const req = request(options, resolve);
    req.once('error', reject);
    req.write(body);
    req.end();
  })
}
function readResponse (res) {
  return new Promise((resolve, reject) => {
    let data = '';
    res.setEncoding('utf8');
    res
      .once('error', reject)
      .on('data', chunk => {
        data += chunk;
      })
      .on('end', () => resolve(data));
  }).then(data => JSON.parse(data))
}

const jsonrpc$1 = '2.0';
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
      http.createServer((req, res) => this.handle(req, res)),
      5000
    );
    this.touch();
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
        resolve(this);
      });
    })
  }
  stop () {
    return new Promise((resolve, reject) => {
      this.idleTimeout = undefined;
      this.touch();
      this.server.stop(err => {
        if (err) return reject(err)
        resolve(this);
      });
    })
  }
  touch () {
    if (this._idleTimeout) {
      clearTimeout(this._idleTimeout);
      this._idleTimeout = undefined;
    }
    if (this.idleTimeout) {
      this._idleTimeout = setTimeout(this.stop.bind(this), this.idleTimeout);
    }
  }
  async handle (req, res) {
    let id;
    try {
      this.touch();
      const body = await readBody(req);
      id = body.id;
      if (body.jsonrpc !== jsonrpc$1) throw new BadRequest()
      const handler = this.methods[body.method];
      if (!handler) throw new MethodNotFound()
      if (!Array.isArray(body.params)) throw new BadRequest()
      const params = deserialize(body.params);
      let p = Promise.resolve(handler(...params));
      if (this.callTimeout) p = timeout(p, this.callTimeout);
      const result = serialize(await p);
      send(res, 200, { jsonrpc: jsonrpc$1, result, id });
    } catch (err) {
      const { name, message } = err;
      const error = serialize({ name, message, ...err });
      send(res, err.status || 500, { jsonrpc: jsonrpc$1, error, id });
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

export { RpcClient, RpcServer };