import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

const steps = [
  {
    number: '01',
    title: 'Connect with Avatar',
    description: 'Click to start a live video session with your AI support agent.',
  },
  {
    number: '02',
    title: 'Describe Your Issue',
    description: 'Speak naturally about your IT problem. The avatar understands context.',
  },
  {
    number: '03',
    title: 'Share Your Screen',
    description: 'Let the AI see exactly what you see for accurate troubleshooting.',
  },
  {
    number: '04',
    title: 'Get Instant Help',
    description: 'Follow guided steps or get automatic fixes applied to resolve issues.',
  },
];

const benefits = [
  'Hyper-realistic avatar with natural expressions',
  'Real-time screen analysis and guidance',
  'Automatic ticket creation and escalation',
  'Integration with existing IT systems',
  'Multilingual support in 50+ languages',
  'Works 24/7 without breaks',
];

export const HowItWorks = () => {
  return (
    <section className="py-24 px-6 bg-gradient-dark">
      <div className="max-w-6xl mx-auto">
        {/* How it works */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            How It <span className="text-gradient">Works</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Get IT support in four simple steps. No more waiting on hold or scheduling appointments.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-24">
          {steps.map((step, index) => (
            <div key={step.number} className="relative">
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-full w-full h-0.5 bg-gradient-to-r from-primary/50 to-transparent" />
              )}
              <div className="glass rounded-2xl p-6 h-full">
                <div className="text-4xl font-bold text-gradient mb-4">{step.number}</div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Benefits */}
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
              Why Choose AI Avatar Support?
            </h3>
            <div className="space-y-4">
              {benefits.map((benefit) => (
                <div key={benefit} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-foreground">{benefit}</span>
                </div>
              ))}
            </div>
            <Button variant="hero" size="lg" className="mt-8">
              Get Started Today
            </Button>
          </div>

          <div className="glass rounded-2xl p-8">
            <div className="text-center">
              <div className="text-5xl font-bold text-gradient mb-2">73%</div>
              <div className="text-muted-foreground mb-6">Reduction in support costs</div>
              
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="bg-secondary rounded-xl p-4">
                  <div className="text-2xl font-bold text-foreground">4.9/5</div>
                  <div className="text-xs text-muted-foreground">User Satisfaction</div>
                </div>
                <div className="bg-secondary rounded-xl p-4">
                  <div className="text-2xl font-bold text-foreground">2min</div>
                  <div className="text-xs text-muted-foreground">Avg. Resolution</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
