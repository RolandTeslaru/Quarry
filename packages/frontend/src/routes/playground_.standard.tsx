import { createFileRoute } from '@tanstack/react-router'
import { previewSearch } from '@/features/playground/catalog'
import { StandardPreview } from '@/features/playground/ui/StandardPreview'

export const Route = createFileRoute('/playground_/standard')({
    validateSearch: previewSearch,
    component: StandardPage,
})

function StandardPage() {
    const search = Route.useSearch()

    return <StandardPreview {...search} />
}
