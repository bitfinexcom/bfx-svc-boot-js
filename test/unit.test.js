'use strict'

const test = require('brittle')
const tmp = require('test-tmp')
const path = require('path')
const fs = require('fs')

const worker = require('../lib/worker')
const fixtureWorker = path.join(__dirname, 'fixtures', 'workers', 'dummy.js')

async function setupDir (t) {
  const dir = await tmp(t)
  fs.mkdirSync(path.join(dir, 'config'))
  fs.mkdirSync(path.join(dir, 'workers'))
  fs.copyFileSync(fixtureWorker, path.join(dir, 'workers', 'dummy.js'))
  return dir
}

function writeConfig (dir, filename, content) {
  const filePath = path.join(dir, 'config', filename)
  const data = filename.endsWith('.js') ? content : JSON.stringify(content)
  fs.writeFileSync(filePath, data)
}

function run (dir, env) {
  return worker({ wtype: 'dummy', env, serviceRoot: dir })
}

test('JSON config resolution', async (t) => {
  await t.test('loads base JSON config if env is not provided', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'common.json', { key: 'value', nested: { a: 1 } })
    writeConfig(dir, 'production.common.json', { key: 'env-specific' })

    const wrk = run(dir)
    t.alike(wrk.conf, { key: 'value', nested: { a: 1 } })
  })

  await t.test('loads env-specific JSON config over base others', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'common.json', { key: 'base' })
    writeConfig(dir, 'production.common.json', { key: 'prod-env-specific' })
    writeConfig(dir, 'development.common.json', { key: 'dev-env-specific' })

    const wrk = run(dir, 'production')
    t.is(wrk.conf.key, 'prod-env-specific')
  })

  await t.test('falls back to base JSON if env-specific JSON is missing', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'common.json', { key: 'base' })

    const wrk = run(dir, 'production')
    t.is(wrk.conf.key, 'base')
  })
})

test('JS config resolution', async (t) => {
  await t.test('loads base JS config when no JSON exists', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'common.js', "module.exports = { key: 'from-js' }")

    const wrk = run(dir)
    t.is(wrk.conf.key, 'from-js')
  })

  await t.test('loads env-specific JS config when no JSON exists and env is provided', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'development.common.js', "module.exports = { key: 'dev-env-js' }")
    writeConfig(dir, 'production.common.js', "module.exports = { key: 'prod-js' }")

    const wrk = run(dir, 'development')
    t.is(wrk.conf.key, 'dev-env-js')
  })

  await t.test('falls back to base JS if env-specific JS is missing and no JSON exists', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'common.js', "module.exports = { key: 'base-js' }")

    const wrk = run(dir, 'production')
    t.is(wrk.conf.key, 'base-js')
  })
})

test('config priority order', async (t) => {
  await t.test('JSON config takes priority over JS config', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'common.json', { source: 'json' })
    writeConfig(dir, 'common.js', "module.exports = { source: 'js' }")

    const wrk = run(dir)
    t.is(wrk.conf.source, 'json')
  })

  await t.test('env-specific JSON has highest priority', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'production.common.json', { source: 'env-json' })
    writeConfig(dir, 'common.json', { source: 'base-json' })
    writeConfig(dir, 'production.common.js', "module.exports = { source: 'env-js' }")
    writeConfig(dir, 'common.js', "module.exports = { source: 'base-js' }")

    const wrk = run(dir, 'production')
    t.is(wrk.conf.source, 'env-json')
  })
})
