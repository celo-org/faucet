import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

 
function nonceLockKey(chainId: string, address: string): string {
  return `nonce-lock:${chainId}:${address}`
}

function getLockKey(chainId: string, address: string): string {
  return `lock:${chainId}:${address}`
}




export async function getNonce(chainId: number, address: string): Promise<number | null> {
  console.time('getNonce')
  const result = await redis.incr(nonceLockKey(chainId.toString(), address))
  console.timeEnd('getNonce')
  return result

}

export  async function forceNonce(chainId: number, address: string, nonce: number) {
  console.time('forceNonce')
  const result = await redis.set(nonceLockKey(chainId.toString(), address), nonce.toString()) // expire after 1 hour
  console.timeEnd('forceNonce')
  return result
}

