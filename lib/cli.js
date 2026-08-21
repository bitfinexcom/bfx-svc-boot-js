'use strict'

const yargs = require('yargs/yargs')

const cliParser = (args = process.argv.slice(2), { exitProcess = true } = {}) => {
  return yargs(args)
    .option('wtype', {
      demand: true,
      type: 'string'
    })
    .option('env', {
      choices: ['production', 'development', 'staging', 'test'],
      demand: true,
      type: 'string'
    })
    .option('debug', {
      default: false,
      type: 'boolean'
    })
    .help('help')
    .exitProcess(exitProcess)
    .argv
}

module.exports = cliParser
