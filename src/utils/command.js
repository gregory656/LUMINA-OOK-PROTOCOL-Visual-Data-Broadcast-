import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import * as Contacts from 'expo-contacts';
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { getFirebaseApp } from './device.js';
import { SessionManager } from './session.js';
import { DeviceManager } from './device.js';
import { Command, COMMANDS, FileTransfer, SocialProfile } from '../types';

export class CommandManager {
  static MESSAGES_STORAGE_KEY = 'conversation_history';

  // Send a command to another device
  static async sendCommand(commandType, payload, targetDeviceId) {
    try {
      const deviceId = await DeviceManager.getDeviceId();

      // Check if devices are in an active session
      const hasPermission = await SessionManager.areDevicesPaired(deviceId, targetDeviceId);
      if (!hasPermission) {
        throw new Error('Devices are not paired or session has expired');
      }

      // Check specific permissions for the command type
      const session = await SessionManager.getActiveSession(deviceId);
      if (session) {
        const allowed = await SessionManager.checkPermission(session.id, deviceId, commandType, 'send');
        if (!allowed) {
          throw new Error('Permission denied for this command type');
        }
      }

      // Create the command object
      const command = {
        type: commandType,
        senderId: deviceId,
        receiverId: targetDeviceId,
        payload: payload,
        timestamp: new Date(),
        nonce: await this.generateNonce(),
        expiresAt: new Date(Date.now() + (5 * 60 * 1000)), // 5 minutes
        signature: await this.signCommand(commandType, payload, deviceId, targetDeviceId)
      };

      // Store command locally for history
      await this.storeCommandLocally(command);

      // Log the command
      await this.logCommand(command);

      return command;
    } catch (error) {
      console.error('Error sending command:', error);
      throw error;
    }
  }

