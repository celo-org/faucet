export function capitalize(word: string) {
  const words = word.split('-')
  return words
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    .trim()
  // }
}
