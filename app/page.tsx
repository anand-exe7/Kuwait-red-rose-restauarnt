import Link from 'next/link';
import { UtensilsCrossed, Clock, Star, ArrowRight } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#fafafa] text-[#111] flex flex-col font-sans relative overflow-hidden">
      
      {/* Decorative background blur */}
      <div className="absolute top-0 right-0 w-[50vw] h-[50vw] bg-orange-100 rounded-full blur-[100px] pointer-events-none opacity-60 translate-x-1/2 -translate-y-1/2" />

      {/* Navbar */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 h-24 flex items-center justify-between">
        <h1 className="text-3xl font-black tracking-tighter">Cenexa</h1>
        <Link href="/customer" className="px-6 py-3 bg-black text-white rounded-full font-bold text-sm hover:bg-orange-500 transition-colors shadow-lg shadow-black/10">
          Order Now
        </Link>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-center gap-12 py-12">
        
        <div className="flex-1 flex flex-col items-start gap-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-100 text-orange-600 font-bold text-sm">
            <Star size={16} className="fill-orange-500" /> Rated 4.9/5 by foodies
          </div>
          <h2 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9]">
            Taste the <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-500">Difference.</span>
          </h2>
          <p className="text-xl text-gray-500 max-w-md leading-relaxed">
            Experience culinary excellence with our premium curated menu. Order from your table and enjoy the fastest service.
          </p>
          <div className="flex gap-4">
            <Link href="/customer" className="group px-8 py-4 bg-black text-white rounded-full font-bold text-lg hover:bg-orange-500 transition-colors shadow-xl shadow-black/20 flex items-center gap-2">
              View Menu
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>

        <div className="flex-1 relative">
          <div className="relative w-full aspect-square max-w-[500px] mx-auto">
            <div className="absolute inset-0 bg-gradient-to-tr from-orange-500 to-yellow-400 rounded-full blur-[60px] opacity-20" />
            <img src="https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=800" alt="Signature Dish" className="relative z-10 w-full h-full object-cover rounded-full border-8 border-white shadow-2xl" />
            
            {/* Floating badge */}
            <div className="absolute -bottom-6 -left-6 z-20 bg-white p-4 rounded-2xl shadow-xl flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center text-orange-500">
                <Clock size={24} />
              </div>
              <div>
                <p className="font-bold">Fast Service</p>
                <p className="text-sm text-gray-500">Avg. 15 min wait</p>
              </div>
            </div>
          </div>
        </div>

      </main>

    </div>
  );
}
