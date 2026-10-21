import { z } from 'zod';
import { Keychain } from '@quarry/shared/domain';

/**
 * What a credential of one kind holds — PretzelGraph's credential templates.
 * Declared in `<System>/credential.ts` and named by that system's source
 * definition (`credential: …`); the catalogue is whatever the definitions name,
 * so there's no way to add one at runtime.
 *
 * Fields is a zod object like a source's Config (annotated with `.meta()` for
 * forms); a field the form must mask carries `secret: true`. A credential holds
 * everything needed to log in — host, port, user, password — so one credential
 * can back several sources.
 */
export interface CredentialTemplate<F extends z.ZodObject = z.ZodObject> {
    readonly id:          Keychain.Credential.Template.Id;
    readonly displayName: string;
    readonly icon:        string;
    readonly Fields:      F;
}

/** The decrypted, parsed values a runtime of this template receives. */
export type ValuesOf<T extends CredentialTemplate> = z.output<T['Fields']>;

export const defineCredential = <F extends z.ZodObject>(template: CredentialTemplate<F>): CredentialTemplate<F> => ({
    ...template,
    id: Keychain.Credential.Template.Id.parse(template.id),
});

/** As the API sends it: Fields becomes JSON Schema (input side — fields with defaults are optional). */
export const credentialToWire = (template: CredentialTemplate): Keychain.Credential.Template.Schema =>
    Keychain.Credential.Template.Schema.parse({
        id:           template.id,
        displayName:  template.displayName,
        icon:         template.icon,
        fieldsSchema: z.toJSONSchema(template.Fields, { io: 'input' }),
    });
