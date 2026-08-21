'use strict'

const test = require('brittle')
const tmp = require('test-tmp')
const path = require('path')
const fs = require('fs')

const worker = require('../lib/worker')
const createShutdownHandler = require('../lib/shutdown')
const cliParser = require('../lib/cli')
const { cliParser2 } = require('../lib/cli')
const fixtureWorkers = path.join(__dirname, 'fixtures', 'workers')

async function setupDir (t) {
  const dir = await tmp(t)
  fs.mkdirSync(path.join(dir, 'config'))
  fs.mkdirSync(path.join(dir, 'workers'))

  for (const filename of fs.readdirSync(fixtureWorkers)) {
    fs.copyFileSync(path.join(fixtureWorkers, filename), path.join(dir, 'workers', filename))
  }

  return dir
}

// yargs logs the usage block through console.error before throwing, so it is
// captured here to keep the test output readable
function parseArgFailure (parse, args) {
  const origError = console.error
  const lines = []
  console.error = (...msg) => lines.push(msg.join(' '))

  let error = null
  try {
    parse(args, { exitProcess: false })
  } catch (err) {
    error = err
  } finally {
    console.error = origError
  }

  return { error, usage: lines.join('\n') }
}

// both parsers print their usage through console.log when help is asked for
function parseWithHelp (parse, args) {
  const origLog = console.log
  const lines = []
  console.log = (...msg) => lines.push(msg.join(' '))

  try {
    return { argv: parse(args, { exitProcess: false }), usage: lines.join('\n') }
  } finally {
    console.log = origLog
  }
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

test('shutdown handler', async (t) => {
  await t.test('exits immediately when worker is not active', (t) => {
    let exitCode = null
    let stopCalled = false
    const hnd = {
      active: 0,
      stop: () => {
        stopCalled = true
      }
    }

    const shutdown = createShutdownHandler(hnd, code => {
      exitCode = code
    }, () => { })

    shutdown()

    t.is(stopCalled, false)
    t.is(exitCode, 0)
  })

  await t.test('stops active worker once before exiting', (t) => {
    let exitCode = null
    let stopCalls = 0
    const hnd = {
      active: 1,
      stop: cb => {
        stopCalls++
        cb()
      }
    }

    const shutdown = createShutdownHandler(hnd, code => {
      exitCode = code
    }, () => { })

    shutdown()
    shutdown()

    t.is(stopCalls, 1)
    t.is(exitCode, 0)
  })
})

test('cli parser', async (t) => {
  await t.test('parses required options and defaults debug to false', (t) => {
    let argv = cliParser(['--wtype', 'dummy', '--env', 'production'])

    t.is(argv.wtype, 'dummy')
    t.is(argv.env, 'production')
    t.is(argv.debug, false)

    argv = cliParser2(['--wtype', 'dummy', '--env', 'production'])

    t.is(argv.wtype, 'dummy')
    t.is(argv.env, 'production')
    t.is(argv.debug, false)
  })

  await t.test('accepts every allowed env', (t) => {
    for (const env of ['production', 'development', 'staging', 'test']) {
      t.is(cliParser(['--wtype', 'dummy', '--env', env]).env, env)
      t.is(cliParser2(['--wtype', 'dummy', '--env', env]).env, env)
    }
  })

  await t.test('parses the debug flag in both directions', (t) => {
    t.is(cliParser(['--wtype', 'dummy', '--env', 'test', '--debug']).debug, true)
    t.is(cliParser(['--wtype', 'dummy', '--env', 'test', '--debug=true']).debug, true)
    t.is(cliParser(['--wtype', 'dummy', '--env', 'test', '--debug', 'true']).debug, true)
    t.is(cliParser(['--wtype', 'dummy', '--env', 'test', '--debug=false']).debug, false)
    t.is(cliParser(['--wtype', 'dummy', '--env', 'test', '--debug', 'false']).debug, false)
    t.is(cliParser(['--wtype', 'dummy', '--env', 'test', '--no-debug']).debug, false)

    t.is(cliParser2(['--wtype', 'dummy', '--env', 'test', '--debug']).debug, true)
    t.is(cliParser2(['--wtype', 'dummy', '--env', 'test', '--debug=true']).debug, true)
    t.is(cliParser2(['--wtype', 'dummy', '--env', 'test', '--debug', 'true']).debug, true)
    t.is(cliParser2(['--wtype', 'dummy', '--env', 'test', '--debug=false']).debug, false)
    t.is(cliParser2(['--wtype', 'dummy', '--env', 'test', '--debug', 'false']).debug, false)
    t.is(cliParser2(['--wtype', 'dummy', '--env', 'test', '--no-debug']).debug, false)
    t.is(cliParser2(['--debug=true', '--wtype', 'dummy', '--env', 'test']).debug, true)
    t.is(cliParser2(['--debug', '--wtype', 'dummy', '--env', 'test']).debug, true)
  })

  await t.test('supports --opt=value form', (t) => {
    let argv = cliParser(['--wtype=dummy', '--env=staging'])

    t.is(argv.wtype, 'dummy')
    t.is(argv.env, 'staging')

    argv = cliParser2(['--wtype=dummy', '--env=staging'])

    t.is(argv.wtype, 'dummy')
    t.is(argv.env, 'staging')
  })

  await t.test('parses unknown cli options', (t) => {
    let argv = cliParser(['--wtype', 'dummy', '--env', 'staging', '--foo', 'bar'])

    t.is(argv.wtype, 'dummy')
    t.is(argv.env, 'staging')
    t.is(argv.foo, 'bar')

    argv = cliParser2(['--wtype', 'dummy', '--env', 'staging', '--foo', 'bar'])

    t.is(argv.wtype, 'dummy')
    t.is(argv.env, 'staging')
    t.is(argv.foo, 'bar')
  })

  await t.test('treats a bare unknown option as a switch', (t) => {
    for (const parse of [cliParser, cliParser2]) {
      t.is(parse(['--wtype', 'dummy', '--env', 'test', '--verbose']).verbose, true)

      const argv = parse(['--wtype', 'dummy', '--env', 'test', '--verbose', '--debug'])

      t.is(argv.verbose, true)
      t.is(argv.debug, true)
    }
  })

  await t.test('turns off an unknown option negated with --no', (t) => {
    for (const parse of [cliParser, cliParser2]) {
      t.is(parse(['--wtype', 'dummy', '--env', 'test', '--no-cache']).cache, false)
    }
  })

  await t.test('coerces numeric option values', (t) => {
    const cases = [
      ['8080', 8080], ['1.5', 1.5], ['-3', -3], ['.5', 0.5], ['1e3', 1000], ['0x10', 16],
      ['007', '007'], ['12abc', '12abc'], ['+5', '+5'], ['9007199254740993', '9007199254740993']
    ]

    for (const parse of [cliParser, cliParser2]) {
      for (const [given, expected] of cases) {
        t.is(parse(['--wtype', 'dummy', '--env', 'test', '--foo', given]).foo, expected)
      }

      // a declared option keeps its value as a string
      t.is(parse(['--wtype', '8080', '--env', 'test']).wtype, '8080')
    }
  })

  await t.test('parses camelCase options as they are', (t) => {
    let argv = cliParser(['--wtype=dummy', '--env=staging', '--apiPort', '8080', '--readMode=off'])

    t.is(argv.wtype, 'dummy')
    t.is(argv.env, 'staging')
    t.is(argv.apiPort, 8080)
    t.is(argv.readMode, 'off')

    argv = cliParser2(['--wtype=dummy', '--env=staging', '--apiPort', '8080', '--readMode=off'])

    t.is(argv.wtype, 'dummy')
    t.is(argv.env, 'staging')
    t.is(argv.apiPort, 8080)
    t.is(argv.readMode, 'off')
  })

  await t.test('collects a repeated unknown option into an array', (t) => {
    for (const parse of [cliParser, cliParser2]) {
      const argv = parse(['--wtype', 'dummy', '--env', 'test', '--peer', 'a', '--peer', 'b'])

      t.alike(argv.peer, ['a', 'b'])
      t.alike(parse(['--wtype', 'dummy', '--env', 'test', '--port', '1', '--port', '2']).port, [1, 2])
    }
  })

  await t.test('keeps an empty unknown option value', (t) => {
    for (const parse of [cliParser, cliParser2]) {
      t.is(parse(['--wtype', 'dummy', '--env', 'test', '--foo', '', '--bar', 'x']).foo, '')
      t.is(parse(['--wtype', 'dummy', '--env', 'test', '--foo=', '--bar', 'x']).foo, '')
      t.is(parse(['--wtype', 'dummy', '--env', 'test', '--foo=', '--bar', 'x']).bar, 'x')
    }
  })

  await t.test('exposes unknown kebab-case options as camelCase', (t) => {
    for (const parse of [cliParser, cliParser2]) {
      const argv = parse(['--wtype', 'dummy', '--env', 'test', '--api-port', '8080'])

      t.is(argv.apiPort, 8080)
      t.is(argv['api-port'], 8080)
    }
  })

  await t.test('fails when wtype is missing', (t) => {
    const cases = [
      [cliParser, 'Missing required argument: wtype'],
      [cliParser2, 'MISSING_ARG: wtype']
    ]

    for (const [parse, message] of cases) {
      const { error } = parseArgFailure(parse, ['--env', 'test'])

      t.ok(error instanceof Error)
      t.is(error.message, message)
    }

    t.ok(parseArgFailure(cliParser, ['--env', 'test']).usage.includes('--wtype'))
  })

  await t.test('fails when env is missing', (t) => {
    const cases = [
      [cliParser, 'Missing required argument: env'],
      [cliParser2, 'MISSING_ARG: env']
    ]

    for (const [parse, message] of cases) {
      const { error } = parseArgFailure(parse, ['--wtype', 'dummy'])

      t.ok(error instanceof Error)
      t.is(error.message, message)
    }
  })

  await t.test('fails when both required options are missing', (t) => {
    const cases = [
      [cliParser, 'Missing required arguments: wtype, env'],
      [cliParser2, 'MISSING_ARGS: wtype, env']
    ]

    for (const [parse, message] of cases) {
      const { error } = parseArgFailure(parse, [])

      t.ok(error instanceof Error)
      t.is(error.message, message)
    }
  })

  await t.test('shows help instead of failing on missing required options', (t) => {
    for (const parse of [cliParser, cliParser2]) {
      const { usage } = parseWithHelp(parse, ['--help'])

      t.ok(usage.includes('--wtype'))
      t.ok(usage.includes('--env'))
    }
  })

  await t.test('fails when env is not an allowed choice', (t) => {
    const { error } = parseArgFailure(cliParser, ['--wtype', 'dummy', '--env', 'nope'])

    t.ok(error instanceof Error)
    t.ok(error.message.includes('Invalid values'))
    t.ok(error.message.includes('Argument: env, Given: "nope"'))

    t.exception(() => cliParser2(['--wtype', 'dummy', '--env', 'nope'], { exitProcess: false }), /INVALID_FLAG: env/)
  })
})

test('worker creation from cli args', async (t) => {
  await t.test('boots the worker described by the parsed args', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'common.json', { development: { key: 'dev' } })

    for (const parse of [cliParser, cliParser2]) {
      const argv = parse(['--wtype', 'dummy', '--env', 'development', '--service-root', dir, '--api-port', '8080'])
      const wrk = worker(argv)

      t.is(wrk.ctx.wtype, 'dummy')
      t.is(wrk.ctx.env, 'development')
      t.is(wrk.ctx.root, dir)
      t.is(wrk.ctx.apiPort, 8080)
      t.is(wrk.ctx.worker, path.join(dir, 'workers', 'dummy'))
      t.is(wrk.ctx.debug, false)
      t.is(wrk.conf.key, 'dev')
      t.is(wrk.constructor.name, 'DummyWorker')
    }
  })

  await t.test('forwards debug and extra options onto the worker ctx', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'common.json', { key: 'base' })

    for (const parse of [cliParser, cliParser2]) {
      const argv = parse([
        '--wtype', 'dummy',
        '--env', 'test',
        '--debug',
        '--service-root', dir,
        '--api-port', '8080'
      ])
      const wrk = worker(argv)

      t.is(wrk.ctx.debug, true)
      t.is(wrk.ctx.apiPort, 8080)
    }
  })

  await t.test('resolves a multi segment wtype to a reversed dotted worker file', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'common.json', { key: 'base' })

    for (const parse of [cliParser, cliParser2]) {
      const argv = parse(['--wtype', 'wrk-services-api', '--env', 'test', '--service-root', dir])
      const wrk = worker(argv)

      t.is(wrk.ctx.wtype, 'wrk-services-api')
      t.is(wrk.ctx.worker, path.join(dir, 'workers', 'api.services.wrk'))
      t.is(wrk.constructor.name, 'WrkServicesApi')
    }
  })

  await t.test('loads the env specific config selected by --env', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'common.json', { key: 'base' })
    writeConfig(dir, 'staging.common.json', { key: 'staging-env' })

    for (const parse of [cliParser, cliParser2]) {
      const argv = parse(['--wtype', 'dummy', '--env', 'staging', '--service-root', dir])
      const wrk = worker(argv)

      t.is(wrk.conf.key, 'staging-env')
    }
  })
})

test('staging env loads staging config', async (t) => {
  const dir = await setupDir(t)
  writeConfig(dir, 'common.json', { key: 'base' })
  writeConfig(dir, 'staging.common.json', { key: 'staging-env' })

  const wrk = run(dir, 'staging')
  t.is(wrk.ctx.env, 'staging')
  t.is(wrk.conf.key, 'staging-env')
})
