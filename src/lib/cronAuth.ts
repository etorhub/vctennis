import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of the cron `Authorization: Bearer <secret>` header against
 * `CRON_SECRET`. Plain `!==` short-circuits on the first differing byte, which is
 * timing-attackable in theory; `timingSafeEqual` requires equal-length buffers, so a
 * length mismatch is handled as an outright rejection without comparing.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return false;
  }

  const expected = Buffer.from(`Bearer ${import.meta.env.CRON_SECRET}`);
  const actual = Buffer.from(authHeader);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
