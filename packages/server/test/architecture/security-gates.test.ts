import { ModulesContainer } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getMethodsRequiringLive } from '@/db/liveness';
import { isGated } from '@/services/Gatekeeper/security-gate';
import { ForgeHarness } from '../support/forge-fixtures';

/**
 * @RequireLive is a parameter decorator: it only marks. @SecurityGate is what
 * checks it — so a @RequireLive on an ungated method would silently check nothing.
 * Every provider in the API's modules, scanned.
 */
describe('@RequireLive', () => {

    let harness: ForgeHarness;

    beforeAll(async () => {
        harness = await ForgeHarness.start();
    });

    afterAll(async () => {
        await harness.stop();
    });

    function getProviders(): object[] {
        const prototypes = new Set<object>();

        for (const module of harness.get(ModulesContainer).values())
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
            'CodeWorkspaceService.authorizePush',
            'CodeWorkspaceService.getSessionCredentials',
        ]));
    });
});
