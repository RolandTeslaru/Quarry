import { notFound } from '@tanstack/react-router'
import { isAxiosError } from 'axios'

/** A loader's request whose 404 means the page's resource isn't there (or isn't yours): the route's not-found. */
export async function orNotFound<T>(request: Promise<T>): Promise<T> {
    try {
        return await request
    }
    catch (error) {
        if (isAxiosError(error) && error.response?.status === 404)
            throw notFound()

        throw error
    }
}
