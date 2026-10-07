/** A local release requires an explicit worker binding as well as a loopback host. */
export function canAccessLocalRoom(
  host: string,
  development: boolean,
  localApp: unknown,
) {
  return (
    (development || localApp === "1") &&
    /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)
  );
}
