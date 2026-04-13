"use client";

import { useJsApiLoader } from "@react-google-maps/api";
import { createContext, useContext, ReactNode } from "react";

// All libraries needed across the app defined ONCE here (stable reference)
const LIBRARIES: ("drawing" | "places" | "geometry")[] = ["drawing", "places", "geometry"];

interface MapsContextValue {
  isLoaded: boolean;
  loadError: Error | undefined;
}

const MapsContext = createContext<MapsContextValue>({
  isLoaded: false,
  loadError: undefined,
});

export function GoogleMapsProvider({ children }: { children: ReactNode }) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
    libraries: LIBRARIES,
  });

  return (
    <MapsContext.Provider value={{ isLoaded, loadError }}>
      {children}
    </MapsContext.Provider>
  );
}

export function useMaps() {
  return useContext(MapsContext);
}
