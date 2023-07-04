import type { PageLoad } from './$types'

export const load: PageLoad = async () => {
  return {
    number: Math.random() * 69 / 420
  }
}
