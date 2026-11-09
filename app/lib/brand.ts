// Central brand definition. Keeping the name, tagline and palette in one place
// makes the rebrand (and any future one) a single-file change.
//
// The shop's own details (name, branch, owner, phone, address) come from the
// environment via ./shop, so moving branch or changing the number is a .env
// edit — nothing here or in any page has to be touched.

import { shopAddress, shopFullName, shopLocation, shopName, shopOwner, shopPhone } from './shop';

const CITY = (process.env.NEXT_PUBLIC_SHOP_COUNTRY || 'Kuwait').trim() || 'Kuwait';
const AREA = shopLocation() || CITY;

export const BRAND = {
  name: shopName(),
  fullName: shopFullName(),
  /** Neighbourhood / branch, e.g. "Al Qurain". Falls back to the country. */
  area: AREA,
  /** Full street address printed on receipts. */
  address: shopAddress(),
  /** Contact number as a customer would dial it. */
  phone: shopPhone(),
  /** Proprietor, printed on the invoice. */
  owner: shopOwner(),
  tagline: `${CITY}’s finest sweets — order from your table, right from your phone.`,
  shortTagline: 'Order from your table, right from your phone.',
  logo: '/finallogo.jpeg',
  city: CITY,
};

// Palette pulled from the shop sign. Beige/cream dominates (~75%), deep red is
// the action colour (~20%), and gold/plum/green are small accents (~5%).
export const BRAND_COLORS = {
  beige: '#f3ecd2',
  cream: '#fbf8ee',
  red: '#b01e28',
  redDark: '#8f1720',
  gold: '#c9a961',
  plum: '#8e2570',
  green: '#3f8f3a',
  ink: '#2a1a12',
} as const;
