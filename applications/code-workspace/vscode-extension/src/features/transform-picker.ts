import * as vscode from 'vscode'
import { CodeWorkspace, type CodeTransform } from '@quarry/shared/domain'
import { getModuleName, getTransformsFromFolder } from './DatasetTransformPreview/pipeline'

interface TransformItem extends vscode.QuickPickItem {
    readonly transform: CodeTransform.Schema
}

interface PickOptions {
    /** The picker's title — what the pick is for (Preview, Build). */
    readonly title: string
    /** Skip the picker when the file declares exactly one transform. */
    readonly onlyOneInFile?: boolean
}

/**
 * Which of the pipeline's transforms — this file's first, then the rest. The
 * pipeline is read from disk (saved files). Undefined if dismissed, or if the
 * pipeline couldn't be read (the user is told why).
 */
export async function pickTransform(uri: vscode.Uri | undefined, options: PickOptions): Promise<CodeTransform.Schema | undefined> {
    const file = uri ?? vscode.window.activeTextEditor?.document.uri
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri

    if (!folder)
        return undefined

    const picker = vscode.window.createQuickPick<TransformItem | vscode.QuickPickItem>()

    picker.title = options.title
    picker.placeholder = 'Reading the pipeline…'
    picker.busy = true
    picker.matchOnDescription = true

    // Shown only if reading takes a moment — a single transform may need no picker at all.
    const showing = setTimeout(() => picker.show(), 150)

    try {
        const listing = await getTransformsFromFolder(folder)

        if ('error' in listing) {
            void vscode.window.showErrorMessage(`The pipeline didn’t load: ${listing.error.message}`)

            return undefined
        }

        const module = file ? getModuleName(folder, file) : null
        const inFile = listing.transforms.filter(transform => module !== null && transform.name.startsWith(`${module}.`))
        const elsewhere = listing.transforms.filter(transform => !inFile.includes(transform))

        if (options.onlyOneInFile && inFile.length === 1)
            return inFile[0]

        clearTimeout(showing)

        picker.items = [
            ...getSection('In this file', inFile),
            ...getSection('In the pipeline', elsewhere),
        ]
        picker.placeholder = listing.transforms.length > 0 ? `Which transform to ${options.title.toLowerCase()}` : 'No transforms in the pipeline yet'
        picker.busy = false
        picker.show()

        const chosen = await new Promise<TransformItem | undefined>(resolve => {
            picker.onDidAccept(() => resolve(picker.selectedItems[0] as TransformItem | undefined))
            picker.onDidHide(() => resolve(undefined))
        })

        return chosen?.transform
    }
    catch (error) {
        void vscode.window.showErrorMessage(`Couldn’t read the pipeline: ${error instanceof Error ? error.message : String(error)}`)

        return undefined
    }
    finally {
        clearTimeout(showing)
        picker.dispose()
    }
}

/** A titled group of the picker: one row per transform — its function, module, and what it writes. */
function getSection(label: string, transforms: CodeTransform.Schema[]): (TransformItem | vscode.QuickPickItem)[] {
    if (transforms.length === 0)
        return []

    return [
        { label, kind: vscode.QuickPickItemKind.Separator },
        ...transforms.map(transform => ({
            label:       `$(symbol-function) ${CodeWorkspace.ModuleFunctionPath.getFunctionName(transform.name)}`,
            description: CodeWorkspace.ModuleFunctionPath.getModuleName(transform.name),
            detail:      `→ ${Object.values(transform.outputs).join(', ')}`,
            transform,
        })),
    ]
}
