/**
 * Minimal, dependency-free `.env` loading, shared by the server, the
 * facilitator, and the payer script. Uses Node's own `process.loadEnvFile`
 * (available since Node 20.6) instead of pulling in the `dotenv` package --
 * one less dependency for a template whose whole point is to stay small.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Loads `packages/api/.env` if it exists. Never throws on a missing file
 *  -- only a required variable missing afterward should fail loudly, via
 *  `requiredEnv` below. Safe to call more than once (idempotent: later
 *  calls just re-read the same file). */
export function loadDotEnv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const root = path.resolve(here, '..') // src/.. or scripts/.. -> packages/api
  try {
    process.loadEnvFile(path.join(root, '.env'))
  } catch {
    // No .env file present -- rely on whatever is already in the shell
    // environment (e.g. a CI secret injected directly).
  }
}

export function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is required but not set. Copy .env.example to .env and fill it in -- ` +
        'see README.md "Environment variables" for how to get each value.',
    )
  }
  return value
}

export function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback
}
