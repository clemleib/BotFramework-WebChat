import hasResolved from 'has-resolved';

import playCognitiveServicesStream from './playCognitiveServicesStream';

function createMockAudioContext(autoEndCount = Infinity) {
  const audioContext = {
    connectedNodes: [],
    createBuffer(channels, frames, samplesPerSec) {
      const channelData = new Array(channels).fill(new Array(frames));

      return {
        channelData,
        duration: 1,
        getChannelData(channel) {
          return channelData[channel];
        },
        samplesPerSec
      };
    },
    createBufferSource() {
      const bufferSource = {
        buffer: null,
        connect(destination) {
          destination.push(bufferSource);
        },
        onended: null,
        start(time) {
          bufferSource.startAtTime = time;

          autoEndCount-- > 0 &&
            setTimeout(() => {
              bufferSource.onended && bufferSource.onended();
            }, 0);
        },
        startAtTime: NaN,
        stop() {
          bufferSource.stopped = true;
        }
      };

      return bufferSource;
    },
    currentTime: 0,
    destination: {
      push(node) {
        audioContext.connectedNodes.push(node);
      }
    }
  };

  return audioContext;
}

function createStreamReader(chunks) {
  return {
    read() {
      const chunk = chunks.shift();

      if (chunk) {
        return {
          on(resolve) {
            resolve({
              buffer: chunk,
              isEnd: false
            });
          }
        };
      } else {
        return {
          on(resolve) {
            resolve({ isEnd: true });
          }
        };
      }
    }
  };
}

test('should play 16-bit chunked stream to AudioContext', async () => {
  const audioContext = createMockAudioContext();
  const chunks = [new Uint8Array([0, 0]).buffer, new Uint8Array([0, 128]).buffer];

  await playCognitiveServicesStream(
    audioContext,
    {
      bitsPerSample: 16,
      channels: 1,
      samplesPerSec: 16000
    },
    createStreamReader(chunks)
  );

  const nodes = audioContext.connectedNodes.map(bufferSource => {
    return {
      channelData: new Float32Array(bufferSource.buffer.channelData),
      startAtTime: bufferSource.startAtTime,
      samplesPerSec: bufferSource.buffer.samplesPerSec
    };
  });

  expect(nodes).toMatchInlineSnapshot(`
    Array [
      Object {
        "channelData": Float32Array [
          0,
        ],
        "samplesPerSec": 16000,
        "startAtTime": 0,
      },
      Object {
        "channelData": Float32Array [
          -1,
        ],
        "samplesPerSec": 16000,
        "startAtTime": 1,
      },
    ]
  `);
});

test('should stop when abort is called after all buffer queued', async () => {
  const audioContext = createMockAudioContext(1);
  const chunks = [new Uint8Array([0, 0]).buffer, new Uint8Array([0, 128]).buffer];
  const abortController = new AbortController();

  const promise = playCognitiveServicesStream(
    audioContext,
    {
      bitsPerSample: 16,
      channels: 1,
      samplesPerSec: 16000
    },
    createStreamReader(chunks),
    { signal: abortController.signal }
  );

  abortController.abort();

  await expect(promise).rejects.toThrow('abort');

  expect(audioContext.connectedNodes.every(bufferSource => bufferSource.stopped)).toBeTruthy();
});

test('should stop when abort is called before first buffer is queued', async () => {
  const audioContext = createMockAudioContext();
  const abortController = new AbortController();
  const read = jest.fn(() => ({
    on() {}
  }));

  const playPromise = playCognitiveServicesStream(
    audioContext,
    {
      bitsPerSample: 16,
      channels: 1,
      samplesPerSec: 16000
    },
    { read },
    { signal: abortController.signal }
  );

  await expect(hasResolved(playPromise)).resolves.toBeFalsy();

  abortController.abort();

  await expect(playPromise).rejects.toThrow('aborted');
});
