
import LZString from 'lz-string';
import { LocationData, GuessResult, MapCategory } from "../types";
import { worldData } from './cities';

const CUSTOM_LOCATIONS_KEY = 'geoguesser_custom_locations_v3'; // Changed version to force migration/reset if needed
const CUSTOM_CATEGORIES_KEY = 'geoguesser_custom_categories_v1';
const DISABLED_BUILTINS_KEY = 'geoguesser_disabled_builtins_v1';

const generateBuiltInLocationsAndCategories = () => {
    const categoriesMap: Record<string, MapCategory> = {};
    const locations: LocationData[] = [];

    // Add Indonesia special category
    categoriesMap['cat_Indonesia'] = {
        id: 'cat_Indonesia',
        name: 'Indonesia',
        description: 'Explore locations across Indonesia.',
        imageUrl: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&q=80&w=1000',
        isBuiltIn: true
    };

    const continentImages: Record<string, string> = {
        'Asia': 'https://picsum.photos/seed/asia/800/600',
        'Europe': 'https://picsum.photos/seed/europe/800/600',
        'North America': 'https://picsum.photos/seed/northamerica/800/600',
        'South America': 'https://picsum.photos/seed/southamerica/800/600',
        'Africa': 'https://picsum.photos/seed/africa/800/600',
        'Oceania': 'https://picsum.photos/seed/oceania/800/600',
        'Antarctica': 'https://picsum.photos/seed/antarctica/800/600'
    };

    worldData.forEach((data: any) => {
        let catId = `cat_${data.continent}`;
        if (data.country === 'Indonesia') {
            catId = 'cat_Indonesia';
        } else if (data.continent) {
            if (!categoriesMap[catId]) {
                categoriesMap[catId] = {
                    id: catId,
                    name: data.continent,
                    description: `Cities and locations in ${data.continent}.`,
                    imageUrl: continentImages[data.continent] || 'https://picsum.photos/seed/world/800/600',
                    isBuiltIn: true
                };
            }
        } else {
             catId = 'cat_world'; // fallback
        }

        locations.push({
            lat: data.lat,
            lng: data.lng,
            city: data.city_original || data.city,
            country: data.country,
            region: data.admin,
            continent: data.continent,
            population: data.population,
            categoryId: catId
        });
    });

    if (!categoriesMap['cat_world']) {
        categoriesMap['cat_world'] = {
             id: 'cat_world',
             name: 'World Tour',
             description: 'Famous cities and capitals around the globe.',
             imageUrl: 'https://picsum.photos/seed/worldtour/800/600',
             isBuiltIn: true
        };
    }

    return {
        categories: Object.values(categoriesMap),
        locations
    };
};

const generatedData = generateBuiltInLocationsAndCategories();
export const DEFAULT_CATEGORIES: MapCategory[] = generatedData.categories;
const BUILT_IN_LOCATIONS: LocationData[] = generatedData.locations;

// --- CATEGORY HELPERS ---

export const getCategories = (): MapCategory[] => {
    try {
        const stored = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
        const customCategories = stored ? JSON.parse(stored) : [];
        return [...DEFAULT_CATEGORIES, ...customCategories];
    } catch (e) {
        return DEFAULT_CATEGORIES;
    }
};

export const addCategory = (category: MapCategory) => {
    const categories = getCategories().filter(c => !c.isBuiltIn); // Only get stored customs to append
    categories.push(category);
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(categories));
};

export const deleteCategory = (id: string) => {
    const categories = getCategories().filter(c => !c.isBuiltIn);
    const newCategories = categories.filter(c => c.id !== id);
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(newCategories));
};

// --- HELPER LOCAL STORAGE ---
export const getStoredCustomLocations = (): LocationData[] => {
    try {
        const stored = localStorage.getItem(CUSTOM_LOCATIONS_KEY);
        if (!stored) return [];
        const decompressed = LZString.decompressFromUTF16(stored);
        const parsed = decompressed ? JSON.parse(decompressed) : [];
        return parsed.map((l: LocationData) => ({...l, isCustom: true}));
    } catch (e) {
        console.error("Gagal memuat lokasi kustom:", e);
        return [];
    }
};

const saveCustomLocationsToStorage = (locations: LocationData[]) => {
    try {
        const jsonString = JSON.stringify(locations);
        const compressed = LZString.compressToUTF16(jsonString);
        localStorage.setItem(CUSTOM_LOCATIONS_KEY, compressed);
        availableLocations = null;
    } catch (e: any) {
        console.error("Gagal menyimpan lokasi kustom:", e);
        if (e.name === 'QuotaExceededError' || (e.message && e.message.toLowerCase().includes('quota'))) {
            throw new Error("Penyimpanan lokal penuh! File CSV Anda terlalu besar (maksimal sekitar 15.000~20.000 batas tarikan). Silakan potong file CSV Anda.");
        }
        throw e;
    }
};

