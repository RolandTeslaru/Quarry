import { type INestApplicationContext, Module } from '@nestjs/common';
import { ModulesContainer, NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiModule } from '@/api.module';
import { destroyPool } from '@quarry/platform-server/db/pool';
import { getMethodsRequiringLive } from '@quarry/platform-server/db/liveness';
import { CatalogModule } from '@quarry/catalog-service/catalog/catalog.module';
import { CodeWorkspaceModule } from '@/services/CodeWorkspace/code-workspace.module';
import { DataConnectionModule } from '@/services/DataConnection/data-connection.module';
import { ForgeModule } from '@/services/Forge/forge.module';
import { isGated } from '@quarry/platform-server/services/Gatekeeper/security-gate';

/** Every service module — the main server's, Catalog's, and those paused by phase 1 of the split: the rule is the code's, not a deployment's. */
@Module({ imports: [ApiModule, CatalogModule, DataConnectionModule, CodeWorkspaceModule, ForgeModule] })
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
