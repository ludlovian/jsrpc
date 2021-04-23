'use strict'

export default function stoppable (server) {
  const openRequests = new Map()
  let stopping = false

  // count the requests as they come in
  server.on('connection', socket => {
    openRequests.set(socket, 0)
    socket.once('close', () => openRequests.delete(socket))
  })

  server.on('request', (req, res) => {
    const { socket } = req
    openRequests.set(socket, openRequests.get(socket) + 1)
    res.once('finish', () => {
      const others = openRequests.get(socket) - 1
      openRequests.set(socket, others)
      if (stopping && others === 0) {
        socket.end()
      }
    })
  })

  // create the stop logic. This will half-close
  server.stop = timeout =>
    new Promise((resolve, reject) => {
      if (stopping) return resolve()
      stopping = true

      let graceful = true
      let tm
      // end any idle connections
      Array.from(openRequests).map(([socket, n]) => n || socket.end())

      // request a close
      server.close(err => {
        /* c8 ignore next */
        if (err) return reject(err)
        if (tm) clearTimeout(tm)
        resolve(graceful)
      })

      // schedule a kill
      if (timeout) {
        tm = setTimeout(() => {
          tm = null
          graceful = false
          Array.from(openRequests.keys()).map(socket => socket.end())
          setImmediate(() =>
            Array.from(openRequests.keys()).map(socket => socket.destroy())
          )
        }, timeout)
      }
    })
  return server
}
