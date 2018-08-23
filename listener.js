const { EventEmitter } = require('events');
const Socket = require('simple-peer');
const debug = require('debug')('twlv:transport-webrtc:listener');

class WebRTCListener extends EventEmitter {
  constructor ({ wrtc, trickle = true, signalers = [], timeout = 10000 } = {}) {
    super();

    this.proto = 'wrtc';
    this.wrtc = wrtc;
    this.timeout = timeout;
    this.signalers = signalers;
    this.trickle = trickle;

    this.sockets = [];

    this._onMessage = this._onMessage.bind(this);
  }

  get urls () {
    return [ `wrtc:${this.node.identity.address}` ];
  }

  up (node) {
    this.units = [];
    this.node = node;
    this.node.on('message', this._onMessage);
  }

  down () {
    this.units = [];
    if (this.node) {
      this.node.removeListener('message', this._onMessage);
      this.node = undefined;
    }
  }

  sendToSignalers (message) {
    this.signalers.map(async signalerAddress => {
      try {
        await this.node.send(Object.assign({ to: signalerAddress }, message));
      } catch (err) {
        // noop
      }
    });
  }

  getUnit (address) {
    return this.units.find(unit => unit.address === address);
  }

  putUnit (unit) {
    this.units.push(unit);
  }

  _onMessage (message) {
    if (message.command !== 'transport:webrtc:signal') {
      return;
    }

    try {
      let payload = JSON.parse(message.payload);
      let { initiator, from, to, renegotiate, signal } = payload;
      let me = this.node.identity.address;

      if (initiator === me || to !== me) {
        return;
      }

      if (renegotiate) {
        let socket = this.sockets.find(socket => socket.twlvAddress === from);
        if (socket) {
          debug('WebRTCListener got renegotiate signal signaler=%s %o', message.from, payload);
          socket.signal(signal);
        }
        return;
      }

      debug('WebRTCListener got signal signaler=%s %o', message.from, payload);

      if (signal.type === 'offer') {
        let unit = new ListenUnit({ listener: this, address: from });
        this.putUnit(unit);
        unit.signal(signal);
        return;
      }

      let unit = this.getUnit(from);
      if (!unit) {
        return;
      }

      unit.signal(signal);
    } catch (err) {
      debug(`WebRTCListener caught error: ${err}`);
    }
  }

  unitDone (unit) {
    let { socket } = unit;

    this.sockets.push(socket);

    socket.on('close', () => {
      let index = this.sockets.indexOf(socket);
      if (index !== -1) {
        this.sockets.splice(index, 1);
      }
    });

    socket.on('signal', signal => {
      console.log('listener socket got signal');
      let message = {
        command: 'transport:webrtc:signal',
        payload: {
          initiator: socket.twlvAddress,
          from: this.node.identity.address,
          to: socket.twlvAddress,
          renegotiate: true,
          signal,
        },
      };
      this.sendToSignalers(message);
    });

    socket.on('error', err => {
      console.error('listener got err', err.stack);
    });

    this.emit('socket', socket);
  }
}

class ListenUnit {
  constructor ({ listener, address }) {
    this.listener = listener;
    this.address = address;

    this.timeout = setTimeout(this._onTimeout.bind(this), this.listener.timeout);

    this.socket = new Socket({ wrtc: this.listener.wrtc, trickle: this.listener.trickle });

    this.socket.on('signal', this._onSocketSignal.bind(this));
    this.socket.on('error', this._onSocketError.bind(this));
    this.socket.on('connect', this._onSocketConnect.bind(this));
    this.socket.on('close', this._onSocketClose.bind(this));
  }

  signal (signal) {
    this.socket.signal(signal);
  }

  _removeFromDialer () {
    let index = this.listener.units.indexOf(this);
    if (index !== -1) {
      this.listener.units.splice(index, 1);
    }
  }

  _onSocketSignal (signal) {
    let message = {
      command: 'transport:webrtc:signal',
      payload: {
        initiator: this.address,
        from: this.listener.node.identity.address,
        to: this.address,
        signal,
      },
    };
    this.listener.sendToSignalers(message);
  }

  _onSocketError (err) {
    debug(`WebRTCListener caught: %s`, err.stack);
  }

  _onSocketConnect () {
    debug('WebRTCListener: socket connected');

    clearTimeout(this.timeout);
    this._removeFromListener();
    this.socket.removeAllListeners();

    this.socket.twlvAddress = this.address;

    // TODO: if dont pause for a while, socket not registered correctly
    this.listener.unitDone(this);
  }

  _onSocketClose () {
    clearTimeout(this.timeout);
    this._removeFromListener();
    this.socket.removeAllListeners();
  }

  _removeFromListener () {
    let index = this.listener.units.indexOf(this);
    if (index !== -1) {
      this.listener.units.splice(index, 1);
    }
  }

  _onTimeout () {
    this.socket.destroy(new Error('WebRTC Listen timeout'));
  }
}

module.exports = { WebRTCListener };
