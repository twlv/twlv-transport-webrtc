const { Node } = require('@twlv/core');
const MemoryFinder = require('@twlv/core/finders/memory');
const { MemoryDialer, MemoryListener } = require('@twlv/core/transports/memory');
const { WebRTCDialer, WebRTCListener } = require('..');
const assert = require('assert');
const wrtc = require('electron-webrtc')(); // TODO: electron wrtc leak?

describe('WebRTC Transport', () => {
  before(() => process.on('unhandledRejection', err => console.error('Unhandled', err)));
  after(() => process.removeAllListeners('unhandledRejection'));

  it('send to other peer', async () => {
    let gw = new Node();
    let node1 = new Node();
    let node2 = new Node();

    gw.addFinder(new MemoryFinder());
    node1.addFinder(new MemoryFinder());
    node2.addFinder(new MemoryFinder());

    node1.addDialer(new WebRTCDialer({ wrtc }));
    node2.addDialer(new WebRTCDialer({ wrtc }));

    node1.addListener(new WebRTCListener({ wrtc }));
    node2.addListener(new WebRTCListener({ wrtc }));

    gw.addListener(new MemoryListener());
    node1.addDialer(new MemoryDialer());
    node2.addDialer(new MemoryDialer());

    try {
      await gw.start();
      await node1.start();
      await node2.start();

      await node1.connect(`memory:${gw.identity.address}`);
      await node2.connect(`memory:${gw.identity.address}`);

      node2.on('message', message => {
        if (message.command.startsWith('transport:webrtc')) {
          return;
        }

        assert.equal(message.command, 'foo');
        assert.equal(message.payload.toString(), 'bar');
      });

      await node1.send({
        to: node2.identity.address,
        command: 'foo',
        payload: 'bar',
      });
    } finally {
      await gw.stop();
      await node1.stop();
      await node2.stop();
    }
  });
});
