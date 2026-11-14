// URL.hostname brackets IPv6 literals; pg exposes the same host without brackets.
export const isLoopbackHost = (hostname: string): boolean =>
  ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
