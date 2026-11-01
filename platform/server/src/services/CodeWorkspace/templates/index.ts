import type { CodeWorkspace } from '@quarry/shared/domain';
import { pythonTransforms } from './python-transforms';
import type { WorkspaceTemplate } from './template';

export type { TemplateParams, WorkspaceTemplate } from './template';

/** Every template the deployment declares — by id. */
export const TEMPLATES: Record<CodeWorkspace.Template.Id, WorkspaceTemplate> = {
    [pythonTransforms.id]: pythonTransforms,
};

/** As the API sends them: no files. */
export const TEMPLATES_WIRE: Record<CodeWorkspace.Template.Id, CodeWorkspace.Template.Schema> = Object.fromEntries(
    Object.values(TEMPLATES).map(template => [
        template.id,
        {
            id:          template.id,
            displayName: template.displayName,
            description: template.description,
        },
    ]),
);
