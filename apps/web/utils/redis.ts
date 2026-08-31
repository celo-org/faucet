import { Redis } from '@upstash/redis'

let client: Redis | undefined

/**
 * Single lazily-initialised Upstash client.
 *
 * Vercel reuses warm lambdas, so constructing a client per request wastes
 * sockets; sharing one module-level instance is safe because the client is
 * stateless HTTP.
 */
export function getRedis(): Redis {
  if (!client) {
    client = Redis.fromEnv()
  }
  return client
}
