// Imported for its side effect as the FIRST import of every entry point:
// reflect-metadata before any decorator runs, env before any module reads it.
import 'reflect-metadata';

import dotenv from 'dotenv';
import * as path from 'node:path';

// src/ → server/ → packages/ → repo root. In containers, env comes from the environment.
const root = (file: string) => path.resolve(__dirname, '../../../', file);

/** A path from the environment: absolute as given, or relative to the repo root (as .env files are). */
export const resolveEnvPath = (value: string) => root(value);

// Loaded first, so its keys win: dotenv never overwrites one already set.
if (process.env.ENV_FILE)
    dotenv.config({ path: root(process.env.ENV_FILE), quiet: true });

dotenv.config({ path: root('.env'), quiet: true });
