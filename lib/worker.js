'use strict'

const path = require('path')
const _ = require('lodash')
const fs = require('fs')

const getConf = (env, basePath) => {
  const fprefix = env
  const dirname = path.dirname(basePath)
  const basename = path.basename(basePath, path.extname(basePath))

  const envJsonPath = path.join(dirname, `${fprefix}.${basename}.json`)
  const baseJsonPath = path.join(dirname, `${basename}.json`)
  const envJsPath = path.join(dirname, `${fprefix}.${basename}.js`)
  const baseJsPath = path.join(dirname, `${basename}.js`)

  const candidates = [envJsonPath, baseJsonPath, envJsPath, baseJsPath]

  const confPath = candidates.find(p => fs.existsSync(p)) || baseJsonPath

  const conf = confPath.endsWith('.js')
    ? require(confPath)
    : JSON.parse(fs.readFileSync(confPath, 'utf8'))

  if (!_.isObject(conf)) {
    return {}
  }

  return conf[env] ? conf[env] : conf
}

process.env.TZ = 'UTC'

const createWorker = (cmd) => {
  const wtype = cmd.wtype
  const env = cmd.env
  const serviceRoot = cmd.serviceRoot || path.dirname(require.main.filename)

  const conf = _.merge(
    {},
    getConf(env, `${serviceRoot}/config/common`)
  )

  const wref = wtype.split('-').reverse()
  const workerFile = path.join(serviceRoot, '/workers/', wref.join('.'))

  const ctx = {
    root: serviceRoot,
    wtype,
    env,
    worker: workerFile
  }

  _.each(cmd, (v, k) => {
    ctx[_.camelCase(k)] = v
  })

  const pname = [wtype]
  pname.push(process.pid)
  process.title = pname.join('-')

  const HandlerClass = require(workerFile)
  const hnd = new HandlerClass(conf, ctx)

  return hnd
}

module.exports = createWorker
