class WebRTCSignaler {
  constructor (node) {
    this.node = node;

    this._onMessage = this._onMessage.bind(this);
  }

  start () {
    this.node.on('message', this._onMessage);
  }

  stop () {
    this.node.removeListener('message', this._onMessage);
  }

  _onMessage (message) {
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
