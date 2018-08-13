const { Node } = require('@twlv/core');
const { MemoryFinder } = require('@twlv/core/finders/memory');
const { MemoryDialer, MemoryListener } = require('@twlv/core/transports/memory');
const { WebRTCDialer, WebRTCListener, WebRTCSignaler } = require('..');
const assert = require('assert');
// const wrtc = require('electron-webrtc')(); // TODO: electron wrtc leak?
const wrtc = require('wrtc'); // TODO: node wrtc leak?

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

    node1.addListener(new WebRTCListener({ wrtc, signalers: [ gw.identity.address ] }));
    node2.addListener(new WebRTCListener({ wrtc, signalers: [ gw.identity.address ] }));

    node1.addDialer(new MemoryDialer());
    node2.addDialer(new MemoryDialer());

    try {
      await node1.start();
      await node2.start();

      try {
        await node2.connect(`wrtc:${node1.identity.address}`);
        throw new Error('Oops');
      } catch (err) {
        if (err.message !== 'WebRTC Dial timeout') {
          throw err;
        }
      }
    } finally {
      await node1.stop();
      await node2.stop();
    }
  });

  it('send to other peer via gateway', async () => {
    let gw1 = new Node();
    // let gw2 = new Node();
    let node1 = new Node();
    let node2 = new Node();

    let signaler1 = new WebRTCSignaler(gw1);
    // let signaler2 = new WebRTCSignaler(gw2);

    gw1.addFinder(new MemoryFinder());
    // gw2.addFinder(new MemoryFinder());
    node1.addFinder(new MemoryFinder());
    node2.addFinder(new MemoryFinder());

    node1.addDialer(new WebRTCDialer({ wrtc, signalers: [ gw1.identity.address ] }));
    node2.addDialer(new WebRTCDialer({ wrtc, signalers: [ gw1.identity.address ] }));
    node1.addListener(new WebRTCListener({ wrtc, signalers: [ gw1.identity.address ] }));
    node2.addListener(new WebRTCListener({ wrtc, signalers: [ gw1.identity.address ] }));

    gw1.addListener(new MemoryListener());
    // gw2.addListener(new MemoryListener());
    node1.addDialer(new MemoryDialer());
    node2.addDialer(new MemoryDialer());

    try {
      await gw1.start();
      // await gw2.start();
      await node1.start();
      await node2.start();

      await signaler1.start();
      // await signaler2.start();

      await node1.connect(`memory:${gw1.identity.address}`);
      await node2.connect(`memory:${gw1.identity.address}`);
      // // await node1.connect(`memory:${gw2.identity.address}`);
      // // await node2.connect(`memory:${gw2.identity.address}`);

      node2.on('message', message => {
        if (message.command.startsWith('transport:webrtc')) {
          return;
        }

        assert.strictEqual(message.command, 'foo');
        assert.strictEqual(message.payload.toString(), 'bar');
      });

      // console.log(node1.identity.address, 'to', node2.identity.address);
      await node1.send({
        to: node2.identity.address,
        command: 'foo',
        payload: 'bar',
      });
    } finally {
      await signaler1.stop();
      // await signaler2.stop();

      await gw1.stop();
      // await gw2.stop();

      await node1.stop();
      await node2.stop();
    }
  });
});
