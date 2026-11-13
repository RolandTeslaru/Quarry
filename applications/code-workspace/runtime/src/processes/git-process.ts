import { CHECKOUT, ROOT_ENV } from '../container';
import { Process } from './process';

/** Getting the workspace's code: run as root, into a checkout `transform` can read but not write. */
export namespace GitProcess {

    /** Fetches the workspace through the main server's Git endpoint, without checking anything out yet. */
    export function clone(repository: string, token: string): Promise<void> {
        return Process.run({
            name:    'Clone',
            command: 'git',
            args:    ['clone', '--quiet', '--no-checkout', repository, CHECKOUT],
            env:     {
                ...ROOT_ENV,
                // The token goes to this git process only: not on disk, not in its arguments.
                GIT_CONFIG_COUNT:   '1',
                GIT_CONFIG_KEY_0:   'http.extraHeader',
                GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}`,
            },
        });
    }

    /** The exact commit the recipe was published from. */
    export function checkout(commit: string): Promise<void> {
        return Process.run({
            name:    'Check out',
            command: 'git',
            args:    ['-C', CHECKOUT, 'checkout', '--quiet', '--detach', commit],
            env:     ROOT_ENV,
        });
    }
}
