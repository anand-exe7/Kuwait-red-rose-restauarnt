import Link from 'next/link';
import {
  ShoppingCart,
  Truck,
  Star,
  Phone,
  MapPin,
  Play,
  ChevronLeft,
  ChevronRight,
  Award,
  Wheat,
  Gift,
  BadgeCheck,
  ArrowRight,
} from 'lucide-react';
import { BRAND } from './lib/brand';

/**
 * Every photo on the landing page lives here so any of them can be swapped in
 * one place. All URLs were checked to resolve before being used.
 */
const IMAGES = {
  hero: 'photo-1549931319-a545dcf3bc73', // assorted bakery pastries
  banner: 'photo-1509365465985-25d11c17e812', // wide dessert table
  macarons: 'photo-1558326567-98ae2405596b',
  croissant: 'photo-1555507036-ab1f4038808a',
  berryTart: 'photo-1488477181946-6428a0291777',
  dates: 'photo-1609501676725-7186f017a4b7',
  saffron: 'photo-1606313564200-e75d5e30476c',
  pistachios: 'photo-1600271886742-f049cd451bba',
  baklava: 'photo-1519676867240-f03562e64548',
  gifting: 'photo-1549465220-1a8b9238cd48',
  sweet1: 'photo-1464195244916-405fa0a82545',
  sweet2: 'photo-1517686469429-8bdb88b9f907',
  sweet3: 'photo-1571506165871-ee72a35bc9d4',
  sweet4: 'photo-1495147466023-ac5c588e2e94',
  sweet5: 'photo-1470337458703-46ad1756a187',
  sweet6: 'photo-1551024506-0bccd828d307',
} as const;

