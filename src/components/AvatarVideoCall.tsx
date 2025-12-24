import { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, MicOff, Phone, Monitor, MessageSquare, Volume2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { RealtimeChat, RealtimeEvent } from '@/utils/RealtimeAudio';
import avatarImg from '@/assets/avatar.png';

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
  const chatRef = useRef<RealtimeChat | null>(null);
  const messageIdRef = useRef(0);
  const currentAssistantMessageRef = useRef<string>('');

  // Simulate audio wave animation when speaking
  useEffect(() => {
    if (!isSpeaking) return;
    const interval = setInterval(() => {
      setAudioLevels(prev => prev.map(() => Math.random() * 0.7 + 0.3));
    }, 150);
    return () => clearInterval(interval);
  }, [isSpeaking]);

  const handleTranscript = useCallback((text: string, role: 'user' | 'assistant') => {
    if (role === 'user') {
      // Add completed user message
      setMessages(prev => [...prev, {
        id: ++messageIdRef.current,
        sender: 'user',
        text
      }]);
    } else {
      // For assistant, accumulate the transcript
      currentAssistantMessageRef.current += text;
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.sender === 'agent') {
          // Update last assistant message
          return prev.map((m, i) =>
            i === prev.length - 1
              ? { ...m, text: currentAssistantMessageRef.current }
              : m
          );
        } else {
          // Create new assistant message
          return [...prev, {
            id: ++messageIdRef.current,
            sender: 'agent',
            text: currentAssistantMessageRef.current
          }];
        }
      });
    }
  }, []);

  const handleMessage = useCallback((event: RealtimeEvent) => {
    // Reset assistant message accumulator when a new response starts
    if (event.type === 'response.created') {
      currentAssistantMessageRef.current = '';
    }
  }, []);

  const startConversation = useCallback(async () => {
    try {
      setStatus('connecting');
      
      chatRef.current = new RealtimeChat({
        onMessage: handleMessage,
        onSpeakingChange: setIsSpeaking,
        onTranscript: handleTranscript,
        onStatusChange: setStatus,
        onError: (error) => {
          console.error('Realtime error:', error);
          toast({
            variant: 'destructive',
            title: 'Connection Error',
            description: error.message || 'Failed to connect to AI agent'
          });
        }
      });

      await chatRef.current.init();
      
      toast({
        title: 'Connected',
        description: 'AI Support Agent is ready to help you'
      });
    } catch (error) {
      console.error('Error starting conversation:', error);
      setStatus('disconnected');
    }
  }, [handleMessage, handleTranscript, toast]);

  const endConversation = useCallback(() => {
    chatRef.current?.disconnect();
    chatRef.current = null;
    setStatus('disconnected');
    setIsSpeaking(false);
    toast({
      title: 'Disconnected',
      description: 'Session ended'
    });
  }, [toast]);

  const sendTextMessage = useCallback(() => {
    if (!inputText.trim() || status !== 'connected') return;

    try {
      chatRef.current?.sendTextMessage(inputText);
      setMessages(prev => [...prev, {
        id: ++messageIdRef.current,
        sender: 'user',
        text: inputText
      }]);
      setInputText('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to send message'
      });
    }
  }, [inputText, status, toast]);

  useEffect(() => {
    return () => {
      chatRef.current?.disconnect();
    };
  }, []);

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="glass-strong rounded-2xl overflow-hidden shadow-card">
        {/* Video call header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${
              status === 'connected' ? 'bg-primary animate-pulse' :
              status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
              'bg-muted-foreground'
            }`} />
            <span className="text-sm font-medium text-foreground">AI IT Support Agent</span>
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
          <div className="flex-1 relative bg-gradient-dark min-h-[400px] lg:min-h-[500px]">
            {/* Glow effect behind avatar */}
            <div className="absolute inset-0 bg-gradient-glow" />

            {/* Avatar image */}
            <div className="relative z-10 flex items-center justify-center h-full p-8">
              <div className="relative">
                <div className={`absolute -inset-4 rounded-full blur-2xl transition-opacity ${
                  isSpeaking ? 'bg-primary/30 opacity-100' : 'bg-primary/20 opacity-50'
                }`} />
                <img
                  src={avatarImg}
                  alt="AI Support Avatar"
                  className={`relative w-64 h-64 lg:w-80 lg:h-80 rounded-full object-cover transition-all ${
                    isSpeaking ? 'shadow-glow' : 'shadow-card'
                  }`}
                />
                {/* Speaking indicator */}
                {status === 'connected' && (
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-card/90 backdrop-blur px-3 py-1.5 rounded-full border border-border/50">
                    {isSpeaking ? (
                      <>
                        <div className="flex gap-0.5">
                          {[0, 1, 2, 3, 4].map((i) => (
                            <div
                              key={i}
                              className="w-1 bg-primary rounded-full animate-wave"
                              style={{
                                height: '12px',
                                animationDelay: `${i * 0.1}s`,
                              }}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground ml-2">Speaking...</span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">Listening...</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Call controls */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3">
              {status === 'disconnected' ? (
                <Button
                  variant="hero"
                  size="lg"
                  onClick={startConversation}
                  className="rounded-full"
                >
                  <Phone className="w-5 h-5 mr-2" />
                  Start Call
                </Button>
              ) : status === 'connecting' ? (
                <Button
                  variant="secondary"
                  size="lg"
                  disabled
                  className="rounded-full"
                >
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Connecting...
                </Button>
              ) : (
                <>
                  <Button
                    variant={isMuted ? "destructive" : "glass"}
                    size="iconLg"
                    onClick={() => setIsMuted(!isMuted)}
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
          <div className="lg:w-96 border-t lg:border-t-0 lg:border-l border-border/50 flex flex-col max-h-[500px]">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
              <MessageSquare className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Live Transcript</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && status === 'disconnected' && (
                <div className="text-center text-muted-foreground text-sm py-8">
                  Click "Start Call" to begin talking with the AI Support Agent
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
              <div className="flex items-center gap-2 bg-secondary rounded-xl px-4 py-3">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendTextMessage()}
                  placeholder={status === 'connected' ? "Type a message..." : "Connect to send messages"}
                  disabled={status !== 'connected'}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
                />
                <Button
                  size="sm"
                  variant="hero"
                  onClick={sendTextMessage}
                  disabled={status !== 'connected' || !inputText.trim()}
                >
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
