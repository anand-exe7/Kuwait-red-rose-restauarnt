import Link from 'next/link';
import { Clock, Star, ArrowRight, ShoppingBag } from 'lucide-react';
import { BRAND } from './lib/brand';

export default function Home() {
  return (
    <div className="min-h-screen w-full bg-brand-cream text-brand-ink flex flex-col font-sans relative overflow-x-hidden">

      {/* Decorative background wash */}
      <div className="absolute top-0 right-0 w-[70vw] h-[70vw] sm:w-[50vw] sm:h-[50vw] bg-brand-gold/20 rounded-full blur-[80px] sm:blur-[100px] pointer-events-none opacity-70 translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 left-0 w-[60vw] h-[60vw] sm:w-[40vw] sm:h-[40vw] bg-brand-red/10 rounded-full blur-[80px] sm:blur-[100px] pointer-events-none opacity-60 -translate-x-1/3 translate-y-1/3" />

      {/* Navbar */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 h-20 sm:h-24 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.logo} alt={BRAND.fullName} className="h-11 sm:h-14 w-auto rounded-xl shadow-md" />
        </div>
        <Link
          href="/customer"
          className="px-4 py-2.5 sm:px-6 sm:py-3 bg-brand-red text-white rounded-full font-bold text-xs sm:text-sm hover:bg-brand-red-dark transition-colors shadow-lg shadow-brand-red/20 active:scale-95"
        >
          Order Now
        </Link>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-center gap-10 sm:gap-12 py-8 sm:py-12">

        <div className="flex-1 flex flex-col gap-6 sm:gap-8 text-center md:text-left items-center md:items-start">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-brand-red/10 text-brand-red font-bold text-xs sm:text-sm">
            <Star size={14} className="fill-brand-gold text-brand-gold shrink-0 sm:w-4 sm:h-4" /> Kuwait’s finest sweets
          </div>
          <h2 className="text-4xl sm:text-6xl lg:text-7xl xl:text-8xl font-black tracking-tighter leading-[0.95] sm:leading-[0.9]">
            Taste the <br/>
            <span className="text-brand-red">Red Rose</span> <span className="text-brand-plum">difference.</span>
          </h2>
          <p className="text-base sm:text-xl text-brand-ink/60 max-w-md leading-relaxed">
            Freshly made Arabic & continental sweets. Scan your table’s QR, browse the menu, and order in seconds.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto justify-center md:justify-start">
            <Link href="/customer" className="group px-6 py-3.5 sm:px-8 sm:py-4 bg-brand-red text-white rounded-full font-bold text-base sm:text-lg hover:bg-brand-red-dark transition-colors shadow-xl shadow-brand-red/20 flex items-center gap-2 active:scale-95 justify-center">
              View Menu
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/takeaway" className="group px-6 py-3.5 sm:px-8 sm:py-4 bg-white text-brand-ink border border-brand-gold/40 rounded-full font-bold text-base sm:text-lg hover:border-brand-red hover:text-brand-red transition-colors shadow-lg flex items-center gap-2 active:scale-95 justify-center">
              <ShoppingBag size={20} /> Takeaway
            </Link>
          </div>
        </div>

        <div className="flex-1 relative w-full max-w-[320px] sm:max-w-[420px] md:max-w-none mt-4 md:mt-0">
          <div className="relative w-full aspect-square max-w-[320px] sm:max-w-[420px] md:max-w-[500px] mx-auto">
            <div className="absolute inset-0 bg-gradient-to-tr from-brand-red/20 to-brand-gold/30 rounded-full blur-[60px] opacity-40" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://images.unsplash.com/photo-1571115177098-24ec42ed204d?auto=format&fit=crop&q=80&w=800" alt="Signature sweets" className="relative z-10 w-full h-full object-cover rounded-full border-4 sm:border-8 border-white shadow-2xl" />

            {/* Floating badge */}
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-auto sm:-bottom-6 sm:-left-6 z-20 bg-white p-3 sm:p-4 rounded-2xl shadow-xl flex items-center gap-3 sm:gap-4 whitespace-nowrap border border-brand-gold/20">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand-red/10 rounded-full flex items-center justify-center text-brand-red shrink-0">
                <Clock size={20} className="sm:w-6 sm:h-6" />
              </div>
              <div>
                <p className="font-bold text-sm sm:text-base">Fresh & Fast</p>
                <p className="text-xs sm:text-sm text-brand-ink/50">Made to order</p>
              </div>
            </div>
          </div>
        </div>

      </main>

      <footer className="relative z-10 text-center py-6 text-xs text-brand-ink/40">
        {BRAND.fullName} · {BRAND.city}
      </footer>
    </div>
  );
}
