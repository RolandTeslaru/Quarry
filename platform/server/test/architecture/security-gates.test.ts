import { type INestApplicationContext, Module } from '@nestjs/common';
import { ModulesContainer, NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MainServerModule } from '@/main-server.module';
import { destroyPool } from '@quarry/platform-kernel/db/pool';
import { getMethodsRequiringLive } from '@quarry/platform-kernel/db/liveness';
import { CatalogModule } from '@quarry/catalog-server/catalog/catalog.module';
import { CodeWorkspaceModule } from '@quarry/code-workspace-server/services/code-workspace/code-workspace.module';
import { SourceModule } from '@quarry/data-connection-server/source/source.module';
import { SyncModule } from '@quarry/data-connection-server/sync/sync.module';
import { SyncRunModule } from '@quarry/data-connection-server/sync-run/sync-run.module';
import { ForgeModule } from '@quarry/forge-server/services/forge/forge.module';
import { JobModule } from '@quarry/forge-server/services/job/job.module';
import { isGated } from '@quarry/platform-kernel/services/Gatekeeper/security-gate';

/** Every service module — the main server's and each service's: the rule is the code's, not a deployment's. */
@Module({ imports: [MainServerModule, CatalogModule, SourceModule, SyncModule, SyncRunModule, CodeWorkspaceModule, ForgeModule, JobModule] })
class EveryServiceModule {}

/**
 * @RequireLive is a parameter decorator: it only marks. @SecurityGate is what
 * checks it — so a @RequireLive on an ungated method would silently check nothing.
 * Every provider in every service's modules, scanned.
 */
describe('@RequireLive', () => {

    let app: INestApplicationContext;

    beforeAll(async () => {
        app = await NestFactory.createApplicationContext(EveryServiceModule, { logger: false });
    });

    afterAll(async () => {
        await app.close();
        await destroyPool();
    });

    function getProviders(): object[] {
        const prototypes = new Set<object>();

        for (const module of app.get(ModulesContainer).values())
            for (const wrapper of module.providers.values())
                if (wrapper.metatype && typeof wrapper.metatype === 'function' && wrapper.metatype.prototype)
                    prototypes.add(wrapper.metatype.prototype as object);

        return [...prototypes];
    }

    it('is only on methods with @SecurityGate', () => {
        const ungated: string[] = [];

        for (const prototype of getProviders())
            for (const key of getMethodsRequiringLive(prototype))
                if (!isGated(prototype, key))
                    ungated.push(`${prototype.constructor.name}.${String(key)}`);

        expect(ungated).toEqual([]);
    });

    it('finds the methods it guards', () => {
        const marked = getProviders().flatMap((prototype) => getMethodsRequiringLive(prototype).map((key) => `${prototype.constructor.name}.${String(key)}`));

        expect(marked).toEqual(expect.arrayContaining([
            'CodeWorkspaceService.openSession',
            'GitService.servePush',
            'CodeWorkspaceService.getSessionCredentials',
        ]));
    });
});