  // Contact Sharing: Full vCard exchange with photos
  static async sendContact(contactId, targetDeviceId) {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Contacts permission denied');
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Image]
      });

      const contact = data.find(c => c.id === contactId);
      if (!contact) {
        throw new Error('Contact not found');
      }

      // Create vCard format
      const vCard = this.createVCard(contact);

      const payload = {
        contactId: contact.id,
        vCard: vCard,
        name: contact.name,
        hasPhoto: !!contact.image
      };

      return await this.sendCommand(COMMANDS.SEND_CONTACT, payload, targetDeviceId);
    } catch (error) {
      console.error('Error sending contact:', error);
      throw error;
    }
  }

  // Location Sharing: GPS coordinates with privacy controls
  static async sendLocation(privacyLevel = 'exact', targetDeviceId) {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission denied');
      }

      const location = await Location.getCurrentPositionAsync({});

      let coordinates = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      };

      // Apply privacy controls
      if (privacyLevel === 'approximate') {
        coordinates = this.obfuscateLocation(coordinates, 100); // ±100 meters
      } else if (privacyLevel === 'city') {
        coordinates = this.obfuscateLocation(coordinates, 1000); // ±1km
      }

      const payload = {
        coordinates: coordinates,
        accuracy: location.coords.accuracy,
        timestamp: location.timestamp,
        privacyLevel: privacyLevel,
        altitude: location.coords.altitude,
        heading: location.coords.heading,
        speed: location.coords.speed
      };

      return await this.sendCommand(COMMANDS.SEND_LOCATION, payload, targetDeviceId);
    } catch (error) {
      console.error('Error sending location:', error);
      throw error;
    }
  }

  // File Transfer: Documents, images, videos (with progress)
  static async sendFile(fileUri, fileName, fileType, targetDeviceId, onProgress = null) {
    try {
      // Check file size
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (fileInfo.size > 50 * 1024 * 1024) { // 50MB limit
        throw new Error('File too large (max 50MB)');
      }

      // Calculate checksum
      const checksum = await this.calculateFileChecksum(fileUri);

      // Create file transfer record
      const transferId = `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const transfer = {
        id: transferId,
        filename: fileName,
        size: fileInfo.size,
        type: fileType,
        checksum: checksum,
        chunks: [],
        progress: 0,
        status: 'pending',
        senderId: await DeviceManager.getDeviceId(),
        receiverId: targetDeviceId,
        createdAt: new Date()
      };

      // Store transfer record
      await this.storeFileTransfer(transfer);

      // Send initial transfer command
      const payload = {
        transferId: transferId,
        filename: fileName,
        size: fileInfo.size,
        type: fileType,
        checksum: checksum
      };

      const command = await this.sendCommand(COMMANDS.SEND_FILE, payload, targetDeviceId);

      // Start chunked transfer
      await this.sendFileInChunks(fileUri, transferId, targetDeviceId, onProgress);

      return command;
    } catch (error) {
      console.error('Error sending file:', error);
      throw error;
    }
  }

  // Text Messaging: Full conversation history
  static async sendMessage(text, targetDeviceId, replyTo = null) {
    try {
      const payload = {
        text: text.trim(),
        replyTo: replyTo,
        messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      // Store in conversation history
      await this.addToConversationHistory(await DeviceManager.getDeviceId(), targetDeviceId, payload);

      return await this.sendCommand(COMMANDS.SEND_MESSAGE, payload, targetDeviceId);
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  // Voice Messages: Audio recording and playback
  static async sendVoiceMessage(audioUri, duration, targetDeviceId) {
    try {
      const audioInfo = await FileSystem.getInfoAsync(audioUri);
      const checksum = await this.calculateFileChecksum(audioUri);

      const payload = {
        audioUri: audioUri,
        duration: duration,
        size: audioInfo.size,
        checksum: checksum,
        messageId: `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      return await this.sendCommand(COMMANDS.SEND_VOICE, payload, targetDeviceId);
    } catch (error) {
      console.error('Error sending voice message:', error);
      throw error;
    }
  }

  // Business Cards: Professional contact exchange
  static async sendBusinessCard(cardData, targetDeviceId) {
    try {
      const payload = {
        ...cardData,
        cardId: `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        format: 'vCard'
      };

      return await this.sendCommand(COMMANDS.BUSINESS_CARD, payload, targetDeviceId);
    } catch (error) {
      console.error('Error sending business card:', error);
      throw error;
    }
  }

  // Asset Management: Check in/out equipment
  static async checkOutAsset(assetId, assigneeId, targetDeviceId) {
    try {
      const payload = {
        assetId: assetId,
        assigneeId: assigneeId,
        action: 'checkout',
        timestamp: new Date(),
        checkoutId: `checkout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      return await this.sendCommand(COMMANDS.ASSET_CHECKOUT, payload, targetDeviceId);
    } catch (error) {
      console.error('Error checking out asset:', error);
      throw error;
    }
  }

  // Attendance Tracking: Event check-in systems
  static async checkInAttendance(eventId, attendeeInfo, targetDeviceId) {
    try {
      const location = await this.getCurrentLocation();

      const payload = {
        eventId: eventId,
        attendeeInfo: attendeeInfo,
        checkInTime: new Date(),
        location: location,
        attendanceId: `attendance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        method: 'vlc'
      };

      return await this.sendCommand(COMMANDS.ATTENDANCE_CHECK, payload, targetDeviceId);
    } catch (error) {
      console.error('Error checking in attendance:', error);
      throw error;
    }
  }

  // Friend Request
  static async sendFriendRequest(targetDeviceId, message = '') {
    try {
      const payload = {
        message: message,
        requestId: `friend_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      return await this.sendCommand(COMMANDS.FRIEND_REQUEST, payload, targetDeviceId);
    } catch (error) {
      console.error('Error sending friend request:', error);
      throw error;
    }
  }

  // Game Invite
  static async sendGameInvite(gameType, targetDeviceId, gameSettings = {}) {
    try {
      const payload = {
        gameType: gameType,
        gameSettings: gameSettings,
        inviteId: `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      return await this.sendCommand(COMMANDS.GAME_INVITE, payload, targetDeviceId);
    } catch (error) {
      console.error('Error sending game invite:', error);
      throw error;
    }
  }

  // Helper methods
  static async generateNonce() {
    const randomBytes = await Crypto.getRandomBytesAsync(16);
    return Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  static async signCommand(type, payload, senderId, receiverId) {
    // Simple signature for demo - in production use proper cryptographic signing
    const message = `${type}:${senderId}:${receiverId}:${JSON.stringify(payload)}`;
    const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, message);
    return hash;
  }

  static createVCard(contact) {
    let vCard = 'BEGIN:VCARD\nVERSION:3.0\n';

    if (contact.name) {
      vCard += `FN:${contact.name}\n`;
      vCard += `N:${contact.name};;;\n`;
    }

    if (contact.phoneNumbers) {
      contact.phoneNumbers.forEach(phone => {
        vCard += `TEL;TYPE=${phone.label || 'VOICE'}:${phone.number}\n`;
      });
    }

    if (contact.emails) {
      contact.emails.forEach(email => {
        vCard += `EMAIL;TYPE=${email.label || 'INTERNET'}:${email.email}\n`;
      });
    }

    vCard += 'END:VCARD\n';
    return vCard;
  }

  static obfuscateLocation(coords, meters) {
    // Simple obfuscation by adding random offset
    const latOffset = (Math.random() - 0.5) * (meters / 111000); // 1 degree lat ≈ 111km
    const lngOffset = (Math.random() - 0.5) * (meters / (111000 * Math.cos(coords.latitude * Math.PI / 180)));

    return {
      latitude: coords.latitude + latOffset,
      longitude: coords.longitude + lngOffset
    };
  }

  static async calculateFileChecksum(fileUri) {
    try {
      const fileContent = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64
      });
      return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, fileContent);
    } catch (error) {
      console.error('Error calculating checksum:', error);
      return null;
    }
  }

  static async sendFileInChunks(fileUri, transferId, targetDeviceId, onProgress) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      const chunkSize = 1024 * 1024; // 1MB chunks
      const totalChunks = Math.ceil(fileInfo.size / chunkSize);

      for (let i = 0; i < totalChunks; i++) {
        const offset = i * chunkSize;
        const chunkData = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
          position: offset,
          length: Math.min(chunkSize, fileInfo.size - offset)
        });

        const chunk = {
          index: i,
          data: chunkData,
          checksum: await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, chunkData)
        };

        // Send chunk command
        await this.sendCommand('file_chunk', {
          transferId: transferId,
          chunk: chunk
        }, targetDeviceId);

        // Update progress
        const progress = ((i + 1) / totalChunks) * 100;
        if (onProgress) {
          onProgress(progress);
        }

        // Store chunk locally
        await this.storeFileChunk(transferId, chunk);
      }

      // Send completion command
      await this.sendCommand('file_complete', { transferId }, targetDeviceId);
    } catch (error) {
      console.error('Error sending file chunks:', error);
      // Send error command
      await this.sendCommand('file_error', {
        transferId,
        error: error.message
      }, targetDeviceId);
    }
  }

  static async getCurrentLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;

      const location = await Location.getCurrentPositionAsync({});
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy
      };
    } catch (error) {
      console.error('Error getting location:', error);
      return null;
    }
  }

  // Storage methods
  static async storeCommandLocally(command) {
    try {
      const stored = await AsyncStorage.getItem('commands');
      const commands = stored ? JSON.parse(stored) : [];
      commands.push(command);

      // Keep only last 100 commands
      if (commands.length > 100) {
        commands.splice(0, commands.length - 100);
      }

      await AsyncStorage.setItem('commands', JSON.stringify(commands));
    } catch (error) {
      console.error('Error storing command locally:', error);
    }
  }

  static async storeFileTransfer(transfer) {
    try {
      const db = getFirestore(getFirebaseApp());
      await setDoc(doc(db, 'file_transfers', transfer.id), transfer);
    } catch (error) {
      console.error('Error storing file transfer:', error);
    }
  }

  static async storeFileChunk(transferId, chunk) {
    try {
      const db = getFirestore(getFirebaseApp());
      const chunkRef = doc(collection(db, 'file_transfers', transferId, 'chunks'));
      await setDoc(chunkRef, chunk);
    } catch (error) {
      console.error('Error storing file chunk:', error);
    }
  }

  static async addToConversationHistory(senderId, receiverId, message) {
    try {
      const conversationKey = [senderId, receiverId].sort().join('_');
      const stored = await AsyncStorage.getItem(this.MESSAGES_STORAGE_KEY);
      const conversations = stored ? JSON.parse(stored) : {};

      if (!conversations[conversationKey]) {
        conversations[conversationKey] = [];
      }

      conversations[conversationKey].push({
        ...message,
        senderId: senderId,
        timestamp: new Date()
      });

      // Keep only last 50 messages per conversation
      if (conversations[conversationKey].length > 50) {
        conversations[conversationKey].splice(0, conversations[conversationKey].length - 50);
      }

      await AsyncStorage.setItem(this.MESSAGES_STORAGE_KEY, JSON.stringify(conversations));
    } catch (error) {
      console.error('Error storing conversation:', error);
    }
  }

  static async getConversationHistory(otherDeviceId) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const conversationKey = [deviceId, otherDeviceId].sort().join('_');
      const stored = await AsyncStorage.getItem(this.MESSAGES_STORAGE_KEY);
      const conversations = stored ? JSON.parse(stored) : {};

      return conversations[conversationKey] || [];
    } catch (error) {
      console.error('Error getting conversation history:', error);
      return [];
    }
  }

  static async logCommand(command) {
    try {
      const db = getFirestore(getFirebaseApp());
      await setDoc(doc(collection(db, 'command_logs')), {
        ...command,
        loggedAt: new Date()
      });
    } catch (error) {
      console.error('Error logging command:', error);
    }
  }

  // Command processing (when receiving commands)
  static async processIncomingCommand(command) {
    try {
      // Validate command
      if (!await this.validateCommand(command)) {
        throw new Error('Invalid command');
      }

      // Process based on command type
      switch (command.type) {
        case COMMANDS.SEND_MESSAGE:
          await this.handleIncomingMessage(command);
          break;
        case COMMANDS.SEND_CONTACT:
          await this.handleIncomingContact(command);
          break;
        case COMMANDS.SEND_LOCATION:
          await this.handleIncomingLocation(command);
          break;
        case COMMANDS.SEND_FILE:
          await this.handleIncomingFile(command);
          break;
        case 'file_chunk':
          await this.handleIncomingFileChunk(command);
          break;
        case 'file_complete':
          await this.handleIncomingFileComplete(command);
          break;
        case COMMANDS.FRIEND_REQUEST:
          await this.handleIncomingFriendRequest(command);
          break;
        case COMMANDS.GAME_INVITE:
          await this.handleIncomingGameInvite(command);
          break;
        default:
          console.log('Unknown command type:', command.type);
      }

      // Log successful processing
      await this.logCommandProcessing(command, 'success');
    } catch (error) {
      console.error('Error processing command:', error);
      await this.logCommandProcessing(command, 'error', error.message);
    }
  }

  static async validateCommand(command) {
    // Basic validation
    const requiredFields = ['type', 'senderId', 'receiverId', 'timestamp', 'signature'];
    for (const field of requiredFields) {
      if (!command[field]) return false;
    }

    // Check expiration
    if (new Date(command.expiresAt) < new Date()) return false;

    // Verify signature (simplified for demo)
    const expectedSignature = await this.signCommand(
      command.type,
      command.payload,
      command.senderId,
      command.receiverId
    );
    return command.signature === expectedSignature;
  }

  static async handleIncomingMessage(command) {
    await this.addToConversationHistory(command.senderId, command.receiverId, command.payload);
  }

  static async handleIncomingContact(command) {
    // Store contact in local contacts or app storage
    console.log('Received contact:', command.payload);
  }

  static async handleIncomingLocation(command) {
    // Store location data
    console.log('Received location:', command.payload);
  }

  static async handleIncomingFile(command) {
    // Initialize file transfer
    console.log('Received file transfer:', command.payload);
  }

  static async handleIncomingFileChunk(command) {
    // Store file chunk
    const { transferId, chunk } = command.payload;
    await this.storeFileChunk(transferId, chunk);
  }

  static async handleIncomingFileComplete(command) {
    // Assemble complete file
    const { transferId } = command.payload;
    await this.assembleCompleteFile(transferId);
  }

  static async handleIncomingFriendRequest(command) {
    // Handle friend request
    console.log('Received friend request:', command.payload);
  }

  static async handleIncomingGameInvite(command) {
    // Handle game invite
    console.log('Received game invite:', command.payload);
  }

  static async assembleCompleteFile(transferId) {
    try {
      const db = getFirestore(getFirebaseApp());
      const chunksRef = collection(db, 'file_transfers', transferId, 'chunks');
      const chunksQuery = query(chunksRef, orderBy('index'));
      const chunksSnapshot = await getDocs(chunksQuery);

      let completeData = '';
      chunksSnapshot.forEach((doc) => {
        const chunk = doc.data();
        completeData += chunk.data;
      });

      // Save complete file
      const transferDoc = await getDoc(doc(db, 'file_transfers', transferId));
      const transfer = transferDoc.data();

      const fileUri = `${FileSystem.documentDirectory}${transfer.filename}`;
      await FileSystem.writeAsStringAsync(fileUri, completeData, {
        encoding: FileSystem.EncodingType.Base64
      });

      console.log('File assembled:', fileUri);
    } catch (error) {
      console.error('Error assembling file:', error);
    }
  }

  static async logCommandProcessing(command, status, error = null) {
    try {
      const db = getFirestore(getFirebaseApp());
      await setDoc(doc(collection(db, 'command_processing_logs')), {
        commandId: command.nonce,
        commandType: command.type,
        senderId: command.senderId,
        receiverId: command.receiverId,
        status: status,
        error: error,
        processedAt: new Date()
      });
    } catch (error) {
      console.error('Error logging command processing:', error);
    }
  }
}

export default CommandManager;