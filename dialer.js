const debug = require('debug')('twlv:transport-webrtc:dialer');

const Socket = require('simple-peer');
class WebRTCDialer {
  constructor ({ wrtc, trickle = true, signalers = [], timeout = 10000 } = {}) {
    this.proto = 'wrtc';

    this.timeout = timeout;
    this.wrtc = wrtc;
    this.signalers = signalers;
    this.trickle = trickle;

    this.units = [];
    this.sockets = [];

    this._onNodeMessage = this._onNodeMessage.bind(this);
  }

  async dial (url, node) {
    if (!this.signalers || !this.signalers.length) {
      throw new Error('WebRTCDialer: Cannot dial without signaler');
    }

    if (!this.node) {
      this._initNodeListener(node);
    }

    if (this.node !== node) {
      throw new Error('WebRTCDialer: Cannot use dialer for multi twlv nodes');
    }

    let address = url.split(':').pop();

    let socket = await new Promise((resolve, reject) => {
      let unit = this.getUnit(address);
      if (!unit) {
        unit = new DialUnit({ dialer: this, address });
        this.putUnit(unit);
      }

      unit.add({ resolve, reject });
    });

    this.sockets.push(socket);

    socket.on('close', () => {
      let index = this.sockets.indexOf(socket);
      if (index !== -1) {
        this.sockets.splice(index, 1);
      }
    });

    socket.on('signal', signal => {
      console.log('dialer socket got signal');
      let message = {
        command: 'transport:webrtc:signal',
        payload: {
          initiator: this.node.identity.address,
          from: this.node.identity.address,
          to: socket.twlvAddress,
          renegotiate: true,
          signal,
        },
      };
      this.sendToSignalers(message);
    });

    socket.on('error', err => {
      console.error('dialer got err', err.stack);
    });

    return socket;
  }

  getUnit (address) {
    return this.units.find(unit => unit.address === address);
  }

  putUnit (unit) {
    this.units.push(unit);
  }

  _initNodeListener (node) {
    this.node = node;
    this.node.on('message', this._onNodeMessage);
  }

  sendToSignalers (message) {
    this.signalers.forEach(async signalerAddress => {
      try {
        await this.node.send(Object.assign({ to: signalerAddress }, message));
      } catch (err) {
        // noop
      }
    });
  }

  _onNodeMessage (message) {
    if (message.command !== 'transport:webrtc:signal') {
      return;
    }

    try {
      let payload = JSON.parse(message.payload);
      let { initiator, from, to, signal, renegotiate } = payload;
      let me = this.node.identity.address;

      if (initiator !== me || to !== me) {
        return;
      }

      if (renegotiate) {
        let socket = this.sockets.find(socket => socket.twlvAddress === from);
        if (socket) {
          debug('WebRTCDialer got renegotiate signal signaler=%s %o', message.from, payload);
          socket.signal(signal);
        }
        return;
      }

      debug('WebRTCDialer got signal signaler=%s %o', message.from, payload);

      let unit = this.getUnit(from);
      if (!unit) {
        return;
      }

      unit.signal(signal);
    } catch (err) {
      debug('WebRTCDialer#_onNodeMessage caught err', err);
    }
  }
}

class DialUnit {
  constructor ({ dialer, address }) {
    this.address = address;
    this.dialer = dialer;
    this.timeout = setTimeout(this._onTimeout.bind(this), this.dialer.timeout);

    this.handlers = [];
    this.socket = new Socket({ initiator: true, wrtc: this.dialer.wrtc, trickle: this.dialer.trickle });
    this.socket.on('connect', this._onSocketConnect.bind(this));
    this.socket.on('close', this._onSocketClose.bind(this));
    this.socket.on('signal', this._onSocketSignal.bind(this));
    this.socket.on('error', this._onSocketError.bind(this));
  }

  _onSocketSignal (signal) {
    let message = {
      command: 'transport:webrtc:signal',
      payload: {
        initiator: this.dialer.node.identity.address,
        from: this.dialer.node.identity.address,
        to: this.address,
        signal,
      },
    };
    this.dialer.sendToSignalers(message);
  }

  _onSocketError (err) {
    this.lastError = err;
    debug(`WebRTCDialer caught %s`, err.stack);
  }

  _onSocketConnect () {
    debug('WebRTCDialer: socket connected');
    clearTimeout(this.timeout);
    this.socket.removeAllListeners();
    this._resolve();
  }

  _onSocketClose () {
    clearTimeout(this.timeout);
    this.socket.removeAllListeners();

    if (this.lastError) {
      return this._reject(this.lastError);
    }

    this._reject(new Error('WebRTC socket hangup'));
  }

  _resolve (socket) {
    this._removeFromDialer();

    this.socket.twlvAddress = this.address;

    this.handlers.forEach(({ resolve }) => resolve(this.socket));
  }

  _reject (err) {
    this._removeFromDialer();
    this.handlers.forEach(({ reject }) => reject(err));
  }

  _removeFromDialer () {
    let index = this.dialer.units.indexOf(this);
    if (index !== -1) {
      this.dialer.units.splice(index, 1);
    }
  }

  add ({ resolve, reject }) {
    this.handlers.push({ resolve, reject });
  }

  signal (signal) {
    this.socket.signal(signal);
  }

  _onTimeout () {
    this.socket.destroy(new Error('WebRTC Dial timeout'));
  }
}

module.exports = { WebRTCDialer };
