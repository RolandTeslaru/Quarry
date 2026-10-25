import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios, { isAxiosError, type AxiosInstance } from 'axios';
import { CodeWorkspace, type Identity } from '@quarry/shared/domain';
import { requireEnv } from '@/db/table';

import Worker = CodeWorkspace.API.Worker;

/** A first open starts a container, clones and syncs the environment — minutes on a cold cache. */
const SESSION_OPEN_TIMEOUT_MS = 300_000;


/**
 * The code workspace worker's API (CodeWorkspace.API.Worker), called with the
 * service token after CodeWorkspaceService's permission checks. Its failures
 * keep their reason:
 *
 *   unreachable or too slow   503 — is the worker running?
 *   its 4xx                   as answered (409: no open session; 403 / 404: access gone)
 *   its 5xx, or a 401         424 Failed Dependency — what the server depended on failed,
 *                             not the server (not 502: the frontend retries those)
 */
@Injectable()
export class CodeWorkspaceWorkerClient {

    private readonly worker: AxiosInstance = axios.create({
        baseURL: requireEnv('CODE_WORKSPACE_WORKER_URL'),
        headers: { authorization: `Bearer ${requireEnv('QUARRY_INTERNAL_TOKEN')}` },
    });

    public async openSession(workspaceRid: CodeWorkspace.Rid, userRid: Identity.User.Rid): Promise<string> {
        const { url } = await this.call(() => Worker.openSession(this.worker, { workspaceRid, userRid }, SESSION_OPEN_TIMEOUT_MS));

        return url;
    }

    private async call<R>(request: () => Promise<R>): Promise<R> {
        try {
            return await request();
        }
        catch (error) {
            throw getFailure(error);
        }
    }
}

function getFailure(error: unknown): unknown {
    if (!isAxiosError<{ message?: unknown }>(error))
        return error;                                                       // a malformed answer (zod) — a 500, logged

    if (!error.response)
        return new ServiceUnavailableException(error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
            ? "The code workspace worker didn't answer in time"
            : "The code workspace worker isn't reachable — is it running?");

    const { status, data } = error.response;
    const message = typeof data?.message === 'string' ? data.message : error.message;

    // A 401 is our service token being refused — a misconfiguration, never the user's login.
    return new HttpException(message, status < 500 && status !== 401 ? status : HttpStatus.FAILED_DEPENDENCY);
}
