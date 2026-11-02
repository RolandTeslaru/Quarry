import type { DataConnection, Keychain } from '@quarry/shared/domain';
import { Encryption } from '@quarry/shared/server/encryption';
import type { SourceDefinition } from './definition';

/**
 * A source's credential as Keychain gives it (encrypted) → the values its runtime gets: decrypted with the
 * workspace key, checked to be of the definition's template, parsed against its Fields.
 */
export function decryptCredential(
    source:     Pick<DataConnection.Source, 'rid'>,
    definition: SourceDefinition,
    credential: Keychain.Credential.Encrypted | null,
): unknown {
    const template = definition.credential;

    if (!template)
        return null;

    if (!credential)
        throw new Error(`Source ${source.rid} has no credential; ${definition.displayName} needs a ${template.displayName} one`);

    if (credential.templateId !== template.id)
        throw new Error(`Source ${source.rid}: credential ${credential.rid} is a '${credential.templateId}' credential, ${definition.displayName} needs '${template.id}'`);

    return template.Fields.parse(Encryption.decrypt(credential.blob));
}
