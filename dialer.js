const debug = require('debug')('twlv:transport-webrtc:dialer');

const Socket = require('simple-peer');
class WebRTCDialer {
  constructor ({ wrtc, signalers = [], timeout = 5000 } = {}) {
    this.proto = 'wrtc';

    this.timeout = timeout;
    this.wrtc = wrtc;
    this.signalers = signalers;
  }

  dial (url, node) {
    let address = url.split(':').pop();

    if (!this.signalers || !this.signalers.length) {
      throw new Error('WebRTCDialer: Cannot dial without signaler');
    }

    return new Promise((resolve, reject) => {
      let socket = new Socket({ initiator: true, wrtc: this.wrtc, trickle: true });

      let dialTimeout = setTimeout(() => socket.destroy(new Error('WebRTC Dial timeout')), this.timeout);

      let onMessage = message => {
        if (message.command !== 'transport:webrtc:signal') {
          return;
        }

        let { from, to, signal } = JSON.parse(message.payload);

        if (from !== address || to !== node.identity.address) {
          return;
        }

        socket.signal(signal);
      };

      node.on('message', onMessage);

      socket.on('close', () => {
        clearTimeout(dialTimeout);
        node.removeListener('message', onMessage);
        socket.removeAllListeners();
        if (lastErr) {
          return reject(lastErr);
        }

        return reject(new Error('WebRTC socket hangup'));
      });

      socket.on('signal', signal => {
        this.signalers.map(signalerAddress => {
          node.send({
            to: signalerAddress,
            command: 'transport:webrtc:signal',
            payload: {
              from: node.identity.address,
              to: address,
              signal,
            },
          });
        });
      });

      let lastErr;
      socket.on('error', err => {
        lastErr = err;
        debug(`WebRTCDialer caught %s`, err.stack);
      });

      socket.on('connect', () => {
        clearTimeout(dialTimeout);
        node.removeListener('message', onMessage);
        socket.removeAllListeners();
        resolve(socket);
      });
    });
  }
}

module.exports = { WebRTCDialer };
