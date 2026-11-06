import Link from 'next/link';
import {
  Phone,
  Clock,
  MapPin,
  Award,
  Wheat,
  Gift,
  Truck,
  Star,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { BRAND } from './lib/brand';
import { formatKWD } from './lib/currency';
import { landingFonts } from './fonts';
import HeroNav from './components/HeroNav';
import Reveal from './components/Reveal';
import HeroCake from './components/HeroCake';
import CountUp from './components/CountUp';
import Tilt from './components/Tilt';
import Reviews, { type Review } from './components/Reviews';
import { getServerSupabase } from './lib/supabaseServer';

// Admin-managed homepage media (Admin → Homepage) refreshes server-side.
export const revalidate = 30;

async function fetchHomeMedia(): Promise<{ gallery: string[]; videos: string[]; finest: string[]; celebrations: string }> {
  const empty = { gallery: [], videos: [], finest: [], celebrations: '' };
  try {
    const sb = getServerSupabase();
    if (!sb) return empty;
    const { data } = await sb.from('app_settings').select('value').eq('id', 'home_media').maybeSingle();
    const v = (data?.value ?? {}) as Partial<typeof empty>;
    return {
      gallery: Array.isArray(v.gallery) ? v.gallery.filter((x) => typeof x === 'string') : [],
      videos: Array.isArray(v.videos) ? v.videos.filter((x) => typeof x === 'string') : [],
      finest: Array.isArray(v.finest) ? v.finest.filter((x) => typeof x === 'string') : [],
      celebrations: typeof v.celebrations === 'string' ? v.celebrations : '',
    };
  } catch {
    return empty;
  }
}

/**
 * Every photo on the landing page lives here so any of them can be swapped in
 * one place. All IDs were checked to resolve before being used.
 */
const IMAGES = {
  macarons: 'photo-1558326567-98ae2405596b', // macaron stack
  croissant: 'photo-1555507036-ab1f4038808a', // butter croissant
  berryCream: 'photo-1488477181946-6428a0291777', // strawberry cream glasses
  tartlets: 'photo-1495147466023-ac5c588e2e94', // fruit tartlets with flowers
  baklava: 'photo-1761828122856-8703baac8e86', // pistachio baklava
  baklavaTray: 'photo-1598110750624-207050c4f28c', // a tray of baklava
  dates: 'photo-1770617476915-7269d29d27dc', // rows of dates
  saffron: 'photo-1643471672168-f4a4b6cfa440', // saffron threads from a jar
  pistachios: 'photo-1610137512859-aa919f651a05', // pistachios in the shell
  giftBoxes: 'photo-1607344645866-009c320b63e0', // black boxes, gold ribbon
  chocolates: 'photo-1481391319762-47dff72954d9', // an open box of chocolates
} as const;

// A `src` can be an Unsplash id (built into a URL) or a full http(s) URL — the
// latter is what admin-uploaded homepage photos use, so we pass those through.
const isFullUrl = (s: string) => /^https?:\/\//.test(s);
const img = (id: string, w = 700) =>
  isFullUrl(id) ? id : `https://images.unsplash.com/${id}?auto=format&fit=crop&q=85&w=${w}`;

/** Several widths of one photo, so high-density screens get a sharp copy. */
const srcSet = (id: string, widths: number[]) =>
  isFullUrl(id) ? '' : widths.map((w) => `${img(id, w)} ${w}w`).join(', ');

const CONTAINER = 'mx-auto w-full max-w-6xl px-5 sm:px-8';

const FOOTER_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Menu', href: '/menu' },
  { label: 'Our Story', href: '#story' },
  { label: 'Visit', href: '#locations' },
  { label: 'Contact', href: '#contact' },
];

const BESTSELLERS = [
  {
    name: 'Macaron Box',
    kind: 'Pâtisserie',
    note: 'Twelve shells in the season’s flavours, boxed and ribboned by hand.',
    price: 4.5,
    image: IMAGES.macarons,
    badge: 'Most loved',
  },
  {
    name: 'Pistachio Baklava',
    kind: 'Arabic Sweets',
    note: 'Paper-thin filo, Aleppo pistachio and a whisper of orange blossom.',
    price: 3.25,
    image: IMAGES.baklava,
  },
  {
    name: 'Butter Croissant',
    kind: 'Viennoiserie',
    note: 'French butter, laminated by hand and out of the oven at dawn.',
    price: 0.75,
    image: IMAGES.croissant,
  },
  {
    name: 'Fruit Tartlets',
    kind: 'Pâtisserie',
    note: 'Vanilla crème pâtissière under the morning’s freshest fruit.',
    price: 1.75,
    image: IMAGES.tartlets,
  },
];

const FLAVOURS = [
  { src: IMAGES.dates, label: 'Medjool dates', from: 'The Gulf' },
  { src: IMAGES.saffron, label: 'Saffron', from: 'Iran' },
  { src: IMAGES.pistachios, label: 'Pistachios', from: 'Aleppo' },
  { src: IMAGES.baklavaTray, label: 'Baklava', from: 'Our kitchen' },
];

const PROMISES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Wheat, title: 'Baked Daily', text: 'Nothing is sold the day after it is baked. Ever.' },
  { icon: Award, title: 'Real Ingredients', text: 'French butter, Iranian saffron, no preservatives.' },
  { icon: Truck, title: 'Same-Day Delivery', text: 'Order before noon, at your door by evening.' },
  { icon: Gift, title: 'Gift Ready', text: 'Every box hand-tied, with a card if you want one.' },
];

const OCCASIONS = [
  {
    title: 'Eid & Ramadan hampers',
    text: 'Dates, maamoul and baklava in keepsake boxes, ready for every visit.',
  },
  {
    title: 'Weddings & engagements',
    text: 'Favours and celebration cakes, finished to match your colours.',
  },
  {
    title: 'Corporate gifting',
    text: 'Boxes for clients and teams, with a card message for every one.',
  },
];

const STEPS = [
  {
    title: 'You Order',
    text: 'Pick your favourites and place your order online in under a minute.',
  },
  {
    title: 'We Bake',
    text: 'Our pastry chefs whisk, proof and bake your box fresh that morning.',
  },
  {
    title: 'We Deliver',
    text: 'Same-day delivery across Kuwait City, boxed and beautifully sealed.',
  },
];

/** Placeholder testimonials — swap these for real ones before launch. */
const REVIEW_SEED: Review[] = [
  {
    name: 'Reem A.',
    rating: 5,
    text: 'The macaron box arrived still cool and the ribbon was perfectly tied. Every shell was flawless — this is our standing order now.',
  },
  {
    name: 'Yousef K.',
    rating: 5,
    text: 'Ordered a gifting hamper for my mother. The packaging alone made her week, and the baklava tasted like my grandmother made it.',
  },
  {
    name: 'Dana S.',
    rating: 5,
    text: 'Same-day delivery actually meant same-day. Warm croissants at the office by nine. The whole floor now orders every Thursday.',
  },
  {
    name: 'Fahad M.',
    rating: 4,
    text: 'The kunafa is the closest to my mother’s that I have found in Salmiya. Only note is that it sells out early on Fridays.',
  },
  {
    name: 'Noura B.',
    rating: 5,
    text: 'We ordered the signature cake for an engagement. It photographed beautifully and, more to the point, it was gone in ten minutes.',
  },
  {
    name: 'Abdullah R.',
    rating: 5,
    text: 'Been buying date rolls here for two years. Same quality every single time, which is rarer than it should be.',
  },
];

