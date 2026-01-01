import { supabase } from '@/integrations/supabase/client';

export type RealtimeEvent = {
  type: string;
  event_id?: string;
  delta?: string;
  response_id?: string;
  item_id?: string;
  output_index?: number;
  transcript?: string;
  audio?: string;
  [key: string]: unknown;
};

export type RealtimeChatCallbacks = {
  onMessage?: (event: RealtimeEvent) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
  onAudioData?: (audioData: Uint8Array) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting') => void;
  onNetworkIssue?: (message: string) => void;
};

export type AudioSettings = {
  bufferSize: number;
  silenceDuration: number;
  prefixPadding: number;
  threshold: number;
};

// Audio recorder for capturing user's microphone with configurable buffer size
export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private outputGain: GainNode | null = null;
  private bufferSize: number;

  constructor(
    private onAudioData: (audioData: Float32Array) => void,
    bufferSize: number = 4096
  ) {
    this.bufferSize = bufferSize;
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.audioContext = new AudioContext({ sampleRate: 24000 });
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(this.bufferSize, 1, 1);

      // Important: avoid routing mic audio to speakers (feedback loop).
      // ScriptProcessor must be connected in the graph to run, so we connect to a muted gain node.
      this.outputGain = this.audioContext.createGain();
      this.outputGain.gain.value = 0;

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        this.onAudioData(new Float32Array(inputData));
      };

      this.source.connect(this.processor);
      this.processor.connect(this.outputGain);
      this.outputGain.connect(this.audioContext.destination);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  }

  stop() {
    this.source?.disconnect();
    this.processor?.disconnect();
    this.outputGain?.disconnect();

    this.stream?.getTracks().forEach((track) => track.stop());
    this.audioContext?.close();

    this.source = null;
    this.processor = null;
    this.outputGain = null;
    this.stream = null;
    this.audioContext = null;
  }
}

// Encode audio for OpenAI API (Float32 -> PCM16 -> Base64)
export const encodeAudioForAPI = (float32Array: Float32Array): string => {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  const uint8Array = new Uint8Array(int16Array.buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }

  return btoa(binary);
};

// Decode base64 audio to Uint8Array (for Simli)
export const decodeAudioFromAPI = (base64Audio: string): Uint8Array => {
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// Retry utility with exponential backoff
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  maxDelay: number = 10000
): Promise<T> => {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) break;
      
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = delay * 0.1 * Math.random();
      
      console.log(`Retry attempt ${attempt + 1}/${maxRetries} in ${delay + jitter}ms`);
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }
  
  throw lastError;
};

export class RealtimeChat {
  private ws: WebSocket | null = null;
  private recorder: AudioRecorder | null = null;
  private callbacks: RealtimeChatCallbacks;
  private isRecording = false;
  private audioSettings: AudioSettings;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isIntentionalDisconnect = false;
  private pingInterval: NodeJS.Timeout | null = null;
  private lastPongTime = Date.now();
  private connectionTimeout: NodeJS.Timeout | null = null;

  constructor(callbacks: RealtimeChatCallbacks, audioSettings?: AudioSettings) {
    this.callbacks = callbacks;
    this.audioSettings = audioSettings || {
      bufferSize: 4096,
      silenceDuration: 800,
      prefixPadding: 400,
      threshold: 0.6,
    };
  }

  updateAudioSettings(settings: AudioSettings) {
    this.audioSettings = settings;
    console.log('Updated audio settings for network quality:', settings);
  }

