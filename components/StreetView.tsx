
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { LocationData } from '../types';
import { Globe } from 'lucide-react';

interface StreetViewProps {
  location: LocationData;
  apiKey: string;
}

declare global {
  interface Window {
    google: any;
    initMap?: () => void;
  }
}

const StreetView: React.FC<StreetViewProps> = ({ location, apiKey }) => {
  const streetViewRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Refs untuk logika animasi (Khusus API Mode)
  const panoramaRef = useRef<any>(null);
  const animationFrameRef = useRef<number>(0);
  const isInteractingRef = useRef<boolean>(false);
  const lastInteractionTimeRef = useRef<number>(Date.now());
  const frameCounterRef = useRef<number>(0); 
  
  // Settings (API Mode Only)
  const ROTATION_SPEED = 0.15; 
  const IDLE_TIMEOUT = 3000; 
  const AUTO_MOVE_INTERVAL = 1800; 

  // Mode: 'api' (Official JS API) or 'iframe' (Free embed hack)
  const mode = apiKey ? 'api' : 'iframe';

  // --- ANIMATION LOOP (API MODE ONLY) ---
  const startAnimation = useCallback(() => {
    if (mode !== 'api') return;

    const animate = () => {
      const now = Date.now();
      const panorama = panoramaRef.current;

      if (panorama) {
        const isIdle = !isInteractingRef.current && (now - lastInteractionTimeRef.current > IDLE_TIMEOUT);

        if (isIdle) {
          // 1. AUTO ROTATE
          const currentPov = panorama.getPov();
          const newHeading = (currentPov.heading + ROTATION_SPEED) % 360;
          
          panorama.setPov({
            heading: newHeading,
            pitch: currentPov.pitch 
          });

          // 2. AUTO MOVE
          frameCounterRef.current += 1;
          
          if (frameCounterRef.current > AUTO_MOVE_INTERVAL) {
            frameCounterRef.current = 0;
            const links = panorama.getLinks();
            if (links && links.length > 0) {
              const currentHeading = newHeading;
              const bestLink = links.sort((a: any, b: any) => {
                const diffA = Math.abs(a.heading - currentHeading);
                const diffB = Math.abs(b.heading - currentHeading);
                return diffA - diffB;
              })[0];

              if (bestLink) {
                 panorama.setPano(bestLink.pano);
                 lastInteractionTimeRef.current = Date.now() - IDLE_TIMEOUT; 
              }
            }
          }
        } else {
            frameCounterRef.current = 0;
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'api') return;

    const loadGoogleMaps = () => {
      if (window.google && window.google.maps) {
        initializeStreetView();
        return;
      }

      if (document.getElementById('google-maps-script')) {
        const interval = setInterval(() => {
            if (window.google && window.google.maps) {
                clearInterval(interval);
                initializeStreetView();
            }
        }, 100);
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap`;
      script.async = true;
      script.defer = true;
      
      window.initMap = () => {
        initializeStreetView();
      };

      script.onerror = () => {
        setError("Invalid Google Maps API Key or Network Error.");
      };

      document.body.appendChild(script);
    };

    const initializeStreetView = () => {
      if (!streetViewRef.current || !window.google) return;

      try {
        const panorama = new window.google.maps.StreetViewPanorama(
          streetViewRef.current,
          {
            position: { lat: location.lat, lng: location.lng },
            pov: { heading: 34, pitch: 0 },
            zoom: 0,
            disableDefaultUI: true,
            showRoadLabels: false,
            clickToGo: true,
            scrollwheel: true,
            panControl: false, 
            zoomControl: false,
            addressControl: false,
            fullscreenControl: false,
            linksControl: false, 
            motionTracking: false,
            motionTrackingControl: false
          }
        );
        
        panoramaRef.current = panorama;
        startAnimation();
        setError(null);
      } catch (err) {
        console.error("Map init error", err);
        setError("Failed to load Street View.");
      }
    };

    loadGoogleMaps();

    return () => {
        cancelAnimationFrame(animationFrameRef.current);
    };
  }, [location, apiKey, mode, startAnimation]);

  const handleInteractionStart = () => {
      isInteractingRef.current = true;
  };

  const handleInteractionEnd = () => {
      isInteractingRef.current = false;
      lastInteractionTimeRef.current = Date.now();
  };

  const BrandingOverlay = () => (
      <div className="absolute top-0 left-0 z-20 pointer-events-none">
         <div className="bg-slate-900/95 backdrop-blur-xl border-b border-r border-slate-700/50 rounded-br-3xl p-4 pr-10 shadow-2xl flex flex-col">
             <div className="flex items-center gap-2">
                 <Globe className="text-cyan-400" size={24} />
                 <h1 className="text-2xl font-black italic tracking-tighter text-white">
                     GEO<span className="text-cyan-400">MAD</span>
                 </h1>
             </div>
             <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest pl-8 -mt-1">
                 World Guessing
             </div>
         </div>
      </div>
  );

  // --- Render for Iframe Mode (Free - CLEAN VERSION) ---
  if (mode === 'iframe') {
    return (
      <div className="relative w-full h-full bg-gray-900 animate-in fade-in duration-500">
        <iframe
          title="Street View"
          className="w-full h-full border-0"
          src={`https://maps.google.com/maps?q=&layer=c&cbll=${location.lat},${location.lng}&cbp=11,0,0,0,0&output=svembed`}
          loading="lazy"
        />
        
        {/* Branding Overlay */}
        <BrandingOverlay />

         {/* Overlay to hide the "View on Google Maps" logo (Bottom Left) */}
        <div className="absolute bottom-0 left-0 w-32 md:w-40 h-10 md:h-12 bg-slate-900 z-10 pointer-events-auto" />
      </div>
    );
  }

  // --- Render for API Mode ---
  if (error) {
     return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900 text-red-400 p-6 text-center animate-in fade-in duration-500">
        <div>
          <h2 className="text-xl font-bold mb-2">Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div 
        className="w-full h-full bg-gray-800 animate-in fade-in duration-1000 fill-mode-forwards relative group"
        onMouseDown={handleInteractionStart}
        onMouseUp={handleInteractionEnd}
        onMouseLeave={handleInteractionEnd}
        onTouchStart={handleInteractionStart}
        onTouchEnd={handleInteractionEnd}
    >
        <div ref={streetViewRef} className="w-full h-full" />
        
        <BrandingOverlay />
        
        {/* Visual indicator for Auto-Mode when idle */}
        <div className="absolute top-4 right-4 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500">
            <div className="bg-black/40 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded border border-white/10">
                Cinematic Mode Active
            </div>
        </div>
    </div>
  );
};

export default StreetView;