const getDisabledBuiltInIds = (): string[] => {
    try {
        const stored = localStorage.getItem(DISABLED_BUILTINS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
};

export const toggleBuiltInLocation = (id: string) => {
    try {
        let disabled = getDisabledBuiltInIds();
        if (disabled.includes(id)) {
            disabled = disabled.filter(d => d !== id);
        } else {
            disabled.push(id);
        }
        localStorage.setItem(DISABLED_BUILTINS_KEY, JSON.stringify(disabled));
        availableLocations = null; 
    } catch (e) {
        console.error("Gagal toggle builtin location:", e);
    }
};

export const getAllLocations = (): LocationData[] => {
    const disabledIds = getDisabledBuiltInIds();
    
    const builtIn = BUILT_IN_LOCATIONS.map((l, i) => {
        const id = `builtin_${i}`;
        return {
            ...l, 
            id: id, 
            isCustom: false,
            isDisabled: disabledIds.includes(id)
        };
    });
    
    const custom = getStoredCustomLocations();
    return [...builtIn, ...custom];
};


const shuffle = <T>(array: T[]): T[] => {
  let currentIndex = array.length,  randomIndex;
  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }
  return array;
};

let availableLocations: LocationData[] | null = null;
let currentCategoryId: string | null = null; // Track current filter

export const getLocationCount = (categoryId?: string) => {
    const all = getAllLocations();
    let active = all.filter(l => !l.isDisabled);
    if (categoryId && categoryId !== 'cat_world') {
        active = active.filter(l => l.categoryId === categoryId);
    }
    return active.length;
};

// Updated Reset to accept Category
export const resetGameService = (categoryId?: string) => {
  currentCategoryId = categoryId || null;
  const allLocs = getAllLocations();
  let activeLocs = allLocs.filter(l => !l.isDisabled);

  if (categoryId && categoryId !== 'cat_world') {
      activeLocs = activeLocs.filter(l => l.categoryId === categoryId);
  }
  
  // If selected category has no maps, fallback to all, or warn? 
  // For now we allow empty, app will handle Game Over immediately.
  
  availableLocations = shuffle([...activeLocs]);
};

export const generateRandomLocation = async (categoryId?: string): Promise<LocationData | null> => {
  await new Promise(resolve => setTimeout(resolve, 300));

  // Determine if we need to load/reload deck
  // 1. If it's the very first run (availableLocations is null)
  // 2. If the category has changed since last pick
  const isFirstLoad = availableLocations === null;
  const isCategoryChanged = categoryId !== undefined && currentCategoryId !== categoryId;

  if (isFirstLoad || isCategoryChanged) {
      resetGameService(categoryId);
  }

  // IMPORTANT: Do NOT auto-refill if availableLocations is empty.
  // We want the game to end (return null) if all locations in the shuffled deck are used.
  if (!availableLocations || availableLocations.length === 0) {
      return null;
  }

  let attempts = 0;
  const MAX_ATTEMPTS = 5;

  while (attempts < MAX_ATTEMPTS) {
      if (availableLocations.length === 0) return null;
      
      const candidate = availableLocations.pop();
      if (!candidate) return null;

      if (window.google && window.google.maps) {
          const svService = new window.google.maps.StreetViewService();
          try {
              const { data } = await svService.getPanorama({
                  location: { lat: candidate.lat, lng: candidate.lng },
                  radius: 1000,
                  preference: window.google.maps.StreetViewPreference.NEAREST
              });
              
              if (data && data.location && data.location.latLng) {
                  candidate.lat = data.location.latLng.lat();
                  candidate.lng = data.location.latLng.lng();
                  return candidate;
              }
          } catch (e) {
              console.warn(`[GeoMad] Skipping ${candidate.city} - No Street View data.`);
              attempts++;
              continue;
          }
      }

      return candidate;
  }

  return null;
};

// Helper: Normalize string (remove accents, lowercase)
// Example: "Råholt" -> "raholt"
const normalizeText = (text: string) => {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};

export const evaluateGuess = async (userInput: string, actualLocation: LocationData, isHardMode: boolean = false): Promise<GuessResult> => {
  // Normalize User Input
  const guess = normalizeText(userInput);
  
  if (!guess || guess.length < 3) {
      return {
        correct: false,
        matchesCity: false,
        matchesCountry: false,
        points: 0,
        message: "Guess too short",
        actualLocation: `${actualLocation.city}, ${actualLocation.country}`,
        guessType: 'WRONG'
      };
  }

  // Normalize Target Data
  const targetCity = normalizeText(actualLocation.city);
  const targetCountry = normalizeText(actualLocation.country);
  
  let correct = false;
  let points = 0;
  let message = "";
  let guessType: 'CITY' | 'COUNTRY' | 'WRONG' = 'WRONG';

  // Compare using Normalized strings INDEPENDENTLY
  const isCityMatch = guess.includes(targetCity) || (targetCity.includes(guess) && guess.length >= 3);
  const isCountryMatch = guess.includes(targetCountry) || (targetCountry.includes(guess) && guess.length >= 4);

  // Logic to determine initial guessType (Priority: City -> Country)
  if (isCityMatch) {
    correct = true;
    points = 10; 
    guessType = 'CITY';
    message = `Correct City! It's ${actualLocation.city}`;
  } 
  else if (isCountryMatch) {
    if (isHardMode) {
        correct = false; // In hard mode, country guesses are wrong, but we still flag matchesCountry as true
        points = 0;
        guessType = 'WRONG';
        message = `Hard Mode Active: Guess the CITY only!`;
    } else {
        correct = true;
        points = 5; 
        guessType = 'COUNTRY';
        message = `Correct Country! It's ${actualLocation.country}`;
    }
  }
  else {
    correct = false;
    points = 0;
    guessType = 'WRONG';
    message = `Wrong. It was ${actualLocation.city}, ${actualLocation.country}`;
  }

  return {
    correct,
    matchesCity: isCityMatch,
    matchesCountry: isCountryMatch,
    points,
    message,
    actualLocation: `${actualLocation.city}, ${actualLocation.country}`,
    guessType
  };
};

export const parseCoordinatesFromUrl = (url: string): { lat: number, lng: number } | null => {
    try {
        const decodedUrl = decodeURIComponent(url);

        if (decodedUrl.includes('mapcrunch.com/p/')) {
            const parts = decodedUrl.split('/p/')[1].split('_');
            if (parts.length >= 2) {
                return { lat: parseFloat(parts[0]), lng: parseFloat(parts[1]) };
            }
        }

        const googleAtPattern = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
        const matchAt = decodedUrl.match(googleAtPattern);
        if (matchAt && matchAt.length >= 3) {
            return { lat: parseFloat(matchAt[1]), lng: parseFloat(matchAt[2]) };
        }

        const googleQueryPattern = /[?&](?:q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/;
        const matchQuery = decodedUrl.match(googleQueryPattern);
        if (matchQuery && matchQuery.length >= 3) {
            return { lat: parseFloat(matchQuery[1]), lng: parseFloat(matchQuery[2]) };
        }

        const simplePattern = /^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/;
        const matchSimple = decodedUrl.trim().match(simplePattern);
        if (matchSimple && matchSimple.length >= 3) {
             return { lat: parseFloat(matchSimple[1]), lng: parseFloat(matchSimple[2]) };
        }

        return null;
    } catch (e) {
        console.error("Error parsing URL", e);
        return null;
    }
};

// Generate Simple ID
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

export const addCustomLocation = async (lat: number, lng: number, manualData?: {city: string, country: string, region: string, categoryId?: string}): Promise<LocationData> => {
    try {
        const allLocs = getStoredCustomLocations();
        const EPSILON = 0.0001; 
        
        const existingLocation = allLocs.find(l => 
            Math.abs(l.lat - lat) < EPSILON && Math.abs(l.lng - lng) < EPSILON
        );

        if (existingLocation) return existingLocation;

        let city = "Unknown City";
        let country = "Unknown Country";
        let region = "";

        if (manualData) {
            city = manualData.city;
            country = manualData.country;
            region = manualData.region;
        } else {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
                headers: { 'User-Agent': 'GeoGuesserGame/1.0' }
            });

            if (!response.ok) throw new Error("Gagal mengambil data lokasi");

            const data = await response.json();
            const address = data.address;
            if (!address) throw new Error("Tidak ada alamat ditemukan.");

            city = address.city || address.town || address.municipality || address.county || address.city_district || address.district || address.village || "Unknown City";
            country = address.country || "Unknown Country";
            region = address.state || address.region || "";
        }

        const newLocation: LocationData = {
            id: generateId(),
            isCustom: true,
            categoryId: manualData?.categoryId || 'cat_world', // Default to World if not specified
            lat,
            lng,
            city,
            country,
            region,
        };

        allLocs.push(newLocation);
        saveCustomLocationsToStorage(allLocs);
        
        if (availableLocations) availableLocations.push(newLocation);
        else resetGameService();

        return newLocation;

    } catch (error) {
        console.error("Add Custom Location Error:", error);
        throw error;
    }
};

export const addBulkCustomLocations = (locations: LocationData[]) => {
    const allLocs = getStoredCustomLocations();
    const updatedLocs = [...allLocs, ...locations];
    saveCustomLocationsToStorage(updatedLocs);
    resetGameService();
};

export const updateCustomLocation = (updatedLoc: LocationData) => {
    const allLocs = getStoredCustomLocations();
    const index = allLocs.findIndex(l => l.id === updatedLoc.id);
    if (index !== -1) {
        allLocs[index] = { ...updatedLoc, isCustom: true };
        saveCustomLocationsToStorage(allLocs);
    }
};

export const deleteCustomLocation = (id: string) => {
    const allLocs = getStoredCustomLocations();
    const filtered = allLocs.filter(l => l.id !== id);
    saveCustomLocationsToStorage(filtered);
};
