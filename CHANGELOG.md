# Changelog

## 2.0.0

Replaces `yargs` with [`paparam`](https://www.npmjs.com/package/paparam) and `lodash`
with [`@bitfinex/lib-js-util-base`](https://www.npmjs.com/package/@bitfinex/lib-js-util-base),
leaving the package with two dependencies that have no dependencies of their own.

The option forms a service is normally started with are unchanged. `--wtype`, `--env`
and `--debug` behave as before, including `--opt=value`, `--debug=true|false`,
`--debug true|false` and `--no-debug`. Unknown options are still forwarded to the
worker, still keyed under both their kebab-case and camelCase spelling, still turned
into numbers when they look like numbers, still collected into an array when repeated,
and still read as a switch when given without a value. Exit codes and the streams the
parser writes to are also unchanged: a bad invocation reports on stderr and leaves with
`1`, `--help` prints on stdout and leaves with `0`.

What follows is what a caller can observe differently.

### Breaking changes

**Failure messages are paparam bails.** A failing parse throws a `Bail` (an `Error`
subclass) whose message is a reason and the flag or argument it belongs to, in place of
the yargs wording. Anything matching on the old text needs updating:

| invocation | 1.x | 2.0.0 |
| --- | --- | --- |
| `--env test` | `Missing required argument: wtype` | `MISSING_ARG: wtype` |
| no options | `Missing required arguments: wtype, env` | `MISSING_ARGS: wtype, env` |
| `--env nope` | `Invalid values: Argument: env, Given: "nope", ...` | `INVALID_FLAG: env` |

**Help output is paparam's.** `--help` prints a `worker [flags]` usage block listing the
flags with their choices inline, rather than the yargs `Options:` table. It still exits
with `0`. `-h` is now a help alias, where 1.x read it as an unknown flag and set
`h: true`, because `.help('help')` never aliased it.

**`--version` is no longer a parser option.** yargs answered it by printing a version and
exiting `0`. Nothing claims it now, so it is treated as any other unknown option: the
worker starts with `version: true` on its `ctx`. Anything calling the service with
`--version` as a liveness or version check has to be changed.

**Short flags are rejected.** `-d`, `-x 1` and bundles such as `-abc` fail with
`UNKNOWN_FLAG`, where yargs accepted them and, for a bundle, set one entry per letter.
Only long options are accepted now. `-h` remains, as help.

**Positional arguments are rejected.** A bare argument fails with `UNKNOWN_ARG: stray`
instead of being gathered into `_`. For the same reason, everything after a `--`
separator is dropped rather than collected.

**`_` and `$0` are gone from the parsed result.** The worker `ctx` no longer carries the
`''` and `'0'` keys those produced through camelCasing. Every other `ctx` entry is
unchanged: `root`, `wtype`, `env`, `worker`, `debug` and the forwarded options.

**Values that are not a value are rejected for `--wtype` and `--env`.** `--wtype ''`,
`--wtype=`, `--wtype` with nothing after it, and `--no-wtype` all fail with
`INVALID_FLAG: wtype`. yargs accepted these and yielded `''` or `false`, which then
failed further along: an empty `wtype` resolves to a `workers/` directory path, and
`false` has no `split`. The failure is the same class of problem reported sooner.

**A repeated `--wtype` or `--env` keeps the last value** instead of becoming an array.
Repeating an unknown option still produces an array, as before.

**An all upper case kebab option lands on a different `ctx` key.** `camelize` renders
`--API-PORT` as `aPIPORT` where lodash's `camelCase` rendered it `apiPort`. Options
written in the usual lower case are unaffected: `--api-port`, `--service-root`,
`--no-cache`, `--foo_bar` all camelCase exactly as before.

### Removed

- The `heapdump` section of the readme, describing a `SIGUSR2` heap snapshot written when
  the service runs with `--debug`. The implementation behind it was removed in
  2023-06-06 (`6ae412e`), so the documented signal had no handler and terminated the
  process instead of writing a snapshot. `--debug` itself is unchanged and still reaches
  the worker as `ctx.debug`, for the worker to act on.
- The unused `type` parameter of the internal `getConf`, only ever called with `null`
  throughout the history of the file.

### Internal

- `lib/cli.js` holds the parser, extracted from `index.js`, exported as before: a single
  callable taking `(args, { exitProcess })`. Requiring the package, or `lib/worker.js`,
  or `lib/shutdown.js`, is unaffected.
- A worker's `conf` is deep copied with `cloneDeep` rather than `merge({}, conf)`, which
  keeps the previous protection: a js config is the cached module object, so a worker
  mutating its own conf must not change the conf of a worker built after it.
