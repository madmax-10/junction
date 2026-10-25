import { extractDetailsFromText } from '../mocks/mockSituationExtractor.ts'
import type { ExtractedDetail } from '../types/extraction.ts'

// Backed by local keyword rules for now; replace the body with the backend extraction request.
export async function extractSituationDetails(text: string): Promise<ExtractedDetail[]> {
  return extractDetailsFromText(text)
}
