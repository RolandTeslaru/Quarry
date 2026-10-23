import { useId, useState, type FormEvent } from 'react'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { DropdownMenu } from '@quarry/standard-ui/foundations/dropdownMenu'
import { Field } from '@quarry/standard-ui/foundations/fieldLayout'
import { Input } from '@quarry/standard-ui/foundations/input'
import { FolderIllustration } from '@quarry/standard-ui/icons'
import type { Library } from '@quarry/shared/domain'
import { LibrarySDK } from '../../../sdk'
import { App } from '@/AppKit'
import { AuthSDK } from '@/SDKs/AuthSDK/sdk'
import { UploadDialog } from '@/SDKs/CatalogSDK/ui/UploadDialog'
import { NewSourceDialog } from '@/SDKs/DataConnectionSDK/ui/NewSourceDialog'
import { ErrorNotice } from '@/components/ErrorNotice'
import { useTask } from '@/hooks/useTask'
import { resourceGlyph } from '@/shell/apps'
import { useLibraryExplorer } from '../root'

/**
 * "+ New" for the open folder: a folder, a dataset (from a file), a source — or,
 * at the top, a project (workspace admins only). Upload and source come from
 * their apps' dialogs until the resource-type registry offers them.
 */
export function CreateBtn() {
    const { cwd } = useLibraryExplorer()
    const isAdmin = AuthSDK.useStore(state => state.user?.workspaceRole === 'admin')

    if (cwd === null) {
        return (
            <Button
                intent='success'
                icon='add'
                disabled={!isAdmin}
                onClick={() => DialogSDK.actions.push('new-project', dialog => <NewProjectDialog dialog={dialog} />)}
            >
                New project
            </Button>
        )
    }

    function openFolderDialog(parentRid: Library.Resource.Rid) {
        DialogSDK.actions.push(`new-folder-${parentRid}`, dialog => (
            <NewFolderDialog parentRid={parentRid} dialog={dialog} />
        ))
    }

    function openUploadDialog(parentRid: Library.Resource.Rid) {
        DialogSDK.actions.push(`upload-${parentRid}`, dialog => (
            <UploadDialog target={{ kind: 'new', parentRid }} dialog={dialog} />
        ))
    }

    function openSourceDialog(parentRid: Library.Resource.Rid) {
        DialogSDK.actions.push(`new-source-${parentRid}`, dialog => (
            <NewSourceDialog parentRid={parentRid} dialog={dialog} />
        ))
    }

    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <Button intent='success' icon='add' endIcon='caret-down'>New</Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align='end'>
                <DropdownMenu.Item onSelect={() => openFolderDialog(cwd)}>
                    <FolderIllustration color='var(--color-amber-400)' className='size-4' />
                    Folder
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item onSelect={() => openUploadDialog(cwd)}>
                    <TypeGlyph type='dataset' />
                    Dataset
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => openSourceDialog(cwd)}>
                    <TypeGlyph type='source' />
                    Source
                </DropdownMenu.Item>
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    )
}

interface TypeGlyphProps {
    type: Library.Resource.Type
}

/** A resource type's mark as in the item view — its app's glyph, bare — at menu size. */
function TypeGlyph({ type }: TypeGlyphProps) {
    const glyph = resourceGlyph(type)

    if (!glyph)
        return null

    return <App.Glyph glyph={glyph} size={16} bare />
}

interface DialogProps {
    dialog: DialogSDK.TemplateProps
}

function NewProjectDialog({ dialog }: DialogProps) {
    const formId = useId()
    const task = useTask()

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (task.pending)
            return

        void task.run(async () => {
            await LibrarySDK.actions.project.create({ name, description: description || null })

            DialogSDK.actions.pop(dialog.entry.dialogId)
        })
    }

    return (
        <DialogSDK.Template {...dialog} dismissible={!task.pending} className='w-[min(520px,calc(100vw-32px))]'>
            <Dialog.Header>
                <Dialog.Title>New project</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description className='sr-only'>Complete the fields below, then choose create.</Dialog.Description>
            <Dialog.Body>
                <form id={formId} onSubmit={submit}>
                    <Field.Set disabled={task.pending}>
                        <Field.Root>
                            <Field.Label htmlFor='project-name'>Name</Field.Label>
                            <Input
                                id='project-name'
                                autoFocus
                                required
                                value={name}
                                onChange={event => setName(event.target.value)}
                            />
                        </Field.Root>
                        <Field.Root>
                            <Field.Label htmlFor='project-description'>Description</Field.Label>
                            <Input
                                id='project-description'
                                value={description}
                                onChange={event => setDescription(event.target.value)}
                            />
                        </Field.Root>
                    </Field.Set>
                    <ErrorNotice error={task.error} />
                </form>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.Cancel disabled={task.pending}>Cancel</Dialog.Cancel>
                <Dialog.Action type='submit' form={formId} intent='primary' loading={task.pending}>
                    Create
                </Dialog.Action>
            </Dialog.Footer>
        </DialogSDK.Template>
    )
}

interface NewFolderDialogProps extends DialogProps {
    parentRid: Library.Resource.Rid
}

function NewFolderDialog({ parentRid, dialog }: NewFolderDialogProps) {
    const formId = useId()
    const task = useTask()

    const [name, setName] = useState('')

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (task.pending)
            return

        void task.run(async () => {
            await LibrarySDK.actions.folder.create({ parentRid, name, description: null })

            DialogSDK.actions.pop(dialog.entry.dialogId)
        })
    }

    return (
        <DialogSDK.Template {...dialog} dismissible={!task.pending} className='w-[min(520px,calc(100vw-32px))]'>
            <Dialog.Header>
                <Dialog.Title>New folder</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description className='sr-only'>Complete the fields below, then choose create.</Dialog.Description>
            <Dialog.Body>
                <form id={formId} onSubmit={submit}>
                    <Field.Set disabled={task.pending}>
                        <Field.Root>
                            <Field.Label htmlFor='folder-name'>Name</Field.Label>
                            <Input
                                id='folder-name'
                                autoFocus
                                required
                                value={name}
                                onChange={event => setName(event.target.value)}
                            />
                        </Field.Root>
                    </Field.Set>
                    <ErrorNotice error={task.error} />
                </form>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.Cancel disabled={task.pending}>Cancel</Dialog.Cancel>
                <Dialog.Action type='submit' form={formId} intent='primary' loading={task.pending}>
                    Create
                </Dialog.Action>
            </Dialog.Footer>
        </DialogSDK.Template>
    )
}
