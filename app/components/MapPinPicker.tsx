"use client";

import { useEffect, useRef, useState } from 'react';
import { LocateFixed } from 'lucide-react';

// Delivery location picker. With NEXT_PUBLIC_GOOGLE_MAPS_API_KEY set it shows a
// Google map with a draggable pin. Without a key it falls back to "use my
// location" plus manual coordinates, so checkout still works in development.

export interface LatLng { lat: number; lng: number }

interface Props {
  value: LatLng | null;
  center: LatLng;               // where the map opens (the shop)
  onChange: (pos: LatLng, suggestion?: { area?: string }) => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { google?: any; __rrMapsLoading?: Promise<void> } }

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

function loadMaps(): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (window.__rrMapsLoading) return window.__rrMapsLoading;
  window.__rrMapsLoading = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY ?? '')}&v=weekly&language=en`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google Maps failed to load'));
    document.head.appendChild(s);
  });
  return window.__rrMapsLoading;
}

export default function MapPinPicker({ value, center, onChange }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const marker = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [manual, setManual] = useState({ lat: '', lng: '' });

  // Build the map once.
  useEffect(() => {
    if (!KEY || !box.current) return;
    let cancelled = false;
    loadMaps().then(() => {
      if (cancelled || !box.current) return;
      const g = window.google.maps;
      const start = value ?? center;
      map.current = new g.Map(box.current, { center: start, zoom: 14, streetViewControl: false, mapTypeControl: false, fullscreenControl: false });
      marker.current = new g.Marker({ position: start, map: map.current, draggable: true });
      const geocoder = new g.Geocoder();
      const moved = (pos: LatLng) => {
        marker.current.setPosition(pos);
        let area: string | undefined;
        geocoder.geocode({ location: pos }, (results: any[] | null) => {
          const comps = results?.[0]?.address_components ?? [];
          const hit = comps.find((c: any) => c.types.includes('sublocality_level_1') || c.types.includes('neighborhood') || c.types.includes('locality'));
          area = hit?.long_name;
          onChangeRef.current(pos, { area });
        });
        onChangeRef.current(pos);
      };
      marker.current.addListener('dragend', () => { const p = marker.current.getPosition(); moved({ lat: p.lat(), lng: p.lng() }); });
      map.current.addListener('click', (e: any) => moved({ lat: e.latLng.lat(), lng: e.latLng.lng() }));
    }).catch((e: Error) => setError(e.message));
    return () => { cancelled = true; };
    // The map is created once; later position changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the pin in sync when the position is set from outside (saved address, GPS).
  useEffect(() => {
    if (value && marker.current && map.current) {
      marker.current.setPosition(value);
      map.current.panTo(value);
    }
  }, [value]);

  const useMyLocation = () => {
    if (!navigator.geolocation) { setError('Your browser cannot share its location.'); return; }
    setLocating(true); setError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); onChange({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { setLocating(false); setError('Could not get your location. Allow location access, or move the pin by hand.'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const applyManual = () => {
    const lat = Number(manual.lat), lng = Number(manual.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { setError('Enter valid coordinates.'); return; }
    setError(null); onChange({ lat, lng });
  };

  return (
    <div className="flex flex-col gap-3">
      {KEY ? (
        <div ref={box} className="w-full h-64 rounded-2xl overflow-hidden border border-brand-gold/30 bg-brand-ink/5" />
      ) : (
        <div className="rounded-2xl border border-dashed border-brand-gold/40 bg-white p-4 text-sm text-brand-ink/70">
          <p className="font-bold text-brand-ink mb-1">Map not configured</p>
          <p className="mb-3">Set <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to show the map. Until then, use your location or type coordinates.</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input inputMode="decimal" placeholder="Latitude" value={manual.lat} onChange={(e) => setManual({ ...manual, lat: e.target.value })} className="px-3 py-2 rounded-xl border border-brand-gold/30" />
            <input inputMode="decimal" placeholder="Longitude" value={manual.lng} onChange={(e) => setManual({ ...manual, lng: e.target.value })} className="px-3 py-2 rounded-xl border border-brand-gold/30" />
          </div>
          <button type="button" onClick={applyManual} className="px-4 py-2 rounded-xl bg-brand-ink text-white text-sm font-bold">Use these coordinates</button>
        </div>
      )}
      <button type="button" onClick={useMyLocation} disabled={locating} className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-brand-red/30 text-brand-red font-bold text-sm hover:bg-brand-red/5 disabled:opacity-60">
        <LocateFixed size={16} /> {locating ? 'Finding you…' : 'Use my current location'}
      </button>
      {error && <p className="text-sm font-bold text-brand-red">{error}</p>}
      {KEY && <p className="text-xs text-brand-ink/50">Drag the pin or tap the map to mark exactly where we should deliver.</p>}
    </div>
  );
}
