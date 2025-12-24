import { Bot, Github, Twitter } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-strong">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground">AI Support Agent</span>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          <a href="#demo" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Demo
          </a>
          <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Features
          </a>
          <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            How It Works
          </a>
          <a href="#docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Docs
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="iconSm">
            <Github className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="iconSm">
            <Twitter className="w-4 h-4" />
          </Button>
          <Button variant="hero" size="sm">
            Get Started
          </Button>
        </div>
      </div>
    </header>
  );
};
