# MSI demo machine setup (M6)

The human lead runs these steps on the MSI Bravo 15 (ParrotOS) **tonight**, in parallel with the build. The go/no-go decision is at **00:00** (see [SUBMISSION.md](SUBMISSION.md)). Everything installs per user in `~/.local/opt`, with no sudo, matching the dev Mac.

**Approval:** steps 2–5 download Node 24.16.0, the Ollama v0.40.2 Linux CPU build (about 1.4 GB), the `qwen3:4b-instruct` model (about 2.5 GB) and the app's npm packages. Running them is the human lead's approval for those downloads on the MSI. Note it in TASKS.md under M6.

## 0. Get the code onto the MSI

No Git remote exists yet. Pick one:

- **Private GitHub repository** (recommended). Easy to update after the freeze, and it can be made public at 08:00. Creating it needs the human lead's OK.
- **USB:** on the Mac run `git bundle create boozer.bundle --all`, then on the MSI run `git clone boozer.bundle boozer-ai`. For updates, re-bundle and `git pull`.

## 1. Record the machine

```sh
cat /etc/os-release; uname -r
lscpu | grep -E 'Model name|^CPU\(s\)'; free -h; df -h ~
lspci | grep -iE 'vga|3d|display'
```

## 2. Node.js 24.16.0

```sh
mkdir -p ~/.local/opt && cd ~/.local/opt
curl -fLO https://nodejs.org/dist/v24.16.0/node-v24.16.0-linux-x64.tar.xz
echo "d804845d34eddc21dc1092b519d643ef40b1f58ec5dec5c22b1f4bd8fabde6c9  node-v24.16.0-linux-x64.tar.xz" | sha256sum -c -
tar -xJf node-v24.16.0-linux-x64.tar.xz
export PATH="$HOME/.local/opt/node-v24.16.0-linux-x64/bin:$PATH"   # also add to your shell profile
node --version    # expect v24.16.0
```

The app refuses other Node major versions (`engine-strict`).

## 3. Ollama v0.40.2, CPU build

```sh
mkdir -p ~/.local/opt/ollama-v0.40.2 && cd ~/.local/opt/ollama-v0.40.2
curl -fLO https://github.com/ollama/ollama/releases/download/v0.40.2/ollama-linux-amd64.tar.zst
curl -fLO https://github.com/ollama/ollama/releases/download/v0.40.2/sha256sum.txt
grep 'ollama-linux-amd64.tar.zst$' sha256sum.txt | sha256sum -c -    # must print OK
tar --zstd -xf ollama-linux-amd64.tar.zst     # if zstd is missing: sudo apt install zstd
ls bin/ollama                                 # if absent: find . -name ollama -type f
OLLAMA_HOST=127.0.0.1:11434 ./bin/ollama serve
```

In a second terminal:

```sh
curl -s http://127.0.0.1:11434/api/version    # expect 0.40.2
ss -ltn | grep 11434                          # must show 127.0.0.1:11434 only
```

Skip the ROCm build. ROCm doesn't officially support the RX 5500, so the plan is CPU. Claim GPU use only if `ollama ps` shows it **and** the timings improve.

## 4. Model

```sh
~/.local/opt/ollama-v0.40.2/bin/ollama pull qwen3:4b-instruct
curl -s http://127.0.0.1:11434/api/tags
```

The `digest` must be `0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`, the same as on the Mac. A different digest means a different model; stop and report it.

## 5. App

```sh
cd boozer-ai
npm ci --ignore-scripts
npm run typecheck && npm test && npm run build
npm start         # then open http://127.0.0.1:4173 in the browser
```

## 6. Quick checks tonight

- One short prompt: `~/.local/opt/ollama-v0.40.2/bin/ollama run qwen3:4b-instruct "Say hello in five words."`. This is a smoke test, not the benchmark. Watch `free -h` while it answers.
- Pick the screen recorder (for example OBS Studio). Make a one-minute test recording while the model answers, and check that memory stays comfortable on 16 GB.
- Repeat the app check with Wi-Fi off.

## 7. Report

Paste the outputs of steps 1, 3 (version and `ss`), 4 (digest) and 5 into TASKS.md under M6, or give them to an agent to record. At the go/no-go, the MSI passes if steps 2–5 work. The full M6 checks (benchmark, offline rehearsal of the finished app, recorder headroom) run after the freeze.