  async init() {
    try {
      this.isIntentionalDisconnect = false;
      this.callbacks.onStatusChange?.('connecting');
      console.log('Initializing realtime chat with WebSocket...');

      // Set connection timeout
      this.connectionTimeout = setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          console.log('Connection timeout, attempting reconnect...');
          this.callbacks.onNetworkIssue?.('Connection is taking longer than expected. Please wait...');
          this.attemptReconnect();
        }
      }, 15000);

      // Get ephemeral token from edge function with retry
      const { data, error } = await retryWithBackoff(
        () => supabase.functions.invoke('realtime-session'),
        3,
        1000,
        5000
      );

      if (error) {
        console.error('Error getting session token:', error);
        throw new Error(`Failed to get session token: ${error.message}`);
      }

      if (!data?.client_secret?.value) {
        console.error('Invalid session response:', data);
        throw new Error("Failed to get ephemeral token from session");
      }

      const EPHEMERAL_KEY = data.client_secret.value;
      console.log('Got ephemeral token, creating WebSocket connection...');

      // Connect via WebSocket (not WebRTC) to get audio data
      const wsUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`;
      
      this.ws = new WebSocket(wsUrl, [
        'realtime',
        `openai-insecure-api-key.${EPHEMERAL_KEY}`,
        'openai-beta.realtime-v1'
      ]);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.clearConnectionTimeout();
        this.reconnectAttempts = 0;
        this.callbacks.onStatusChange?.('connected');
        this.lastPongTime = Date.now();
        
        // Start heartbeat to detect connection issues
        this.startHeartbeat();
        
        // Start recording user audio with network-optimized buffer size
        this.startRecording();
      };

      this.ws.onmessage = (event) => {
        try {
          this.lastPongTime = Date.now(); // Any message counts as activity
          const data = JSON.parse(event.data);
          this.handleEvent(data);
        } catch (e) {
          console.error('Error parsing WebSocket message:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.callbacks.onNetworkIssue?.('Connection issue detected. Trying to reconnect...');
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        this.clearConnectionTimeout();
        this.stopHeartbeat();
        this.stopRecording();
        
        if (!this.isIntentionalDisconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect();
        } else {
          this.callbacks.onStatusChange?.('disconnected');
        }
      };

    } catch (error) {
      console.error("Error initializing chat:", error);
      this.clearConnectionTimeout();
      
      if (!this.isIntentionalDisconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.callbacks.onNetworkIssue?.('Having trouble connecting. Retrying...');
        this.attemptReconnect();
      } else {
        this.callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
        this.callbacks.onStatusChange?.('disconnected');
      }
    }
  }

  private clearConnectionTimeout() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      // Check if we haven't received anything in 30 seconds
      if (Date.now() - this.lastPongTime > 30000) {
        console.log('Connection appears stale, reconnecting...');
        this.callbacks.onNetworkIssue?.('Connection lost. Reconnecting...');
        this.attemptReconnect();
      }
    }, 10000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private async attemptReconnect() {
    this.reconnectAttempts++;
    console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    
    this.ws?.close();
    this.ws = null;
    this.stopRecording();
    
    if (this.reconnectAttempts <= this.maxReconnectAttempts) {
      this.callbacks.onStatusChange?.('reconnecting');
      
      // Exponential backoff with jitter
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);
      const jitter = delay * 0.1 * Math.random();
      
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
      
      if (!this.isIntentionalDisconnect) {
        await this.init();
      }
    } else {
      this.callbacks.onError?.(new Error('Failed to reconnect after multiple attempts'));
      this.callbacks.onStatusChange?.('disconnected');
    }
  }

  private async startRecording() {
    try {
      this.recorder = new AudioRecorder((audioData) => {
        if (this.ws?.readyState === WebSocket.OPEN && this.isRecording) {
          const base64Audio = encodeAudioForAPI(audioData);
          this.ws.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64Audio
          }));
        }
      }, this.audioSettings.bufferSize);
      
      await this.recorder.start();
      this.isRecording = true;
      console.log('Audio recording started with buffer size:', this.audioSettings.bufferSize);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }

  private stopRecording() {
    this.isRecording = false;
    this.recorder?.stop();
    this.recorder = null;
  }

  private handleEvent(event: RealtimeEvent) {
    console.log('Received event:', event.type);
    this.callbacks.onMessage?.(event);

    switch (event.type) {
      case 'session.created':
        console.log('Session created, configuring with network-optimized settings...');
        // Configure session with network-adaptive VAD and response settings
        this.ws?.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            voice: 'shimmer',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            // NOTE: We intentionally do NOT enable Whisper input transcription here.
            // It can hit rate limits (429) and is not required for audio-to-audio responses.
            turn_detection: {
              type: 'server_vad',
              threshold: this.audioSettings.threshold,
              prefix_padding_ms: this.audioSettings.prefixPadding,
              silence_duration_ms: this.audioSettings.silenceDuration,
              create_response: true
            },
            temperature: 0.7,
            max_response_output_tokens: 500
          }
        }));
        break;

      case 'response.audio.delta':
        // This is the key - we receive audio data here and send to Simli
        if (event.delta) {
          const audioData = decodeAudioFromAPI(event.delta);
          this.callbacks.onAudioData?.(audioData);
        }
        this.callbacks.onSpeakingChange?.(true);
        break;

      case 'response.audio.done':
        this.callbacks.onSpeakingChange?.(false);
        break;

      case 'response.audio_transcript.delta':
        if (event.delta) {
          this.callbacks.onTranscript?.(event.delta, 'assistant');
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript) {
          this.callbacks.onTranscript?.(event.transcript as string, 'user');
        }
        break;

      case 'conversation.item.input_audio_transcription.failed':
        // Transcription failed but OpenAI may still process audio
        console.warn('Audio transcription failed:', event);
        // Don't treat as fatal error - the model can still respond to audio
        break;

      case 'error':
        console.error('Realtime API error:', event);
        // Only report critical errors
        if (event.error && typeof event.error === 'object') {
          const errorObj = event.error as { type?: string; message?: string };
          if (errorObj.type !== 'invalid_request_error') {
            this.callbacks.onError?.(new Error(errorObj.message || JSON.stringify(event)));
          }
        }
        break;
    }
  }

  sendTextMessage(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not ready');
    }

    // Create conversation item
    this.ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text
        }]
      }
    }));

    // Request response
    this.ws.send(JSON.stringify({ type: 'response.create' }));
  }

  setMuted(muted: boolean) {
    this.isRecording = !muted;
  }

  disconnect() {
    console.log('Disconnecting realtime chat...');
    this.isIntentionalDisconnect = true;
    this.stopHeartbeat();
    this.clearConnectionTimeout();
    this.stopRecording();
    this.ws?.close();
    this.ws = null;
    this.callbacks.onStatusChange?.('disconnected');
  }
}
