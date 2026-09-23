import Link from 'next/link';
import {
  ShoppingCart,
  Truck,
  Phone,
  Clock,
  MapPin,
  Award,
  Wheat,
  Gift,
  BadgeCheck,
  ArrowRight,
} from 'lucide-react';
import { BRAND } from './lib/brand';
import { formatKWD } from './lib/currency';
import HeroNav from './components/HeroNav';
import Reveal from './components/Reveal';
import CakeSpin from './components/CakeSpin';
import Reviews, { type Review } from './components/Reviews';

/**
 * Every photo on the landing page lives here so any of them can be swapped in
 * one place. All URLs were checked to resolve before being used.
 */
const IMAGES = {
  macarons: 'photo-1558326567-98ae2405596b', // macaron stack
  croissant: 'photo-1555507036-ab1f4038808a', // butter croissant
  berryTart: 'photo-1488477181946-6428a0291777', // strawberry cream glasses
  dates: 'photo-1770617476915-7269d29d27dc', // rows of dates
  saffron: 'photo-1643471672168-f4a4b6cfa440', // saffron threads from a jar
  pistachios: 'photo-1610137512859-aa919f651a05', // pistachios in the shell
  baklava: 'photo-1761828122856-8703baac8e86', // pistachio baklava
  gifting: 'photo-1512909006721-3d6018887383', // ribboned parcel
  sweet1: 'photo-1464195244916-405fa0a82545', // cookies in a cloth
  sweet2: 'photo-1517686469429-8bdb88b9f907', // hands working dough
  sweet3: 'photo-1571506165871-ee72a35bc9d4', // macarons
  sweet4: 'photo-1495147466023-ac5c588e2e94', // fruit tartlets with flowers
  sweet5: 'photo-1606313564200-e75d5e30476c', // chocolate cake slices
  sweet6: 'photo-1551024506-0bccd828d307', // caramel sundae
} as const;

