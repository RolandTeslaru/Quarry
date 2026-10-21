import type { DataConnection, Keychain } from '@quarry/shared/domain';
import type { CredentialTemplate } from './core/credential';
import type { SourceDefinition } from './core/definition';
import { Definition as Postgres } from './Postgres/definition';

export { credentialToWire, defineCredential, type CredentialTemplate, type ValuesOf } from './core/credential';
export { defineSource, defineSync, toWire, type ConfigOf, type CredentialOf, type SourceDefinition, type SyncConfigOf, type SyncDefinition } from './core/definition';

/**
 * Entry point for the API (and anything else): every source definition, and
 * nothing that can open a connection — this file must never import a runtime.
 *
 * Adding a system: a folder with definition.ts + runtime.ts (+ credential.ts
 * if it logs in), one entry here, one in runtimes.ts.
 */
export const SOURCE_DEFINITIONS: Readonly<Record<DataConnection.Source.DefinitionId, SourceDefinition>> = {
    [Postgres.id]: Postgres,
};

// Keyed by id: a key that disagrees with its definition's id is a bug — fail at load.
for (const [id, definition] of Object.entries(SOURCE_DEFINITIONS))
    if (definition.id !== id)
        throw new Error(`SOURCE_DEFINITIONS['${id}'] holds definition '${definition.id}'`);

export const findDefinition = (id: DataConnection.Source.DefinitionId): SourceDefinition | undefined =>
    SOURCE_DEFINITIONS[id];

/**
 * Every credential template, from the definitions that name them — templates
 * live on definitions (PretzelGraph's blueprints), so this is the catalogue.
 */
export const CREDENTIAL_TEMPLATES: Readonly<Record<Keychain.Credential.Template.Id, CredentialTemplate>> = (() => {
    const templates: Record<Keychain.Credential.Template.Id, CredentialTemplate> = {};

    for (const definition of Object.values(SOURCE_DEFINITIONS)) {
        const template = definition.credential;

        if (!template)
            continue;

        // Two definitions may share a template object; two different templates may not share an id.
        if (templates[template.id] && templates[template.id] !== template)
            throw new Error(`Two credential templates use the id '${template.id}'`);

        templates[template.id] = template;
    }

    return templates;
})();

export const findCredentialTemplate = (id: Keychain.Credential.Template.Id): CredentialTemplate | undefined =>
    CREDENTIAL_TEMPLATES[id];
