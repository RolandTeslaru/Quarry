// The IDE's page, before VS Code's workbench starts — the bridge to the Quarry page around the IDE's iframe:
//  - commands the workbench registers in the browser (the Dockerfile passes them to its create() as `commands`),
//    each answered by Quarry's page: an extension calls one with executeCommand and gets the page's answer;
//  - the extension's commands Quarry's page executes here (`quarry:execute`), through VS Code's own executeCommand, which
//    the Dockerfile's patch hands over as `globalThis.quarryExecuteCommand`.
// The messages are CodeWorkspace.Workbench's (packages/shared/domain/CodeWorkspace/Workbench.ts).
(() => {
    const COMMANDS = ['quarry.workbench.pickResource'];

    // What Quarry's page may execute here: Workbench.Execute's commands.
    const EXECUTABLE = ['quarry.preview', 'quarry.build'];

    const pending = new Map();

    // Quarry's page says hello once the IDE has loaded: from then on, messages go to and come from that origin only.
    let quarryOrigin = null;

    window.addEventListener('message', (event) => {
        if (event.source !== window.parent)
            return;

        if (event.data?.type === 'quarry:hello') {
            quarryOrigin = event.origin;

            return;
        }

        if (event.origin !== quarryOrigin)
            return;

        if (event.data?.type === 'quarry:answer') {
            pending.get(event.data.id)?.(event.data.result);
            pending.delete(event.data.id);

            return;
        }

        if (event.data?.type === 'quarry:execute' && EXECUTABLE.includes(event.data.command))
            void execute(event.data.id, event.data.command);
    });

    function ask(command, args) {
        if (!quarryOrigin)
            return Promise.reject(new Error('This editor isn’t connected to Quarry — open it from the workspace’s page.'));

        const id = crypto.randomUUID();

        return new Promise((resolve) => {
            pending.set(id, resolve);
            window.parent.postMessage({ type: 'quarry:ask', id, command, args }, quarryOrigin);
        });
    }

    async function execute(id, command) {
        let error = null;

        try {
            await globalThis.quarryExecuteCommand(command);
        }
        catch (thrown) {
            error = thrown?.message ?? String(thrown);
        }

        window.parent.postMessage({ type: 'quarry:executed', id, error }, quarryOrigin);
    }

    globalThis.quarryWorkbenchCommands = COMMANDS.map((id) => ({
        id,
        handler: (args) => ask(id, args),
    }));
})();