const img = (id: string, w = 700) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&q=80&w=${w}`;

const NAV_LINKS = [
  { label: 'Shop', href: '/customer' },
  { label: 'Our Story', href: '#story' },
  { label: 'Gifting', href: '#gifting' },
  { label: 'Locations', href: '#locations' },
];

const BESTSELLERS = [
  { name: 'Macaron Box', price: '$35.00', image: IMAGES.macarons },
  { name: 'Butter Croissant', price: '$5.00', image: IMAGES.croissant },
  { name: 'Berry Tart', price: '$8.00', image: IMAGES.berryTart },
];

const FLAVOURS = [
  { src: IMAGES.dates, alt: 'Medjool dates' },
  { src: IMAGES.saffron, alt: 'Saffron threads' },
  { src: IMAGES.pistachios, alt: 'Pistachios' },
  { src: IMAGES.baklava, alt: 'Baklava' },
];

const REVIEWS = [
  {
    name: 'Reem A.',
    text: 'The macaron box arrived still cool and the ribbon was perfectly tied. Every shell was flawless — this is our standing order now.',
  },
  {
    name: 'Yousef K.',
    text: 'Ordered a gifting hamper for my mother. The packaging alone made her week, and the baklava tasted like my grandmother made it.',
  },
  {
    name: 'Dana S.',
    text: 'Same-day delivery actually meant same-day. Warm croissants at the office by nine. The whole floor now orders every Thursday.',
  },
];

/** A whisk — lucide has no whisk icon, so it is drawn inline. */
function Whisk({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2v6" />
      <path d="M12 8c-3.9 0-6 3-6 7 0 3 2.7 5 6 5s6-2 6-5c0-4-2.1-7-6-7z" />
      <path d="M12 8v12" />
      <path d="M8.6 9.6c-.9 3-.9 7.2 0 9.9" />
      <path d="M15.4 9.6c.9 3 .9 7.2 0 9.9" />
    </svg>
  );
}

function Stars() {
  return (
    <div className="flex gap-0.5 text-brand-gold">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={12} className="fill-current" />
      ))}
    </div>
  );
}

function ReviewCard({ name, text }: { name: string; text: string }) {
  return (
    <div className="bg-white rounded-xl border border-brand-gold/15 shadow-sm p-4 flex flex-col gap-2">
      <Stars />
      <p className="text-[11.5px] text-brand-ink/65 leading-relaxed">{text}</p>
      <p className="text-[11px] font-bold text-brand-red">{name}</p>
    </div>
  );
}

function Photo({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={img(src, 600)}
      alt={alt}
      loading="lazy"
      className={`w-full object-cover rounded-xl shadow-sm ${className ?? ''}`}
    />
  );
}

export default function Home() {
  return (
    <div className="min-h-screen w-full bg-brand-cream text-brand-ink font-poppins overflow-x-hidden">
      {/* ==================== HERO ==================== */}
      <section className="relative bg-brand-red text-white overflow-hidden">
        {/* Premium sweeping side-wave for the hero pastries */}
        <svg
          aria-hidden
          className="pointer-events-none hidden lg:block absolute left-0 bottom-0 w-full h-[120%] text-brand-cream"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMinYMax slice"
        >
          <path
            fill="currentColor"
            d="M0,900 L0,150 C350,150 550,550 850,900 Z"
          />
        </svg>

        {/* ---------- Nav ---------- */}
        <header className="relative z-30 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={BRAND.logo}
              alt={BRAND.fullName}
              className="h-9 w-9 rounded-full object-cover ring-2 ring-white/40"
            />
            <span className="font-bold text-[13px] sm:text-sm tracking-[0.2em] uppercase">
              Red Rose
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-9 text-[13px] font-medium">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="text-white/90 hover:text-white transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <Link
            href="#contact"
            className="px-4 py-2 sm:px-5 sm:py-2.5 bg-brand-red-dark text-white rounded-md font-bold text-[10px] tracking-[0.15em] uppercase hover:bg-brand-ink transition-colors shadow-md"
          >
            Contact Us
          </Link>
        </header>

        {/* ---------- Hero content ---------- */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 items-center gap-10 lg:gap-4 pt-2 pb-14 sm:pb-16">
          <div className="relative order-2 lg:order-1 flex justify-center lg:justify-start lg:pl-10">
            <div className="absolute -top-1 left-0 sm:left-2 lg:left-2 z-20 w-[76px] h-[76px] sm:w-[88px] sm:h-[88px] rounded-full bg-brand-red text-white flex flex-col items-center justify-center text-center shadow-xl ring-4 ring-brand-cream">
              <Award size={17} className="text-brand-gold" />
              <span className="text-[7.5px] sm:text-[8px] font-bold uppercase tracking-[0.1em] leading-[1.35] mt-1">
                Best
                <br />
                Quality
                <br />
                Bakery
              </span>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img(IMAGES.hero, 900)}
              alt="Assorted freshly baked pastries"
              className="w-[270px] h-[270px] sm:w-[360px] sm:h-[360px] lg:w-[430px] lg:h-[430px] rounded-full object-cover shadow-2xl"
            />
          </div>

          <div className="order-1 lg:order-2 flex flex-col gap-5 text-center lg:text-left items-center lg:items-start">
            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold leading-[1.1] tracking-tight">
              Sweeten Every
              <br />
              Moment.
            </h1>
            <p className="text-sm sm:text-[15px] text-white/75">
              Artisanal Pastries, Delivered.
            </p>
            <Link
              href="/customer"
              className="mt-1 inline-flex items-center px-8 py-3 bg-brand-cream text-brand-red rounded-full font-bold text-[11px] tracking-[0.2em] uppercase hover:bg-white transition-colors shadow-lg"
            >
              Order Now
            </Link>

            <div className="flex items-start gap-8 sm:gap-10 mt-4">
              {[
                { icon: Award, label: 'Finest\nBakery' },
                { icon: Wheat, label: 'Premium\nIngredients' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-2 w-20">
                  <div className="w-11 h-11 rounded-full bg-white/15 ring-1 ring-white/25 flex items-center justify-center">
                    <Icon size={18} className="text-brand-gold" />
                  </div>
                  <span className="text-[10px] font-medium leading-tight text-center whitespace-pre-line text-white/85">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ---------- Info bar ---------- */}
        <div className="relative z-20 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 sm:pb-20">
          <div className="bg-white text-brand-ink rounded-2xl shadow-2xl px-5 py-5 sm:px-7 sm:py-6 flex flex-col lg:flex-row items-center gap-5 lg:gap-7">
            <div className="flex lg:flex-col gap-2.5 shrink-0">
              <a
                href="tel:+96500000000"
                aria-label="Call us"
                className="w-9 h-9 rounded-full bg-brand-red/10 text-brand-red flex items-center justify-center hover:bg-brand-red hover:text-white transition-colors"
              >
                <Phone size={15} />
              </a>
              <a
                href="#locations"
                aria-label="Find us"
                className="w-9 h-9 rounded-full bg-brand-red/10 text-brand-red flex items-center justify-center hover:bg-brand-red hover:text-white transition-colors"
              >
                <MapPin size={15} />
              </a>
            </div>

            <div className="hidden lg:block w-px h-14 bg-brand-gold/25 shrink-0" />

            <p className="flex-1 text-[11.5px] sm:text-xs text-brand-ink/60 leading-relaxed text-center lg:text-left max-w-md">
              We&apos;re a family pastry shop in Kuwait City, baking Arabic and
              French classics fresh every morning. Cardamom, saffron, rose and
              real butter — nothing else.
            </p>

            <div className="flex items-center gap-4 sm:gap-6 shrink-0">
              <button className="flex items-center gap-1.5 px-4 py-2.5 border border-brand-red/50 text-brand-red rounded-full font-bold text-[10px] tracking-[0.13em] uppercase hover:bg-brand-red hover:text-white transition-colors whitespace-nowrap">
                <Play size={10} className="fill-current" /> Watch Video
              </button>

              <div className="text-center shrink-0">
                <p className="text-xl sm:text-2xl font-extrabold leading-none text-brand-ink">
                  12M+
                </p>
                <p className="text-[9.5px] text-brand-ink/55 mt-1">Happy Customers</p>
              </div>

              <Link
                href="/customer"
                className="px-4 py-2.5 bg-brand-red text-white rounded-full font-bold text-[10px] tracking-[0.13em] uppercase hover:bg-brand-red-dark transition-colors whitespace-nowrap"
              >
                Explore Menu
              </Link>
            </div>
          </div>
        </div>

        <svg
          className="absolute bottom-0 left-0 w-full h-16 sm:h-24 text-brand-cream pointer-events-none"
          viewBox="0 0 1440 120"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M0,120 L1440,120 L1440,40 C1100,-20 300,140 0,40 Z"
          />
        </svg>
      </section>

      {/* ==================== BESTSELLERS ==================== */}
      <section className="relative py-14 sm:py-24 overflow-hidden">
        {/* Premium subtle wave filling the right side space */}
        <svg
          className="absolute top-[10%] -right-[15%] w-[45%] h-[80%] text-brand-red pointer-events-none opacity-[0.03]"
          viewBox="0 0 400 800"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M400,0 L400,800 L200,800 C50,600 -50,200 200,0 Z"
          />
        </svg>

        {/* Decorative falling petals for extra premium detail */}
        <svg
          className="absolute top-[25%] right-[8%] w-10 h-10 text-brand-red/40 rotate-45 pointer-events-none drop-shadow-md blur-[1px]"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M12 2C8 2 4 6 4 12C4 18 12 22 12 22C12 22 20 18 20 12C20 6 16 2 12 2Z" />
        </svg>
        <svg
          className="absolute top-[65%] right-[18%] w-14 h-14 text-brand-red/70 -rotate-12 pointer-events-none drop-shadow-lg"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M12 2C8 2 4 6 4 12C4 18 12 22 12 22C12 22 20 18 20 12C20 6 16 2 12 2Z" />
        </svg>
        <svg
          className="absolute top-[40%] left-[8%] w-12 h-12 text-brand-red/60 -rotate-45 pointer-events-none drop-shadow-md"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M12 2C8 2 4 6 4 12C4 18 12 22 12 22C12 22 20 18 20 12C20 6 16 2 12 2Z" />
        </svg>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-4xl font-bold text-center mb-10 sm:mb-12 tracking-tight">
            Our Signature Bestsellers
          </h2>

          <div className="relative">
            <button
              aria-label="Previous"
              className="hidden md:flex absolute -left-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white shadow-lg text-brand-red items-center justify-center hover:bg-brand-red hover:text-white transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              aria-label="Next"
              className="hidden md:flex absolute -right-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white shadow-lg text-brand-red items-center justify-center hover:bg-brand-red hover:text-white transition-colors"
            >
              <ChevronRight size={18} />
            </button>

            <div className="grid sm:grid-cols-3 gap-5 sm:gap-6">
              {BESTSELLERS.map((p) => (
                <article
                  key={p.name}
                  className="group bg-white rounded-2xl shadow-xl border border-brand-gold/10 overflow-hidden flex flex-col"
                >
                  <div className="p-3.5 pb-0">
                    <div className="aspect-[4/3] rounded-xl overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img(p.image, 700)}
                        alt={p.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  </div>
                  <div className="px-4 py-5 flex flex-col items-center gap-3.5 text-center">
                    <h3 className="font-semibold text-[13px]">
                      {p.name} - <span className="text-brand-red font-bold">{p.price}</span>
                    </h3>
                    <button className="px-6 py-2.5 bg-brand-red text-white rounded-full font-bold text-[10px] tracking-[0.15em] uppercase hover:bg-brand-red-dark transition-colors">
                      Add To Cart
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ==================== KUWAIT'S FINEST FLAVORS ==================== */}
      <section id="story" className="relative py-12 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-10 items-center">
          <div className="flex flex-col gap-5 text-center md:text-left items-center md:items-start">
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight">
              Kuwait&apos;s Finest Flavors
            </h2>
            <p className="text-[13px] text-brand-ink/60 leading-[1.9] max-w-md">
              We source Medjool dates from the Gulf, saffron from Iran and
              pistachios from Aleppo, then fold them into recipes our family has
              baked for three generations. Nothing is frozen, and nothing leaves
              the kitchen a day old.
            </p>
            <Link
              href="/customer"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-red text-white rounded-full font-bold text-[10px] tracking-[0.15em] uppercase hover:bg-brand-red-dark transition-colors"
            >
              Explore Menu <ArrowRight size={13} />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {FLAVOURS.map((f, i) => (
              <Photo
                key={f.alt}
                src={f.src}
                alt={f.alt}
                className={`h-32 sm:h-40 ${i % 2 === 1 ? 'sm:mt-6' : ''}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ==================== BIG FEATURE BANNER ==================== */}
      <section className="relative w-full h-[300px] sm:h-[420px] overflow-hidden my-6 sm:my-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img(IMAGES.banner, 1800)}
          alt="A table of Red Rose pastries laid out for sharing"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-ink/80 via-brand-red/55 to-transparent" />
        <div className="relative z-10 h-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-center text-white">
          <div className="max-w-lg flex flex-col gap-4">
            <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-brand-gold">
              Baked fresh since 1998
            </p>
            <h2 className="text-2xl sm:text-4xl font-bold leading-tight tracking-tight">
              Every tray leaves our kitchen the morning you eat it.
            </h2>
            <p className="text-[13px] text-white/80 leading-relaxed">
              Four ovens, eleven pastry chefs, and a rule we have never broken —
              nothing is sold the day after it is baked.
            </p>
            <Link
              href="/customer"
              className="self-start inline-flex items-center gap-2 px-6 py-3 bg-brand-cream text-brand-red rounded-full font-bold text-[11px] tracking-[0.2em] uppercase hover:bg-white transition-colors shadow-lg"
            >
              Order Today <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* ========= RED BAND: GIFTING + HOW IT WORKS + GUARANTEE ========= */}
      <section id="gifting" className="relative bg-brand-red text-white overflow-hidden">
        {/* Massive elegant sweeping top wave matching the reference */}
        <svg
          className="absolute top-0 left-0 w-full h-[140px] sm:h-[280px] text-brand-cream pointer-events-none"
          viewBox="0 0 1440 280"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M0,0 L1440,0 L1440,50 C1000,200 400,280 0,120 Z"
          />
        </svg>

        {/* ---- Luxury Gifting ---- */}
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-36 sm:pt-48 pb-14 grid md:grid-cols-2 gap-10 items-center">
          <div className="flex flex-col gap-5 text-center md:text-left items-center md:items-start">
            <h2 className="text-2xl sm:text-4xl font-bold flex items-center gap-2.5 tracking-tight">
              <Gift size={26} className="text-brand-gold" /> Luxury Gifting
            </h2>
            <p className="text-[13px] text-white/75 leading-[1.9] max-w-md">
              Hand-tied silk ribbon, a hand-written card, and a box built to
              survive the drive. Corporate orders, wedding favours and Eid
              hampers — we deliver anywhere in Kuwait, on the day you name.
            </p>
            <Link
              href="#gifting"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-white text-brand-red rounded-full font-bold text-[10px] tracking-[0.15em] uppercase hover:bg-brand-cream transition-colors"
            >
              View Gifting Collection <ArrowRight size={13} />
            </Link>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img(IMAGES.gifting, 900)}
            alt="Red Rose gift boxes tied with ribbon"
            loading="lazy"
            className="w-full h-[240px] sm:h-[300px] object-cover rounded-2xl shadow-2xl"
          />
        </div>

        {/* ---- How It Works ---- */}
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
          {/* Inner dark-red wave for How It Works to create the 2-tone effect */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150vw] sm:w-[200vw] h-[120%] bg-brand-red-dark/30 -z-10 rounded-[100%_0_100%_0/50%_0_50%_0] transform -skew-y-3" />
          
          <h2 className="text-2xl sm:text-4xl font-bold text-center mb-12 tracking-tight">
            How It Works
          </h2>
          <div className="grid sm:grid-cols-3 gap-10 sm:gap-6">
            {[
              {
                n: '1.',
                title: 'You Order',
                text: 'Pick your favourites and place your order online in under a minute.',
                icon: ShoppingCart,
              },
              {
                n: '2.',
                title: 'We Bake',
                text: 'Our pastry chefs whisk, proof and bake your box fresh that morning.',
                icon: null,
              },
              {
                n: '3.',
                title: 'We Deliver',
                text: 'Same-day delivery across Kuwait City, boxed and beautifully sealed.',
                icon: Truck,
              },
            ].map((s) => (
              <div key={s.title} className="flex flex-col items-center text-center gap-3.5">
                <div className="text-white">
                  {s.icon ? <s.icon size={40} strokeWidth={1.4} /> : <Whisk size={40} />}
                </div>
                <h3 className="font-semibold text-[15px]">
                  <span className="text-brand-gold font-bold">{s.n}</span> {s.title}
                </h3>
                <p className="text-[11.5px] text-white/70 leading-relaxed max-w-[210px]">
                  {s.text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ---- Freshness Guarantee ---- */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 sm:pb-28">
          <div className="bg-brand-red-dark rounded-2xl ring-1 ring-brand-gold/40 px-6 py-6 sm:px-10 sm:py-7 flex flex-col sm:flex-row items-center gap-5 shadow-xl text-center sm:text-left">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-brand-gold text-brand-red flex items-center justify-center shrink-0 shadow-lg ring-4 ring-brand-gold/25">
              <BadgeCheck size={30} />
            </div>
            <div>
              <h3 className="text-lg sm:text-2xl font-bold tracking-tight">
                Freshness Guarantee
              </h3>
              <p className="text-[12.5px] text-white/75 mt-1">
                Freshly baked daily, guaranteed to delight — or we replace the box.
              </p>
            </div>
          </div>
        </div>

        <svg
          className="absolute bottom-0 left-0 w-full h-16 sm:h-24 text-brand-cream pointer-events-none"
          viewBox="0 0 1440 120"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M0,120 L1440,120 L1440,60 C900,160 400,-20 0,80 Z"
          />
        </svg>
      </section>

      {/* ==================== SWEET WORDS ==================== */}
      <section className="relative py-14 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-4xl font-bold text-center mb-10 sm:mb-12 tracking-tight">
            Sweet Words
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-4">
              <Photo src={IMAGES.sweet1} alt="Piping cream onto a pastry" className="h-44" />
              <ReviewCard {...REVIEWS[0]} />
              <Photo src={IMAGES.sweet4} alt="Coffee and dessert" className="h-40" />
            </div>
            <div className="flex flex-col gap-4">
              <Photo src={IMAGES.sweet2} alt="Tarts on a plate" className="h-52" />
              <Photo src={IMAGES.sweet5} alt="Fresh strawberries and cream" className="h-36" />
              <ReviewCard {...REVIEWS[1]} />
            </div>
            <div className="flex flex-col gap-4">
              <Photo src={IMAGES.sweet3} alt="A slice of layered cake" className="h-40" />
              <ReviewCard {...REVIEWS[2]} />
              <Photo src={IMAGES.sweet6} alt="Dessert plated with rose petals" className="h-44" />
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FIND OUR BOUTIQUES ==================== */}
      <section id="locations" className="relative pb-14 sm:pb-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-4xl font-bold text-center mb-10 tracking-tight">
            Find Our Boutiques
          </h2>

          <div className="rounded-2xl overflow-hidden shadow-lg border border-brand-gold/15 bg-white grid md:grid-cols-3">
            <div className="md:col-span-2 h-64 md:h-80">
              <iframe
                title="Red Rose Pastry — Salmiya"
                src="https://www.google.com/maps?q=Salmiya+Kuwait&output=embed"
                className="w-full h-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <div className="p-6 flex flex-col justify-center gap-3">
              <div className="flex items-center gap-2 text-brand-red">
                <MapPin size={18} />
                <h3 className="font-bold text-base">Salmiya</h3>
              </div>
              <p className="text-[12px] text-brand-ink/65 leading-relaxed">
                179 Street, Salmiya 123
                <br />
                Kuwait City
              </p>
              <p className="text-[11px] text-brand-ink/45">
                Open daily · 8:00 — 23:00
              </p>
              <a
                href="https://www.google.com/maps?q=Salmiya+Kuwait"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 self-start inline-flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white rounded-full font-bold text-[10px] tracking-[0.15em] uppercase hover:bg-brand-red-dark transition-colors"
              >
                Get Directions <ArrowRight size={13} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FOOTER ==================== */}
      <footer id="contact" className="relative bg-brand-red text-white overflow-hidden">
        <svg
          className="absolute top-0 left-0 w-full h-16 sm:h-24 text-brand-cream pointer-events-none"
          viewBox="0 0 1440 120"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M0,0 L1440,0 L1440,30 C1000,120 400,-20 0,70 Z"
          />
        </svg>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-8 grid gap-10 md:grid-cols-[1fr_1.3fr_auto]">
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={BRAND.logo}
                alt=""
                className="h-9 w-9 rounded-full object-cover ring-2 ring-white/40"
              />
              <span className="font-bold text-[13px] tracking-[0.2em] uppercase">
                Red Rose
              </span>
            </div>
            <p className="text-[11.5px] text-white/70 leading-relaxed max-w-[230px]">
              Artisanal Arabic and French pastries, baked fresh every morning in
              Kuwait City and delivered to your door.
            </p>
          </div>

          <div className="flex flex-col gap-4 md:items-center">
            <h4 className="font-bold text-lg sm:text-xl tracking-tight">Newsletter Sign Up</h4>
            <div className="relative w-full max-w-sm">
              <label htmlFor="newsletter-email" className="sr-only">
                Email address
              </label>
              <input
                id="newsletter-email"
                type="email"
                placeholder="Email address"
                className="w-full pl-5 pr-[104px] py-3 rounded-full bg-white text-brand-ink text-[12px] placeholder:text-brand-ink/40 focus:outline-none focus:ring-2 focus:ring-brand-gold"
              />
              <button
                type="button"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-5 py-2 bg-brand-red-dark text-white rounded-full font-bold text-[10px] tracking-[0.15em] uppercase hover:bg-brand-ink transition-colors"
              >
                Sign Up
              </button>
            </div>

            <div className="flex items-center gap-2.5 mt-1">
              <SocialIcon label="Facebook">
                <path d="M13.5 21v-7.5h2.5l.5-3h-3V8.8c0-.9.25-1.5 1.5-1.5H16.5V4.6c-.3 0-1.3-.13-2.4-.13-2.4 0-4.1 1.5-4.1 4.2v2.3H7.5v3H10V21h3.5z" />
              </SocialIcon>
              <SocialIcon label="Instagram">
                <path d="M12 2.2c3.2 0 3.6 0 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.25.07 1.62.07 4.81s0 3.56-.07 4.81c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.25.06-1.62.07-4.85.07s-3.6 0-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.8 3.8 0 0 1-1.38-.9 3.8 3.8 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.2 15.56 2.2 15.19 2.2 12s0-3.56.07-4.81c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38a3.8 3.8 0 0 1 1.38-.9c.42-.16 1.06-.36 2.23-.41C8.44 2.2 8.8 2.2 12 2.2zm0 3.05A6.75 6.75 0 1 0 18.75 12 6.75 6.75 0 0 0 12 5.25zm0 11.13A4.38 4.38 0 1 1 16.38 12 4.38 4.38 0 0 1 12 16.38zm6.99-11.4a1.58 1.58 0 1 1-1.58-1.57 1.58 1.58 0 0 1 1.58 1.57z" />
              </SocialIcon>
              <SocialIcon label="LinkedIn">
                <path d="M4.5 4.5h3.2v3.2H4.5V4.5zm0 5h3.2V20H4.5V9.5zm5.4 0h3.06v1.44h.04c.43-.8 1.47-1.65 3.02-1.65 3.23 0 3.83 2.03 3.83 4.68V20h-3.2v-5.35c0-1.28-.03-2.92-1.83-2.92-1.84 0-2.12 1.39-2.12 2.83V20H9.9V9.5z" />
              </SocialIcon>
              <SocialIcon label="Email">
                <path d="M3 5.5h18c.55 0 1 .45 1 1V17.5c0 .55-.45 1-1 1H3c-.55 0-1-.45-1-1V6.5c0-.55.45-1 1-1zm9 7.1 8-4.85V6.9l-8 4.85L4 6.9v.85l8 4.85z" />
              </SocialIcon>
            </div>
          </div>

          <nav className="flex flex-col gap-2.5 text-[12px] md:items-end">
            {NAV_LINKS.concat([{ label: 'Contact Us', href: '#contact' }]).map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="text-white/75 hover:text-white transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="relative z-10 border-t border-white/15">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between gap-1.5 text-[10.5px] text-white/60">
            <span>
              © {new Date().getFullYear()} {BRAND.fullName} · {BRAND.city}
            </span>
            <Link href="#" className="hover:text-white transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SocialIcon({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <a
      href="#"
      aria-label={label}
      className="w-8 h-8 rounded-full bg-white text-brand-red flex items-center justify-center hover:bg-brand-gold hover:text-white transition-colors"
    >
      <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
        {children}
      </svg>
    </a>
  );
}
