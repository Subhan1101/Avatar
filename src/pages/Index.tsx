import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { AvatarVideoCall } from '@/components/AvatarVideoCall';
import { FeatureGrid } from '@/components/FeatureGrid';
import { HowItWorks } from '@/components/HowItWorks';
import { TechStack } from '@/components/TechStack';
import { Footer } from '@/components/Footer';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <Hero />

      {/* Demo Section */}
      <section id="demo" className="py-24 px-6">
        <div className="max-w-6xl mx-auto text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Experience the <span className="text-gradient">Demo</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            See our AI avatar in action. This interactive demo shows how the support experience works.
          </p>
        </div>
        <AvatarVideoCall />
      </section>

      {/* Features Section */}
      <section id="features">
        <FeatureGrid />
      </section>

      {/* How It Works Section */}
      <section id="how-it-works">
        <HowItWorks />
      </section>

      {/* Tech Stack */}
      <TechStack />

      <Footer />
    </div>
  );
};

export default Index;
