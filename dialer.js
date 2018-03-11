const Socket = require('simple-peer');
class WebRTCDialer {
  constructor ({ wrtc } = {}) {
    this.proto = 'wrtc';
    this.wrtc = wrtc;
  }

  dial (url, node) {
    let address = url.split(':').pop();
    return new Promise((resolve, reject) => {
      let socket = new Socket({ initiator: true, wrtc: this.wrtc, trickle: true });

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
        resolve(socket);
      });
    });
  }
}

module.exports = { WebRTCDialer };
