
import { ChatMessage, ConnectionStatus, LikeEvent } from '../types';

type ChatCallback = (msg: ChatMessage) => void;
type LikeCallback = (event: LikeEvent) => void;
type StatusCallback = (status: ConnectionStatus) => void;

class TikTokService {
  private ws: WebSocket | null = null;
  private chatCallbacks: ChatCallback[] = [];
  private likeCallbacks: LikeCallback[] = [];
  private statusCallbacks: StatusCallback[] = [];
  private status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private simulationInterval: any = null;
  private simulationLikeInterval: any = null;

  // URL akan di-set secara dinamis saat connect() dipanggil
  private wsUrl: string = ""; 

  connect() {
    if (this.status === ConnectionStatus.CONNECTED) return;

    // --- DYNAMIC HOSTNAME DETECTION ---
    // Menggunakan hostname dari browser. 
    // Jika di PC: localhost -> ws://localhost:62024
    // Jika di HP: 192.168.x.x -> ws://192.168.x.x:62024
    const hostname = localhost;
    const port = '62024'; // Port standar Indofinity/TikFinity
    this.wsUrl = `ws://${hostname}:${port}`;

    console.log(`[TikTokService] Connecting to WebSocket at: ${this.wsUrl}`);
    this.updateStatus(ConnectionStatus.CONNECTING);

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log("[TikTokService] Terhubung ke IndoFinity WebSocket");
        this.updateStatus(ConnectionStatus.CONNECTED);
      };

      this.ws.onmessage = (event) => {
        try {
          // Parsing sesuai referensi Indofinity
          const message = JSON.parse(event.data);
          const { event: eventName, data: eventData } = message;

          // Handle event 'chat'
          if (eventName === 'chat' && eventData) {
            // FIX: Prioritaskan msgId (ID Pesan Unik) daripada uniqueId (ID User).
            // Jika msgId tidak ada, gunakan kombinasi UserID + Timestamp agar komentar baru dari user yang sama tetap masuk.
            const messageId = eventData.msgId || `${eventData.uniqueId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            
            const chatMsg: ChatMessage = {
              uniqueId: messageId,
              nickname: eventData.nickname || eventData.uniqueId || "Anon",
              comment: eventData.comment || "",
              profilePictureUrl: eventData.profilePictureUrl
            };
            this.notifyChat(chatMsg);
          }
          
          // Handle event 'like'
          if (eventName === 'like' && eventData) {
            const likeEvent: LikeEvent = {
                uniqueId: eventData.uniqueId || `anon_${Date.now()}`,
                nickname: eventData.nickname || "Anon",
                likeCount: eventData.likeCount || 1,
                totalLikeCount: eventData.totalLikeCount || 0,
                profilePictureUrl: eventData.profilePictureUrl
            };
            this.notifyLike(likeEvent);
          }

        } catch (e) {
          console.error("[TikTokService] Error parsing message:", e);
        }
      };

      this.ws.onerror = (e) => {
        console.warn(`[TikTokService] WebSocket error pada ${this.wsUrl}. Pastikan Indofinity berjalan.`, e);
        this.updateStatus(ConnectionStatus.FAILED);
      };

      this.ws.onclose = () => {
        console.log('[TikTokService] Koneksi WebSocket ditutup');
        this.updateStatus(ConnectionStatus.DISCONNECTED);
        this.ws = null;
        
        // Auto-reconnect logic
        // Hanya reconnect jika status masih DISCONNECTED (bukan manual disconnect)
        setTimeout(() => {
           if (this.status === ConnectionStatus.DISCONNECTED) {
               console.log("[TikTokService] Mencoba menghubungkan ulang...");
               this.connect(); 
           }
        }, 5000);
      };

    } catch (e) {
      console.warn("[TikTokService] WS Connection Error", e);
      this.updateStatus(ConnectionStatus.FAILED);
    }
  }

  disconnect() {
    this.stopSimulation();
    if (this.ws) {
        // Hapus handler onclose agar tidak memicu auto-reconnect saat manual disconnect
        this.ws.onclose = null; 
        this.ws.close();
        this.ws = null;
    }
    this.updateStatus(ConnectionStatus.DISCONNECTED);
  }

  // Demo mode for testing without a live connection
  startSimulation() {
    if (this.simulationInterval) return;
    
    this.updateStatus(ConnectionStatus.CONNECTED);
    console.log("[TikTokService] Starting simulation mode...");

    const randomNames = ["Budi01", "Siti_Gamer", "AgusGeografi", "DewiPutri", "Rizky_Traveler", "IndoGuesser", "TikTokUser123"];
    const randomComments = ["Jakarta", "Bali", "Indonesia", "Jepang", "Salah ini", "Bandung kah?", "Paris", "London", "Halo bang", "Semangat", "New York", "Tokyo"];

    // Simulate Chat
    this.simulationInterval = setInterval(() => {
        const randomName = randomNames[Math.floor(Math.random() * randomNames.length)];
        const randomComment = randomComments[Math.floor(Math.random() * randomComments.length)];
        
        const msg: ChatMessage = {
            uniqueId: `${randomName}_${Date.now()}`, // Unique ID based on time
            nickname: randomName,
            comment: randomComment,
            profilePictureUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${randomName}`
        };
        
        this.notifyChat(msg);
    }, 2000); 

