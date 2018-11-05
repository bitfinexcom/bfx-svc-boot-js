'use strict'

const cmd = require('yargs')
  .option('wtype', {
    demand: true,
    type: 'string'
  })
  .option('env', {
    choices: ['production', 'development'],
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

let shutdown = 0
process.on('SIGINT', () => {
  if (shutdown) {
    return
  }
  shutdown = 1

  if (!hnd.active) {
    return
  }
  console.log('BKW', process.title, 'shutting down')
  hnd.stop(() => {
    process.exit()
  })
})

module.exports = hnd