const ROMAN = ['I', 'II', 'III', 'IV'];

/**
 * What bursts out from behind the cake when it lands. x/y/s are in cake
 * widths from the cake's centre; mx/my/ms are the phone layout, where the
 * cake sits under the wordmark. Items without mx are desktop-only.
 */
const BURST: {
  src: string;
  x: number; y: number; s: number;
  mx?: number; my?: number; ms?: number;
  r: number; d: number; f: number;
}[] = [
  { src: 'cherries', x: -0.8, y: -0.5, s: 0.34, mx: -0.44, my: 0.24, ms: 0.3, r: -12, d: 0, f: 6.5 },
  { src: 'raspberry', x: 0.72, y: -0.56, s: 0.15, mx: 0.44, my: -0.18, ms: 0.15, r: 16, d: 60, f: 5.5 },
  { src: 'strawberry', x: 0.92, y: 0.3, s: 0.26, mx: 0.41, my: 0.38, ms: 0.24, r: -14, d: 120, f: 7 },
  { src: 'cherry', x: -0.96, y: 0.32, s: 0.13, mx: -0.46, my: -0.24, ms: 0.12, r: 12, d: 90, f: 5 },
  { src: 'petal-a', x: -0.4, y: -0.82, s: 0.11, r: 24, d: 30, f: 6 },
  { src: 'petal-b', x: 0.36, y: -0.84, s: 0.11, r: -30, d: 150, f: 7 },
  { src: 'petal-c', x: 1.2, y: -0.12, s: 0.1, mx: 0.47, my: 0.04, ms: 0.09, r: 40, d: 200, f: 6.5 },
  { src: 'petal-a', x: -1.22, y: -0.02, s: 0.09, mx: -0.5, my: 0.04, ms: 0.09, r: -50, d: 240, f: 5.8 },
];

/** Petals drifting down through the hero, some behind the cream, some in front. */
const FALLING = [
  { src: 'petal-b', left: '7%', w: 34, dur: 17, delay: -3, sway: 60, front: false, phone: true },
  { src: 'petal-a', left: '24%', w: 24, dur: 21, delay: -11, sway: -40, front: true, phone: false },
  { src: 'petal-c', left: '79%', w: 28, dur: 19, delay: -6, sway: -50, front: false, phone: true },
  { src: 'petal-a', left: '92%', w: 34, dur: 23, delay: -15, sway: 40, front: true, phone: false },
  { src: 'petal-b', left: '57%', w: 22, dur: 26, delay: -19, sway: 30, front: false, phone: false },
];

const RIBBON = [
  'Baked fresh every morning',
  'Hand-tied gift boxes',
  'Same-day delivery across Kuwait',
  'Arabic & French pâtisserie',
  'Since 2012',
];

