import { extractFromKnownIds, type KnownIds } from '../mocks/knownRecords.ts'
import type { ExtractedDetail } from '../types/extraction.ts'

// Reads local records once their ids are known. This does not call the backend.
export async function extractSituationDetails(ids: KnownIds): Promise<ExtractedDetail[]> {
  if (!ids.usedCarId && !ids.issue && !ids.postId) return []
  return extractFromKnownIds(ids)
}
