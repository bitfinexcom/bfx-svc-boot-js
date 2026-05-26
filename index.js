'use strict'

const cmd = require('yargs')
  .option('wtype', {
    demand: true,
    type: 'string'
  })
  .option('env', {
    choices: ['production', 'development', 'test'],
    demand: true,
    type: 'string'
  })
  .option('debug', {
    default: false,
    type: 'boolean'
  })
  .help('help')
  .argv

const hnd = require('./lib/worker.js')(cmd)
const createShutdownHandler = require('./lib/shutdown')

const shutdown = createShutdownHandler(hnd)
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

module.exports = hnd
