# Plan: Venue Location Picker Improvements

Deferred from Phase 9 — implement after Phase 9 is complete.

## Problem

The venue creation modal in `OperatorPage.tsx` has two issues:
1. **"Use my current location" appears to do nothing** — geolocation works and sets lat/lng, but no reverse geocoding runs, so the only visible feedback is tiny gray raw coordinates. Users assume it failed.
2. **No way to visually pick a location** — the old form had Places autocomplete only. A map picker would make it much easier to pinpoint a venue precisely.

## File to modify

- `frontend/src/pages/OperatorPage.tsx` — all changes in this one file

## No script changes needed

`google.maps.Map`, `google.maps.Marker`, and `google.maps.Geocoder` are all part of the core Maps API — available with the current script setup (`v=beta&libraries=places`), no library additions needed.

---

## Fix 1: Reverse geocode after "Use my current location"

After successfully getting coordinates, call `new google.maps.Geocoder().geocode({ location: { lat, lng } }, ...)` and set `newVenueAddress` from the result. This makes the button clearly do something visible.

```typescript
function handleUseMyLocation() {
  if (!navigator.geolocation) { setVenueFormError('Geolocation not supported'); return; }
  setLocatingUser(true);
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setNewVenueLat(lat);
      setNewVenueLng(lng);
      setLocatingUser(false);
      setVenueFormError(null);
      if (mapsReady) {
        new google.maps.Geocoder().geocode(
          { location: { lat, lng } },
          (results, status) => {
            if (status === 'OK' && results?.[0]) setNewVenueAddress(results[0].formatted_address);
          }
        );
      }
    },
    () => {
      setVenueFormError('Could not get your location — check browser permissions');
      setLocatingUser(false);
    }
  );
}
```

---

## Fix 2: "Choose on map" — full-screen map overlay

Add a "Choose on map" button next to "Use my current location" in the venue modal. Clicking it opens a full-screen overlay (z-60, above the modal at z-50).

### New state to add

```typescript
const [showMapPicker, setShowMapPicker] = useState(false);
const [pickedLat, setPickedLat] = useState<number | null>(null);
const [pickedLng, setPickedLng] = useState<number | null>(null);
const mapContainerRef = useRef<HTMLDivElement>(null);
const mapInstanceRef = useRef<google.maps.Map | null>(null);
const markerRef = useRef<google.maps.Marker | null>(null);
```

### Map initialization useEffect

```typescript
useEffect(() => {
  if (!showMapPicker || !mapContainerRef.current || !mapsReady) return;
  const center = (newVenueLat !== null && newVenueLng !== null)
    ? { lat: newVenueLat, lng: newVenueLng }
    : { lat: 51.5074, lng: -0.1278 }; // default: London
  const map = new google.maps.Map(mapContainerRef.current, {
    zoom: 14, center,
    mapTypeControl: false, fullscreenControl: false, streetViewControl: false,
  });
  mapInstanceRef.current = map;
  if (newVenueLat !== null && newVenueLng !== null) {
    markerRef.current = new google.maps.Marker({ position: center, map });
    setPickedLat(newVenueLat); setPickedLng(newVenueLng);
  }
  map.addListener('click', (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    setPickedLat(e.latLng.lat()); setPickedLng(e.latLng.lng());
    if (markerRef.current) markerRef.current.setPosition(e.latLng);
    else markerRef.current = new google.maps.Marker({ position: e.latLng, map });
  });
  return () => { mapInstanceRef.current = null; markerRef.current = null; };
}, [showMapPicker, mapsReady]);
```

### Confirm handler (reverse geocodes on confirm)

```typescript
function confirmMapLocation() {
  if (pickedLat === null || pickedLng === null) return;
  setNewVenueLat(pickedLat); setNewVenueLng(pickedLng);
  setShowMapPicker(false);
  new google.maps.Geocoder().geocode(
    { location: { lat: pickedLat, lng: pickedLng } },
    (results, status) => {
      if (status === 'OK' && results?.[0]) setNewVenueAddress(results[0].formatted_address);
    }
  );
}
```

### Map picker layout

```
┌────────────────────────────┐
│  Choose location  [Cancel] │  ← header bar
├────────────────────────────┤
│                            │
│    Google Map (flex-1)     │
│    click to place pin      │
│                            │
├────────────────────────────┤
│ 51.505, -0.127  [Confirm]  │  ← footer bar, Confirm disabled until pin placed
└────────────────────────────┘
```

### Venue modal button row

```
  📍 Use my current location     🗺 Choose on map
```

### closeVenueModal update

Reset `showMapPicker`, `pickedLat`, `pickedLng` in addition to existing resets.

---

## Verification

1. Open venue creation modal as a privileged operator
2. Click "Use my current location" → grant permission → address field should fill in automatically
3. Click "Choose on map" → full-screen map appears
4. Tap a location → pin appears, footer shows coordinates
5. Click "Confirm location" → modal shows resolved address
6. Complete form and create venue — verify it saves correctly
