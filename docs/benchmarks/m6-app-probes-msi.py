"""Run M6's five HTTP probes against the actual npm start command; no project selected."""
import datetime
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time

output = Path(sys.argv[1])
records = []
def run(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=15)
    record = dict(command=args, exitCode=result.returncode, stdout=result.stdout, stderr=result.stderr)
    records.append(record)
    return record

with socket.socket() as sock:
    if sock.connect_ex(('127.0.0.1', 4173)) == 0:
        raise RuntimeError('Port already occupied; refusing to probe an unknown server')
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
server = subprocess.Popen(['npm', 'start'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
try:
    for _ in range(100):
        with socket.socket() as sock:
            if sock.connect_ex(('127.0.0.1', 4173)) == 0:
                break
        if server.poll() is not None:
            raise RuntimeError('npm start exited before listening')
        time.sleep(.1)
    else:
        raise RuntimeError('Timed out waiting for listener')
    time.sleep(1)
    listeners = run(['ss', '-ltn'])
    cases = [([], '/', 200), (['-H', 'Host: localhost:4173'], '/', 403),
             (['-H', 'Origin: https://evil.example'], '/', 403),
             (['-X', 'POST'], '/', 405),
             (['--path-as-is'], '/../../etc/passwd', 404)]
    for args, path, expected in cases:
        result = run(['curl', '-sS', '-m', '5', '-o', '/dev/null', '-w', '%{http_code}', *args, 'http://127.0.0.1:4173' + path])
        result.update(expectedStatus=expected, passed=result['exitCode'] == 0 and result['stdout'] == str(expected))
    run(['free', '-h'])
finally:
    os.killpg(server.pid, signal.SIGTERM)
    stdout, stderr = server.communicate(timeout=15)
    records.append(dict(command=['npm', 'start'], exitCode=server.returncode, termination='SIGTERM after probes', stdout=stdout, stderr=stderr))
    output.write_text(json.dumps(dict(at=started, records=records), indent=2) + '\n')
for record in records:
    print(' '.join(record['command']), 'exit', record['exitCode'], 'passed', record.get('passed', 'n/a'))
assert sum(r.get('passed', False) for r in records) == 5, 'HTTP checks failed'
