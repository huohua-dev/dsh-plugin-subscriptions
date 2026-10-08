/** Subscription quota is terminal for the current turn, even if its window resets later. */
import { isQuotaExceededError } from '@deepseek-ai/dsh-llm'

/** Recognize explicit plan/usage exhaustion, not ordinary request/token throttling. */
export function isSubscriptionQuotaExceeded(detail: string): boolean {
  // API providers also call RPM/TPM buckets "quota". These are burst limits,
  // not exhausted subscription allowances.
  if (/\b(?:requests?|(?:input |output )?tokens?)\s+(?:per|a|each)\s+(?:second|minute)\b|\b(?:rpm|tpm)\b/i.test(detail)) return false
  return isQuotaExceededError(detail)
    || /\bquota[\s_-]+(?:exhausted|reached)\b/i.test(detail)
    || /\b(?:hit|reached|exceeded)\s+(?:(?:your|the)\s+)?(?:weekly|monthly|daily|session|subscription|plan|usage)\s+(?:usage\s+)?limit\b/i.test(detail)
    || /\byou(?:'ve| have) hit your limit\b/i.test(detail)
    || /\b(?:weekly|monthly|daily|session|subscription|plan)\s+(?:usage\s+)?limit\s+(?:has\s+been\s+)?(?:reached|exceeded|exhausted)\b/i.test(detail)
}
