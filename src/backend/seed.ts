// The seven applications the portal launches, as of 30 September 2026.
//
// This list is here for the local demo backend (D9). The real project gets the same seven rows
// from `supabase/migrations/0001_init.sql`, which is the source of truth for the cloud - the two
// are written out twice on purpose and neither generates the other (D7). After the first deploy
// the list is maintained on the Admin screen, not here: adding a tile is a settings change, not a
// release (CI-01).

import type { NewPortalLink } from './types';

export const SEED_LINKS: NewPortalLink[] = [
  {
    slug: 'iq',
    name: 'UEL Niko IQ',
    tagline: 'Keyboard-first sales order and quotation entry for Intact IQ.',
    url: 'https://uelnikoiq.com',
    colour: '#1f7a6c',
    sortOrder: 1,
    accessMode: 'everyone',
    status: 'live',
  },
  {
    slug: 'crm',
    name: 'UEL Niko CRM',
    tagline: "Reps' mobile CRM: customers, calls, pricing and orders.",
    url: 'https://uelnikocrm.com',
    colour: '#0f4c81',
    sortOrder: 2,
    accessMode: 'everyone',
    status: 'live',
  },
  {
    slug: 'sales',
    name: 'UEL Niko Sales',
    tagline: 'Offline-first point of sale for the agricultural fairs.',
    url: 'https://uelnikopos.com',
    colour: '#9a5b12',
    sortOrder: 3,
    accessMode: 'everyone',
    status: 'live',
  },
  {
    slug: 'stock',
    name: 'UEL Niko Stock',
    tagline: 'Warehouse stock checking over a read-only Intact IQ snapshot.',
    url: 'https://uelnikostock.com',
    colour: '#6b3fa0',
    sortOrder: 4,
    accessMode: 'everyone',
    status: 'live',
  },
  {
    slug: 'sop',
    name: 'UEL Niko SOP',
    tagline: 'Purchase-order documents in, validated orders out.',
    url: 'https://uelnikosop.com',
    colour: '#a33b2a',
    sortOrder: 5,
    accessMode: 'everyone',
    status: 'live',
  },
  {
    slug: 'pod',
    name: 'UEL Niko POD',
    tagline: 'Delivery routes and proof of delivery.',
    url: 'https://uelnikopod.com',
    colour: '#2e6b3e',
    sortOrder: 6,
    accessMode: 'everyone',
    status: 'live',
  },
  {
    slug: 'booking',
    name: 'UEL Niko Booking',
    tagline: 'Meeting rooms and the boardroom, on one calendar.',
    url: 'https://uelnikobooking.com',
    colour: '#0d7490',
    sortOrder: 7,
    accessMode: 'everyone',
    status: 'live',
  },
];
