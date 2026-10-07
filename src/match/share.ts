/** Short link printed on the card, e.g. "lash-vs-seven.web.app/wordhunt". */
export const shareLink = (slug: string) => `${location.host}/${slug}`

/** Text that travels with the image in the share sheet — names, result, and a link to play. */
export function shareMessage(game: string, slug: string, names: [string, string], winner: number, scoreLine: string) {
  const url = `${location.origin}/${slug}`
  if (winner < 0) return `${names[0]} and ${names[1]} drew ${scoreLine} at ${game} on Lash vs Seven. Settle it: ${url}`
  const loser = names[winner === 0 ? 1 : 0]
  return `${names[winner]} beat ${loser} ${scoreLine} at ${game} on Lash vs Seven. Think you can do better? ${url}`
}
