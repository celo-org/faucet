import { useEffect, useState } from 'react'
import { getAddresses } from 'utils/history'

export function useLastAddress() {
  const [lastAddress, setLastAddress] = useState<string>()
  useEffect(() => {
    const lastUsedAddress = getAddresses().at(0)
    setLastAddress(lastUsedAddress)
  }, [])

  return lastAddress
}
