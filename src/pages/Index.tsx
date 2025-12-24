import { Header } from '@/components/Header';
import { AvatarVideoCall } from '@/components/AvatarVideoCall';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Main content - centered video call */}
      <main className="pt-24 pb-12 px-6">
        <AvatarVideoCall />
      </main>
    </div>
  );
};

export default Index;
