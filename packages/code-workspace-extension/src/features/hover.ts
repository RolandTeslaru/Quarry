import * as vscode from 'vscode'
import { Reference } from '../domain/Reference'
import type { Quarry } from '../quarry'
import { TYPE_ICONS, TYPE_LABELS } from './presentation'

/** Over a reference's string: a card for what it points to, with "Open in Quarry". */
export class ReferenceHover implements vscode.HoverProvider {

    public constructor(private readonly quarry: Quarry) {}

    public async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | null> {
        if (!this.quarry.isConnected())
            return null

        const reference = Reference.findAt(Reference.findAll(document.getText()), document.offsetAt(position))

        if (!reference)
            return null

        const range = new vscode.Range(document.positionAt(reference.start), document.positionAt(reference.end))
        const resolved = await this.quarry.getResource(reference.value).catch(() => undefined)
        const card = new vscode.MarkdownString(undefined, true)

        if (resolved === undefined)
            card.appendMarkdown('$(cloud-offline) Couldn’t reach Quarry.')
        else if (resolved === null)
            card.appendMarkdown(reference.kind === 'output'
                ? '$(add) **New dataset** — nothing is there yet; the first build creates it.'
                : '$(warning) **Not found** — nothing at this path, or you can’t see it.')
        else {
            const { resource, location } = resolved
            const url = this.quarry.getResourceUrl(resource.rid)

            card.appendMarkdown(`$(${TYPE_ICONS[resource.type]}) **${escape(resource.name)}** · ${TYPE_LABELS[resource.type]}\n\n`)
            card.appendMarkdown(`${escape(location)}\n\n`)

            if (resource.description)
                card.appendMarkdown(`${escape(resource.description)}\n\n`)

            card.appendMarkdown(`Updated ${resource.updatedAt.toLocaleString()}\n\n`)
            card.appendMarkdown(`\`${resource.rid}\`\n\n`)

            if (url)
                card.appendMarkdown(`[Open in Quarry](${url.toString()})`)
        }

        return new vscode.Hover(card, range)
    }
}

/** Library names are user text: no markdown in them. */
function escape(text: string): string {
    return text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, character => `\\${character}`)
}
