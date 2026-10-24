import type { CodeWorkspace } from '@quarry/shared/domain';

/** What a template is rendered with — from the create request, resolved by CodeWorkspaceService. */
export interface TemplateParams {
    /** The workspace's name, as typed. */
    readonly workspaceName: string;
    /** `sales-cleaning` — the Python project's name. */
    readonly projectName:   string;
    /** `sales_cleaning` — the importable package under src/. */
    readonly packageName:   string;
    /** Library paths the example transform reads and writes; null: the example is commented out. */
    readonly example:       { readonly inputPath: string; readonly outputPath: string } | null;
}

/** A workspace template: its wire description, its first commit's files, and what to run on them before committing. */
export interface WorkspaceTemplate extends CodeWorkspace.Template.Schema {
    readonly files:    (params: TemplateParams) => Record<string, string>;
    /** Runs in the working directory after the files are written (e.g. `uv lock`). */
    readonly prepare?: (directory: string) => Promise<void>;
}
