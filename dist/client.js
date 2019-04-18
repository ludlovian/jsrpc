'use strict';

var http = require('http');

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
    const req = http.request(options, resolve);
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

module.exports = RpcClient;
