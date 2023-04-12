const HISTORY = 'fauceted-addresses'

export function saveAddress(address: string) {
  const listOfAddresses = retrieve()

  const nextList = [
    address,
    ...listOfAddresses.filter((addr) => addr !== address),
  ]

  localStorage.setItem(HISTORY, JSON.stringify(nextList))
  return nextList
}

export function getAddresses() {
  const list = retrieve()
  return list
}

function retrieve() {
  const rawList = localStorage.getItem(HISTORY)

  let listOfAddresses: string[] = []

  if (typeof rawList === 'string') {
    listOfAddresses = JSON.parse(rawList) as string[]
  }

  return listOfAddresses
}
