'use strict'

const path = require('path')
const _ = require('lodash')
const fs = require('fs')
const serviceRoot = path.dirname(require.main.filename)

const getJSONConf = (env, type, path) => {
  const conf = JSON.parse(fs.readFileSync(path, 'utf8'))
  if (!_.isObject(conf)) {
    return {}
  }

  let res = {}

  if (type) {
    _.set(res, type, conf[env] ? conf[env] : conf)
  } else {
    res = conf
  }

  return res
}

process.env.TZ = 'UTC'

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

const wtype = cmd.wtype
const env = cmd.env
const debug = cmd.debug

let heapdump
if (debug) {
  heapdump = require('heapdump')
}

const conf = _.merge(
  {},
  getJSONConf(env, null, `${serviceRoot}/config/common.json`)
)

const wref = wtype.split('-').reverse()
const ctx = {
  root: serviceRoot,
  wtype: wtype,
  env: env
}

_.each(cmd, (v, k) => {
  ctx[_.camelCase(k)] = v
})

const pname = [wtype]
pname.push(process.pid)
process.title = pname.join('-')

const HandlerClass = require(path.join(serviceRoot, '/workers/', wref.join('.')))
const hnd = new HandlerClass(conf, ctx)

let shutdown = 0

process.on('SIGINT', () => {
  if (shutdown) {
    return
  }
  shutdown = 1

  if (!hnd.active) {
    return
  }
  console.log('BKW', pname, 'shutting down')
  hnd.stop(() => {
    process.exit()
  })
})
