'use strict'

const cliParser = require('./lib/cli')
const createWorker = require('./lib/worker')
const createShutdownHandler = require('./lib/shutdown')

const argv = cliParser()
const hnd = createWorker(argv)

const shutdown = createShutdownHandler(hnd)
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

module.exports = hnd