    // Simulate Likes
    this.simulationLikeInterval = setInterval(() => {
        const randomName = randomNames[Math.floor(Math.random() * randomNames.length)];
        const likeEvent: LikeEvent = {
            uniqueId: `${randomName}_like_${Date.now()}`,
            nickname: randomName,
            likeCount: Math.floor(Math.random() * 5) + 1,
            totalLikeCount: 100,
            profilePictureUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${randomName}`
        };
        this.notifyLike(likeEvent);
    }, 800); // More frequent than chat
  }

  stopSimulation() {
      if (this.simulationInterval) {
          clearInterval(this.simulationInterval);
          this.simulationInterval = null;
      }
      if (this.simulationLikeInterval) {
          clearInterval(this.simulationLikeInterval);
          this.simulationLikeInterval = null;
      }
      if (this.status === ConnectionStatus.CONNECTED && !this.ws) {
          this.updateStatus(ConnectionStatus.DISCONNECTED);
      }
  }

  // UPDATED: Returns an unsubscribe function
  onChat(callback: ChatCallback) {
    this.chatCallbacks.push(callback);
    return () => {
        this.chatCallbacks = this.chatCallbacks.filter(cb => cb !== callback);
    };
  }

  // UPDATED: Returns an unsubscribe function
  onLike(callback: LikeCallback) {
      this.likeCallbacks.push(callback);
      return () => {
          this.likeCallbacks = this.likeCallbacks.filter(cb => cb !== callback);
      };
  }

  // UPDATED: Returns an unsubscribe function
  onStatusChange(callback: StatusCallback) {
    this.statusCallbacks.push(callback);
    // Panggil callback segera dengan status saat ini agar UI sinkron
    callback(this.status);
    
    return () => {
        this.statusCallbacks = this.statusCallbacks.filter(cb => cb !== callback);
    };
  }

  private notifyChat(msg: ChatMessage) {
    if (this.chatCallbacks.length > 0) {
        this.chatCallbacks.forEach(cb => cb(msg));
    }
  }

  private notifyLike(event: LikeEvent) {
      if (this.likeCallbacks.length > 0) {
          this.likeCallbacks.forEach(cb => cb(event));
      }
  }

  private updateStatus(newStatus: ConnectionStatus) {
    this.status = newStatus;
    if (this.statusCallbacks.length > 0) {
        this.statusCallbacks.forEach(cb => cb(newStatus));
    }
  }
}

export const tiktokService = new TikTokService();
