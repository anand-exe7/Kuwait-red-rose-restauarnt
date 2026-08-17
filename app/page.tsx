import Link from 'next/link';
import { UtensilsCrossed, Clock, Star, ArrowRight } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen w-full bg-[#fafafa] text-[#111] flex flex-col font-sans relative overflow-x-hidden">

      {/* Decorative background blur */}
      <div className="absolute top-0 right-0 w-[70vw] h-[70vw] sm:w-[50vw] sm:h-[50vw] bg-orange-100 rounded-full blur-[80px] sm:blur-[100px] pointer-events-none opacity-60 translate-x-1/2 -translate-y-1/2" />

      {/* Navbar */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 h-20 sm:h-24 flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tighter">Cenexa</h1>
        <Link href="/customer" className="px-4 py-2.5 sm:px-6 sm:py-3 bg-black text-white rounded-full font-bold text-xs sm:text-sm hover:bg-orange-500 transition-colors shadow-lg shadow-black/10 active:scale-95">
          Order Now
        </Link>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-center gap-10 sm:gap-12 py-8 sm:py-12">

        <div className="flex-1 flex flex-col items-start gap-6 sm:gap-8 text-center md:text-left items-center md:items-start">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-orange-100 text-orange-600 font-bold text-xs sm:text-sm">
            <Star size={14} className="fill-orange-500 shrink-0 sm:w-4 sm:h-4" /> Rated 4.9/5 by foodies
          </div>
          <h2 className="text-4xl sm:text-6xl lg:text-7xl xl:text-8xl font-black tracking-tighter leading-[0.95] sm:leading-[0.9]">
            Taste the <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-500">Difference.</span>
          </h2>
          <p className="text-base sm:text-xl text-gray-500 max-w-md leading-relaxed">
            Experience culinary excellence with our premium curated menu. Order from your table and enjoy the fastest service.
          </p>
          <div className="flex gap-4 w-full sm:w-auto justify-center md:justify-start">
            <Link href="/customer" className="group px-6 py-3.5 sm:px-8 sm:py-4 bg-black text-white rounded-full font-bold text-base sm:text-lg hover:bg-orange-500 transition-colors shadow-xl shadow-black/20 flex items-center gap-2 active:scale-95 w-full sm:w-auto justify-center">
              View Menu
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>

        <div className="flex-1 relative w-full max-w-[320px] sm:max-w-[420px] md:max-w-none mt-4 md:mt-0">
          <div className="relative w-full aspect-square max-w-[320px] sm:max-w-[420px] md:max-w-[500px] mx-auto">
            <div className="absolute inset-0 bg-gradient-to-tr from-orange-500 to-yellow-400 rounded-full blur-[60px] opacity-20" />
            <img src="https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=800" alt="Signature Dish" className="relative z-10 w-full h-full object-cover rounded-full border-4 sm:border-8 border-white shadow-2xl" />

            {/* Floating badge */}
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-auto sm:-bottom-6 sm:-left-6 z-20 bg-white p-3 sm:p-4 rounded-2xl shadow-xl flex items-center gap-3 sm:gap-4 whitespace-nowrap">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-orange-100 rounded-full flex items-center justify-center text-orange-500 shrink-0">
                <Clock size={20} className="sm:w-6 sm:h-6" />
              </div>
              <div>
                <p className="font-bold text-sm sm:text-base">Fast Service</p>
                <p className="text-xs sm:text-sm text-gray-500">Avg. 15 min wait</p>
              </div>
            </div>
          </div>
        </div>

      </main>

    </div>
  );
}
