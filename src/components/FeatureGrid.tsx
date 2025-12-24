import { Monitor, Shield, Zap, MessageSquare, Eye, Mail } from 'lucide-react';

const features = [
  {
    icon: Eye,
    title: 'Screen Vision',
    description: 'AI sees your screen in real-time to identify issues and guide you through solutions step by step.',
  },
  {
    icon: Monitor,
    title: 'Screen Sharing',
    description: 'Share your screen instantly with the AI agent for hands-on troubleshooting assistance.',
  },
  {
    icon: MessageSquare,
    title: 'Natural Conversation',
    description: 'Speak naturally with a hyper-realistic avatar that understands context and responds intelligently.',
  },
  {
    icon: Zap,
    title: 'Instant Resolution',
    description: 'Get immediate help without waiting in queue. AI resolves common IT issues in seconds.',
  },
  {
    icon: Mail,
    title: 'Ticket Automation',
    description: 'Automatically generates support tickets with full context when escalation is needed.',
  },
  {
    icon: Shield,
    title: 'Secure & Private',
    description: 'Enterprise-grade security ensures your data and conversations remain confidential.',
  },
];

export const FeatureGrid = () => {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Next-Gen IT Support <span className="text-gradient">Capabilities</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Our AI avatar combines cutting-edge technology to deliver human-like support experiences.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group glass rounded-2xl p-6 hover:border-primary/50 transition-all duration-300 hover:-translate-y-1"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center mb-4 group-hover:shadow-glow transition-shadow">
                <feature.icon className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