const img = (id: string, w = 700) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&q=80&w=${w}`;

const NAV_LINKS = [
  { label: 'Shop', href: '/customer' },
  { label: 'Our Story', href: '#story' },
  { label: 'Gifting', href: '#gifting' },
  { label: 'Locations', href: '#locations' },
];

const PROMISES = [
  {
    icon: Wheat,
    title: 'Baked Daily',
    text: 'Nothing is sold the day after it is baked. Ever.',
  },
  {
    icon: Award,
    title: 'Real Ingredients',
    text: 'French butter, Iranian saffron, no preservatives.',
  },
  {
    icon: Truck,
    title: 'Same-Day Delivery',
    text: 'Order before noon, at your door by evening.',
  },
  {
    icon: Gift,
    title: 'Gift Ready',
    text: 'Every box hand-tied, with a card if you want one.',
  },
];

/** Placeholder customer portraits for the "50K+" card. */
const AVATARS = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=120',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=120',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=120',
];

const BESTSELLERS = [
  { name: 'Macaron Box', price: 4.5, image: IMAGES.macarons },
  { name: 'Butter Croissant', price: 0.75, image: IMAGES.croissant },
  { name: 'Berry Tart', price: 1.75, image: IMAGES.berryTart },
];

const FLAVOURS = [
  { src: IMAGES.dates, alt: 'Medjool dates', label: 'Medjool dates', from: 'The Gulf' },
  { src: IMAGES.saffron, alt: 'Saffron threads', label: 'Saffron', from: 'Iran' },
  { src: IMAGES.pistachios, alt: 'Pistachios', label: 'Pistachios', from: 'Aleppo' },
  { src: IMAGES.baklava, alt: 'Baklava', label: 'Baklava', from: 'Our kitchen' },
];

/** Placeholder testimonials — swap these for real ones before launch. */
const REVIEW_SEED: Review[] = [
  {
    name: 'Reem A.',
    rating: 5,
    photo: img(IMAGES.sweet3, 700),
    text: 'The macaron box arrived still cool and the ribbon was perfectly tied. Every shell was flawless — this is our standing order now.',
  },
  {
    name: 'Yousef K.',
    rating: 5,
    photo: img(IMAGES.sweet4, 700),
    text: 'Ordered a gifting hamper for my mother. The packaging alone made her week, and the baklava tasted like my grandmother made it.',
  },
  {
    name: 'Dana S.',
    rating: 5,
    photo: img(IMAGES.sweet1, 700),
    text: 'Same-day delivery actually meant same-day. Warm croissants at the office by nine. The whole floor now orders every Thursday.',
  },
  {
    name: 'Fahad M.',
    rating: 4,
    photo: img(IMAGES.sweet2, 700),
    text: 'The kunafa is the closest to my mother\u2019s that I have found in Salmiya. Only note is that it sells out early on Fridays.',
  },
  {
    name: 'Noura B.',
    rating: 5,
    photo: img(IMAGES.sweet5, 700),
    text: 'We ordered the signature cake for an engagement. It photographed beautifully and, more to the point, it was gone in ten minutes.',
  },
  {
    name: 'Abdullah R.',
    rating: 5,
    photo: img(IMAGES.sweet6, 700),
    text: 'Been buying date rolls here for two years. Same quality every single time, which is rarer than it should be.',
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
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* handle */}
      <path d="M12 2.2v6.1" />
      {/* outer basket */}
      <path d="M12 8.3c-4.6 0-7 3.5-7 7.1 0 3.5 3.1 6.2 7 6.2s7-2.7 7-6.2c0-3.6-2.4-7.1-7-7.1z" />
      {/* inner wires */}
      <path d="M12 8.3v13.3" />
      <path d="M8.3 9.5c-1.4 3.6-1.4 8.6 0 11.4" />
      <path d="M15.7 9.5c1.4 3.6 1.4 8.6 0 11.4" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen w-full bg-brand-cream text-brand-ink font-poppins overflow-x-hidden">
      <HeroNav />

      {/* The hero is sized to exactly one viewport at any screen size, so the
          tagline and CTA never fall below the fold. */}
      <section className="relative bg-brand-red text-white overflow-hidden min-h-[100svh] lg:h-[100svh] lg:min-h-[430px] lg:max-h-[1000px] flex flex-col">
        {/* Three stacked light layers rather than one flat radial: a warm core
            behind the cake, a rose bloom low in the frame that lifts the wave,
            and a vignette that darkens the corners so the wordmark holds. */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(120% 88% at 50% 14%, #f2404f 0%, #dc2a38 26%, #b81a27 56%, #8e1019 80%, #6d0810 100%)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(65% 42% at 50% 66%, rgba(255,152,160,0.26) 0%, rgba(255,120,132,0.10) 45%, transparent 72%)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(58,3,9,0.42) 0%, transparent 20%, transparent 68%, rgba(58,3,9,0.34) 100%)',
          }}
        />

        {/* Fine grain over the flat gradients — stops the red reading as a
            plastic fill and gives the hero some depth. */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.055] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E\")",
            backgroundSize: '180px 180px',
          }}
        />

        {/* Drifting petals — ambient life in the field around the still cake. */}
        {[
          { top: '18%', left: '7%', size: 26, delay: '0s', dur: '15s', op: 0.16 },
          { top: '34%', left: '15%', size: 17, delay: '2.5s', dur: '18s', op: 0.13 },
          { top: '62%', left: '10%', size: 21, delay: '5s', dur: '16s', op: 0.11 },
          { top: '22%', left: '88%', size: 23, delay: '1.2s', dur: '17s', op: 0.15 },
          { top: '48%', left: '93%', size: 15, delay: '4s', dur: '14s', op: 0.12 },
          { top: '70%', left: '84%', size: 19, delay: '6.5s', dur: '19s', op: 0.1 },
        ].map((p, i) => (
          <svg
            key={i}
            aria-hidden
            viewBox="0 0 24 24"
            fill="#ffd9dc"
            className="hidden sm:block absolute pointer-events-none anim-petal z-[1]"
            style={{
              top: p.top,
              left: p.left,
              width: p.size,
              height: p.size,
              opacity: p.op,
              animationDelay: p.delay,
              animationDuration: p.dur,
            }}
          >
            <path d="M12 2C8 2 4 6 4 12c0 6 8 10 8 10s8-4 8-10c0-6-4-10-8-10z" />
          </svg>
        ))}

        {/* The nav is fixed (see HeroNav); this spacer reserves exactly the
            same height inside the hero so the layout maths are unchanged. */}
        <div className="shrink-0 h-[clamp(64px,9svh,108px)]" aria-hidden />

        {/* ---------- Stage: ROSE + cake + BLOOM as one scaling composition.
             Laying these out in a single flex row (rather than pinning the
             words to the viewport edges) keeps the cake overlapping both words
             at every aspect ratio, including short/wide laptop screens. ---- */}
        {/* pt gives the spinning cake clearance under the nav at its widest sweep */}
        {/* px-[3vw] plus the sizes below keep the whole ROSE–cake–BLOOM row
            inside the viewport. The type is capped on BOTH axes: 11vw stops it
            running off the sides on wide screens, 18.5svh stops it eating the
            hero's height on short ones. */}
        <div className="relative z-30 flex-1 min-h-[30svh] lg:min-h-0 w-full flex flex-col items-center justify-center px-[4vw] pt-[1%] select-none">
          {/* Eyebrow — anchors the wordmark and fills the dead band below the nav. */}
          <div
            className="relative z-40 shrink-0 flex items-center gap-3 sm:gap-5 anim-fade-down"
            style={{ animationDelay: '80ms' }}
          >
            <span className="hidden sm:block h-px w-10 sm:w-16 bg-gradient-to-r from-transparent to-brand-gold/70" />
            <span className="text-[7px] sm:text-[9.5px] font-semibold uppercase tracking-[0.2em] sm:tracking-[0.34em] text-brand-gold/95 whitespace-nowrap">
              <span className="sm:hidden">Kuwait · Since 2012</span>
              <span className="hidden sm:inline">
                Handcrafted in Kuwait · Since 2012
              </span>
            </span>
            <span className="hidden sm:block h-px w-10 sm:w-16 bg-gradient-to-l from-transparent to-brand-gold/70" />
          </div>

          {/* Reference layout: the wordmark is anchored to the outer edges and
              the cake floats centred ON TOP of it. Taking the cake out of the
              flow is what lets the type run far bigger than it could when the
              three sat side by side. Under sm the words stack instead. */}
          <div className="relative flex-1 min-h-0 w-full mt-[1svh]">
            {/* --- wordmark layer, with the cake riding the gap between the
                 two words. BLOOM is wider than ROSE, so the gap's centre is
                 NOT the container's centre; a zero-width flex item lands
                 exactly on it under `justify-between`, and the cake hangs off
                 that, overlapping both words evenly. --- */}
            <div className="hero-word-layer">
              <div className="hero-word-gap-l flex justify-end anim-slide-left" style={{ animationDelay: '140ms' }}>
                <span
                  className="block font-display font-bold tracking-[-0.022em] hero-word text-transparent bg-clip-text"
                  style={{
                    // The field behind this word is ~#cb2331, so a red of the
                    // same weight vanishes into it. This one is lit from above
                    // and stays LIGHTER than the field top to bottom, which is
                    // what makes it read; the shadow only sharpens the edge.
                    backgroundImage:
                      'linear-gradient(180deg, #ffa8a6 0%, #ff7078 34%, #fb4d5b 70%, #ee3242 100%)',
                    filter:
                      'drop-shadow(0 2px 1px rgba(90,3,12,0.45)) drop-shadow(0 20px 44px rgba(28,0,4,0.55))',
                  }}
                >
                  RED
                </span>
              </div>

              {/* absolute center anchor for the cake, independent of text width */}
              <div className="hero-cake-anchor absolute inset-0 m-auto z-20 flex items-center justify-center anim-cake-arrive pointer-events-none">
                {/* The cake holds still; only the light behind it breathes. */}
                <div
                  aria-hidden
                  className="hero-cake-halo absolute left-1/2 top-1/2 rounded-full pointer-events-none anim-glow"
                  style={{
                    background:
                      'radial-gradient(closest-side, rgba(255,196,186,0.55), rgba(255,120,120,0.18) 55%, transparent 78%)',
                  }}
                />
                <div className="hero-cake-pos">
                  {/* Shadow sits outside the animated wrapper — see globals.css. */}
                  <div aria-hidden className="hero-cake-shadow" />
                  <div className="hero-cake-bob">
                    <div className="hero-cake-yaw">
                      <CakeSpin alt="Red Rose signature red velvet layer cake" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="hero-word-gap-r flex justify-start anim-slide-right" style={{ animationDelay: '140ms' }}>
                <span
                  className="hero-shimmer block font-display font-bold tracking-[-0.022em] hero-word text-transparent bg-clip-text"
                  style={{
                    backgroundImage:
                      'linear-gradient(100deg, #fdeed6 0%, #f2d3a4 30%, #ffffff 45%, #fffdf8 51%, #f2d3a4 68%, #fdeed6 100%)',
                  }}
                >
                  ROSE
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* ---------- Bottom block on the cream ---------- */}
        <div className="relative shrink-0 z-20">
          {/* The red meets the cream on three offset crests rather than one
              edge: a dark under-swell, a lit rose swell, then the cream itself,
              with a gold hairline riding the top crest. Each layer runs its own
              curve, so the red side reads as flowing and the cream side stays
              calm under the text. */}
          <svg
            className="absolute bottom-[calc(100%-1px)] left-0 w-full h-[clamp(84px,14svh,180px)]"
            viewBox="0 0 1440 170"
            preserveAspectRatio="none"
            aria-hidden
          >
            <defs>
              <linearGradient id="waveDeep" x1="0" y1="0" x2="1" y2="0.4">
                <stop offset="0%" stopColor="#5f060d" />
                <stop offset="48%" stopColor="#94121d" />
                <stop offset="100%" stopColor="#5f060d" />
              </linearGradient>
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

            {/* one soft swell only — three tight crests read as a hard stripe */}
            <path
              fill="url(#waveLit)"
              opacity="0.38"
              d="M0,54 C200,-18 470,-24 760,32 C1020,82 1238,90 1440,34 L1440,170 L0,170 Z"
            />
            {/* the cream shore */}
            <path
              fill="#fbf8ee"
              d="M0,112 C200,44 468,28 754,78 C1012,123 1234,128 1440,80 L1440,170 L0,170 Z"
            />
            {/* gold hairline riding the cream crest */}
            <path
              fill="none"
              stroke="url(#waveGold)"
              strokeWidth="1.5"
              d="M0,112 C200,44 468,28 754,78 C1012,123 1234,128 1440,80"
            />
          </svg>

          <div className="bg-brand-cream w-full">
            <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-[clamp(8px,2svh,34px)]">
              {/* Under lg the row folds to two columns with the CTA spanning
                  beneath both, so nothing is squeezed on a phone. */}
              <div className="mx-auto max-w-5xl grid grid-cols-2 lg:grid-cols-3 items-center gap-x-4 gap-y-3 sm:gap-y-5 lg:gap-8">
                {/* Customize your box — the paper-and-knife doodle is gone;
                    the pastries themselves now carry the invitation. */}
                <Link
                  href="/customer"
                  className="group order-1 flex flex-col sm:flex-row items-center text-center sm:text-left justify-center lg:justify-start gap-3 sm:gap-4 anim-fade-up"
                  style={{ animationDelay: '520ms' }}
                >
                  <div className="relative shrink-0">
                    <div className="flex -space-x-3 sm:-space-x-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img(IMAGES.macarons, 320)}
                        alt=""
                        className="w-[76px] h-[76px] sm:w-[92px] sm:h-[92px] rounded-full object-cover shadow-[0_10px_26px_rgba(74,21,21,0.3)] ring-[3px] ring-brand-gold/70 transition-transform duration-500 group-hover:-translate-x-2 group-hover:rotate-[-4deg]"
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img(IMAGES.berryTart, 320)}
                        alt=""
                        className="w-[76px] h-[76px] sm:w-[92px] sm:h-[92px] rounded-full object-cover shadow-[0_10px_26px_rgba(74,21,21,0.3)] ring-[3px] ring-brand-gold/70 transition-transform duration-500 group-hover:translate-x-2 group-hover:rotate-[4deg]"
                      />
                    </div>
                    <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#4a1515] text-brand-cream flex items-center justify-center text-[17px] leading-none font-light ring-[3px] ring-brand-cream shadow-md transition-transform duration-500 group-hover:scale-110 group-hover:rotate-90 z-10">
                      +
                    </span>
                  </div>

                  <div>
                    <p className="text-[9px] sm:text-[9.5px] font-semibold uppercase tracking-[0.24em] text-brand-red/75">
                      Build your own
                    </p>
                    <p className="font-display text-[21px] sm:text-[30px] leading-[1.05] text-[#4a1515]">
                      Customize
                      <span className="block italic text-brand-red">
                        your box
                      </span>
                    </p>
                    <span className="mt-1 inline-flex items-center gap-1.5 text-[9.5px] sm:text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-red">
                      Start building
                      <ArrowRight
                        size={12}
                        className="transition-transform duration-300 group-hover:translate-x-1"
                      />
                    </span>
                  </div>
                </Link>

                {/* Order now */}
                <div
                  className="order-3 col-span-2 lg:order-2 lg:col-span-1 flex justify-center anim-fade-up"
                  style={{ animationDelay: '680ms' }}
                >
                  <Link
                    href="/customer"
                    className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full px-9 sm:px-12 py-3.5 sm:py-4 text-brand-cream font-semibold text-[11.5px] sm:text-[12.5px] tracking-[0.18em] shadow-[0_16px_38px_rgba(74,21,21,0.45)] transition-transform duration-300 hover:-translate-y-0.5 active:scale-95"
                    style={{
                      backgroundImage:
                        'linear-gradient(135deg, #75201f 0%, #4a1515 48%, #2b0a0a 100%)',
                    }}
                  >
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-full ring-1 ring-inset ring-brand-gold/45"
                    />
                    {/* sheen sweeps across on hover */}
                    <span
                      aria-hidden
                      className="absolute inset-y-0 -left-1/3 w-1/3 -skew-x-[22deg] bg-gradient-to-r from-transparent via-white/28 to-transparent transition-all duration-700 ease-out group-hover:left-full"
                    />
                    <span className="relative">ORDER NOW</span>
                    <ArrowRight
                      size={15}
                      className="relative transition-transform duration-300 group-hover:translate-x-1"
                    />
                  </Link>
                </div>

                {/* 50K+ card */}
                <div
                  className="order-2 lg:order-3 flex justify-center lg:justify-end anim-fade-up"
                  style={{ animationDelay: '600ms' }}
                >
                  <div
                    className="group relative w-full max-w-[196px] sm:max-w-[236px] rounded-[1.5rem] sm:rounded-[1.75rem] px-5 sm:px-7 py-4 sm:py-5 text-white overflow-hidden shadow-[0_20px_46px_rgba(74,21,21,0.42)] transition-transform duration-500 hover:-translate-y-1"
                    style={{
                      backgroundImage:
                        'linear-gradient(150deg, #7d1017 0%, #580c0d 54%, #380607 100%)',
                    }}
                  >
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-[1.75rem] ring-1 ring-inset ring-brand-gold/35"
                    />
                    <span
                      aria-hidden
                      className="absolute -top-12 -right-10 w-36 h-36 rounded-full pointer-events-none"
                      style={{
                        background:
                          'radial-gradient(closest-side, rgba(255,196,178,0.30), transparent)',
                      }}
                    />

                    <div className="relative flex flex-col items-center">
                      <span
                        className="font-numeric lining-nums font-semibold text-[46px] sm:text-[58px] leading-[0.88] tracking-[-0.01em] text-transparent bg-clip-text"
                        style={{
                          backgroundImage:
                            'linear-gradient(180deg, #fff8ec 0%, #f2d9a8 58%, #d9b26a 100%)',
                        }}
                      >
                        50K+
                      </span>
                      <span className="mt-2 h-px w-16 bg-gradient-to-r from-transparent via-brand-gold/70 to-transparent" />
                      <p className="mt-2 sm:mt-2.5 text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.2em] text-white/75">
                        Happy customers
                      </p>
                      <div className="flex -space-x-3 mt-3 sm:mt-3.5">
                        {AVATARS.map((a, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={a}
                            src={a}
                            alt=""
                            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover border-[3px] border-[#4d0a0b] transition-transform duration-500 group-hover:-translate-y-0.5"
                            style={{ zIndex: 3 - i, transitionDelay: `${i * 60}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <p
                className="mt-[clamp(10px,2.2svh,44px)] mx-auto max-w-4xl text-center text-[#4a1515] font-semibold text-[clamp(16px,min(4.7vw,4.3svh),46px)] leading-[1.25] tracking-[-0.015em] px-2 anim-fade-up"
                style={{ animationDelay: '820ms' }}
              >
                Exquisite pastries crafted for those who appreciate{' '}
                <span className="font-display font-medium italic text-brand-red">
                  the art of sweet indulgence.
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== BESTSELLERS ==================== */}
      <Reveal>
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
            <p className="text-center text-[9.5px] font-semibold uppercase tracking-[0.26em] text-brand-gold-dark">
              What Salmiya keeps ordering
            </p>
            <h2 className="mb-11 mt-3 text-center font-display text-[32px] leading-none tracking-tight text-[#4a1515] sm:mb-14 sm:text-[46px]">
              Our Signature Bestsellers
            </h2>

            <div className="stagger grid gap-6 sm:grid-cols-3 sm:gap-7">
              {BESTSELLERS.map((p, i) => (
                <article
                  key={p.name}
                  className="group flex flex-col overflow-hidden rounded-[1.4rem] bg-white ring-1 ring-brand-gold/18 shadow-[0_12px_34px_rgba(74,21,21,0.09)] transition-[box-shadow,transform] duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_26px_58px_rgba(74,21,21,0.2)]"
                >
                  <div className="relative aspect-[5/4] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img(p.image, 1000)}
                      alt={p.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.08]"
                    />
                    {i === 0 && (
                      <span className="absolute left-3.5 top-3.5 rounded-full bg-white/90 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-brand-red shadow-sm backdrop-blur-sm">
                        Most loved
                      </span>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col items-center px-5 pb-6 pt-5 text-center">
                    <h3 className="font-display text-[21px] leading-tight text-[#4a1515]">
                      {p.name}
                    </h3>
                    <span
                      aria-hidden
                      className="my-3 block h-px w-10 bg-gradient-to-r from-transparent via-brand-gold to-transparent transition-[width] duration-500 group-hover:w-20"
                    />
                    <p className="font-semibold tabular-nums text-[16px] text-brand-red">
                      {formatKWD(p.price)}
                    </p>
                    <button className="mt-5 w-full rounded-full bg-brand-red px-6 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white transition-colors duration-300 hover:bg-brand-red-dark active:scale-[0.98]">
                      Add to cart
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-12 flex justify-center">
              <Link
                href="/customer"
                className="group inline-flex items-center gap-2 border-b border-brand-gold/50 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-brand-red transition-colors hover:border-brand-red"
              >
                See the full menu
                <ArrowRight size={13} className="transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ==================== KUWAIT'S FINEST FLAVORS ==================== */}
      <Reveal>
        <section id="story" className="relative py-12 sm:py-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-10 items-center">
            <div className="flex flex-col items-center gap-5 text-center md:items-start md:text-left">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.26em] text-brand-gold-dark">
                Sourced, not substituted
              </span>
              <h2 className="font-display text-[32px] leading-[1.02] tracking-tight text-[#4a1515] sm:text-[46px]">
                Kuwait&apos;s Finest Flavors
              </h2>
              <p className="max-w-md text-[15px] leading-[1.85] text-brand-ink/70">
                We source Medjool dates from the Gulf, saffron from Iran and
                pistachios from Aleppo, then fold them into recipes our family has
                baked for three generations. Nothing is frozen, and nothing leaves
                the kitchen a day old.
              </p>
              <ul className="flex w-full max-w-md flex-col gap-0 self-stretch">
                {FLAVOURS.map((f) => (
                  <li
                    key={f.label}
                    className="flex items-baseline justify-between gap-4 border-b border-brand-gold/25 py-2.5 last:border-b-0"
                  >
                    <span className="font-display text-[16px] text-[#4a1515]">{f.label}</span>
                    <span
                      aria-hidden
                      className="mx-1 h-px flex-1 self-center bg-brand-gold/25"
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-ink/45">
                      {f.from}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href="/customer"
                className="group mt-1 inline-flex items-center gap-2 rounded-full bg-brand-red px-7 py-3.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white transition-colors hover:bg-brand-red-dark"
              >
                Explore Menu
                <ArrowRight size={13} className="transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>

            <div className="stagger grid grid-cols-2 gap-3.5 sm:gap-5">
              {FLAVOURS.map((f, i) => (
                <figure
                  key={f.alt}
                  className={`group/f relative overflow-hidden rounded-2xl ring-1 ring-brand-gold/18 shadow-[0_10px_28px_rgba(74,21,21,0.1)] transition-shadow duration-500 hover:shadow-[0_20px_44px_rgba(74,21,21,0.2)] ${i % 2 === 1 ? 'sm:mt-9' : ''}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img(f.src, 900)}
                    alt={f.alt}
                    loading="lazy"
                    className={`w-full object-cover transition-transform duration-[900ms] ease-out group-hover/f:scale-[1.07] ${
                      i === 0 || i === 3 ? 'h-44 sm:h-60' : 'h-36 sm:h-48'
                    }`}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#2a1108]/78 via-[#2a1108]/12 to-transparent"
                  />
                  <figcaption className="absolute inset-x-0 bottom-0 p-3.5 sm:p-4">
                    <span className="block text-[8.5px] font-semibold uppercase tracking-[0.24em] text-brand-gold">
                      {f.from}
                    </span>
                    <span className="mt-0.5 block font-display text-[16px] leading-none text-white sm:text-[18px]">
                      {f.label}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ==================== WHY RED ROSE ==================== */}
      <Reveal>
        <section className="relative py-12 sm:py-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-4xl font-bold text-center tracking-tight">
              Why Red Rose
            </h2>
            <p className="mx-auto mb-11 mt-3 max-w-xl text-center text-[15px] leading-relaxed text-brand-ink/65">
              Four things we refuse to compromise on, in every box that leaves the
              kitchen.
            </p>

            <div className="stagger grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
              {PROMISES.map(({ icon: Icon, title, text }) => (
                <div
                  key={title}
                  className="group relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl bg-white px-5 py-8 text-center ring-1 ring-brand-gold/18 shadow-[0_8px_24px_rgba(74,21,21,0.07)] transition-[box-shadow] duration-500 hover:shadow-[0_20px_44px_rgba(74,21,21,0.16)]"
                >
                  {/* warm wash rises from the base instead of the card jumping */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-0 bg-gradient-to-t from-brand-red/8 to-transparent transition-[height] duration-500 ease-out group-hover:h-full"
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-3 -top-3 text-brand-red/[0.055] transition-transform duration-700 ease-out group-hover:-translate-y-1 group-hover:rotate-6"
                  >
                    <Icon size={104} strokeWidth={1.1} />
                  </span>
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-red/10 text-brand-red transition-[background-color,color,transform] duration-500 group-hover:scale-[1.08] group-hover:bg-brand-red group-hover:text-white">
                    <Icon size={23} strokeWidth={1.7} />
                  </div>
                  <h3 className="relative font-display text-[17px] leading-none tracking-tight text-[#4a1515]">
                    {title}
                  </h3>
                  <span
                    aria-hidden
                    className="relative block h-px w-6 bg-brand-gold/70 transition-[width] duration-500 group-hover:w-14"
                  />
                  <p className="relative text-[12.5px] leading-relaxed text-brand-ink/60">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ========= RED BAND: GIFTING + HOW IT WORKS + GUARANTEE ========= */}
      <Reveal>
        <section
          id="gifting"
          className="relative overflow-hidden text-white"
          style={{
            backgroundImage:
              'linear-gradient(168deg, #b81a27 0%, #9d1420 34%, #7c0e19 68%, #5f070f 100%)',
          }}
        >
          {/* Massive elegant sweeping top wave matching the reference */}
          <svg
            className="absolute -top-px left-0 w-full h-[140px] sm:h-[280px] text-brand-cream pointer-events-none"
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
              <span className="inline-flex items-center gap-2 rounded-full bg-[#fbeec6]/12 px-4 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#f0d9a4] ring-1 ring-[#f0d9a4]/35">
                <Gift size={13} /> Gifting
              </span>
              <h2 className="font-display text-[34px] leading-[1.05] tracking-tight sm:text-[52px]">
                Luxury Gifting
              </h2>
              <p className="max-w-md text-[17px] leading-[1.75] text-[#fbe6d8] sm:text-[19px]">
                Hand-tied silk ribbon, a hand-written card, and a box built to
                survive the drive. Corporate orders, wedding favours and Eid
                hampers — delivered anywhere in Kuwait, on the day you name.
              </p>
              <Link
                href="#gifting"
                className="group inline-flex items-center gap-2.5 rounded-full px-8 py-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[#4a1515] shadow-[0_14px_32px_rgba(30,0,4,0.4)] transition-transform duration-300 hover:-translate-y-0.5"
                style={{
                  backgroundImage:
                    'linear-gradient(135deg, #fbeec6 0%, #dcbb79 48%, #b9924b 100%)',
                }}
              >
                View Gifting Collection
                <ArrowRight size={14} className="transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img(IMAGES.gifting, 900)}
              alt="A wrapped Red Rose parcel, hand-tied"
              loading="lazy"
              className="h-[260px] w-full rounded-2xl object-cover shadow-[0_28px_60px_rgba(30,0,4,0.45)] ring-1 ring-brand-gold/25 sm:h-[340px]"
            />
          </div>

          {/* ---- How It Works ---- */}
          <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
            {/* Inner dark-red wave for How It Works to create the 2-tone effect */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150vw] sm:w-[200vw] h-[120%] bg-brand-red-dark/30 -z-10 rounded-[100%_0_100%_0/50%_0_50%_0] transform -skew-y-3" />
          
            <h2 className="text-2xl sm:text-4xl font-bold text-center tracking-tight">
              How It Works
            </h2>
            <p className="mx-auto mb-14 mt-3 max-w-sm text-center text-[15px] leading-relaxed text-white/70">
              From your screen to your door in three steps.
            </p>
            <div className="relative grid sm:grid-cols-3 gap-10 sm:gap-6">
              {/* rule connecting the three steps */}
              <div
                aria-hidden
                className="absolute left-[17%] right-[17%] top-[38px] hidden h-px bg-gradient-to-r from-transparent via-brand-gold/55 to-transparent sm:block"
              />
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
                <div
                  key={s.title}
                  className="group relative flex flex-col items-center gap-3.5 text-center"
                >
                  <div className="relative">
                    <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-[#5f070f] text-white shadow-[0_12px_28px_rgba(30,0,4,0.5)] ring-1 ring-brand-gold/40 transition-transform duration-500 group-hover:scale-[1.06]">
                      {s.icon ? <s.icon size={31} strokeWidth={1.6} /> : <Whisk size={31} />}
                    </div>
                    <span className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-brand-gold font-numeric lining-nums text-[14px] font-semibold text-[#4a1515] shadow-md">
                      {s.n.replace('.', '')}
                    </span>
                  </div>
                  <h3 className="mt-1 font-display text-[20px] leading-none tracking-tight">
                    {s.title}
                  </h3>
                  <p className="max-w-[230px] text-[13px] leading-relaxed text-white/72">
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
            className="absolute -bottom-px left-0 w-full h-16 sm:h-24 text-brand-cream pointer-events-none"
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
      </Reveal>

      {/* ==================== SWEET WORDS ==================== */}
      <Reveal>
        <section className="relative py-14 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="mb-3 text-center font-display text-[32px] leading-none tracking-tight sm:text-[46px]">
              Sweet Words
            </h2>
            <p className="mx-auto mb-11 max-w-sm text-center text-[14px] text-brand-ink/55">
              Hover to hold it still — and add your own below.
            </p>
          </div>

          {/* full-bleed, so the run has somewhere to come from and go to */}
          <Reviews seed={REVIEW_SEED} />
        </section>
      </Reveal>

      {/* ==================== FIND OUR BOUTIQUES ==================== */}
      <Reveal>
        <section id="locations" className="relative pb-16 sm:pb-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-center font-display text-[32px] leading-none tracking-tight sm:text-[46px]">
              Find Our Shop
            </h2>
            <p className="mx-auto mb-11 mt-3 max-w-sm text-center text-[15px] text-brand-ink/60">
              One kitchen, one counter, in Salmiya.
            </p>

            <div className="grid overflow-hidden rounded-[1.5rem] bg-white shadow-[0_18px_46px_rgba(74,21,21,0.13)] ring-1 ring-brand-gold/20 md:grid-cols-5">
              <div className="relative h-72 md:col-span-3 md:h-[420px]">
                <iframe
                  title="Red Rose Sweets — Salmiya, Kuwait"
                  src="https://www.google.com/maps?q=29.3339,48.0777&z=16&output=embed"
                  className="h-full w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                {/* Seals the embed: the wheel scrolls the page instead of
                    zooming the map, and the view stays where we put it. The
                    Get directions button is the way out to the real map. */}
                <span aria-hidden className="absolute inset-0 cursor-default" />
              </div>

              <div className="flex flex-col justify-center gap-5 p-7 sm:p-9 md:col-span-2">
                <div>
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.24em] text-brand-gold-dark">
                    Our shop
                  </span>
                  <h3 className="mt-1.5 font-display text-[28px] leading-none text-[#4a1515]">
                    Salmiya
                  </h3>
                </div>

                <div className="flex flex-col gap-3.5 text-[14px] leading-relaxed text-brand-ink/70">
                  <p className="flex items-start gap-3">
                    <MapPin size={17} className="mt-0.5 shrink-0 text-brand-red" />
                    <span>
                      179 Street, Salmiya 123
                      <br />
                      Kuwait City
                    </span>
                  </p>
                  <p className="flex items-start gap-3">
                    <Clock size={17} className="mt-0.5 shrink-0 text-brand-red" />
                    <span>
                      Open daily
                      <br />
                      <span className="tabular-nums">8:00 — 23:00</span>
                    </span>
                  </p>
                  <p className="flex items-start gap-3">
                    <Phone size={17} className="mt-0.5 shrink-0 text-brand-red" />
                    <a href="tel:+96522000000" className="tabular-nums transition-colors hover:text-brand-red">
                      +965 2200 0000
                    </a>
                  </p>
                </div>

                <a
                  href="https://www.google.com/maps?q=Salmiya+Kuwait"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group mt-1 inline-flex items-center justify-center gap-2 self-start rounded-full bg-brand-red px-7 py-3.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-brand-red-dark"
                >
                  Get directions
                  <ArrowRight size={13} className="transition-transform duration-300 group-hover:translate-x-1" />
                </a>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ==================== FOOTER ==================== */}
      <footer id="contact" className="relative bg-brand-red text-white overflow-hidden">
        <svg
          className="absolute -top-px left-0 w-full h-16 sm:h-24 text-brand-cream pointer-events-none"
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
