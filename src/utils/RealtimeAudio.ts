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
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected') => void;
};

// Audio recorder for capturing user's microphone
export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  constructor(private onAudioData: (audioData: Float32Array) => void) {}

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      this.audioContext = new AudioContext({ sampleRate: 24000 });
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        this.onAudioData(new Float32Array(inputData));
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  }

  stop() {
    this.source?.disconnect();
    this.processor?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    this.audioContext?.close();
    this.source = null;
    this.processor = null;
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

export class RealtimeChat {
  private ws: WebSocket | null = null;
  private recorder: AudioRecorder | null = null;
  private callbacks: RealtimeChatCallbacks;
  private isRecording = false;

  constructor(callbacks: RealtimeChatCallbacks) {
    this.callbacks = callbacks;
  }

  async init() {
    try {
      this.callbacks.onStatusChange?.('connecting');
      console.log('Initializing realtime chat with WebSocket...');

      // Get ephemeral token from edge function
      const { data, error } = await supabase.functions.invoke('realtime-session');

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
        this.callbacks.onStatusChange?.('connected');
        
        // Start recording user audio
        this.startRecording();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleEvent(data);
        } catch (e) {
          console.error('Error parsing WebSocket message:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.callbacks.onError?.(new Error('WebSocket connection error'));
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed');
        this.callbacks.onStatusChange?.('disconnected');
        this.stopRecording();
      };

    } catch (error) {
      console.error("Error initializing chat:", error);
      this.callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      this.callbacks.onStatusChange?.('disconnected');
      throw error;
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
      });
      
      await this.recorder.start();
      this.isRecording = true;
      console.log('Audio recording started');
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
        console.log('Session created, configuring with improved settings...');
        // Configure session with better VAD and response settings
        this.ws?.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            voice: 'shimmer',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.6, // Higher threshold to reduce false triggers
              prefix_padding_ms: 400, // More padding for cleaner audio
              silence_duration_ms: 800, // Faster response after user stops speaking
              create_response: true // Auto-create response when speech ends
            },
            temperature: 0.7, // Slightly lower for more consistent responses
            max_response_output_tokens: 500 // Limit response length for faster replies
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

      case 'error':
        console.error('Realtime API error:', event);
        this.callbacks.onError?.(new Error(JSON.stringify(event)));
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
    this.stopRecording();
    this.ws?.close();
    this.ws = null;
    this.callbacks.onStatusChange?.('disconnected');
  }
}
