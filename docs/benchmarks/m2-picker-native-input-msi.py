"""M2-PICK manual-invocation probe: operate only Boozer's exact native-dialog window."""
import ctypes
import ctypes.util
import re
import subprocess
import sys
import time

window = None
for _ in range(100):
    tree = subprocess.run(['xwininfo', '-root', '-tree'], capture_output=True, text=True, check=True).stdout
    for line in tree.splitlines():
        if '"Choose a project folder for Boozer AI"' in line:
            window = int(re.search(r'0x[0-9a-f]+', line).group(), 16)
            break
    if window is not None:
        break
    time.sleep(.1)
if window is None:
    raise RuntimeError('Boozer folder dialog was not found')

x11 = ctypes.CDLL(ctypes.util.find_library('X11'))
xtest = ctypes.CDLL(ctypes.util.find_library('Xtst'))
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XStringToKeysym.argtypes = [ctypes.c_char_p]
x11.XStringToKeysym.restype = ctypes.c_ulong
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XKeysymToKeycode.restype = ctypes.c_uint
x11.XSetInputFocus.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
x11.XRaiseWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XFlush.argtypes = [ctypes.c_void_p]
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
xtest.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
display = x11.XOpenDisplay(None)
if not display:
    raise RuntimeError('No X11 display')
x11.XRaiseWindow(display, window)
x11.XSetInputFocus(display, window, 1, 0)
x11.XFlush(display)
time.sleep(.1)

def key(name, down):
    code = x11.XKeysymToKeycode(display, x11.XStringToKeysym(name.encode()))
    if not code:
        raise RuntimeError('Unsupported test key')
    xtest.XTestFakeKeyEvent(display, code, int(down), 0)
    x11.XFlush(display)

def tap(name):
    key(name, True)
    key(name, False)

try:
    if sys.argv[1] == 'cancel':
        tap('Escape')
    elif sys.argv[1] == 'select':
        key('Control_L', True)
        tap('l')
        key('Control_L', False)
        time.sleep(.2)
        # This probe's own absolute ASCII repo path; never type arbitrary user input.
        path = '/home/boozer/boozer-ai'
        for char in path:
            tap({'/': 'slash', '-': 'minus'}.get(char, char))
        tap('Return')
    else:
        raise RuntimeError('Unknown probe action')
finally:
    x11.XCloseDisplay(display)
