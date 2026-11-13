import * as path from 'node:path';
import { CHECKOUT, JOB_FILE, TRANSFORM_ENV, TRANSFORM_USER, VENV } from '../container';
import { Process } from './process';

/** The transform's Python, as `transform`: its environment (through uv), then the transform itself. */
export namespace PythonProcess {

    const USER = { uid: TRANSFORM_USER.uid, gid: TRANSFORM_USER.gid };

    /** A virtualenv that also sees the image's own packages: quarry.transforms and its engines. */
    export function createVirtualEnvironment(): Promise<void> {
        return Process.run({
            name:    'Create the environment',
            command: 'uv',
            args:    ['venv', '--quiet', '--system-site-packages', VENV],
            env:     TRANSFORM_ENV,
            cwd:     CHECKOUT,
            user:    USER,
        });
    }

    /** Exactly what the workspace's uv.lock says, without dev dependencies — never re-resolved. */
    export function installLock(): Promise<void> {
        return Process.run({
            name:    'Install the lock',
            command: 'uv',
            args:    ['sync', '--frozen', '--no-dev'],
            env:     TRANSFORM_ENV,
            cwd:     CHECKOUT,
            user:    USER,
        });
    }

    /** The transform, as JOB_FILE describes it. It announces each finished output file on file descriptor 3. */
    export function runTransform(onEvent: (line: string) => void): Promise<void> {
        return Process.run({
            name:    'Run the transform',
            command: path.join(VENV, 'bin/python'),
            args:    ['-m', 'quarry.transforms.run', JOB_FILE],
            env:     {
                ...TRANSFORM_ENV,
                QUARRY_EVENTS_FD: '3',
            },
            cwd:     CHECKOUT,
            user:    USER,
            onEvent,
        });
    }
}
