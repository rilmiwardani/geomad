
export interface MapCategory {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  isBuiltIn?: boolean; // If true, cannot be deleted
  locationCount?: number; // Helper for UI
}

export interface LocationData {
  id?: string; // Unique ID for CRUD operations
  categoryId: string; // Linked Category ID
  isCustom?: boolean; // Flag to distinguish between built-in and user locations
  isDisabled?: boolean; // Flag if location is blacklisted/disabled
  lat: number;
  lng: number;
  city: string;
  country: string;
  region?: string;
  continent?: string;
  population?: number;
}

export interface Player {
  name: string;
  score: number;
  lastGuess?: string;
  avatarColor?: string; // Hex color for UI flair
  profilePictureUrl?: string; // TikTok profile pic
  // New tracking for bonus system
  foundCityInRound?: boolean;
  foundCountryInRound?: boolean;
  gotBonus?: boolean;
}

export interface WinnerNotification {
  id: string;
  player: Player;
  type: 'CITY' | 'COUNTRY' | 'BONUS';
  points: number;
  message: string;
}

export interface GameState {
  currentLocation: LocationData | null;
  round: number;
  isGameOver: boolean;
  roundWinners: Player[]; // Pemenang di ronde ini (max 5)
  sessionLeaderboard: Player[]; // Akumulasi skor sesi ini
  // New global tracking for round end condition
  isCityFound: boolean; // True jika semua slot kota habis (atau waktu habis)
  isCountryFound: boolean; // True jika semua slot negara habis (atau waktu habis)
  cityFoundCount: number; // Jumlah slot kota yang terisi (Max 2)
  countryFoundCount: number; // Jumlah slot negara yang terisi (Max 3)
}

export interface GuessResult {
  correct: boolean;
  matchesCity: boolean;    // New: Explicit flag
  matchesCountry: boolean; // New: Explicit flag
  points: number;
  message: string;
  actualLocation: string;
  guessType: 'CITY' | 'COUNTRY' | 'WRONG';
}

export interface ChatMessage {
  uniqueId: string;
  nickname: string;
  comment: string;
  profilePictureUrl?: string;
  isCorrect?: boolean; // Visual helper
}

export interface LikeEvent {
  uniqueId: string;
  nickname: string;
  likeCount: number;
  totalLikeCount: number;
  profilePictureUrl?: string;
}

export interface GameSettings {
  concealClues: boolean;     // Apakah clue disembunyikan di awal?
  concealDuration: number;   // Durasi (detik) sebelum huruf mulai terbuka
  roundDuration: number;     // Total durasi ronde (detik)
  summaryDuration: number;   // Durasi tampilan hasil sebelum lanjut otomatis (detik)
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING_LOCATION = 'LOADING_LOCATION',
  PLAYING = 'PLAYING',
  EVALUATING = 'EVALUATING',
  ROUND_RESULT = 'ROUND_RESULT',
  GAME_OVER = 'GAME_OVER',
  ALL_LEVELS_COMPLETED = 'ALL_LEVELS_COMPLETED',
  ERROR = 'ERROR'
}

export enum ConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  FAILED = 'FAILED'
}
