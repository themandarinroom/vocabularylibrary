// Developer-only: on a local preview (127.0.0.1 / localhost) with ?devRelay=1, record pictures are fetched through the
// local developer image relay, which stands in for the approved (not yet applied) Storage CORS policy.
// Returns undefined everywhere else, so real sites always load pictures directly.
export function devImageRelay(loc = globalThis.location) {
  const local = ['127.0.0.1', 'localhost'].includes(loc?.hostname);
  return local && new URLSearchParams(loc.search).get('devRelay') === '1' ? (u => `/__img?u=${encodeURIComponent(u)}`) : undefined;
}
