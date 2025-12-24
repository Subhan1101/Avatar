export const TechStack = () => {
  const technologies = [
    { name: 'OpenAI GPT-4o', description: 'Realtime conversational AI' },
    { name: 'Whisper', description: 'Speech-to-text transcription' },
    { name: 'WebRTC', description: 'Real-time audio streaming' },
    { name: 'Lovable Cloud', description: 'Backend infrastructure' },
    { name: 'React', description: 'Frontend framework' },
    { name: 'TTS', description: 'Natural voice synthesis' },
  ];

  return (
    <section className="py-16 px-6 border-y border-border/30">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Powered By Industry Leaders
          </h3>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          {technologies.map((tech) => (
            <div key={tech.name} className="group text-center">
              <div className="text-lg font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                {tech.name}
              </div>
              <div className="text-xs text-muted-foreground/60 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {tech.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
