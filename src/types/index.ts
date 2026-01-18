// Core Types for Ultimate VLC Proximity Platform

export interface DeviceProfile {
  id: string;
  nickname?: string;
  avatar?: string;
  category: 'family' | 'work' | 'friends' | 'temporary';
  trustLevel: 'basic' | 'trusted' | 'admin';
  lastSeen: Date;
  capabilities: string[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PairingSession {
  id: string;
  devices: string[];
  type: 'permanent' | 'session' | 'temporary';
  expiresAt?: Date;
  permissions: Permission[];
  createdAt: Date;
  lastActivity: Date;
  status: 'active' | 'expired' | 'revoked';
}

export interface Permission {
  resource: string;
  actions: string[];
  conditions?: Record<string, any>;
}

export interface VLCConfig {
  transmissionSpeed: number; // bits per second
  errorCorrectionLevel: number;
  rangeOptimization: boolean;
  adaptiveBrightness: boolean;
  multiChannelEnabled: boolean;
  compressionEnabled: boolean;
}

export interface FileTransfer {
  id: string;
  filename: string;
  size: number;
  type: string;
  checksum: string;
  chunks: FileChunk[];
  progress: number;
  status: 'pending' | 'transferring' | 'complete' | 'failed';
  senderId: string;
  receiverId: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface FileChunk {
  index: number;
  data: string; // Base64 encoded
  checksum: string;
}

export interface SocialProfile {
  id: string;
  displayName: string;
  avatar?: string;
  status: string;
  interests: string[];
  socialLinks: SocialLink[];
  achievements: Achievement[];
  bio?: string;
  lastActive: Date;
}

export interface SocialLink {
  platform: string;
  handle: string;
  url: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: Date;
}

export interface GameSession {
  id: string;
  game: string;
  players: Player[];
  state: GameState;
  winner?: string;
  scores: Record<string, number>;
  createdAt: Date;
  endedAt?: Date;
}

export interface Player {
  deviceId: string;
  profile: SocialProfile;
  ready: boolean;
  joinedAt: Date;
}

export type GameState = Record<string, any>;

export interface Asset {
  id: string;
  name: string;
  type: string;
  location: string;
  status: 'available' | 'checked_out' | 'maintenance';
  assignedTo?: string;
  lastUpdated: Date;
  metadata: Record<string, any>;
}

export interface AttendanceRecord {
  id: string;
  eventId: string;
  attendeeId: string;
  checkInTime: Date;
  checkOutTime?: Date;
  method: 'vlc' | 'manual';
  location?: string;
}

export interface VitalSigns {
  id: string;
  patientId: string;
  timestamp: Date;
  heartRate?: number;
  bloodPressure?: { systolic: number; diastolic: number };
  temperature?: number;
  oxygenSaturation?: number;
  notes?: string;
}

export interface MedicationRecord {
  id: string;
  patientId: string;
  medicationId: string;
  dosage: string;
  administeredBy: string;
  timestamp: Date;
  verified: boolean;
  notes?: string;
}

export interface MeshNetwork {
  id: string;
  devices: string[];
  routes: NetworkRoute[];
  messageQueue: QueuedMessage[];
  status: 'active' | 'degraded' | 'offline';
  lastUpdated: Date;
}

export interface NetworkRoute {
  from: string;
  to: string;
  via: string[];
  quality: number;
  lastUsed: Date;
}

export interface QueuedMessage {
  id: string;
  from: string;
  to: string;
  type: string;
  payload: any;
  priority: 'low' | 'normal' | 'high' | 'critical';
  expiresAt?: Date;
  createdAt: Date;
}

export interface AnalyticsData {
  deviceId: string;
  pairings: PairingStats;
  transfers: TransferStats;
  commands: CommandStats;
  security: SecurityStats;
  performance: PerformanceStats;
  period: {
    start: Date;
    end: Date;
  };
}

export interface PairingStats {
  totalPairings: number;
  successfulPairings: number;
  averagePairingTime: number;
  pairingMethods: Record<string, number>;
  failureReasons: Record<string, number>;
}

export interface TransferStats {
  totalTransfers: number;
  successfulTransfers: number;
  averageTransferSpeed: number;
  totalBytesTransferred: number;
  fileTypes: Record<string, number>;
}

export interface CommandStats {
  totalCommands: number;
  successfulCommands: number;
  commandTypes: Record<string, number>;
  averageResponseTime: number;
}

export interface SecurityStats {
  failedAuthAttempts: number;
  blockedIPs: string[];
  suspiciousActivities: number;
  securityIncidents: SecurityIncident[];
}

export interface SecurityIncident {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  timestamp: Date;
  resolved: boolean;
}

export interface PerformanceStats {
  averageVLCRange: number;
  averageTransmissionSpeed: number;
  errorRate: number;
  batteryImpact: number;
  cpuUsage: number;
}

export interface AuditLog {
  id: string;
  timestamp: Date;
  action: string;
  actor: string;
  target?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

export interface UIState {
  theme: 'light' | 'dark' | 'auto';
  animations: boolean;
  hapticFeedback: boolean;
  soundEffects: boolean;
  quickActions: QuickAction[];
  shortcuts: KeyboardShortcut[];
  language: string;
  fontSize: 'small' | 'medium' | 'large';
}

export interface QuickAction {
  id: string;
  name: string;
  icon: string;
  action: () => void;
  category: string;
  enabled: boolean;
}

export interface KeyboardShortcut {
  id: string;
  key: string;
  modifiers: string[];
  action: () => void;
  description: string;
}

export interface Notification {
  id: string;
  type: 'pairing' | 'message' | 'file' | 'security' | 'system';
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  actions: NotificationAction[];
  expiresAt?: Date;
  createdAt: Date;
  read: boolean;
}

export interface NotificationAction {
  id: string;
  label: string;
  action: () => void;
}

export interface APIEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  handler: Function;
  authRequired: boolean;
  rateLimit?: number;
  description: string;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  lastTriggered?: Date;
  failureCount: number;
}

export interface Command {
  type: string;
  senderId: string;
  receiverId: string;
  payload: any;
  timestamp: Date;
  nonce: string;
  expiresAt: Date;
  signature: string;
}

// Command Types
export const COMMANDS = {
  // Basic commands
  PING: 'ping',
  STATUS: 'status',

  // Data exchange
  SEND_CONTACT: 'send_contact',
  SEND_LOCATION: 'send_location',
  SEND_FILE: 'send_file',
  SEND_MESSAGE: 'send_message',
  SEND_VOICE: 'send_voice',

  // Device control
  REQUEST_PERMISSION: 'request_permission',
  GRANT_ACCESS: 'grant_access',
  REVOKE_ACCESS: 'revoke_access',

  // Social features
  BUSINESS_CARD: 'business_card',
  FRIEND_REQUEST: 'friend_request',

  // Gaming/Social
  GAME_INVITE: 'game_invite',
  CHALLENGE: 'challenge',

  // Enterprise
  ASSET_CHECKOUT: 'asset_checkout',
  INVENTORY_UPDATE: 'inventory_update',
  ATTENDANCE_CHECK: 'attendance_check',

  // Healthcare
  VITAL_SIGNS: 'vital_signs',
  MEDICATION_RECORD: 'medication_record',
  EMERGENCY_ALERT: 'emergency_alert'
} as const;

export type CommandType = typeof COMMANDS[keyof typeof COMMANDS];