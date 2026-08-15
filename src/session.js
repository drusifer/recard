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
  handlers = { data: [], roster: [], 'session-ended': [] };

  constructor(role) {
    this.role = role;
  }

  on(event, handler) {
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
  static host({ name }) {
    const session = new Session('host');
    const Peer = PeerCtor();
    const peer = new Peer(generateShortCode());
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
  static join(hostId, { name }) {
    const session = new Session('join');
    const Peer = PeerCtor();
    const peer = new Peer();
    session.peer = peer;
    session.selfName = name;

    session.readyPromise = new Promise((resolve, reject) => {
      peer.on('open', (id) => {
        session.selfId = id;
        const conn = peer.connect(hostId, { metadata: { name } });
        session.hostConn = conn;
        conn.on('open', () => resolve(id));
        conn.on('data', (msg) => session.emit('data', msg));
        conn.on('close', () => session.emit('session-ended'));
        conn.on('error', () => session.emit('session-ended'));
      });
      peer.on('error', reject);
    });

    return session;
  }

  _wireIncomingConnection(conn) {
    const name = conn.metadata?.name ?? conn.peer;
    const record = { id: conn.peer, name, status: 'connecting', conn };
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
      [...this.peers.values()].map(({ id, name, status }) => ({ id, name, connection: status })),
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
