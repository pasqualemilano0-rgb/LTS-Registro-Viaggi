/** A short app switch is not a new login. Limit repeated wake-up verifications
 * while preserving full verification after an actual pause or expired trust.
 * Pure time-based decision: never persists credentials or bypasses backend auth.
 */
export const FOREGROUND_TRUST_MS = 60000;
export const SHORT_BACKGROUND_MS = 25000;
export function mustRevalidateOnReturn({
 verified, hasSession, sameOwner = true, lastVerifiedAt = 0,
 backgroundAt = null, now = Date.now(), blocked = false
} = {}) {
 if(blocked || !verified || !hasSession || !sameOwner)return true;
 if(!Number.isFinite(lastVerifiedAt) || lastVerifiedAt <= 0 ||
    !Number.isFinite(now) || now < lastVerifiedAt)return true;
 if(now - lastVerifiedAt >= FOREGROUND_TRUST_MS)return true;
 if(backgroundAt !== null) {
  if(!Number.isFinite(backgroundAt) || backgroundAt > now ||
     now - backgroundAt >= SHORT_BACKGROUND_MS)return true;
 }
 return false;
}
