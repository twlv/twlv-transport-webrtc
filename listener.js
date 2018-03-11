const { EventEmitter } = require('events');
const Socket = require('simple-peer');

class WebRTCListener extends EventEmitter {
  constructor ({ wrtc } = {}) {
    super();

    this.proto = 'wrtc';
    this.wrtc = wrtc;

    this._onMessage = this._onMessage.bind(this);
  }
  get urls () {
    return [ `wrtc:${this.node.identity.address}` ];
  }

  up (node) {
    this._sockets = [];
    this.node = node;
    this.node.on('message', this._onMessage);
  }

  down () {
    this.node.removeListener('message', this._onMessage);
    this.node = undefined;
    this._sockets = [];
  }

  _onMessage (message) {
    if (message.command !== 'transport:webrtc:signal') {
      return;
    }

    let address = message.from;
    let signal = JSON.parse(message.payload);
    // console.log('L', signal);

    if (signal.type !== 'offer') {
      let socket = this._sockets.find(socket => socket.address === address);
      if (!socket) {
        return;
      }

      socket.signal(signal);
      return;
    }

    let socket = new Socket({ wrtc: this.wrtc, trickle: true });
    socket.address = address;
    socket.on('signal', signal => {
      this.node.relay({
        to: address,
        command: 'transport:webrtc:signal',
        payload: signal,
      });
    });

    socket.on('error', err => {
      console.error('WebRTCListener caught', err);
    });

    socket.on('connect', () => {
      let index = this._sockets.find(s => s.address === address);
      if (index !== -1) {
        this._sockets.splice(index, 1);
      }

      socket.removeAllListeners();

      this.emit('socket', socket);
    });

    this._sockets.push(socket);

    socket.signal(signal);
  }
}

module.exports = { WebRTCListener };
