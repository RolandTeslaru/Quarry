// The job container's layout (docker/code-workspace-runtime/Dockerfile): where things are, who runs what,
// and the whole environment each kind of process gets.

/** The image's `transform` user: the workspace's code runs as it. */
export const TRANSFORM_USER = {
    uid:  1001,
    gid:  1001,
    home: '/home/transform',
};

/** Where the workspace is checked out: by root, readable by `transform`, never written by it. */
export const CHECKOUT = '/work/repo';

/** The workspace's environment: `transform`'s own, so nothing is written into the checkout. */
export const VENV = `${TRANSFORM_USER.home}/venv`;

/** What Python is told to run: the transform, its inputs by parameter as signed read URLs. Readable by `transform`. */
export const JOB_FILE = '/work/job.json';

/** Where Python writes each output's files, one folder per output parameter. */
export const OUTPUTS = `${TRANSFORM_USER.home}/out`;

/** The cache volume the ForgeAgent mounts for this runtime type, owned by `transform` (the image's `/cache`). */
export const CACHE = '/cache';

const PATH = '/usr/local/bin:/usr/bin:/bin';

/** A root process's whole environment. */
export const ROOT_ENV = {
    PATH,
    HOME:                '/root',
    GIT_TERMINAL_PROMPT: '0',
};

/** A transform process's whole environment: nothing of the runtime's own is passed on. */
export const TRANSFORM_ENV = {
    PATH,
    HOME:                   TRANSFORM_USER.home,
    UV_CACHE_DIR:           `${CACHE}/uv`,
    UV_PROJECT_ENVIRONMENT: VENV,
    UV_LINK_MODE:           'copy',          // the cache is another filesystem
    UV_PYTHON_DOWNLOADS:    'never',         // the image's Python
};
