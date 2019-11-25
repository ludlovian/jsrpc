# jsrpc
Simple JSON RPC over HTTP

Comes in client and server variants

## Server API

### RpcServer
```
import { RpcServer } from 'jsrpc'
server = new RpcServer(options)
server = RpcServer.create(options)
```

Creates a server. Options are the `net`/`http` listen options (e.g. `{ port: 12345 }`), but also include:
- `callTimeout` timeout for any individual call (in ms) - default 5 sec

Server is an EventEmitter, emitting the following:
- `start` - when the server has started
- `stop` - when the server has stopped
- `call` - on each call with `{ method, params }`


### start
`await server.start()`

Starts the server listening

### stop

`await server.stop()`

Stops the server

### handle
`server.handle(<method>, <handler>)`

Sets the handler for a given method. Returns the server for chaining. Handler will be `awaited` so can be async.

## Client API

### RpcClient
```
import { RcpClient } from 'jsrpc'
client = new RpcClient(options)
```

Creates a client. Options are those for `http.request` (e.g. `{ port: 12345 }`).

### call

`result = await client.call(<method>, <params...>)`

Calls the method remotely and returns the result or throws the error from the handler.
Any errors thrown will actually just be `instanceof Error` but with `name`, `message` and any other custom props added,
so you cannot do `instanceof` checks.
