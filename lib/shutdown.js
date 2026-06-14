'use strict'

function createShutdownHandler (hnd, exit = process.exit, log = console.log) {
  let shutdown = 0

  return () => {
    if (shutdown) {
      return
    }
    shutdown = 1

    if (!hnd.active) {
      exit(0)
      return
    }

    log('BKW', process.title, 'shutting down')
    hnd.stop(() => {
      exit(0)
    })
  }
}

module.exports = createShutdownHandler
