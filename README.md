# jsrpc
Simple JSON RPC over HTTP

Comes in client and server variants

## Server API

### RpcServer
```
import RpcServer from 'jsrpc/server'
server = new RpcServer(options)
server = RpcServer.create(options)
```

Creates a server. Options are the `net`/`http` listen options (e.g. `{ port: 12345 }`), but also include:
- `callTimeout` timeout for any individual call (in ms) - default 5 sec
- `idleTimeout` timeout after which server shuts down if no call been made - default 5 min

### start
`await server.start()`

Starts the server listening

### stop

`await server.stop()`

Stops the server

### on
`server.on(<method>, <handler>)`

Sets the handler for a given method. Returns the server for chaining. Handler will be `awaited` so can be async.

## Client API

### RpcClient
```
import RcpClient from 'jsrpc/client'
client = new RpcClient(options)
```

Creates a client. Options are those for `http.request` (e.g. `{ port: 12345 }`).

### call

`result = await client.call(<method>, <params...>)`

Calls the method remotely and returns the result or throws the error from the handler.
Any errors thrown will actually just be `instanceof Error` but with `name`, `message` and any other custom props added,
so you cannot do `instanceof` checks.
