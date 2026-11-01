import { createFileRoute } from '@tanstack/react-router'
import { Playground } from '@/features/playground/ui/Playground'

export const Route = createFileRoute('/playground')({
    component: Playground,
})
