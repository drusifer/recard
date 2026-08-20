/**
 * PeerJS wiring (ARCHITECTURE.md D2/D3/D5). This file talks to real
 * WebRTC/PeerJS and is not covered by node:test — mocking a DataConnection
 * would only prove the code matches our own assumptions about PeerJS's
 * behavior, not reality (see Trin's "mocks vs reality" lesson). It's
 * verified manually: two browser tabs against a local static server, per
 * ARCHITECTURE.md's Testing Strategy.
 *
 * Star topology: the host is the hub. Joining clients only ever connect to
 * the host, never to each other.
 */

const PeerCtor = () => globalThis.Peer;

// Excludes visually-ambiguous characters (0/O, 1/I) since this is read
// and typed by people, not just copy-pasted (Smith Gate-close finding:
// the raw PeerJS id is an internal UUID, not something a person can read
// aloud or type - see docs/DECISIONS.md).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateShortCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export class Session {
  /** @type {'host'|'join'} */
  role;
  /** @type {Map<string, {id: string, name: string, connection: DataConnection}>} */
  peers = new Map();
  // D32: 'host-lost' is the RETRYABLE loss of the host; 'session-ended'
  // is final. They are separate events because a client about to retry
  // must never first be told the session is over (Smith Gate 1 #2).
  handlers = { data: [], roster: [], 'host-lost': [], 'session-ended': [] };

  constructor(role) {
    this.role = role;
  }

  /**
   * Tears down the underlying peer. Needed by the US-44 retry loop: an
   * attempt that times out leaves a half-open peer holding a broker
   * connection, and one per attempt would accumulate for the whole
   * budget.
   */
  close() {
    try { this.peer?.destroy(); } catch { /* already gone */ }
    this.handlers = { data: [], roster: [], 'host-lost': [], 'session-ended': [] };
  }

  on(event, handler) {
    // Fail loudly on a typo'd or unregistered event: silently dropping a
    // subscription means a disconnect handler that simply never runs.
    if (!this.handlers[event]) throw new Error(`Session: unknown event "${event}"`);
    this.handlers[event].push(handler);
    return this;
  }

  emit(event, payload) {
    for (const handler of this.handlers[event] ?? []) handler(payload);
  }

  /**
   * Host: create a table and wait for others to join. Uses a short,
   * human-readable code as the PeerJS id (rather than PeerJS's default
   * UUID) so it can actually be read aloud or typed, not just
   * copy-pasted. Collisions on the public broker are rare (33^6 code
   * space) but possible - on that error, `ready()` rejects and the
   * caller should let the user retry, which generates a fresh code.
   */
  static host({ name, code }) {
    const session = new Session('host');
    const Peer = PeerCtor();
    // US-37: a restoring host re-requests the code it had, so guests can
    // rejoin with the code they already hold. The broker may refuse it
    // (still held, or since taken) - that rejects `ready()`, and the
    // caller falls back to a fresh code rather than failing outright.
    const peer = new Peer(code || generateShortCode());
    session.peer = peer;
    session.selfId = null;
    session.selfName = name;

    session.readyPromise = new Promise((resolve, reject) => {
      peer.on('open', (id) => {
        session.selfId = id;
        resolve(id);
      });
      peer.on('error', (err) => reject(err));
    });

    peer.on('connection', (conn) => {
      session._wireIncomingConnection(conn);
    });

    return session;
  }

  /** Join an existing table by the host's PeerJS id. */
  static join(hostId, { name, playerKey }) {
    const session = new Session('join');
    const Peer = PeerCtor();
    const peer = new Peer();
    session.peer = peer;
    session.selfName = name;

    session.readyPromise = new Promise((resolve, reject) => {
      peer.on('open', (id) => {
        session.selfId = id;
        // US-38: a returning player presents the key the host gave them last
        // time, so the host can reunite them with their seat and hand.
        const conn = peer.connect(hostId, { metadata: { name, playerKey } });
        session.hostConn = conn;
        conn.on('open', () => resolve(id));
        conn.on('data', (msg) => session.emit('data', msg));
        // D32: losing the host is RETRYABLE and must not be announced as
        // the end of the session - a client about to retry that is first
        // told "session ended" has been scared and then corrected, which
        // costs more trust than the delay it was explaining (Smith Gate 1
        // #2). Whoever wires this decides when it is genuinely over.
        conn.on('close', () => session.emit('host-lost'));
        conn.on('error', () => session.emit('host-lost'));
      });
      peer.on('error', reject);
    });

    return session;
  }

  _wireIncomingConnection(conn) {
    const name = conn.metadata?.name ?? conn.peer;
    const record = { id: conn.peer, name, playerKey: conn.metadata?.playerKey ?? null, status: 'connecting', conn };
    this.peers.set(conn.peer, record);
    this._emitRoster();

    conn.on('open', () => {
      record.status = 'connected';
      this._emitRoster();
    });
    conn.on('data', (msg) => this.emit('data', { fromId: conn.peer, msg }));
    conn.on('close', () => {
      record.status = 'disconnected';
      this._emitRoster();
    });
    conn.on('error', () => {
      record.status = 'disconnected';
      this._emitRoster();
    });
  }

  _emitRoster() {
    this.emit(
      'roster',
      [...this.peers.values()].map(({ id, name, playerKey, status }) => ({ id, name, playerKey, connection: status })),
    );
  }

  /** Host only: send a message to every connected peer. */
  broadcast(message) {
    for (const record of this.peers.values()) {
      if (record.status !== 'connected') continue;
      record.conn.send(message);
    }
  }

  /** Host only: send a message to one specific peer (used for per-player views). */
  sendTo(peerId, message) {
    this.peers.get(peerId)?.conn?.send(message);
  }

  /** Join side only: send a message to the host. */
  send(message) {
    this.hostConn.send(message);
  }

  ready() {
    return this.readyPromise;
  }
}
