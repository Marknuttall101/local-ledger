import type { AiRequestItem, Classifier, ClassifierResult } from '../core/categorise'
import { fallbackClassifier } from '../core/fallbackClassifier'
import type { Category } from '../core/types'
import { getMeta, setMeta } from '../db/db'
import { getApiKey } from './apiKey'
import { createJevClient, type CategoryOption } from './openrouter'

export type AiStatus = 'ai' | 'offline'

/**
 * Smart sorting: whether shop names may be sent to the AI model. Off until the user says yes
 * ('ask' = not asked yet, which also means off). It also needs the user's own OpenRouter key.
 */
export type SmartSorting = 'ask' | 'on' | 'off'

export const getSmartSorting = async (): Promise<SmartSorting> => (await getMeta<SmartSorting>('smartSorting')) ?? 'ask'

export const setSmartSorting = (choice: SmartSorting) => setMeta('smartSorting', choice)

/** The AI when smart sorting is on and there's a key; otherwise guesses on this device, and nothing is sent */
export async function chosenClassifier(onStatus?: (s: AiStatus) => void, fetchImpl?: typeof fetch): Promise<Classifier> {
  const key = getApiKey()
  return (await getSmartSorting()) === 'on' && key ? createAiClassifier(key, onStatus, fetchImpl) : fallbackClassifier
}

const CONCURRENCY = 4

/**
 * Asks Jev, through OpenRouter with the user's key, about each shop. Any shop it can't answer
 * (bad key, out of credit, offline) keeps the on-device guess, so the user always gets a result.
 */
export function createAiClassifier(apiKey: string, onStatus?: (s: AiStatus) => void, fetchImpl?: typeof fetch): Classifier {
  const jev = createJevClient({ apiKey, fetchImpl })
  return {
    name: 'ai',
    async classify(items: AiRequestItem[], categories: Category[], onProgress) {
      // Transfers and income are decided by rules on this device, never by the AI
      const cats: CategoryOption[] = categories.filter((c) => c.id !== 'transfers' && c.id !== 'income').map(({ id, name, hint }) => ({ id, name, hint }))
      const results: ClassifierResult[] = await fallbackClassifier.classify(items, categories)
      let offline = false
      let anyAi = false
      let done = 0
      let next = 0

      const worker = async () => {
        while (next < items.length) {
          const i = next++
          if (!offline) {
            try {
              const answer = await jev.classify({ text: items[i].text, place: items[i].place }, cats)
              if (answer) {
                results[i] = { merchantKey: items[i].merchantKey, ...answer, source: 'ai' }
                anyAi = true
              }
            } catch {
              // Bad key, no credit or no connection: stop asking; the rest keep their on-device guess
              offline = true
            }
          }
          onProgress?.(++done, items.length)
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker))
      onStatus?.(anyAi ? 'ai' : 'offline')
      return results
    },
  }
}
