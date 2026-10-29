import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CodeWorkspace } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { RequireLive } from '@/db/liveness';
import { GatekeeperService } from '@/services/Gatekeeper/gatekeeper.service';
import { SecurityGate } from '@/services/Gatekeeper/security-gate';
import { CIService } from '../ci/ci.service';
import { GitRepos } from './git-repos';
import { serveGit } from './http-backend';

/** Git over HTTP: read on the live workspace to fetch, write to push. */
@Injectable()
export class GitService {

    constructor(
        public readonly gatekeeper: GatekeeperService,
        private readonly gitRepos:  GitRepos,
        private readonly ci:        CIService,
    ) {}

    @SecurityGate('read')
    async serveFetch(principal: Principal.User, @RequireLive() rid: CodeWorkspace.Rid, request: Request, response: Response, rest: string): Promise<void> {
        await serveGit(request, response, {
            projectRoot: this.gitRepos.root,
            pathInfo:    `/${rid}.git/${rest}`,
            remoteUser:  principal.userRid,
        });
    }

    @SecurityGate('write')
    async servePush(principal: Principal.User, @RequireLive() rid: CodeWorkspace.Rid, request: Request, response: Response, rest: string): Promise<void> {
        // The push itself, not its advertisement: compare the heads around it to see what it moved.
        const before = rest === 'git-receive-pack' ? await this.gitRepos.getHeads(rid) : null;

        await serveGit(request, response, {
            projectRoot: this.gitRepos.root,
            pathInfo:    `/${rid}.git/${rest}`,
            remoteUser:  principal.userRid,
            afterServe:  before ? () => this.ci.queueChecksForPush(principal, rid, before) : undefined,
        });
    }
}
