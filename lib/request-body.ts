/** Drain unused request bodies before returning through the local Worker proxy.
 * Early error responses otherwise leave its next POST with a disconnected stream.
 * Discard chunks without buffering, and bound both bytes and waiting time.
 */
export async function discardUnreadRequestBody(req?: Request) {
  if (!req?.body || req.bodyUsed || req.body.locked) return;
  const reader = req.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  const timer = setTimeout(cancel, 5000);
  let discarded = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      discarded += value.byteLength;
      if (discarded > 200 * 1024 * 1024) {
        cancel();
        break;
      }
    }
  } catch {
    // A disconnected client must not replace the response's actual error/status.
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
