declare module 'microphone-stream' {
  import { Transform } from 'stream';

  interface MicrophoneStreamOptions {
    objectMode?: boolean;
    bitDepth?: number;
    encoding?: string;
    rate?: number;
    channels?: number;
    additionalFlags?: string[];
    device?: string;
    debug?: boolean;
  }

  class MicrophoneStream extends Transform {
    constructor(options?: MicrophoneStreamOptions);
    
    setStream(stream: MediaStream): void;
    
    stop(): void;
    
    pauseRecording(): void;
    
    playRecording(): void;
    
    on(event: 'data', listener: (chunk: Buffer) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: string | symbol, listener: (...args: unknown[]) => void): this;
  }

  export = MicrophoneStream;
} 