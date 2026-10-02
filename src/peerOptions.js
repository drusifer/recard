/**
 * Local WebRTC signaling path: by default `session.js` hands PeerJS no
 * options at all, which means its own public cloud broker. A URL search
 * string carrying `peerHost` (written by `tools/localPeerServer.mjs`, read
 * by whoever navigates a browser to the app - the test harness, or a jev
 * tool run with its own local-broker flag) redirects it at a local
 * PeerServer instead. Split out pure so it's unit-tested directly, rather
 * than joining session.js's own "needs a real broker" exemption.
 */
export function peerOptionsFromSearch(search) {
  const parameters = new URLSearchParams(search ?? '');
  const host = parameters.get('peerHost');
  if (!host) return;
  return {
    host,
    port: Number(parameters.get('peerPort')) || 443,
    path: parameters.get('peerPath') || '/',
    key: parameters.get('peerKey') || 'peerjs',
    secure: false,
  };
}
