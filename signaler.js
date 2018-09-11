class WebRTCSignaler {
  get test () {
    return 'transport:webrtc:signal';
  }

  async handle (message, node) {
    let payload = JSON.parse(message.payload);

    await node.send({
      to: payload.to,
      command: message.command,
      payload: message.payload,
    });
  }
}

module.exports = { WebRTCSignaler };
