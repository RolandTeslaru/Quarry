import { sql, type Kysely } from 'kysely';

/** Each service's login: its role, and the variable holding its connection URL. */
export const SERVICE_LOGINS = [
    { role: 'catalog_service',         url: 'CATALOG_DATABASE_URL' },
    { role: 'data_connection_service', url: 'DATA_CONNECTION_DATABASE_URL' },
    { role: 'forge_service',           url: 'FORGE_DATABASE_URL' },
] as const;

/**
 * The services' database logins, from their connection URLs — after the migrations have created
 * the roles (each service's schema's 001_initial.sql). For dev and tests: in production the
 * infrastructure creates them, and the main server's role needn't be allowed to. Nothing to do
 * for a service whose URL isn't set.
 */
export async function setServiceLogins(database: Kysely<unknown>): Promise<void> {
    for (const login of SERVICE_LOGINS) {
        const url = process.env[login.url];

        if (!url)
            continue;

        const { username, password } = new URL(url);

        if (username !== login.role)
            throw new Error(`${login.url} must log in as ${login.role}, not ${username}`);

        // ALTER ROLE takes no parameters: the password goes in as a quoted literal.
        await sql`alter role ${sql.id(login.role)} with login password ${sql.lit(decodeURIComponent(password))}`.execute(database);
    }
}
