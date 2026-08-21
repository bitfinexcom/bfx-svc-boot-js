'use strict'

const cliParser = () => {
  return require('yargs')
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
    .argv
}

module.exports = cliParser
