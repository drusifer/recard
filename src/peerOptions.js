/**
 * Local WebRTC signaling path: by default `session.js` hands PeerJS no
 * options at all, which means its own public cloud broker. A URL search
 * string carrying `peerHost` (written by `tools/localPeerServer.mjs`,
 * always the literal loopback `127.0.0.1` - read by whoever navigates a
 * browser to the app: the test harness, or a jev tool run with its own
 * local-broker flag) redirects it at a local PeerServer instead, with no
 * outbound network dependency anywhere in the connection (signaling OR
 * ICE - see `config` below). Split out pure so it's unit-tested
 * directly, rather than joining session.js's own "needs a real broker"
 * exemption.
 */
export function peerOptionsFromSearch(search) {
  const parameters = new URLSearchParams(search ?? '');
  const host = parameters.get('peerHost');
  // US-151/D176: a relayed game master's own RTCConfiguration (Cloudflare
  // TURN, relay-only), written by `withPeerConfig` below.
  const peerConfig = parameters.get('peerConfig');
  const config = peerConfig ? JSON.parse(peerConfig) : undefined;
  if (!host) return config && { config };
  return {
    host,
    port: Number(parameters.get('peerPort')) || 443,
    path: parameters.get('peerPath') || '/',
    key: parameters.get('peerKey') || 'peerjs',
    secure: false,
    // PeerJS's own default ICE config bakes in a public Google STUN
    // server regardless of the signaling host override (checked
    // directly against its bundled source) - two peers on the SAME
    // machine have no NAT between them to traverse, so this override
    // means zero outbound network dependency, not just for signaling.
    config: config ?? { iceServers: [] },
  };
}

/**
 * `url` with `rtcConfig` added as the `peerConfig` parameter that
 * `peerOptionsFromSearch` reads; unchanged when there is none. Only the
 * Node harness writes it, on its own headless pages - a share link
 * carries the table code alone, so these credentials never reach a player.
 */
export function withPeerConfig(url, rtcConfig) {
  if (!rtcConfig) return url;
  const queryAt = url.indexOf('?');
  const base = queryAt === -1 ? url : url.slice(0, queryAt);
  const parameters = new URLSearchParams(queryAt === -1 ? '' : url.slice(queryAt + 1));
  parameters.set('peerConfig', JSON.stringify(rtcConfig));
  return `${base}?${parameters}`;
}
