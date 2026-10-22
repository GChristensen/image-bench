# Image Bench Host Restart

An addon of [Image Bench](https://github.com/GChristensen/image-bench) that restarts a hung or crashed
SD WebUI (Forge, Forge Neo) or ComfyUI from the Image Bench window: the power button of the console drawer and the
plug icon shown while the connection to the host is lost.

It is not a part of Image Bench, and it is not in the extension index or the Comfy Registry. It controls processes,
and security software may flag that. Install it by hand only if you want restarts from the browser.
Without it, Image Bench works as usual, and its restart buttons link to this page.

## What it does

A hung host cannot restart itself, so the addon starts a small helper process (the *sidecar*,
`image_bench_restart/host_supervisor.py`, plain Python run with the host's interpreter) that outlives the host:

- **It starts with the host.** When the host loads the addon and `store/host_restart.json` names a start command,
  the addon starts the sidecar as a detached background process without a window (on Windows it also leaves the
  host's job object, so that closing the host's terminal does not end it), or registers the host with the sidecar
  that is already running. Without the file, nothing is started.
- **It listens on a port of its own.** The sidecar is a small HTTP server on the host's port + 100, on the same
  addresses as the host (on the network when the host runs with `--listen`) and with the host's TLS certificate, so
  that the browser reaches it while the host does not answer. Every request but the certificate page `/` needs a
  random token, which the host passes to the Image Bench window (`/image-bench/host_restart`, a page of the host's
  own origin; other web pages cannot read it). It answers `/status` (whether the host process runs, its memory), `/restart` and
  `/register`.
- **It kills the host.** On a restart, it finds the root of the host's process tree by walking up from the server
  process through the Python interpreters, venv launchers and the shells of the start script (a `cmd.exe` waiting
  at `pause` included), kills that tree with the host's console window, and waits for the port to be free.
  It reads the process list (psutil if installed, else `CreateToolhelp32Snapshot` / `ps`) and kills with
  psutil or `taskkill /F` / signals.
- **It starts the host again.** It runs the start command of `host_restart.json` in a new console window (on Linux and
  macOS without one, output into `store/host.log`), with the environment of the program that started the host
  (read from that process). The new host registers itself, and the Image Bench window reconnects.
- **It ends by itself** 2 minutes after the host is gone and no Image Bench window asks for its status.

The command is set only in `host_restart.json`, edited by hand: neither the browser nor the host can change it, so
anyone reaching a host started with `--listen` can restart it, but cannot run anything else.
The addon never writes outside its `store/` folder, never downloads anything and connects only to the sidecar on
the same computer.

### Why security software may flag it

Each of these is common in malware too: a hidden detached process that survives its parent, process enumeration
through the Windows API, killing a process tree, reading the environment of another process, a local server that
runs a command on request. Some antivirus and EDR products warn about such code or quarantine the files.
If yours does, add an exception for the addon folder or do not use the addon.

## Installation

Copy the `image-bench-host-restart` folder (this folder) next to Image Bench:

- SD WebUI: `extensions/image-bench-host-restart`
- ComfyUI: `custom_nodes/image-bench-host-restart`

The same folder works for both. Then create `store/host_restart.json` in the addon folder with the script that
starts the host:

```json
{"command": "D:\\sd\\webui\\run.bat"}
```

and restart the host once. Later changes to the file take effect without a restart. Until the file exists, the
restart button of Image Bench shows where to create it and which script started the host, and
**Settings › Host restart** shows the same.

| Key       | Value                                                                                                      |
|-----------|------------------------------------------------------------------------------------------------------------|
| `command` | A `.bat`/`.cmd` (run by cmd), `.ps1` (PowerShell), `.sh` (bash) or other file; a command line; or an argument list |
| `cwd`     | The working folder; by default that of the script                                                          |
| `port`    | The sidecar's port, instead of the host's port + 100                                                       |
| `listen`  | `true` / `false`: listen on the network or on 127.0.0.1 only, instead of following the host                |

With a self-signed certificate (https), the browser has to accept it for the sidecar's port once too:
**Settings › Host restart** links its page.

## Files

- `__init__.py`: the ComfyUI entry (routes of `/image-bench/host_restart`)
- `scripts/image_bench_host_restart.py`: the SD WebUI entry (the same routes)
- `image_bench_restart/host_restart.py`: starting the sidecar, registering with it, passing restarts to it
- `image_bench_restart/host_supervisor.py`: the sidecar
- `image_bench_restart/host_process.py`: the process tree of the host
- `store/`: `host_restart.json` (yours), `host_supervisor.json` (address and token of the running sidecar),
  `host_supervisor.log`

## Removal

Delete the folder. A running sidecar ends by itself 2 minutes after the host is gone; to end it at once, end the
process whose pid is in `store/host_supervisor.json`.
