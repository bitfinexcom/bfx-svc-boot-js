# bfx-svc-boot-js

Used to spawn a `bfx-svc-js` service. Contains the worker CLI.

**Arguments:**

```
wtype         worker name, e.g. wrk-util-net-api
env           production or development
debug         enable debug mode, with heap dump support

For workers that require a port:

apiPort       port to listen on, e.g. 8721
```

## Heap dumps

Memory snapshots can be loaded in Chrome. Open developer tools, go to the `Memory` tab, click: `Load profile...`. You can load multiple snapshots and diff them.


To enable Memory Snapshot support, start the service with the `--debug` flag.

A snapshot is written each time the process receives a `SIGUSR2` signal.

```
$ kill -USR2 <pid>
```
**Example:**

```
# start service with heap dump support
$ node worker.js --env=development --wtype=wrk-util-net-api --apiPort 8721 --debug=true

# do some operations, e.g. multiple requests

# then take first snapshot
$ ps -A | grep util-net-api
70833 ttys001    0:01.23 wrk-util-net-api-70833

$ kill -USR2 70833

# heapdump-258886655.138372.heapsnapshot file appears in service dir

# repeat sending signal if you want to compare snapshots
```
