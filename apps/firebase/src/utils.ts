export function withTimeLog<A>(
  name: string,
  f: (...args: any[]) => Promise<A>,
) {
  return async (...args: Parameters<typeof f>): Promise<A> => {
    try {
      console.time(name)
      return await f(...args)
    } finally {
      console.timeEnd(name)
    }
  }
}

export async function runWithTimeLog<A>(
  name: string,
  f: () => Promise<A>,
): Promise<A> {
  try {
    console.time(name)
    return await f()
  } finally {
    console.timeEnd(name)
  }
}
