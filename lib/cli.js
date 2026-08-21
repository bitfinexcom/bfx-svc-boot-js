'use strict'

const yargs = require('yargs/yargs')
const { command, flag, validate } = require('paparam')

const ENVS = ['production', 'development', 'staging', 'test']
const BOOLEANS = ['true', 'false']
const REQUIRED = ['wtype', 'env']

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

// number rules compatible with previous version: hex and plain decimals become numbers, a leading zero or a
// value too large to hold precision stays a string
const looksLikeNumber = (value) =>
  /^0x[0-9a-f]+$/i.test(value) ||
  (!/^0[^.]/.test(value) && /^-?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?$/i.test(value))

const coerce = (value) => {
  if (typeof value !== 'string' || !looksLikeNumber(value)) return value

  return Number.isSafeInteger(Math.floor(parseFloat(value))) ? Number(value) : value
}

// rewrites the two forms paparam bails on into the forms it accepts:
//
// - a value given to a boolean flag, so `--debug=true` and `--debug true` become
//   `--debug` / `--no-debug`. Only the boolean flags of the definition are
//   rewritten, by their cli name as typed, so a value flag keeps a literal
//   `true` / `false` as its string value. Like previous parser, only the literal
//   `true` is truthy, anything else turns the flag off
// - a negative number value, read as a flag of its own, so `--foo -3` is joined
//   into `--foo=-3`
const normalizeArgs = (args, flags) => {
  const booleans = flags.filter(f => f.boolean).flatMap(f => f.aliases)
  const normalized = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const eq = arg.indexOf('=')
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq)
    const next = args[i + 1]

    // previous parsing collects everything past `--` into `_`, which is not carried over
    if (arg === '--') break

    if (!arg.startsWith('--')) {
      normalized.push(arg)
      continue
    }

    if (booleans.includes(name)) {
      let value = eq === -1 ? null : arg.slice(eq + 1)

      if (value === null && BOOLEANS.includes(next)) {
        value = args[++i]
      }

      normalized.push(value === null ? arg : (value === 'true' ? `--${name}` : `--no-${name}`))
      continue
    }

    if (eq === -1 && next !== undefined && next.startsWith('-') && looksLikeNumber(next)) {
      normalized.push(`${arg}=${args[++i]}`)
      continue
    }

    // an empty `--foo=` swallows the flag that follows it, `--foo ''` does not
    if (eq === arg.length - 1) {
      normalized.push(arg.slice(0, eq), '')
      continue
    }

    normalized.push(arg)
  }

  return normalized
}

// paparam only parses what the definition declares, while previous parser accepts
// arbitrary  options, so every flag outside the definition is declared on the fly.
// Declaring them keeps the parse strict, an unknown flag left to `sloppy()` would
// swallow the flag that follows it
const unknownFlags = (args, flags) => {
  const known = flags.flatMap(f => f.aliases)
  const unknown = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (!arg.startsWith('--')) continue

    const eq = arg.indexOf('=')
    const typed = eq === -1 ? arg.slice(2) : arg.slice(2, eq)
    const name = typed.startsWith('no-') ? typed.slice(3) : typed

    if (known.includes(name) || unknown.some(f => f.aliases.includes(name))) continue

    const next = args[i + 1]
    const valued = eq !== -1 || (next !== undefined && !next.startsWith('-'))

    // an optional value defaulting to '' keeps `--foo=` and `--foo ''` parsable,
    // and multiple() collects a repeated option the way previous parser does
    unknown.push(valued ? flag(`--${name} [${name}]`).default('').multiple() : flag(`--${name}`))
  }

  return unknown
}

const demand = (requiredFlags) => validate(({ flags }) => {
  if (flags.help) {
    return true
  }

  const missing = requiredFlags.filter(name => flags[name] === undefined)
  if (missing.length === 0) {
    return true
  }

  const err = new Error()
  err.bail = { reason: `MISSING_ARG${missing.length > 1 ? 'S' : ''}: ${missing.join(', ')}` }
  throw err
}, 'required flags')

const cliParser2 = (args = process.argv.slice(2), { exitProcess = true } = {}) => {
  const flags = [
    flag('--wtype <wtype>', 'worker type'),
    flag('--env <env>', 'service environment').choices(ENVS),
    flag('--debug', 'debug mode'),
    flag('--help|-h', 'show help')
  ]
  args = normalizeArgs(args, flags)

  const unknown = unknownFlags(args, flags)
  const cmd = command('worker', ...flags, ...unknown, demand(REQUIRED))

  try {
    cmd.parse(args)
  } catch (err) {
    if (!exitProcess) {
      throw err
    }

    console.error(cmd.usage())
    console.error(err.message)
    process.exit(1)
  }

  if (exitProcess && cmd.flags.help) {
    process.exit(0)
  }

  const { wtype, env, debug } = cmd.flags
  const parsed = { wtype, env, debug }

  for (const f of unknown) {
    const value = cmd.flags[f.name]
    const coerced = Array.isArray(value) ? value.map(coerce) : coerce(value)

    // paparam keys a flag by its camelCase name, previous parser exposes both spellings and
    // only turns an option into an array once it is given more than once
    parsed[f.name] = parsed[f.aliases[0]] = Array.isArray(coerced) && coerced.length === 1
      ? coerced[0]
      : coerced
  }

  return parsed
}

module.exports = cliParser
module.exports.cliParser2 = cliParser2
