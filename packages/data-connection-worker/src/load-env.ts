// Imported first by main.ts: reflect-metadata before any decorator runs, env before any module reads it.
import 'reflect-metadata';
import * as path from 'node:path';
import dotenv from 'dotenv';

// src/ → data-connection-worker/ → packages/ → repo root. In containers, env comes from the environment.
const root = (file: string) => path.resolve(__dirname, '../../../', file);

// Loaded first, so its keys win: dotenv never overwrites one already set.
if (process.env.ENV_FILE)
    dotenv.config({ path: root(process.env.ENV_FILE), quiet: true });

dotenv.config({ path: root('.env'), quiet: true });
