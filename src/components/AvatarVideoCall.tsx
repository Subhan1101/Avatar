import { useState, useEffect } from 'react';
import { Mic, MicOff, Phone, Monitor, MessageSquare, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import avatarImg from '@/assets/avatar.png';

interface Message {
  id: number;
  sender: 'user' | 'agent';
  text: string;
}

const demoConversation: Message[] = [
  { id: 1, sender: 'agent', text: "Hello! I'm your AI IT Support Agent. How can I help you today?" },
  { id: 2, sender: 'user', text: "Hi, I'm having trouble logging into my account." },
  { id: 3, sender: 'agent', text: "I'd be happy to help with that. Can I share my screen with you to guide you through the steps?" },
  { id: 4, sender: 'user', text: "Yes, please go ahead." },
  { id: 5, sender: 'agent', text: "I can see your screen now. I notice the username format isn't quite right. It should start with a backslash followed by the domain." },
];

export const AvatarVideoCall = () => {
  const [isMuted, setIsMuted] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [audioLevels, setAudioLevels] = useState([0.3, 0.5, 0.8, 0.4, 0.6]);

  // Simulate conversation flow
  useEffect(() => {
    if (currentMessageIndex < demoConversation.length) {
      const timeout = setTimeout(() => {
        setIsTyping(true);
        setTimeout(() => {
          setMessages(prev => [...prev, demoConversation[currentMessageIndex]]);
          setIsTyping(false);
          setCurrentMessageIndex(prev => prev + 1);
        }, 1000);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [currentMessageIndex]);

  // Simulate audio wave animation
  useEffect(() => {
    const interval = setInterval(() => {
      setAudioLevels(prev => prev.map(() => Math.random() * 0.7 + 0.3));
    }, 150);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="glass-strong rounded-2xl overflow-hidden shadow-card">
        {/* Video call header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-medium text-foreground">AI IT Support Agent</span>
            <span className="text-xs text-muted-foreground">• Connected</span>
          </div>
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-muted-foreground" />
            <div className="flex items-end gap-0.5 h-4">
              {audioLevels.map((level, i) => (
                <div
                  key={i}
                  className="w-1 bg-primary rounded-full transition-all duration-150"
                  style={{ height: `${level * 100}%` }}
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
                <div className="absolute -inset-4 bg-primary/20 rounded-full blur-2xl animate-pulse" />
                <img
                  src={avatarImg}
                  alt="AI Support Avatar"
                  className="relative w-64 h-64 lg:w-80 lg:h-80 rounded-full object-cover shadow-glow"
                />
                {/* Speaking indicator */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-card/90 backdrop-blur px-3 py-1.5 rounded-full border border-border/50">
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
                </div>
              </div>
            </div>

            {/* Call controls */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3">
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
                onClick={() => setIsConnected(!isConnected)}
              >
                <Phone className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Chat section */}
          <div className="lg:w-96 border-t lg:border-t-0 lg:border-l border-border/50 flex flex-col max-h-[500px]">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
              <MessageSquare className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Live Transcript</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-secondary rounded-2xl rounded-bl-md px-4 py-2.5">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="p-4 border-t border-border/50">
              <div className="flex items-center gap-2 bg-secondary rounded-xl px-4 py-3">
                <input
                  type="text"
                  placeholder="Type a message..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <Button size="sm" variant="hero">
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
