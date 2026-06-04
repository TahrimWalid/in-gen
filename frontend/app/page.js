import Canvas from '@/components/Canvas';
import Sidebar from '@/components/Sidebar';

export default function Home() {
  return (
    <main className="w-screen h-screen bg-slate-50 flex overflow-hidden">
      <Sidebar />
      <div className="flex-1 h-full">
        <Canvas />
      </div>
    </main>
  );
}