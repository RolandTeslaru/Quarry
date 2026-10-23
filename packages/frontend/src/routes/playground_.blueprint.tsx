import { createFileRoute } from '@tanstack/react-router'
import { previewSearch } from '@/features/playground/catalog'
import { BlueprintPreview } from '@/features/playground/ui/BlueprintPreview'

export const Route = createFileRoute('/playground/blueprint')({
    validateSearch: previewSearch,
    component: BlueprintPage,
})

function BlueprintPage() {
    const search = Route.useSearch()

    return <BlueprintPreview {...search} />
}