export default async function Home() {
  const media = await fetchHomeMedia();
  const finestSrc = (i: number) => media.finest[i] || FLAVOURS[i].src;
  const celebrationsSrc = media.celebrations || IMAGES.giftBoxes;
  return (
    <div
      className={`landing ${landingFonts} min-h-screen w-full overflow-x-clip bg-brand-cream font-body text-brand-ink`}
    >
      <div aria-hidden className="scroll-progress" />
      <HeroNav />

      {/* ==================== HERO ====================
          On tablet and desktop the hero is exactly one viewport, so the
          tagline and CTA never fall below the fold. On a phone it grows to
          fit: the wordmark, cake and CTA come first, the cards follow. */}
      <section className="hero-tl relative flex min-h-[100svh] flex-col overflow-clip bg-brand-red text-white lg:h-[100svh] lg:min-h-[430px] lg:max-h-[1000px]">
        {/* Light: a warm core behind the cake, a rose bloom low in the frame,
            and a vignette that darkens the corners so the wordmark holds. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 88% at 50% 14%, #f2404f 0%, #dc2a38 26%, #b81a27 56%, #8e1019 80%, #6d0810 100%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(65% 42% at 50% 66%, rgba(255,152,160,0.22) 0%, rgba(255,120,132,0.08) 45%, transparent 72%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(58,3,9,0.42) 0%, transparent 20%, transparent 68%, rgba(58,3,9,0.30) 100%)',
          }}
        />
        <div aria-hidden className="grain pointer-events-none absolute inset-0 opacity-[0.055] mix-blend-overlay" />

        {/* Petals drifting down through the scene. */}
        {FALLING.map((p, i) => (
          <span
            key={i}
            aria-hidden
            className={`petal-fall pointer-events-none absolute top-0 ${p.front ? 'z-40' : 'z-10'} ${p.phone ? '' : 'max-sm:hidden'}`}
            style={
              {
                left: p.left,
                width: p.w,
                '--dur': `${p.dur}s`,
                '--delay': `${p.delay}s`,
                '--sway': `${p.sway}px`,
              } as React.CSSProperties
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/cutouts/${p.src}.webp`} alt="" className="block h-auto w-full drop-shadow-[0_8px_8px_rgba(40,0,6,0.35)]" />
          </span>
        ))}

        {/* The nav is fixed (see HeroNav); this spacer reserves its height. */}
        <div className="h-[clamp(86px,11svh,108px)] shrink-0 sm:h-[clamp(76px,10svh,108px)]" aria-hidden />

        {/* ---------- Stage: RED + cake + ROSE ---------- */}
        <div className="relative z-30 flex w-full flex-1 select-none flex-col items-center justify-center px-[4vw] pt-[1%] sm:min-h-[30svh] lg:min-h-0">
          <div
            className="relative z-40 flex shrink-0 items-center gap-3 sm:gap-5 anim-fade-down"
            style={{ animationDelay: '80ms' }}
          >
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-brand-gold/70 sm:w-16" />
            <span className="whitespace-nowrap font-body text-[9px] font-medium uppercase tracking-[0.34em] text-brand-gold-light/90 sm:text-[10px] sm:tracking-[0.42em]">
              <span className="sm:hidden">Kuwait · Since 2012</span>
              <span className="hidden sm:inline">Handcrafted in Kuwait · Since 2012</span>
            </span>
            <span className="h-px w-8 bg-gradient-to-l from-transparent to-brand-gold/70 sm:w-16" />
          </div>

          <div className="relative mt-[2.5svh] flex min-h-0 w-full flex-1 flex-col justify-center sm:mt-[1svh]">
            {/* Phone: RED ROSE on one line with the cake beneath.
                Tablet up: the words hold the edges and the cake floats over
                the gap between them. Layout lives in globals.css. */}
            <div className="hero-word-layer">
              <div className="hero-word-gap-l flex anim-slide-left" style={{ animationDelay: '140ms' }}>
                <span className="hx hx-left block">
                <span
                  className="hero-word block bg-clip-text font-wordmark tracking-[-0.022em] text-transparent"
                  style={{
                    // Lit from above and lighter than the field behind it,
                    // which is what lets a red word read on a red ground.
                    backgroundImage:
                      'linear-gradient(180deg, #ffa8a6 0%, #ff7078 34%, #fb4d5b 70%, #ee3242 100%)',
                    filter:
                      'drop-shadow(0 2px 1px rgba(90,3,12,0.45)) drop-shadow(0 20px 44px rgba(28,0,4,0.55))',
                  }}
                >
                  RED
                </span>
                </span>
              </div>

              <div className="hero-cake-anchor">
                <div
                  aria-hidden
                  className="hero-cake-halo anim-glow"
                  style={{
                    background:
                      'radial-gradient(closest-side, rgba(255,196,186,0.55), rgba(255,120,120,0.18) 55%, transparent 78%)',
                  }}
                />
                {/* The cake drops in and holds a slow 3D spin.
                    Fruit and petals burst out on impact. */}
                <div className="hero-cake-pos hx hx-cake">
                  <div className="hero-cake-drop anim-cake-drop">
                    <div aria-hidden className="hero-cake-shadow" />
                    <HeroCake alt="Red Rose signature red velvet layer cake" />
                  </div>

                  {BURST.map((b, i) => (
                    <span
                      key={i}
                      aria-hidden
                      className={`burst ${b.mx === undefined ? 'max-sm:hidden' : ''}`}
                      style={
                        {
                          '--x': b.x,
                          '--y': b.y,
                          '--s': b.s,
                          '--mx': b.mx ?? 0,
                          '--my': b.my ?? 0,
                          '--ms': b.ms ?? 0,
                          '--r': `${b.r}deg`,
                          '--d': `${b.d}ms`,
                          '--f': `${b.f}s`,
                          '--fd': `${-i * 0.7}s`,
                        } as React.CSSProperties
                      }
                    >
                      <span className="hx hx-burst block">
                        <span className="burst-fly">
                          <span className="float">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/cutouts/${b.src}.webp`} alt="" />
                          </span>
                        </span>
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="hero-word-gap-r flex anim-slide-right" style={{ animationDelay: '140ms' }}>
                <span className="hx hx-right block">
                <span
                  className="hero-word hero-shimmer block bg-clip-text font-wordmark tracking-[-0.022em] text-transparent"
                  style={{
                    backgroundImage:
                      'linear-gradient(100deg, #fdeed6 0%, #f2d3a4 30%, #ffffff 45%, #fffdf8 51%, #f2d3a4 68%, #fdeed6 100%)',
                    filter: 'drop-shadow(0 18px 40px rgba(28,0,4,0.35))',
                  }}
                >
                  ROSE
                </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ---------- Bottom block on the cream ---------- */}
        <div className="relative z-20 shrink-0">
          {/* The red meets the cream on a soft swell with a gold hairline on
              the crest. The lit under-swell only shows from tablet up; on a
              phone it read as a thick red stripe. */}
          <svg
            className="absolute bottom-[calc(100%-1px)] left-0 h-[clamp(46px,7svh,64px)] w-full sm:h-[clamp(84px,14svh,180px)]"
            viewBox="0 0 1440 170"
            preserveAspectRatio="none"
            aria-hidden
          >
            <defs>
              <linearGradient id="waveLit" x1="0" y1="0" x2="1" y2="0.5">
                <stop offset="0%" stopColor="#b5182a" />
                <stop offset="42%" stopColor="#e8455a" />
                <stop offset="100%" stopColor="#a61324" />
              </linearGradient>
              <linearGradient id="waveGold" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#c9a961" stopOpacity="0" />
                <stop offset="20%" stopColor="#e6cf98" stopOpacity="0.75" />
                <stop offset="52%" stopColor="#f6e6bd" stopOpacity="0.95" />
                <stop offset="84%" stopColor="#e6cf98" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#c9a961" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              className="max-sm:hidden"
              fill="url(#waveLit)"
              opacity="0.3"
              d="M0,54 C200,-18 470,-24 760,32 C1020,82 1238,90 1440,34 L1440,170 L0,170 Z"
            />
            <path
              fill="#fbf8ee"
              d="M0,112 C200,44 468,28 754,78 C1012,123 1234,128 1440,80 L1440,170 L0,170 Z"
            />
            <path
              fill="none"
              stroke="url(#waveGold)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              d="M0,112 C200,44 468,28 754,78 C1012,123 1234,128 1440,80"
            />
          </svg>

          <div className="w-full bg-brand-cream text-brand-ink">
            <div className="mx-auto flex w-full max-w-6xl flex-col px-5 pb-12 sm:px-6 sm:pb-[clamp(8px,2svh,34px)] lg:px-8">
              {/* Phone: tagline first, straight under the cake. */}
              <p
                className="order-1 mx-auto mt-1 max-w-4xl text-balance px-1 text-center font-display text-[clamp(25px,min(5.6vw,5svh),52px)] font-medium leading-[1.12] tracking-[-0.01em] text-brand-wine anim-fade-up sm:order-2 sm:mt-[clamp(10px,2.2svh,40px)]"
                style={{ animationDelay: '820ms' }}
              >
                Exquisite pastries crafted for those who appreciate{' '}
                <em className="font-normal italic text-brand-red">the art of sweet indulgence.</em>
              </p>

              <div className="order-2 mx-auto mt-7 grid w-full max-w-5xl grid-cols-2 items-center gap-x-4 gap-y-9 sm:order-1 sm:mt-0 sm:gap-y-5 lg:grid-cols-3 lg:gap-8">
                {/* Customize your box */}
                <Link
                  href="/menu"
                  className="group order-2 flex flex-col items-center justify-center gap-3 text-center anim-fade-up sm:order-1 sm:flex-row sm:gap-5 sm:text-left lg:justify-start"
                  style={{ animationDelay: '520ms' }}
                >
                  <div className="relative shrink-0">
                    <div className="flex -space-x-3 sm:-space-x-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img(IMAGES.macarons, 320)}
                        alt=""
                        width={92}
                        height={92}
                        className="h-[68px] w-[68px] rounded-full object-cover shadow-[0_10px_26px_rgba(74,21,21,0.28)] ring-[3px] ring-brand-gold/70 transition-transform duration-500 group-hover:-translate-x-1.5 group-hover:rotate-[-4deg] sm:h-[88px] sm:w-[88px]"
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img(IMAGES.berryCream, 320)}
                        alt=""
                        width={92}
                        height={92}
                        className="h-[68px] w-[68px] rounded-full object-cover shadow-[0_10px_26px_rgba(74,21,21,0.28)] ring-[3px] ring-brand-gold/70 transition-transform duration-500 group-hover:translate-x-1.5 group-hover:rotate-[4deg] sm:h-[88px] sm:w-[88px]"
                      />
                    </div>
                    <span className="absolute -bottom-1 -right-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-brand-wine font-body text-[16px] font-light leading-none text-brand-cream shadow-md ring-[3px] ring-brand-cream transition-transform duration-500 group-hover:rotate-90 sm:h-8 sm:w-8">
                      +
                    </span>
                  </div>

                  <div>
                    <p className="font-body text-[9px] font-medium uppercase tracking-[0.3em] text-brand-gold-dark sm:text-[9.5px]">
                      Build your own
                    </p>
                    <p className="mt-1.5 font-display text-[25px] font-medium leading-[0.95] text-brand-wine sm:text-[32px]">
                      Customize
                      <em className="block font-normal italic text-brand-red">your box</em>
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1.5 font-body text-[9.5px] font-medium uppercase tracking-[0.22em] text-brand-red sm:text-[10px]">
                      Start building
                      <ArrowRight size={12} strokeWidth={1.8} className="transition-transform duration-300 group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>

                {/* Order now */}
                <div
                  className="order-1 col-span-2 flex justify-center anim-fade-up sm:order-3 lg:order-2 lg:col-span-1"
                  style={{ animationDelay: '680ms' }}
                >
                  <Link href="/menu" className="btn btn-wine group overflow-hidden px-11 py-[19px] text-[11.5px] sm:px-12">
                    {/* sheen sweeps across on hover */}
                    <span
                      aria-hidden
                      className="absolute inset-y-0 -left-1/3 w-1/3 -skew-x-[22deg] bg-gradient-to-r from-transparent via-white/25 to-transparent transition-all duration-700 ease-out group-hover:left-full"
                    />
                    <span className="relative">Order Now</span>
                    <ArrowRight size={15} strokeWidth={1.8} className="relative" />
                  </Link>
                </div>

                {/* 50K+ */}
                <div
                  className="order-3 flex justify-center anim-fade-up sm:order-2 lg:order-3 lg:justify-end"
                  style={{ animationDelay: '600ms' }}
                >
                  <div
                    className="relative w-full max-w-[188px] overflow-hidden rounded-[1.5rem] px-5 py-5 text-white shadow-[0_22px_46px_-18px_rgba(74,21,21,0.7)] transition-transform duration-500 hover:-translate-y-1 sm:max-w-[236px] sm:rounded-[1.75rem] sm:px-7"
                    style={{
                      backgroundImage: 'linear-gradient(150deg, #7d1017 0%, #580c0d 54%, #380607 100%)',
                    }}
                  >
                    <span aria-hidden className="absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-brand-gold/35" />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full"
                      style={{ background: 'radial-gradient(closest-side, rgba(255,196,178,0.28), transparent)' }}
                    />
                    <div className="relative flex flex-col items-center">
                      <CountUp
                        to={50}
                        suffix="K+"
                        delay={700}
                        className="lining-nums bg-clip-text font-display text-[50px] font-semibold tabular-nums leading-[0.85] text-transparent sm:text-[62px]"
                        style={{ backgroundImage: 'linear-gradient(180deg, #fff8ec 0%, #f2d9a8 58%, #d9b26a 100%)' }}
                      />
                      <span className="mt-2.5 h-px w-14 bg-gradient-to-r from-transparent via-brand-gold/70 to-transparent" />
                      <p className="mt-2.5 font-body text-[9px] font-medium uppercase tracking-[0.28em] text-white/75 sm:text-[10px]">
                        Happy customers
                      </p>
                      <div className="mt-3 flex gap-1" aria-hidden>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={11} strokeWidth={1.2} className="fill-current text-brand-gold" />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== RIBBONS ==================== */}
      <div aria-hidden className="relative z-10 overflow-x-clip pb-4 pt-10 sm:pb-6 sm:pt-16">
        <Ribbon variant="back" />
        <Ribbon variant="front" />
      </div>

      {/* ==================== SIGNATURES ==================== */}
      <Reveal>
        <section id="signatures" className="relative scroll-mt-24 pb-20 pt-12 sm:pb-28 sm:pt-20">
          <Cutout src="raspberry" className="left-[2%] top-16 w-[86px] max-sm:hidden" p0={50} p1={-70} r0={-18} r1={8} f={6} />
          <Cutout src="petal-c" className="left-[40%] top-6 w-[30px] max-lg:hidden" p0={90} p1={-120} r0={10} r1={90} f={5} />
          <Cutout src="strawberries" className="-right-7 top-[44%] w-[96px] sm:-right-4 sm:w-[136px] xl:right-[1.5%]" p0={80} p1={-110} r0={8} r1={-10} f={7} />
          <div className={CONTAINER}>
            <div className="flex flex-col items-center gap-7 text-center lg:flex-row lg:items-end lg:justify-between lg:text-left">
              <div>
                <p className="eyebrow text-brand-gold-dark">The Signatures</p>
                <h2 className="heading mt-5 text-brand-wine">
                  Our Signature <em className="text-brand-red">Bestsellers</em>
                </h2>
              </div>
              <div className="rise flex max-w-sm flex-col items-center gap-5 lg:items-start lg:pb-2">
                <p className="lede text-brand-ink/65">
                  What Salmiya keeps ordering — baked each morning, boxed by hand,
                  and usually gone by evening.
                </p>
                <Link href="/menu" className="text-link text-brand-red hover:text-brand-red-dark">
                  See the full menu
                  <ArrowRight size={13} strokeWidth={1.8} />
                </Link>
              </div>
            </div>

            {/* Four across in a single row on tablet and up; two columns on phones. */}
            <div className="stagger mt-12 grid grid-cols-2 gap-x-4 gap-y-10 sm:mt-16 sm:grid-cols-4 sm:gap-x-5 sm:gap-y-14">
              {BESTSELLERS.map((p, i) => (
                <Link
                  key={p.name}
                  href="/menu"
                  className="group block w-[72%] shrink-0 snap-start sm:w-auto"
                  style={{ '--i': i } as React.CSSProperties}
                >
                  <Tilt>
                  <div className="arch curtain relative isolate aspect-[4/5] overflow-hidden bg-brand-sand shadow-[0_26px_50px_-30px_rgba(74,21,21,0.55)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img(p.image, 900)}
                      srcSet={srcSet(p.image, [500, 800, 1100])}
                      sizes="(min-width: 1024px) 270px, (min-width: 640px) 46vw, 72vw"
                      alt={p.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.06]"
                    />
                    <span aria-hidden className="arch pointer-events-none absolute inset-[9px] border border-white/55" />
                    {p.badge && (
                      <span className="absolute bottom-5 left-1/2 z-[3] -translate-x-1/2 whitespace-nowrap rounded-full bg-brand-cream/95 px-3.5 py-1.5 font-body text-[9px] font-medium uppercase tracking-[0.24em] text-brand-red shadow-sm">
                        {p.badge}
                      </span>
                    )}
                    <span aria-hidden className="tilt-glare" />
                  </div>
                  </Tilt>

                  <div className="signature-copy flex flex-col items-center px-2 pt-6 text-center">
                    <p className="font-body text-[9.5px] font-medium uppercase tracking-[0.3em] text-brand-gold-dark">
                      {p.kind}
                    </p>
                    <h3 className="signature-name mt-2.5 font-display text-[22px] font-bold leading-tight text-brand-wine sm:text-[26px]">
                      {p.name}
                    </h3>
                    <p className="mt-2 max-w-[250px] font-body text-[13px] font-light leading-relaxed text-brand-ink/60">
                      {p.note}
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      <span className="lining-nums font-display text-[21px] font-semibold text-brand-red">
                        {formatKWD(p.price)}
                      </span>
                      <span aria-hidden className="h-3.5 w-px bg-brand-gold/50" />
                      <span className="inline-flex items-center gap-1.5 font-body text-[10px] font-medium uppercase tracking-[0.24em] text-brand-wine/70 transition-colors duration-300 group-hover:text-brand-red">
                        Order
                        <ArrowRight size={12} strokeWidth={1.8} className="transition-transform duration-300 group-hover:translate-x-1" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ==================== OUR STORY ==================== */}
      <Reveal>
        <section id="story" className="relative scroll-mt-24 py-20 sm:py-28">
          <Cutout src="petal-b" className="right-[3%] top-8 w-[40px] max-sm:hidden" p0={120} p1={-140} r0={-20} r1={70} f={6} />
          <div className={`${CONTAINER} grid items-center gap-16 lg:grid-cols-2 lg:gap-20`}>
            <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
              <p className="eyebrow text-brand-gold-dark">Our Story · Since 2012</p>
              <h2 className="heading mt-5 text-brand-wine">
                Kuwait&apos;s Finest <em className="text-brand-red">Flavors</em>
              </h2>
              <p className="lede rise mt-6 max-w-md text-brand-ink/65">
                We source Medjool dates from the Gulf, saffron from Iran and
                pistachios from Aleppo, then fold them into recipes our family has
                baked for three generations. Nothing is frozen, and nothing leaves
                the kitchen a day old.
              </p>

              <ul className="mt-9 w-full max-w-md border-t border-brand-gold/25 text-left">
                {FLAVOURS.map((f, i) => (
                  <li
                    key={f.label}
                    className="rise flex items-baseline gap-4 border-b border-brand-gold/25 py-3.5"
                    style={{ '--i': i + 2 } as React.CSSProperties}
                  >
                    <span className="w-6 font-display text-[14px] italic text-brand-gold-dark">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="font-display text-[21px] font-medium leading-none text-brand-wine">
                      {f.label}
                    </span>
                    <span aria-hidden className="flex-1 self-center border-b border-dotted border-brand-gold/55" />
                    <span className="font-body text-[10px] font-medium uppercase tracking-[0.24em] text-brand-ink/50">
                      {f.from}
                    </span>
                  </li>
                ))}
              </ul>

              <Link href="/menu" className="btn btn-outline mt-10">
                Explore the menu
                <ArrowRight size={13} strokeWidth={1.8} />
              </Link>
            </div>

            {/* Two staggered columns of photographs, with the year set
                between them like a maker's mark. */}
            <div className="relative mx-auto w-full max-w-[520px] lg:max-w-none">
              {/* The two columns drift at different speeds as the page moves. */}
              <div className="grid grid-cols-2 gap-4 sm:gap-5">
                <div
                  className="parallax flex flex-col gap-4 sm:gap-5"
                  style={{ '--p0': '24px', '--p1': '-24px' } as React.CSSProperties}
                >
                  <Photo i={0} src={finestSrc(0)} label={FLAVOURS[0].label} from={FLAVOURS[0].from} aspect="aspect-[4/5]" />
                  <Photo i={2} src={finestSrc(2)} label={FLAVOURS[2].label} from={FLAVOURS[2].from} aspect="aspect-square" />
                </div>
                <div
                  className="parallax mt-12 flex flex-col gap-4 sm:mt-16 sm:gap-5"
                  style={{ '--p0': '80px', '--p1': '-80px' } as React.CSSProperties}
                >
                  <Photo i={1} src={finestSrc(1)} label={FLAVOURS[1].label} from={FLAVOURS[1].from} aspect="aspect-square" />
                  <Photo i={3} src={finestSrc(3)} label={FLAVOURS[3].label} from={FLAVOURS[3].from} aspect="aspect-[4/5]" />
                </div>
              </div>

              {/* A rose laid across the corner of the photographs. */}
              <Cutout
                src="rose"
                className="-bottom-14 -left-6 z-10 w-[230px] sm:-bottom-16 sm:-left-12 sm:w-[310px] lg:-bottom-20 lg:-left-24 lg:w-[380px]"
                p0={50}
                p1={-50}
                r0={-16}
                r1={-6}
                f={8}
              />

              <div className="absolute -left-3 -top-6 flex h-[92px] w-[92px] flex-col sm:-left-9 sm:-top-9 items-center justify-center rounded-full bg-brand-cream text-center shadow-[0_18px_40px_-16px_rgba(74,21,21,0.5)] ring-1 ring-brand-gold/40 sm:h-[112px] sm:w-[112px]">
                <span aria-hidden className="absolute inset-[5px] rounded-full border border-brand-gold/35" />
                <span className="font-display text-[13px] italic leading-none text-brand-gold-dark sm:text-[15px]">Est.</span>
                <span className="lining-nums mt-1 font-display text-[26px] font-semibold leading-none text-brand-wine sm:text-[32px]">
                  2012
                </span>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ==================== WHY RED ROSE ==================== */}
      <Reveal>
        <section id="promise" className="relative scroll-mt-24 pb-24 pt-16 sm:pb-32 sm:pt-24">
          <Cutout src="strawberry" className="-left-6 top-[34%] w-[150px] max-sm:hidden xl:left-[1.5%]" p0={90} p1={-90} r0={-20} r1={6} f={7} />
          <Cutout src="cherry" className="-right-3 bottom-[8%] w-[56px] sm:right-[2%] sm:w-[78px]" p0={60} p1={-100} r0={14} r1={-12} f={5.5} />
          <div className={CONTAINER}>
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow eyebrow-center text-brand-gold-dark">The Red Rose Promise</p>
              <h2 className="heading mt-5 text-brand-wine">
                Why <em className="text-brand-red">Red Rose</em>
              </h2>
              <p className="lede mx-auto mt-5 max-w-md text-brand-ink/65">
                Four things we refuse to compromise on, in every box that leaves the kitchen.
              </p>
            </div>

            {/* Hairline grid: the gold shows only through the 1px gaps. */}
            <div className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-[24px] border border-brand-gold/30 bg-brand-gold/30 sm:mt-16 lg:grid-cols-4">
              {PROMISES.map(({ icon: Icon, title, text }, i) => (
                <div
                  key={title}
                  className="group bg-brand-cream px-4 py-10 text-center transition-colors duration-500 hover:bg-white sm:px-8 sm:py-12"
                >
                  <div className="rise flex flex-col items-center" style={{ '--i': i } as React.CSSProperties}>
                  <span className="font-display text-[15px] italic text-brand-gold-dark">{ROMAN[i]}</span>
                  <Icon size={26} strokeWidth={1.1} className="mt-5 text-brand-red transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-110" />
                  <h3 className="mt-5 font-display text-[22px] font-medium leading-tight text-brand-wine sm:text-[25px]">
                    {title}
                  </h3>
                  <span aria-hidden className="mt-4 block h-px w-8 bg-brand-gold/60 transition-[width] duration-500 group-hover:w-14" />
                  <p className="mt-4 max-w-[220px] font-body text-[13px] font-light leading-relaxed text-brand-ink/60 sm:text-[13.5px]">
                    {text}
                  </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ========= RED BAND: GIFTING + HOW IT WORKS + GUARANTEE =========
          Not wrapped in one Reveal: each block below reveals as it is
          reached, so How it works isn't spent before anyone scrolls to it. */}
        <section
          id="celebrations"
          className="relative overflow-clip text-white"
          style={{
            backgroundImage: 'linear-gradient(172deg, #b81a27 0%, #9d1420 28%, #7c0e19 64%, #5f070f 100%)',
          }}
        >
          <div aria-hidden className="grain pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay" />
          <EdgeCurve position="top" />

          {/* petals drifting through the band */}
          <Cutout src="petal-a" className="left-[3%] top-[9%] w-[42px]" p0={160} p1={-200} r0={0} r1={140} f={6} />
          <Cutout src="petal-c" className="right-[4%] top-[30%] w-[36px] max-sm:hidden" p0={200} p1={-220} r0={30} r1={-90} f={7} />
          <Cutout src="petal-b" className="left-[6%] top-[52%] w-[34px] max-sm:hidden" p0={140} p1={-180} r0={-40} r1={60} f={5.5} />
          <Cutout src="petal-a" className="right-[7%] top-[70%] w-[30px]" p0={180} p1={-160} r0={60} r1={-40} f={6.5} />

          {/* ---- Gifting ---- */}
          <Reveal>
          <div className={`${CONTAINER} relative grid items-center gap-20 pb-20 pt-28 sm:pt-36 lg:grid-cols-[1fr_1.05fr] lg:gap-20 lg:pb-28 lg:pt-40`}>
            <div className="relative mx-auto w-full max-w-[340px] sm:max-w-[420px] lg:mx-0 lg:max-w-[440px]">
              <div aria-hidden className="arch absolute -inset-3 border border-brand-gold-light/40 sm:-inset-4" />
              <div className="arch curtain relative isolate aspect-[4/5] overflow-hidden shadow-[0_40px_80px_-30px_rgba(20,0,3,0.85)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img(celebrationsSrc, 1000)}
                  srcSet={srcSet(celebrationsSrc, [700, 1000, 1400])}
                  sizes="(min-width: 1024px) 440px, (min-width: 640px) 420px, 340px"
                  alt="Black gift boxes tied with gold ribbon"
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
              <div
                className="parallax absolute -bottom-8 -right-4 z-20 w-[42%] sm:-right-12"
                style={{ '--p0': '50px', '--p1': '-40px' } as React.CSSProperties}
              >
                <div className="aspect-square overflow-hidden rounded-full border-[5px] border-brand-cream shadow-[0_24px_50px_-20px_rgba(20,0,3,0.8)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img(IMAGES.chocolates, 600)}
                    srcSet={srcSet(IMAGES.chocolates, [400, 700])}
                    sizes="(min-width: 640px) 185px, 145px"
                    alt="An open box of assorted chocolates"
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>

              {/* A rose laid against the foot of the arch. */}
              <Cutout
                src="rose"
                className="-bottom-12 -left-10 z-10 w-[210px] sm:-left-20 sm:w-[290px]"
                p0={40}
                p1={-40}
                r0={-34}
                r1={-22}
                f={8}
              />
            </div>

            <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
              <p className="eyebrow text-brand-gold-light">Our Collections</p>
              <h2 className="heading mt-5 text-white">
                Made for <em className="text-brand-gold-light">Celebrations</em>
              </h2>
              <p className="lede rise mt-6 max-w-lg text-[#fbe6d8]/85">
                Hand-tied silk ribbon, a hand-written card, and a box built to
                survive the drive — ready in-store for the day you name.
              </p>

              <ul className="mt-9 w-full max-w-lg border-t border-white/15 text-left">
                {OCCASIONS.map((o, i) => (
                  <li
                    key={o.title}
                    className="rise flex gap-5 border-b border-white/15 py-5"
                    style={{ '--i': i + 2 } as React.CSSProperties}
                  >
                    <span className="pt-1.5 font-display text-[15px] italic text-brand-gold-light/80">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <p className="font-display text-[23px] font-medium leading-tight">{o.title}</p>
                      <p className="mt-1.5 font-body text-[13.5px] font-light leading-relaxed text-white/65">
                        {o.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="rise mt-10 flex flex-col items-center gap-6 sm:flex-row" style={{ '--i': 6 } as React.CSSProperties}>
                <Link href="/menu" className="btn btn-gold">
                  Explore the menu
                  <ArrowRight size={13} strokeWidth={1.8} />
                </Link>
                <a href="tel:+96522000000" className="text-link text-white/80 hover:text-white">
                  Call the shop
                  <ArrowRight size={13} strokeWidth={1.8} />
                </a>
              </div>
            </div>
          </div>
          </Reveal>

          {/* ---- How it works ---- */}
          <Reveal>
          <div id="how-it-works" className={`${CONTAINER} relative scroll-mt-20`}>
            <div className="border-t border-white/15 py-20 sm:py-24">
              <div className="mx-auto max-w-2xl text-center">
                <p className="eyebrow eyebrow-center text-brand-gold-light">How it works</p>
                <h2 className="heading mt-5 text-white">
                  From our kitchen <em className="text-brand-gold-light">to your door</em>
                </h2>
              </div>

              <div className="relative mt-14 sm:mt-16">
                {/* rule through the three markers */}
                <span
                  aria-hidden
                  className="draw-x absolute left-[16.67%] right-[16.67%] top-[95px] hidden h-px bg-gradient-to-r from-brand-gold-light/10 via-brand-gold-light/50 to-brand-gold-light/10 sm:block"
                />
                <ol className="stagger grid gap-14 sm:grid-cols-3 sm:gap-8">
                  {STEPS.map((s, i) => (
                    <li key={s.title} className="relative flex flex-col items-center text-center">
                      <span className="numeral-outline lining-nums font-display text-[84px] font-medium leading-[0.9]">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span aria-hidden className="relative mt-4 block h-2 w-2 rotate-45 bg-brand-gold-light shadow-[0_0_0_5px_rgba(124,14,25,0.9)]" />
                      <h3 className="mt-6 font-display text-[27px] font-medium leading-tight">{s.title}</h3>
                      <p className="mt-3 max-w-[260px] font-body text-[14px] font-light leading-relaxed text-white/70">
                        {s.text}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
          </Reveal>

          {/* ---- Freshness promise ---- */}
          <Reveal>
          <div id="guarantee" className={`${CONTAINER} relative scroll-mt-28 pb-32 sm:pb-40`}>
            <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 rounded-[28px] border border-brand-gold-light/30 bg-black/10 px-7 py-11 text-center sm:flex-row sm:gap-11 sm:px-12 sm:text-left">
              <Seal />
              <div>
                <p className="eyebrow text-brand-gold-light">Our guarantee</p>
                <h3 className="mt-4 font-display text-[34px] font-medium leading-none sm:text-[40px]">
                  Freshness, <em className="font-normal italic text-brand-gold-light">guaranteed</em>
                </h3>
                <p className="mt-4 max-w-xl font-body text-[14.5px] font-light leading-relaxed text-white/72">
                  Everything is baked the morning it is sold. If a box isn&apos;t
                  perfect when it reaches you, we replace it — no questions asked.
                </p>
              </div>
            </div>
          </div>
          </Reveal>

          <EdgeCurve position="bottom" />
        </section>

      {/* ==================== GALLERY (admin-managed) ==================== */}
      {media.gallery.length > 0 && (
        <section className="relative py-20 sm:py-28">
          <div className={CONTAINER}>
            <div className="text-center">
              <p className="eyebrow eyebrow-center text-brand-gold-dark">From our kitchen</p>
              <h2 className="heading mt-5 text-brand-wine">The <em className="text-brand-red">gallery</em></h2>
            </div>
            <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {media.gallery.map((url) => (
                <div key={url} className="aspect-[9/16] overflow-hidden rounded-2xl border border-brand-gold/25 bg-brand-sand shadow-[0_18px_40px_-28px_rgba(74,21,21,0.45)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ==================== VIDEOS (admin-managed) ==================== */}
      {media.videos.length > 0 && (
        <section className="relative bg-brand-sand/40 py-20 sm:py-28">
          <div className={CONTAINER}>
            <div className="text-center">
              <p className="eyebrow eyebrow-center text-brand-gold-dark">Watch</p>
              <h2 className="heading mt-5 text-brand-wine">In <em className="text-brand-red">motion</em></h2>
            </div>
            <div className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4">
              {media.videos.map((url) => (
                <div key={url} className="aspect-[9/16] overflow-hidden rounded-2xl border border-brand-gold/25 bg-black shadow-[0_18px_40px_-28px_rgba(74,21,21,0.45)]">
                  <video src={url} className="h-full w-full object-cover" controls playsInline preload="metadata" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ==================== SWEET WORDS ==================== */}
      <Reveal>
        <section id="reviews" className="relative scroll-mt-24 py-20 sm:py-28">
          <Cutout src="croissant" className="-left-16 top-4 w-[150px] sm:-left-14 sm:top-10 sm:w-[240px] xl:left-[1%]" p0={60} p1={-80} r0={-10} r1={6} f={8} />
          <Cutout src="cherries" className="-right-10 top-[12%] w-[120px] sm:-right-8 sm:w-[190px] xl:right-[2%]" p0={90} p1={-90} r0={12} r1={-8} f={6.5} />
          <div className="mx-auto max-w-2xl px-5 text-center">
            <p className="eyebrow eyebrow-center text-brand-gold-dark">Testimonials</p>
            <h2 className="heading mt-5 text-brand-wine">
              Sweet <em className="text-brand-red">Words</em>
            </h2>
            <p className="lede rise mx-auto mt-5 max-w-md text-brand-ink/65">
              Notes from the people we bake for.
            </p>
          </div>

          {/* full-bleed, so the run has somewhere to come from and go to */}
          <div className="mt-12 sm:mt-16">
            <Reviews seed={REVIEW_SEED} />
          </div>
        </section>
      </Reveal>

      {/* ==================== VISIT ==================== */}
      <Reveal>
        <section id="locations" className="relative scroll-mt-24 pb-28 sm:pb-36">
          <Cutout src="petal-c" className="left-[8%] top-0 w-[34px] max-sm:hidden" p0={100} p1={-120} r0={-30} r1={50} f={6} />
          <Cutout src="raspberry" className="right-[6%] top-6 w-[58px] sm:w-[74px]" p0={70} p1={-90} r0={10} r1={-16} f={5.5} />
          <div className={CONTAINER}>
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow eyebrow-center text-brand-gold-dark">Visit us</p>
              <h2 className="heading mt-5 text-brand-wine">
                Find Our <em className="text-brand-red">Shop</em>
              </h2>
              <p className="lede rise mx-auto mt-5 max-w-md text-brand-ink/65">
                One kitchen, one counter, in Salmiya.
              </p>
            </div>

            <div className="mt-12 grid overflow-hidden rounded-[28px] border border-brand-gold/25 bg-white shadow-[0_34px_70px_-40px_rgba(74,21,21,0.5)] sm:mt-16 lg:grid-cols-5">
              <div className="relative h-72 sm:h-96 lg:col-span-3 lg:h-auto lg:min-h-[480px]">
                <iframe
                  title="Red Rose Sweets — Salmiya, Kuwait"
                  src="https://www.google.com/maps?q=29.3339,48.0777&z=16&output=embed"
                  className="absolute inset-0 h-full w-full border-0 [filter:grayscale(0.4)_sepia(0.18)_contrast(1.03)]"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                {/* Seals the embed: the wheel scrolls the page instead of
                    zooming the map. Get directions is the way out to the map. */}
                <span aria-hidden className="absolute inset-0 cursor-default" />
              </div>

              <div className="flex flex-col justify-center px-7 py-10 sm:px-11 sm:py-12 lg:col-span-2">
                <p className="eyebrow text-brand-gold-dark">The shop</p>
                <h3 className="mt-4 font-display text-[42px] font-medium leading-none text-brand-wine">Salmiya</h3>

                <dl className="mt-8 divide-y divide-brand-gold/20 border-y border-brand-gold/20">
                  <InfoRow icon={MapPin} label="Address">
                    179 Street, Salmiya 123
                    <br />
                    Kuwait City
                  </InfoRow>
                  <InfoRow icon={Clock} label="Hours">
                    Open daily · <span className="tabular-nums">8:00 – 23:00</span>
                  </InfoRow>
                  <InfoRow icon={Phone} label="Telephone">
                    <a href="tel:+96522000000" className="tabular-nums transition-colors hover:text-brand-red">
                      +965 2200 0000
                    </a>
                  </InfoRow>
                </dl>

                <div className="mt-9 flex flex-wrap gap-3">
                  <a
                    href="https://www.google.com/maps?q=Salmiya+Kuwait"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-red px-7"
                  >
                    Get directions
                    <ArrowRight size={13} strokeWidth={1.8} />
                  </a>
                  <a href="tel:+96522000000" className="btn btn-outline px-7">
                    Call us
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ==================== FOOTER ==================== */}
      <footer
        id="contact"
        className="relative overflow-clip text-white"
        style={{ backgroundImage: 'linear-gradient(176deg, #9d1420 0%, #7c0e19 45%, #4f070c 100%)' }}
      >
        <div aria-hidden className="grain pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay" />
        <EdgeCurve position="top" />

        <div className="relative mx-auto w-full max-w-7xl px-5 pt-28 sm:px-8 sm:pt-36">
          <div className="grid gap-12 border-b border-white/15 pb-14 sm:grid-cols-2 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-4">
              <Link href="/" className="inline-flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/finallogo.jpeg"
                  alt=""
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full object-cover ring-1 ring-brand-gold-light/60"
                />
                <span className="leading-none">
                  <span className="sr-only">{BRAND.fullName}</span>
                  <span aria-hidden className="block font-body text-[10px] font-medium uppercase tracking-[0.5em] text-brand-gold-light/85">
                    Pastry · Kuwait
                  </span>
                </span>
              </Link>
              <p className="mt-6 max-w-xs font-body text-[14px] font-light leading-relaxed text-white/65">
                Artisanal Arabic and French pastries, baked fresh every morning in
                Kuwait City and delivered to your door.
              </p>
            </div>

            <div className="lg:col-span-2">
              <FooterHeading>Explore</FooterHeading>
              <ul className="mt-5 flex flex-col gap-3">
                {FOOTER_LINKS.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="font-body text-[14px] font-light text-white/70 transition-colors hover:text-brand-gold-light"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-3">
              <FooterHeading>Visit</FooterHeading>
              <address className="mt-5 flex flex-col gap-3 font-body text-[14px] font-light not-italic leading-relaxed text-white/70">
                <span>
                  179 Street, Salmiya 123
                  <br />
                  Kuwait City
                </span>
                <span>
                  Open daily · <span className="tabular-nums">8:00 – 23:00</span>
                </span>
                <a href="tel:+96522000000" className="tabular-nums transition-colors hover:text-brand-gold-light">
                  +965 2200 0000
                </a>
              </address>
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <FooterHeading>From our kitchen</FooterHeading>
              <p className="mt-5 font-display text-[22px] font-medium leading-tight">
                Baked fresh <em className="font-normal italic text-brand-gold-light">every morning</em>
              </p>
              <p className="mt-2 font-body text-[13px] font-light leading-relaxed text-white/60">
                Call ahead for Eid hampers, wedding favours and corporate boxes — we&apos;ll match them to your colours.
              </p>
              <a href="tel:+96522000000" className="mt-5 inline-flex items-center gap-2 font-body text-[11px] font-medium uppercase tracking-[0.24em] text-brand-gold-light transition-colors hover:text-white">
                +965 2200 0000
                <ArrowRight size={13} strokeWidth={1.8} />
              </a>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 py-7 font-body text-[11.5px] font-light tracking-[0.06em] text-white/55">
            <span>
              © {new Date().getFullYear()} {BRAND.fullName} · {BRAND.city}
            </span>
            <span>
              Powered by{' '}
              <a
                href="https://www.cenexasystems.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-gold-light transition-colors hover:text-white hover:underline"
              >
                Cenexa Systems
              </a>{' '}
              © {new Date().getFullYear()}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* --------------------------------------------------------------------- */

/** A photograph in the Our Story mosaic, captioned on a soft shade. */
function Photo({ src, label, from, aspect, i }: { src: string; label: string; from: string; aspect: string; i: number }) {
  return (
    <figure
      className={`curtain group relative isolate overflow-hidden rounded-[18px] shadow-[0_22px_44px_-28px_rgba(74,21,21,0.6)] ${aspect}`}
      style={{ '--i': i } as React.CSSProperties}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img(src, 800)}
        srcSet={srcSet(src, [500, 800, 1100])}
        sizes="(min-width: 1024px) 270px, 45vw"
        alt={label}
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.05]"
      />
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#2a1108]/75 via-[#2a1108]/5 to-transparent" />
      <figcaption className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <span className="block font-body text-[8.5px] font-medium uppercase tracking-[0.28em] text-brand-gold-light">
          {from}
        </span>
        <span className="mt-1 block font-display text-[19px] font-medium leading-none text-white sm:text-[22px]">
          {label}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * A cut-out photograph (fruit, petals, a rose) resting on the edge of a
 * section. It drifts with the scroll (p0 → p1 px, r0 → r1 deg) and bobs
 * gently on its own, so the page never sits completely still.
 */
function Cutout({
  src,
  className = '',
  p0 = 70,
  p1 = -70,
  r0 = 0,
  r1 = 0,
  f = 7,
}: {
  src: string;
  className?: string;
  p0?: number;
  p1?: number;
  r0?: number;
  r1?: number;
  f?: number;
}) {
  return (
    <span aria-hidden className={`cutout ${className}`}>
      <span
        className="parallax block"
        style={{ '--p0': `${p0}px`, '--p1': `${p1}px`, '--r0': `${r0}deg`, '--r1': `${r1}deg` } as React.CSSProperties}
      >
        <span className="float" style={{ '--f': `${f}s` } as React.CSSProperties}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/cutouts/${src}.webp`} alt="" loading="lazy" />
        </span>
      </span>
    </span>
  );
}

/** One band of the crossing ribbons under the hero. */
function Ribbon({ variant }: { variant: 'front' | 'back' }) {
  // Four copies: the track loops at -50%, so each half must be identical
  // and wider than the widest screen.
  const items = [...RIBBON, ...RIBBON, ...RIBBON, ...RIBBON];
  const shift = variant === 'front' ? { '--sx0': '5%', '--sx1': '-5%' } : { '--sx0': '-5%', '--sx1': '5%' };
  return (
    <div className={`ribbon ribbon-${variant}`}>
      <div className="scroll-slide" style={shift as React.CSSProperties}>
        <div className="ribbon-track">
          {items.map((t, i) => (
            <span key={i} className="ribbon-item">
              {t}
              <span className="ribbon-star">✦</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A soft dip where a cream section meets a red one, with a gold hairline. */
function EdgeCurve({ position }: { position: 'top' | 'bottom' }) {
  const top = position === 'top';
  const fill = top
    ? 'M0,0 L1440,0 L1440,20 C1080,92 360,92 0,20 Z'
    : 'M0,96 L1440,96 L1440,76 C1080,4 360,4 0,76 Z';
  const line = top ? 'M0,20 C360,92 1080,92 1440,20' : 'M0,76 C360,4 1080,4 1440,76';
  return (
    <svg
      aria-hidden
      viewBox="0 0 1440 96"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute left-0 h-[40px] w-full sm:h-[80px] ${top ? '-top-px' : '-bottom-px'}`}
    >
      <defs>
        <linearGradient id={`edge-gold-${position}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ecd8a6" stopOpacity="0" />
          <stop offset="50%" stopColor="#ecd8a6" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ecd8a6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path fill="#fbf8ee" d={fill} />
      <path fill="none" stroke={`url(#edge-gold-${position})`} strokeWidth="1.25" vectorEffect="non-scaling-stroke" d={line} />
    </svg>
  );
}

/** A round maker's seal: rose mark in the centre, the promise around it. */
function Seal() {
  return (
    <div className="relative h-[128px] w-[128px] shrink-0">
      <svg
        viewBox="0 0 120 120"
        className="absolute inset-0 h-full w-full text-brand-gold-light motion-safe:animate-[spin_36s_linear_infinite]"
        aria-hidden
      >
        <defs>
          <path id="seal-ring" d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0" />
        </defs>
        <circle cx="60" cy="60" r="58.5" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.8" />
        <circle cx="60" cy="60" r="34" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.8" />
        <text fill="currentColor" fontSize="8" fontWeight="500" style={{ fontFamily: 'var(--lux-body)' }}>
          <textPath href="#seal-ring" textLength="280" lengthAdjust="spacing">
            BAKED FRESH · EVERY MORNING · SINCE 2012 ·
          </textPath>
        </text>
      </svg>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/finallogo.jpeg"
        alt=""
        width={56}
        height={56}
        className="absolute left-1/2 top-1/2 h-[54px] w-[54px] -translate-x-1/2 -translate-y-1/2 rounded-full object-cover"
      />
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 py-4">
      <Icon size={16} strokeWidth={1.4} className="mt-0.5 shrink-0 text-brand-red" />
      <div>
        <dt className="font-body text-[9.5px] font-medium uppercase tracking-[0.28em] text-brand-ink/45">{label}</dt>
        <dd className="mt-1.5 font-body text-[15px] font-light leading-relaxed text-brand-ink/80">{children}</dd>
      </div>
    </div>
  );
}

function FooterHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="font-body text-[10px] font-medium uppercase tracking-[0.32em] text-brand-gold-light">
      {children}
    </h4>
  );
}

