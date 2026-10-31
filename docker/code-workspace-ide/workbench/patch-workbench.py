"""
Hooks Quarry's bridge (quarry-bridge.js) into openvscode-server's workbench page, at image build time:
the page loads the bridge before the workbench; the workbench's bootstrap passes the bridge's commands to
create() — VS Code's embedder `commands`, which openvscode-server's bootstrap doesn't expose — and hands the
bridge VS Code's web `commands.executeCommand`, so Quarry's page can run commands in the workbench.

The bootstrap is minified, so the patch matches its shape, not its names, and fails the build unless it
matches exactly once: an openvscode-server upgrade that moves it stops here instead of shipping an IDE
whose commands are silently missing.
"""

import re
import shutil
import sys

WORKBENCH = "/opt/openvscode-server/out/vs/code/browser/workbench"

shutil.copy(sys.argv[1], f"{WORKBENCH}/quarry-bridge.js")

# The page: the bridge as a classic script before the workbench's module, so it runs first.
html_path = f"{WORKBENCH}/workbench.html"
html = open(html_path).read()
module = '<script type="module" src="{{WORKBENCH_WEB_BASE_URL}}/out/vs/code/browser/workbench/workbench.js"></script>'
bridge = '<script src="{{WORKBENCH_WEB_BASE_URL}}/out/vs/code/browser/workbench/quarry-bridge.js"></script>'

if html.count(module) != 1:
    sys.exit("workbench.html: the workbench's script tag isn't there once — check the openvscode-server version")

open(html_path, "w").write(html.replace(module, f"{bridge}\n\t{module}"))

# The bootstrap: create(document.body, { ...config, windowIndicator: … }) gets the bridge's commands too.
js_path = f"{WORKBENCH}/workbench.js"
js = open(js_path).read()
pattern = re.compile(r"(document\.body,\{\.\.\.([A-Za-z_$][\w$]*),)(windowIndicator:)")
matches = pattern.findall(js)

if len(matches) != 1:
    sys.exit(f"workbench.js: found the create() call {len(matches)} times, not once — check the openvscode-server version")

js = pattern.sub(r"\1commands:globalThis.quarryWorkbenchCommands??[],\3", js)

# The web API's commands namespace: `async function e(t,...i){return(await w.p).commands.executeCommand(t,...i)}s.executeCommand=e`
# — its executeCommand also goes on globalThis, for the bridge.
execute = re.compile(r"(\(await [A-Za-z_$][\w$]*\.p\)\.commands\.executeCommand\([\w$]+,\.\.\.[\w$]+\)\}([A-Za-z_$][\w$]*)\.executeCommand=([A-Za-z_$][\w$]*))")
matches = execute.findall(js)

if len(matches) != 1:
    sys.exit(f"workbench.js: found the web API's executeCommand {len(matches)} times, not once — check the openvscode-server version")

open(js_path, "w").write(execute.sub(r"\1,globalThis.quarryExecuteCommand=\3", js))
