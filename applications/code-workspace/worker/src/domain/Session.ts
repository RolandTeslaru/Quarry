import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { CodeWorkspace, Foundations, Identity } from '@quarry/shared/domain';

/**
 * One user's session on one workspace: the container behind their open IDE
 * (docs/design/transforms.md §6). Only the code workspace worker knows them —
 * in memory, and on their containers' labels, which survive a restart.
 */
export namespace Session {

    /** The session's capability: its IDE path (`/s/<secret>/`) and VS Code's connection token. */
    export const Secret = z.string().regex(/^[0-9a-f]{48}$/, 'Not a session secret');
    export type  Secret = z.infer<typeof Secret>;

    export const createSecret = (): Secret => Secret.parse(randomBytes(24).toString('hex'));

    export const Schema = z.object({
        workspaceRid:   CodeWorkspace.Rid,
        userRid:        Identity.User.Rid,
        container:      z.string().min(1),
        secret:         Secret,
        port:           z.number().int().positive().nullable(),     // VS Code's port on this host; null while stopped
        lastActivityAt: z.number(),                                 // epoch ms — what the idle stop reads
    });
    export type Schema = z.infer<typeof Schema>;

    /** Which session: its workspace and its user. */
    export type Key = `${CodeWorkspace.Rid}|${Identity.User.Rid}`;

    export const getKey = (workspaceRid: CodeWorkspace.Rid, userRid: Identity.User.Rid): Key => `${workspaceRid}|${userRid}`;

    /** `quarry-code-workspace-session-<workspace uuid>-<user uuid>` — its volume has the same name. */
    export const getContainerName = (workspaceRid: CodeWorkspace.Rid, userRid: Identity.User.Rid): string =>
        `quarry-code-workspace-session-${Foundations.Rid.parse(workspaceRid).locator}-${Foundations.Rid.parse(userRid).locator}`;

    /** Every session container carries this label; the others say whose session it is. */
    export const LABEL = 'quarry.code-workspace-session';

    /** What a session's container is labelled with — enough to find the session again after a restart. */
    export const toLabels = (session: Pick<Schema, 'workspaceRid' | 'userRid' | 'secret'>): Record<string, string> => ({
        [LABEL]:               'true',
        [`${LABEL}.workspace`]: session.workspaceRid,
        [`${LABEL}.user`]:      session.userRid,
        [`${LABEL}.secret`]:    session.secret,
    });

    /** A labelled container back into its session — null if its labels aren't a session's. */
    export const fromLabels = (container: { name: string; labels: Record<string, string> }, port: number | null): Schema | null => {
        const parsed = Schema.safeParse({
            workspaceRid:   container.labels[`${LABEL}.workspace`],
            userRid:        container.labels[`${LABEL}.user`],
            secret:         container.labels[`${LABEL}.secret`],
            container:      container.name,
            port,
            lastActivityAt: Date.now(),
        });

        return parsed.success ? parsed.data : null;
    };
}
