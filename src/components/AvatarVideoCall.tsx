import { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, MicOff, Phone, Monitor, MonitorOff, MessageSquare, Volume2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { DIDClient } from '@/utils/DIDClient';
import { RealtimeChat } from '@/utils/RealtimeAudio';

// Your D-ID Agent ID
const DID_AGENT_ID = 'v2_agt_FsyLjsn-';

interface Message {
  id: number;
  sender: 'user' | 'agent';
  text: string;
}

export const AvatarVideoCall = () => {
  const { toast } = useToast();
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [audioLevels, setAudioLevels] = useState([0.3, 0.5, 0.8, 0.4, 0.6]);
  const [isListening, setIsListening] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const didRef = useRef<DIDClient | null>(null);
  const realtimeChatRef = useRef<RealtimeChat | null>(null);
  const messageIdRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const speechUnavailableRef = useRef(false);
  const currentTranscriptRef = useRef<string>('');
  const pendingUserTranscriptRef = useRef<string>('');

  // Audio wave animation when speaking
  useEffect(() => {
    if (!isSpeaking) return;
    const interval = setInterval(() => {
      setAudioLevels((prev) => prev.map(() => Math.random() * 0.7 + 0.3));
    }, 150);
    return () => clearInterval(interval);
  }, [isSpeaking]);

  const showSpeechUnavailable = useCallback(() => {
    if (speechUnavailableRef.current) return;
    speechUnavailableRef.current = true;
    toast({
      variant: 'destructive',
      title: 'Avatar voice unavailable',
      description: 'The avatar cannot speak right now (insufficient credits). Chat will continue without voice.',
    });
  }, [toast]);

  const startConversation = useCallback(async () => {
    try {
      setStatus('connecting');

      if (!videoRef.current) {
        throw new Error('Video element not found');
      }

      console.log('Initializing D-ID avatar...');

      // First initialize D-ID for avatar video
      didRef.current = new DIDClient(DID_AGENT_ID, {
        onConnected: async () => {
          console.log('D-ID avatar connected, now starting OpenAI Realtime...');

          // Now start OpenAI Realtime for voice
          try {
            realtimeChatRef.current = new RealtimeChat({
              onStatusChange: (s) => {
                console.log('Realtime status:', s);
                if (s === 'connected') {
                  setStatus('connected');
                  setIsListening(true);

                  // Send initial greeting via D-ID
                  setTimeout(async () => {
                    const greeting = "Hello! I'm Aria, your friendly IT support assistant. How can I help you today?";
                    setMessages([{ id: ++messageIdRef.current, sender: 'agent', text: greeting }]);
                    const ok = await didRef.current?.speak(greeting);
                    if (ok === false) showSpeechUnavailable();
                  }, 500);
                } else if (s === 'disconnected') {
                  setIsListening(false);
                }
              },
              onSpeakingChange: (speaking) => {
                setIsSpeaking(speaking);
              },
              onTranscript: (text, role) => {
                console.log(`Transcript [${role}]:`, text);

                if (role === 'user') {
                  // User transcript from Whisper
                  pendingUserTranscriptRef.current += text;
                } else if (role === 'assistant') {
                  // Assistant transcript - accumulate for D-ID
                  currentTranscriptRef.current += text;
                }
              },
              onMessage: async (event) => {
                // When assistant response is complete, add to messages and make D-ID speak
                if (event.type === 'response.audio_transcript.done') {
                  const fullText = currentTranscriptRef.current.trim();
                  if (fullText) {
                    setMessages((prev) => [...prev, { id: ++messageIdRef.current, sender: 'agent', text: fullText }]);
                    
                    // Make D-ID avatar speak with lip sync
                    const ok = await didRef.current?.speak(fullText);
                    if (ok === false) showSpeechUnavailable();
                  }
                  currentTranscriptRef.current = '';
                }

                // When user finishes speaking, add their message
                if (event.type === 'conversation.item.input_audio_transcription.completed') {
                  const userText = (event.transcript as string)?.trim();
                  if (userText) {
                    setMessages((prev) => [...prev, { id: ++messageIdRef.current, sender: 'user', text: userText }]);
                  }
                  pendingUserTranscriptRef.current = '';
                }

                // Handle interruption - user started speaking while assistant was talking
                if (event.type === 'input_audio_buffer.speech_started') {
                  console.log('User interrupted - speech started');
                  // The server VAD will handle stopping the current response
                }
              },
              onError: (error) => {
                console.error('Realtime error:', error);
                toast({
                  variant: 'destructive',
                  title: 'Voice Error',
                  description: 'Voice connection error. Please try again.',
                });
              },
            });

            await realtimeChatRef.current.init();
          } catch (error) {
            console.error('Failed to initialize OpenAI Realtime:', error);
            toast({
              variant: 'destructive',
              title: 'Voice Error',
              description: 'Failed to start voice. Avatar video will work without voice input.',
            });
            setStatus('connected');
          }
        },
        onDisconnected: () => {
          console.log('D-ID avatar disconnected');
          setStatus('disconnected');
          realtimeChatRef.current?.disconnect();
        },
        onSpeakingStart: () => {
          // D-ID speaking state is controlled by our calls, not needed here
        },
        onSpeakingEnd: () => {
          // D-ID speaking state is controlled by our calls
        },
        onError: (error) => {
          console.error('D-ID error:', error);
          toast({
            variant: 'destructive',
            title: 'Avatar Error',
            description: error.message || 'Failed to initialize avatar',
          });
          setStatus('disconnected');
        },
        onStreamReady: (stream) => {
          console.log('D-ID stream ready');
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        },
      });

      await didRef.current.init(videoRef.current);

      toast({
        title: 'Connecting',
        description: 'Setting up voice and video...',
      });
    } catch (error) {
      console.error('Error starting conversation:', error);
      setStatus('disconnected');
      toast({
        variant: 'destructive',
        title: 'Connection Failed',
        description: error instanceof Error ? error.message : 'Failed to start conversation',
      });
    }
  }, [toast, showSpeechUnavailable]);

  const endConversation = useCallback(() => {
    realtimeChatRef.current?.disconnect();
    realtimeChatRef.current = null;
    didRef.current?.disconnect();
    didRef.current = null;
    setStatus('disconnected');
    setIsSpeaking(false);
    setIsListening(false);
    setMessages([]);
    toast({
      title: 'Disconnected',
      description: 'Session ended',
    });
  }, [toast]);

  const toggleMute = useCallback(() => {
    if (status !== 'connected') return;

    const newMuted = !isMuted;
    setIsMuted(newMuted);
    realtimeChatRef.current?.setMuted(newMuted);
    setIsListening(!newMuted);

    toast({
      title: newMuted ? 'Microphone Off' : 'Microphone On',
      description: newMuted ? 'You are now muted' : 'You can speak now - just talk naturally!',
    });
  }, [status, isMuted, toast]);

  const sendTextMessage = useCallback(async () => {
    if (!inputText.trim() || status !== 'connected') return;

    const userMessage = inputText.trim();
    setInputText('');

    // Add user message
    setMessages((prev) => [...prev, { id: ++messageIdRef.current, sender: 'user', text: userMessage }]);

    // Send via OpenAI Realtime
    try {
      realtimeChatRef.current?.sendTextMessage(userMessage);
    } catch (error) {
      console.error('Error sending text message:', error);
    }
  }, [inputText, status]);

  // Capture screen and send to AI
  const captureAndAnalyzeScreen = useCallback(async () => {
    if (!screenStreamRef.current || !isScreenSharing) return;

    try {
      const videoTrack = screenStreamRef.current.getVideoTracks()[0];
      if (!videoTrack) return;

      // Create canvas to capture frame
      if (!screenCanvasRef.current) {
        screenCanvasRef.current = document.createElement('canvas');
      }
      const canvas = screenCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Create video element to draw from stream
      const video = document.createElement('video');
      video.srcObject = screenStreamRef.current;
      video.muted = true;
      await video.play();

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      // Convert to base64
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      
      video.pause();
      video.srcObject = null;

      // Send to AI with the screenshot
      const analysisPrompt = "I'm sharing my screen. Please look at this screenshot and help me with any issues you see. If there's an error, explain what's wrong and how to fix it.";
      
      setMessages((prev) => [...prev, { id: ++messageIdRef.current, sender: 'user', text: '📸 [Screen shared for analysis]' }]);
      
      // Send to OpenAI Realtime with image context
      if (realtimeChatRef.current) {
        realtimeChatRef.current.sendTextMessage(`${analysisPrompt}\n\n[Screen capture attached - analyzing the visible content on screen]`);
      }

      toast({
        title: 'Screen Captured',
        description: 'Aria is analyzing your screen...',
      });

    } catch (error) {
      console.error('Error capturing screen:', error);
      toast({
        variant: 'destructive',
        title: 'Capture Failed',
        description: 'Failed to capture screen for analysis',
      });
    }
  }, [isScreenSharing, toast]);

  // Toggle screen sharing
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      // Stop screen sharing
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
      setIsScreenSharing(false);
      toast({
        title: 'Screen Share Ended',
        description: 'Screen sharing has been stopped',
      });
    } else {
      try {
        // Start screen sharing
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        screenStreamRef.current = stream;
        setIsScreenSharing(true);

        // Listen for when user stops sharing via browser UI
        stream.getVideoTracks()[0].onended = () => {
          screenStreamRef.current = null;
          setIsScreenSharing(false);
          toast({
            title: 'Screen Share Ended',
            description: 'Screen sharing was stopped',
          });
        };

        toast({
          title: 'Screen Sharing Active',
          description: 'Click the screen share button again to capture and analyze your screen',
        });

        // Automatically capture after a short delay
        setTimeout(() => {
          captureAndAnalyzeScreen();
        }, 1000);

      } catch (error) {
        console.error('Error starting screen share:', error);
        if ((error as Error).name !== 'NotAllowedError') {
          toast({
            variant: 'destructive',
            title: 'Screen Share Failed',
            description: 'Could not start screen sharing. Please try again.',
          });
        }
      }
    }
  }, [isScreenSharing, toast, captureAndAnalyzeScreen]);

  useEffect(() => {
    return () => {
      realtimeChatRef.current?.disconnect();
      didRef.current?.disconnect();
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="glass-strong rounded-2xl overflow-hidden shadow-card">
        {/* Video call header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${
                status === 'connected'
                  ? 'bg-primary animate-pulse'
                  : status === 'connecting'
                  ? 'bg-yellow-500 animate-pulse'
                  : 'bg-muted-foreground'
              }`}
            />
            <span className="text-sm font-medium text-foreground">AI IT Support Agent - Aria</span>
            <span className="text-xs text-muted-foreground">
              • {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting...' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-muted-foreground" />
            <div className="flex items-end gap-0.5 h-4">
              {audioLevels.map((level, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-150 ${isSpeaking ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                  style={{ height: isSpeaking ? `${level * 100}%` : '30%' }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row">
          {/* Avatar video section */}
          <div className="flex-1 relative bg-gradient-to-b from-secondary/50 to-background min-h-[500px] lg:min-h-[600px]">
            <div className="absolute inset-0 bg-gradient-radial from-primary/5 via-transparent to-transparent" />

            <div className="relative z-10 flex items-center justify-center h-full">
              {/* D-ID Avatar Video */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className={`w-full h-full object-contain max-h-[550px] transition-all ${
                  status === 'connected' ? 'opacity-100' : 'opacity-0 absolute'
                }`}
              />

              {/* Placeholder when not connected */}
              {status !== 'connected' && (
                <div className={`flex items-center justify-center transition-all ${status === 'connecting' ? 'animate-pulse' : ''}`}>
                  {status === 'connecting' ? (
                    <div className="text-center">
                      <Loader2 className="w-16 h-16 text-primary animate-spin mx-auto mb-4" />
                      <p className="text-muted-foreground">Initializing avatar...</p>
                      <p className="text-muted-foreground/60 text-sm mt-2">This may take a moment</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="w-32 h-32 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
                        <Phone className="w-16 h-16 text-primary/60" />
                      </div>
                      <p className="text-muted-foreground text-lg mb-2">Ready to assist</p>
                      <p className="text-muted-foreground/60 text-sm">Click "Start Call" to begin</p>
                    </div>
                  )}
                </div>
              )}

              {/* Speaking/Listening indicator overlay */}
              {status === 'connected' && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-card/90 backdrop-blur-sm px-4 py-2 rounded-full border border-border/50 shadow-lg">
                  {isSpeaking ? (
                    <>
                      <div className="flex gap-0.5">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className="w-1.5 bg-primary rounded-full animate-wave"
                            style={{
                              height: '16px',
                              animationDelay: `${i * 0.1}s`,
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-sm text-foreground font-medium ml-2">Speaking...</span>
                    </>
                  ) : isMuted ? (
                    <>
                      <MicOff className="w-4 h-4 text-destructive" />
                      <span className="text-sm text-muted-foreground">Microphone off</span>
                    </>
                  ) : isListening ? (
                    <>
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-sm text-green-600 font-medium">Listening... Just speak!</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Ready</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Call controls */}
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3">
              {status === 'disconnected' ? (
                <Button variant="hero" size="lg" onClick={startConversation} className="rounded-full px-8">
                  <Phone className="w-5 h-5 mr-2" />
                  Start Call
                </Button>
              ) : status === 'connecting' ? (
                <Button variant="secondary" size="lg" disabled className="rounded-full px-8">
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Connecting...
                </Button>
              ) : (
                <>
                  <Button
                    variant={isMuted ? 'destructive' : 'glass'}
                    size="iconLg"
                    onClick={toggleMute}
                    className="rounded-full"
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </Button>
                  <Button 
                    variant={isScreenSharing ? 'default' : 'glass'} 
                    size="iconLg" 
                    className={`rounded-full ${isScreenSharing ? 'bg-primary animate-pulse' : ''}`}
                    onClick={toggleScreenShare}
                    title={isScreenSharing ? 'Click to capture screen' : 'Share screen'}
                  >
                    {isScreenSharing ? <Monitor className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                  </Button>
                  <Button variant="destructive" size="iconLg" className="rounded-full" onClick={endConversation}>
                    <Phone className="w-5 h-5" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Chat section */}
          <div className="lg:w-96 border-t lg:border-t-0 lg:border-l border-border/50 flex flex-col max-h-[600px]">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
              <MessageSquare className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Live Transcript</span>
              {isListening && !isMuted && (
                <span className="ml-auto text-xs text-green-600 animate-pulse">● Live</span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && status === 'disconnected' && (
                <div className="text-center text-muted-foreground text-sm py-8">
                  Click "Start Call" to begin talking with Aria
                </div>
              )}
              {messages.length === 0 && status === 'connected' && (
                <div className="text-center text-muted-foreground text-sm py-8">
                  Just speak naturally - Aria is listening!
                </div>
              )}
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      message.sender === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-secondary text-secondary-foreground rounded-bl-md'
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Input area */}
            <div className="p-4 border-t border-border/50">
              {status === 'connected' && !isMuted && (
                <p className="text-xs text-green-600 mb-2 text-center">
                  🎤 Voice active - speak anytime to interrupt!
                </p>
              )}
              <div className="flex items-center gap-2 bg-secondary rounded-xl px-4 py-3">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendTextMessage()}
                  placeholder={status === 'connected' ? 'Or type a message...' : 'Connect to send messages'}
                  disabled={status !== 'connected'}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
                />
                <Button size="sm" variant="hero" onClick={sendTextMessage} disabled={status !== 'connected' || !inputText.trim()}>
                  Send
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
