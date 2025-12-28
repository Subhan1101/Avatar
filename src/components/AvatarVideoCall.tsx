import { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, MicOff, Phone, Monitor, MessageSquare, Volume2, Loader2, AudioLines } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { DIDClient } from '@/utils/DIDClient';
import { supabase } from '@/integrations/supabase/client';

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
  const [isProcessing, setIsProcessing] = useState(false);

  const [isListening, setIsListening] = useState(false);

  const didRef = useRef<DIDClient | null>(null);
  const messageIdRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const lastProcessedRef = useRef<number>(0);
  const speechUnavailableRef = useRef(false);

  // Echo-prevention: track when the avatar last finished speaking + what it last said
  const lastSpeakingEndRef = useRef<number>(0);
  const lastAgentUtteranceRef = useRef<string>('');
  const handleVoiceInputRef = useRef<(text: string) => void>(() => {});

  // Start listening (manual: only when user taps the mic)
  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    if (status !== 'connected') return;
    if (isProcessing || isSpeaking) return;

    try {
      recognitionRef.current.start();
      setIsListening(true);
      console.log('Started listening...');
    } catch (error) {
      console.error('Error starting speech recognition:', error);
    }
  }, [status, isProcessing, isSpeaking]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch (e) {
      // Ignore
    }
    setIsListening(false);
  }, []);

  // Initialize Speech Recognition (single-shot; no auto restart)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        console.log('Voice input:', transcript);
        if (transcript.trim()) {
          handleVoiceInputRef.current(transcript.trim());
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  // Stop listening when muted
  useEffect(() => {
    if (isMuted) {
      stopListening();
    }
  }, [isMuted, stopListening]);

  // Stop listening when avatar is speaking or processing
  useEffect(() => {
    if (isSpeaking || isProcessing) {
      stopListening();
    }
  }, [isSpeaking, isProcessing, stopListening]);

  // Update timestamp when avatar stops speaking
  useEffect(() => {
    if (!isSpeaking) {
      lastSpeakingEndRef.current = Date.now();
    }
  }, [isSpeaking]);

  const handleVoiceInput = useCallback(
    async (transcript: string) => {
      if (!transcript || status !== 'connected' || isProcessing) return;

      const now = Date.now();

      // Debounce: prevent processing if we just processed something
      if (now - lastProcessedRef.current < 2000) {
        console.log('Debouncing voice input, too soon after last request');
        return;
      }

      // Strong echo filter: ignore anything shortly after the avatar stops speaking
      const msSinceSpeaking = now - lastSpeakingEndRef.current;
      const normalized = transcript.trim().toLowerCase();
      const words = normalized.split(/\s+/).filter(Boolean);
      const lastAgent = lastAgentUtteranceRef.current.trim().toLowerCase();

      // 1) Ignore very short utterances right after the avatar spoke (most common echo case: "hello")
      if (msSinceSpeaking < 8000 && words.length <= 2) {
        console.log('Ignoring short voice input right after avatar speech (likely echo):', transcript);
        return;
      }

      // 2) Ignore anything that matches words from the last agent utterance right after it spoke
      if (msSinceSpeaking < 15000 && lastAgent && lastAgent.includes(normalized)) {
        console.log('Ignoring voice input that matches last agent utterance (likely echo):', transcript);
        return;
      }

      lastProcessedRef.current = now;

      // Add user message
      setMessages((prev) => [
        ...prev,
        {
          id: ++messageIdRef.current,
          sender: 'user',
          text: transcript,
        },
      ]);

      // Get AI response and make avatar speak
      await getAIResponse(transcript);
    },
    [status, isProcessing],
  );

  useEffect(() => {
    handleVoiceInputRef.current = handleVoiceInput;
  }, [handleVoiceInput]);

  const toggleMute = useCallback(() => {
    if (status !== 'connected') return;

    if (isMuted) {
      // Unmute and listen once (manual mode)
      setIsMuted(false);
      startListening();
    } else {
      // Mute and stop listening
      setIsMuted(true);
      stopListening();
    }
  }, [status, isMuted, startListening, stopListening]);

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

  const startConversation = useCallback(
    async () => {
      try {
        setStatus('connecting');

        if (!videoRef.current) {
          throw new Error('Video element not found');
        }

        console.log('Initializing D-ID avatar...');
        didRef.current = new DIDClient(DID_AGENT_ID, {
          onConnected: () => {
            console.log('D-ID avatar connected');
            setStatus('connected');

            // Send initial greeting
            setTimeout(async () => {
              const greeting = "Hello! I'm Aria, your friendly IT support assistant. How can I help you today?";
              lastAgentUtteranceRef.current = greeting;
              const ok = await didRef.current?.speak(greeting);
              if (ok === false) showSpeechUnavailable();

              setMessages([
                {
                  id: ++messageIdRef.current,
                  sender: 'agent',
                  text: greeting,
                },
              ]);
            }, 1000);
          },
          onDisconnected: () => {
            console.log('D-ID avatar disconnected');
            setStatus('disconnected');
          },
          onSpeakingStart: () => setIsSpeaking(true),
          onSpeakingEnd: () => setIsSpeaking(false),
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
            console.log('Stream ready');
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
            }
          },
        });

        await didRef.current.init(videoRef.current);

        toast({
          title: 'Connected',
          description: 'AI Support Agent Aria is ready to help!',
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
    },
    [toast, showSpeechUnavailable],
  );

  const endConversation = useCallback(() => {
    didRef.current?.disconnect();
    didRef.current = null;
    setStatus('disconnected');
    setIsSpeaking(false);
    setMessages([]);
    toast({
      title: 'Disconnected',
      description: 'Session ended',
    });
  }, [toast]);

  // Get AI response and make avatar speak it
  const getAIResponse = useCallback(
    async (userMessage: string) => {
      setIsProcessing(true);

      try {
        // Use Lovable AI to generate response
        const { data, error } = await supabase.functions.invoke('ai-chat', {
          body: { message: userMessage },
        });

        if (error) throw error;

        const aiResponse = data?.response || "I'm sorry, I couldn't process that. Could you please try again?";

        // Add AI response to messages
        setMessages((prev) => [
          ...prev,
          {
            id: ++messageIdRef.current,
            sender: 'agent',
            text: aiResponse,
          },
        ]);

        // Make avatar speak the response with lip-sync
        lastAgentUtteranceRef.current = aiResponse;
        const ok = await didRef.current?.speak(aiResponse);
        if (ok === false) showSpeechUnavailable();
      } catch (error) {
        console.error('Error getting AI response:', error);
        const errorMessage = "I'm having trouble connecting right now. Please try again.";
        setMessages((prev) => [
          ...prev,
          {
            id: ++messageIdRef.current,
            sender: 'agent',
            text: errorMessage,
          },
        ]);
        lastAgentUtteranceRef.current = errorMessage;
        const ok = await didRef.current?.speak(errorMessage);
        if (ok === false) showSpeechUnavailable();
      } finally {
        setIsProcessing(false);
      }
    },
    [showSpeechUnavailable],
  );

  const sendTextMessage = useCallback(async () => {
    if (!inputText.trim() || status !== 'connected' || isProcessing) return;

    const userMessage = inputText.trim();
    setInputText('');

    // Add user message
    setMessages(prev => [...prev, {
      id: ++messageIdRef.current,
      sender: 'user',
      text: userMessage
    }]);

    // Get AI response and make avatar speak
    await getAIResponse(userMessage);
  }, [inputText, status, isProcessing, getAIResponse]);

  useEffect(() => {
    return () => {
      didRef.current?.disconnect();
    };
  }, []);

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="glass-strong rounded-2xl overflow-hidden shadow-card">
        {/* Video call header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${
              status === 'connected' ? 'bg-primary animate-pulse' :
              status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
              'bg-muted-foreground'
            }`} />
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
                  className={`w-1 rounded-full transition-all duration-150 ${
                    isSpeaking ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
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
              {/* HeyGen Avatar Video */}
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
                <div className={`flex items-center justify-center transition-all ${
                  status === 'connecting' ? 'animate-pulse' : ''
                }`}>
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

              {/* Speaking indicator overlay */}
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
                  ) : isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                      <span className="text-sm text-muted-foreground">Thinking...</span>
                    </>
                  ) : isMuted ? (
                    <>
                      <MicOff className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Mic off</span>
                    </>
                  ) : isListening ? (
                    <>
                      <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                      <span className="text-sm text-muted-foreground">Listening...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Tap mic to talk</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Call controls */}
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3">
              {status === 'disconnected' ? (
                <Button
                  variant="hero"
                  size="lg"
                  onClick={startConversation}
                  className="rounded-full px-8"
                >
                  <Phone className="w-5 h-5 mr-2" />
                  Start Call
                </Button>
              ) : status === 'connecting' ? (
                <Button
                  variant="secondary"
                  size="lg"
                  disabled
                  className="rounded-full px-8"
                >
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Connecting...
                </Button>
              ) : (
                <>
                  <Button
                    variant={isMuted ? "destructive" : "glass"}
                    size="iconLg"
                    onClick={toggleMute}
                    className="rounded-full"
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </Button>
                  <Button
                    variant="glass"
                    size="iconLg"
                    className="rounded-full"
                  >
                    <Monitor className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="iconLg"
                    className="rounded-full"
                    onClick={endConversation}
                  >
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
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && status === 'disconnected' && (
                <div className="text-center text-muted-foreground text-sm py-8">
                  Click "Start Call" to begin talking with Aria
                </div>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
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
              {isListening && (
                <p className="text-xs text-primary mb-2 text-center animate-pulse flex items-center justify-center gap-2">
                  <AudioLines className="w-3 h-3" />
                  Listening... Just speak naturally
                </p>
              )}
              <div className="flex items-center gap-2 bg-secondary rounded-xl px-4 py-3">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendTextMessage()}
                  placeholder={status === 'connected' ? "Or type a message..." : "Connect to send messages"}
                  disabled={status !== 'connected' || isProcessing}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
                />
                <Button
                  size="sm"
                  variant="hero"
                  onClick={sendTextMessage}
                  disabled={status !== 'connected' || !inputText.trim() || isProcessing}
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
