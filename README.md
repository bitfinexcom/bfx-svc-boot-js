# bfx-svc-boot-js

Used to spawn a `bfx-svc-js` service. Contains the worker CLI.

**Arguments:**

```
wtype         worker name, e.g. wrk-util-net-api, required
env           production, development, staging or test, required
debug         enable debug mode, forwarded to the worker as ctx.debug
```

Any other option is forwarded to the worker as well, so a worker that needs a port
can be started with `--api-port 8721` and read it from `ctx.apiPort`.

**Example:**

```
$ node worker.js --env=development --wtype=wrk-util-net-api --api-port 8721 --debug
```
