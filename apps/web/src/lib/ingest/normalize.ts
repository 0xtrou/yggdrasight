import { ProviderType, CreateSignalSchema } from '@yggdrasight/core'
import type { CreateSignalInput } from '@yggdrasight/core'
import { parseTradingView } from './parsers/tradingview'
import { parseGeneric } from './parsers/generic'

export async function normalize(provider: ProviderType, body: unknown): Promise<CreateSignalInput> {
  let result: CreateSignalInput

  switch (provider) {
    case ProviderType.TRADINGVIEW:
      result = parseTradingView(body)
      break
    default:
      result = parseGeneric(body)
  }

  // Final schema validation — throws ZodError if invalid
  return CreateSignalSchema.parse(result)
}
