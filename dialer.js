const Socket = require('simple-peer');
class WebRTCDialer {
  constructor ({ wrtc, timeout = 30000 } = {}) {
    this.proto = 'wrtc';

    this.timeout = timeout;
    this.wrtc = wrtc;
  }

  dial (url, node) {
    let address = url.split(':').pop();

    return new Promise((resolve, reject) => {
      let socket = new Socket({ initiator: true, wrtc: this.wrtc, trickle: true });

      let dialTimeout = setTimeout(() => {
        socket.destroy();
        reject(new Error('WebRTC Dial timeout'));
      }, this.timeout);

      let onMessage = message => {
        if (message.command !== 'transport:webrtc:signal') {
          return;
        }

        if (message.from !== address) {
          return;
        }

        let signal = JSON.parse(message.payload);
        // console.log('D', signal);
        socket.signal(signal);
      };

      node.on('message', onMessage);

      socket.on('signal', signal => {
        node.relay({
          to: address,
          command: 'transport:webrtc:signal',
          payload: signal,
        });
      });

      socket.on('error', err => {
        console.error('WebRTCDialer caught', err);
      });

      socket.on('connect', () => {
        node.removeListener('message', onMessage);
        socket.removeAllListeners();
        clearTimeout(dialTimeout);
        resolve(socket);
      });
    });
  }
}

module.exports = { WebRTCDialer };
