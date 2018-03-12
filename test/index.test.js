const { Node } = require('@twlv/core');
const { MemoryFinder } = require('@twlv/core/finders/memory');
const { MemoryDialer, MemoryListener } = require('@twlv/core/transports/memory');
const { WebRTCDialer, WebRTCListener } = require('..');
const assert = require('assert');
// const wrtc = require('electron-webrtc')(); // TODO: electron wrtc leak?
const wrtc = require('wrtc'); // TODO: electron wrtc leak?

describe.only('WebRTC Transport', () => {
  before(() => process.on('unhandledRejection', err => console.error('Unhandled', err)));
  after(() => process.removeAllListeners('unhandledRejection'));

  it('send to other peer', async () => {
    let gw1 = new Node();
    let gw2 = new Node();
    let node1 = new Node();
    let node2 = new Node();

    gw1.addFinder(new MemoryFinder());
    gw2.addFinder(new MemoryFinder());
    node1.addFinder(new MemoryFinder());
    node2.addFinder(new MemoryFinder());

    node1.addDialer(new WebRTCDialer({ wrtc }));
    node2.addDialer(new WebRTCDialer({ wrtc }));

    node1.addListener(new WebRTCListener({ wrtc }));
    node2.addListener(new WebRTCListener({ wrtc }));

    gw1.addListener(new MemoryListener());
    gw2.addListener(new MemoryListener());
    node1.addDialer(new MemoryDialer());
    node2.addDialer(new MemoryDialer());

    try {
      await gw1.start();
      await gw2.start();
      await node1.start();
      await node2.start();

      await node1.connect(`memory:${gw1.identity.address}`);
      await node2.connect(`memory:${gw1.identity.address}`);
      await node1.connect(`memory:${gw2.identity.address}`);
      await node2.connect(`memory:${gw2.identity.address}`);

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
      await gw1.stop();
      await gw2.stop();
      await node1.stop();
      await node2.stop();
    }
  });
});
