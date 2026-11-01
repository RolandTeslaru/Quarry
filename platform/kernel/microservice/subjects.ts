/**
 * The NATS subject a call travels on: its pattern, under this environment's namespace when there is one
 * (`QUARRY_MICROSERVICE_CALLS_NAMESPACE`). Processes sharing a NATS server answer only calls from their own
 * environment — tests set their test database's name, so a dev server on the same NATS never takes a
 * test's call, as tests keep to their own Redis database.
 */
export function getSubject(pattern: string): string {
    const namespace = process.env.QUARRY_MICROSERVICE_CALLS_NAMESPACE;

    return namespace ? `${namespace}.${pattern}` : pattern;
}
