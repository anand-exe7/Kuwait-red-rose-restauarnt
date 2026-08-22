// Central brand definition. Keeping the name, tagline and palette in one place
// makes the rebrand (and any future one) a single-file change.

export const BRAND = {
  name: 'Red Rose',
  fullName: 'Red Rose Sweets',
  tagline: 'Kuwait’s finest sweets — order from your table, right from your phone.',
  shortTagline: 'Order from your table, right from your phone.',
  logo: '/logo.jpeg',
  city: 'Kuwait',
} as const;

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
