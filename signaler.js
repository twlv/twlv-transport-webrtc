class WebRTCSignaler {
  constructor (node) {
    this.node = node;

    this._handler = {
      test: 'transport:webrtc:signal',
      handle: this._handle.bind(this),
    };
    // this._onMessage = this._onMessage.bind(this);
  }

  start () {
    this.node.addHandler(this._handler);
  }

  stop () {
    this.node.removeHandler(this._handler);
  }

  _handle (message) {
    if (message.command !== 'transport:webrtc:signal') {
      return;
    }

    let payload = JSON.parse(message.payload);

    this.node.send({
      to: payload.to,
      command: message.command,
      payload: message.payload,
    });
  }
}

module.exports = { WebRTCSignaler };
