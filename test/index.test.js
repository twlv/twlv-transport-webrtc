const { Node } = require('@twlv/core');
const { MemoryFinder } = require('@twlv/core/finders/memory');
const { MemoryDialer, MemoryReceiver } = require('@twlv/core/transports/memory');
const { WebRTCDialer, WebRTCReceiver, WebRTCSignaler } = require('..');
const assert = require('assert');
const wrtc = require('wrtc');

describe('WebRTC Transport', () => {
  before(() => process.on('unhandledRejection', err => console.error('Unhandled', err)));
  after(() => process.removeAllListeners('unhandledRejection'));

  it('got timeout', async () => {
    let node1 = new Node();
    let node2 = new Node();
    let gw = new Node();

    node1.addFinder(new MemoryFinder());
    node2.addFinder(new MemoryFinder());

    node1.addDialer(new WebRTCDialer({ wrtc, signalers: [ gw.identity.address ], timeout: 500 }));
    node2.addDialer(new WebRTCDialer({ wrtc, signalers: [ gw.identity.address ], timeout: 500 }));

    node1.addReceiver(new WebRTCReceiver({ wrtc, signalers: [ gw.identity.address ] }));
    node2.addReceiver(new WebRTCReceiver({ wrtc, signalers: [ gw.identity.address ] }));

    node1.addDialer(new MemoryDialer());
    node2.addDialer(new MemoryDialer());

    try {
      await node1.start();
      await node2.start();

      await node2.connect(`wrtc:${node1.identity.address}`);
      throw new Error('Oops');
    } catch (err) {
      if (err.message !== 'WebRTC Dial timeout') {
        throw err;
      }
    } finally {
      await node1.stop();
      await node2.stop();
    }
  });

  it('send to other peer via gateway', async () => {
    let gw1 = new Node();
    let node1 = new Node();
    let node2 = new Node();

    gw1.addFinder(new MemoryFinder());
    gw1.addHandler(new WebRTCSignaler());

    node1.addFinder(new MemoryFinder());
    node2.addFinder(new MemoryFinder());

    node1.addDialer(new WebRTCDialer({ wrtc, signalers: [ gw1.identity.address ] }));
    node2.addDialer(new WebRTCDialer({ wrtc, signalers: [ gw1.identity.address ] }));
    node1.addReceiver(new WebRTCReceiver({ wrtc, signalers: [ gw1.identity.address ] }));
    node2.addReceiver(new WebRTCReceiver({ wrtc, signalers: [ gw1.identity.address ] }));

    gw1.addReceiver(new MemoryReceiver());

    node1.addDialer(new MemoryDialer());
    node2.addDialer(new MemoryDialer());

    try {
      await gw1.start();

      await node1.start();
      await node2.start();

      await node1.connect(`memory:${gw1.identity.address}`);
      await node2.connect(`memory:${gw1.identity.address}`);

      node2.on('message', message => {
        if (message.command.startsWith('transport:webrtc')) {
          return;
        }

        assert.strictEqual(message.command, 'foo');
        assert.strictEqual(message.payload.toString(), 'bar');
      });

      await node1.send({
        to: node2.identity.address,
        command: 'foo',
        payload: 'bar',
      });
    } finally {
      await gw1.stop();
      await node1.stop();
      await node2.stop();
    }
  });
});
