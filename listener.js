const { EventEmitter } = require('events');
const Socket = require('simple-peer');
const debug = require('debug')('twlv:transport-webrtc:listener');

class WebRTCListener extends EventEmitter {
  constructor ({ wrtc, signalers = [] } = {}) {
    super();

    this.proto = 'wrtc';
    this.wrtc = wrtc;
    this.signalers = signalers;

    this._onMessage = this._onMessage.bind(this);
  }
  get urls () {
    return [ `wrtc:${this.node.identity.address}` ];
  }

  up (node) {
    if (!this.signalers || !this.signalers.length) {
      throw new Error('WebRTCListener: Cannot listen without signaler');
    }

    this._sockets = [];
    this.node = node;
    this.node.on('message', this._onMessage);
  }

  down () {
    this._sockets = [];
    if (this.node) {
      this.node.removeListener('message', this._onMessage);
      this.node = undefined;
    }
  }

  _onMessage (message) {
    if (message.command !== 'transport:webrtc:signal') {
      return;
    }

    let { from, to, signal } = JSON.parse(message.payload);
    if (to !== this.node.identity.address) {
      return;
    }

    if (signal.type !== 'offer') {
      let socket = this._sockets.find(socket => socket.address === from);
      if (!socket) {
        return;
      }

      socket.signal(signal);
      return;
    }

    let socket = new Socket({ wrtc: this.wrtc, trickle: true });
    socket.address = from;
    socket.on('signal', signal => {
      this.signalers.map(signalerAddress => {
        this.node.send({
          to: signalerAddress,
          command: 'transport:webrtc:signal',
          payload: {
            from: this.node.identity.address,
            to: from,
            signal,
          },
        });
      });
    });

    socket.on('error', err => {
      debug(`WebRTCListener caught %s`, err.stack);
    });

    socket.on('connect', () => {
      let index = this._sockets.find(s => s.address === from);
      if (index !== -1) {
        this._sockets.splice(index, 1);
      }

      socket.removeAllListeners();

      this.emit('socket', socket);
    });

    socket.on('close', () => {
      let index = this._sockets.indexOf(socket);
      if (index !== -1) {
        this._sockets.splice(index, 1);
      }
      socket.removeAllListeners();
    });

    this._sockets.push(socket);

    socket.signal(signal);
  }
}

module.exports = { WebRTCListener };
