import { z } from 'zod';
import { defineCredential } from '../core/credential';

/** A PostgreSQL login: where the server is and who to connect as. */
export const Credential = defineCredential({
    id:          'postgres',
    displayName: 'PostgreSQL',
    icon:        'postgres',
    Fields: z.object({
        host:     z.string().min(1).meta({ title: 'Host', description: 'Hostname or IP address of the database server' }),
        port:     z.number().int().positive().default(5432).meta({ title: 'Port' }),
        database: z.string().min(1).meta({ title: 'Database' }),
        user:     z.string().min(1).meta({ title: 'User', description: 'Use a read-only role' }),
        password: z.string().default('').meta({ title: 'Password', secret: true }),
        ssl:      z.boolean().default(false).meta({ title: 'Require SSL' }),
    }),
});
