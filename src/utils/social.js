import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getFirebaseApp } from './device.js';
import { DeviceManager } from './device.js';
import { SocialProfile, Achievement } from '../types';

export class SocialManager {
  static PROFILES_STORAGE_KEY = 'social_profiles';
  static FRIENDS_STORAGE_KEY = 'friends_list';

  // Get or create social profile
  static async getSocialProfile(deviceId = null) {
    try {
      const targetDeviceId = deviceId || await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const profileRef = doc(db, 'social_profiles', targetDeviceId);
      const profileDoc = await getDoc(profileRef);

      if (profileDoc.exists()) {
        const data = profileDoc.data();
        return {
          id: targetDeviceId,
          displayName: data.displayName || `User ${targetDeviceId.slice(-4)}`,
          avatar: data.avatar,
          status: data.status || 'available',
          interests: data.interests || [],
          socialLinks: data.socialLinks || [],
          achievements: data.achievements || [],
          bio: data.bio || '',
          lastActive: data.lastActive?.toDate() || new Date(),
          level: data.level || 1,
          experience: data.experience || 0,
          gamesPlayed: data.gamesPlayed || 0,
          gamesWon: data.gamesWon || 0,
          friendsCount: data.friendsCount || 0
        };
      }

      // Create default profile
      const defaultProfile = {
        id: targetDeviceId,
        displayName: `User ${targetDeviceId.slice(-4)}`,
        status: 'available',
        interests: [],
        socialLinks: [],
        achievements: [],
        bio: '',
        lastActive: new Date(),
        level: 1,
        experience: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        friendsCount: 0
      };

      await setDoc(profileRef, defaultProfile);
      return defaultProfile;
    } catch (error) {
      console.error('Error getting social profile:', error);
      return null;
    }
  }

  // Update social profile
  static async updateSocialProfile(updates) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const profileRef = doc(db, 'social_profiles', deviceId);
      await updateDoc(profileRef, {
        ...updates,
        lastActive: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error updating social profile:', error);
      return false;
    }
  }

  // Update online status
  static async updateStatus(status) {
    const validStatuses = ['available', 'busy', 'away', 'offline'];
    if (!validStatuses.includes(status)) {
      throw new Error('Invalid status');
    }
    return await this.updateSocialProfile({ status });
  }

  // Add interest
  static async addInterest(interest) {
    try {
      const profile = await this.getSocialProfile();
      if (!profile) return false;

      const interests = [...profile.interests];
      if (!interests.includes(interest)) {
        interests.push(interest);
        return await this.updateSocialProfile({ interests });
      }
      return true;
    } catch (error) {
      console.error('Error adding interest:', error);
      return false;
    }
  }

  // Remove interest
  static async removeInterest(interest) {
    try {
      const profile = await this.getSocialProfile();
      if (!profile) return false;

      const interests = profile.interests.filter(i => i !== interest);
      return await this.updateSocialProfile({ interests });
    } catch (error) {
      console.error('Error removing interest:', error);
      return false;
    }
  }

  // Add social link
  static async addSocialLink(platform, handle, url) {
    try {
      const link = { platform, handle, url };
      const db = getFirestore(getFirebaseApp());
      const deviceId = await DeviceManager.getDeviceId();

      const profileRef = doc(db, 'social_profiles', deviceId);
      await updateDoc(profileRef, {
        socialLinks: arrayUnion(link)
      });

      return true;
    } catch (error) {
      console.error('Error adding social link:', error);
      return false;
    }
  }

  // Remove social link
  static async removeSocialLink(platform, handle) {
    try {
      const profile = await this.getSocialProfile();
      if (!profile) return false;

      const linkToRemove = profile.socialLinks.find(link =>
        link.platform === platform && link.handle === handle
      );

      if (linkToRemove) {
        const db = getFirestore(getFirebaseApp());
        const deviceId = await DeviceManager.getDeviceId();
        const profileRef = doc(db, 'social_profiles', deviceId);

        await updateDoc(profileRef, {
          socialLinks: arrayRemove(linkToRemove)
        });
      }

      return true;
    } catch (error) {
      console.error('Error removing social link:', error);
      return false;
    }
  }

  // Award achievement
  static async awardAchievement(achievementId, name, description, icon) {
    try {
      const achievement = {
        id: achievementId,
        name,
        description,
        icon,
        unlockedAt: new Date()
      };

      const db = getFirestore(getFirebaseApp());
      const deviceId = await DeviceManager.getDeviceId();
      const profileRef = doc(db, 'social_profiles', deviceId);

      await updateDoc(profileRef, {
        achievements: arrayUnion(achievement)
      });

      // Log achievement
      await setDoc(doc(collection(db, 'achievement_logs')), {
        deviceId,
        achievementId,
        achievementName: name,
        unlockedAt: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error awarding achievement:', error);
      return false;
    }
  }

  // Get achievements
  static async getAchievements(deviceId = null) {
    try {
      const profile = await this.getSocialProfile(deviceId);
      return profile?.achievements || [];
    } catch (error) {
      console.error('Error getting achievements:', error);
      return [];
    }
  }

  // Friend management
  static async sendFriendRequest(targetDeviceId, message = '') {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const requestId = `friend_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const friendRequest = {
        id: requestId,
        from: deviceId,
        to: targetDeviceId,
        message: message,
        status: 'pending',
        createdAt: new Date()
      };

      await setDoc(doc(db, 'friend_requests', requestId), friendRequest);

      return friendRequest;
    } catch (error) {
      console.error('Error sending friend request:', error);
      throw error;
    }
  }

  // Accept friend request
  static async acceptFriendRequest(requestId) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const requestRef = doc(db, 'friend_requests', requestId);
      const requestDoc = await getDoc(requestRef);

      if (!requestDoc.exists()) {
        throw new Error('Friend request not found');
      }

      const request = requestDoc.data();

      if (request.to !== deviceId) {
        throw new Error('Not authorized to accept this request');
      }

      // Update request status
      await updateDoc(requestRef, {
        status: 'accepted',
        acceptedAt: new Date()
      });

      // Add to friends lists
      const profileRef1 = doc(db, 'social_profiles', request.from);
      const profileRef2 = doc(db, 'social_profiles', request.to);

      await updateDoc(profileRef1, {
        friends: arrayUnion(request.to),
        friendsCount: await this.getFriendsCount(request.from) + 1
      });

      await updateDoc(profileRef2, {
        friends: arrayUnion(request.from),
        friendsCount: await this.getFriendsCount(request.to) + 1
      });

      return true;
    } catch (error) {
      console.error('Error accepting friend request:', error);
      return false;
    }
  }

  // Decline friend request
  static async declineFriendRequest(requestId) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const requestRef = doc(db, 'friend_requests', requestId);
      const requestDoc = await getDoc(requestRef);

      if (!requestDoc.exists()) {
        throw new Error('Friend request not found');
      }

      const request = requestDoc.data();

      if (request.to !== deviceId) {
        throw new Error('Not authorized to decline this request');
      }

      await updateDoc(requestRef, {
        status: 'declined',
        declinedAt: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error declining friend request:', error);
      return false;
    }
  }

  // Get friend requests
  static async getFriendRequests(status = 'pending') {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const requestsRef = collection(db, 'friend_requests');
      const q = query(
        requestsRef,
        where('to', '==', deviceId),
        where('status', '==', status)
      );

      const querySnapshot = await getDocs(q);
      const requests = [];

      querySnapshot.forEach((doc) => {
        requests.push({ id: doc.id, ...doc.data() });
      });

      return requests;
    } catch (error) {
      console.error('Error getting friend requests:', error);
      return [];
    }
  }

  // Get friends list
  static async getFriends(deviceId = null) {
    try {
      const targetDeviceId = deviceId || await DeviceManager.getDeviceId();
      const profile = await this.getSocialProfile(targetDeviceId);

      if (!profile || !profile.friends) return [];

      // Get friend profiles
      const friends = [];
      for (const friendId of profile.friends) {
        const friendProfile = await this.getSocialProfile(friendId);
        if (friendProfile) {
          friends.push(friendProfile);
        }
      }

      return friends;
    } catch (error) {
      console.error('Error getting friends:', error);
      return [];
    }
  }

  // Get friends count
  static async getFriendsCount(deviceId = null) {
    try {
      const friends = await this.getFriends(deviceId);
      return friends.length;
    } catch (error) {
      console.error('Error getting friends count:', error);
      return 0;
    }
  }

  // Remove friend
  static async removeFriend(friendId) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const profileRef1 = doc(db, 'social_profiles', deviceId);
      const profileRef2 = doc(db, 'social_profiles', friendId);

      await updateDoc(profileRef1, {
        friends: arrayRemove(friendId),
        friendsCount: await this.getFriendsCount(deviceId) - 1
      });

      await updateDoc(profileRef2, {
        friends: arrayRemove(deviceId),
        friendsCount: await this.getFriendsCount(friendId) - 1
      });

      return true;
    } catch (error) {
      console.error('Error removing friend:', error);
      return false;
    }
  }

  // Discover users by interests
  static async discoverUsersByInterests(interests, limit = 20) {
    try {
      const db = getFirestore(getFirebaseApp());
      const profilesRef = collection(db, 'social_profiles');

      // For each interest, find users
      const userSets = [];

      for (const interest of interests) {
        const q = query(profilesRef, where('interests', 'array-contains', interest));
        const querySnapshot = await getDocs(q);

        const users = [];
        querySnapshot.forEach((doc) => {
          users.push({ id: doc.id, ...doc.data() });
        });
        userSets.push(new Set(users.map(u => u.id)));
      }

      // Find intersection of all interest sets
      if (userSets.length === 0) return [];

      let intersection = userSets[0];
      for (let i = 1; i < userSets.length; i++) {
        intersection = new Set([...intersection].filter(id => userSets[i].has(id)));
      }

      // Get user details
      const discoveredUsers = [];
      for (const userId of intersection) {
        if (discoveredUsers.length >= limit) break;
        const profile = await this.getSocialProfile(userId);
        if (profile) {
          discoveredUsers.push(profile);
        }
      }

      return discoveredUsers;
    } catch (error) {
      console.error('Error discovering users:', error);
      return [];
    }
  }

  // Get leaderboard
  static async getLeaderboard(sortBy = 'experience', limit = 50) {
    try {
      const db = getFirestore(getFirebaseApp());
      const profilesRef = collection(db, 'social_profiles');

      let q;
      if (sortBy === 'experience') {
        q = query(profilesRef, orderBy('experience', 'desc'), limit(limit));
      } else if (sortBy === 'level') {
        q = query(profilesRef, orderBy('level', 'desc'), limit(limit));
      } else if (sortBy === 'gamesWon') {
        q = query(profilesRef, orderBy('gamesWon', 'desc'), limit(limit));
      }

      const querySnapshot = await getDocs(q);
      const leaderboard = [];

      querySnapshot.forEach((doc) => {
        leaderboard.push({ id: doc.id, ...doc.data() });
      });

      return leaderboard;
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      return [];
    }
  }

  // Update game statistics
  static async updateGameStats(won = false) {
    try {
      const profile = await this.getSocialProfile();
      if (!profile) return false;

      const updates = {
        gamesPlayed: profile.gamesPlayed + 1,
        gamesWon: won ? profile.gamesWon + 1 : profile.gamesWon,
        experience: profile.experience + (won ? 10 : 5)
      };

      // Level up logic (every 100 experience points)
      const newLevel = Math.floor(updates.experience / 100) + 1;
      if (newLevel > profile.level) {
        updates.level = newLevel;
        // Award level up achievement
        await this.awardAchievement(
          `level_${newLevel}`,
          `Level ${newLevel}`,
          `Reached level ${newLevel}!`,
          '🏆'
        );
      }

      return await this.updateSocialProfile(updates);
    } catch (error) {
      console.error('Error updating game stats:', error);
      return false;
    }
  }

  // Get online friends
  static async getOnlineFriends() {
    try {
      const friends = await this.getFriends();
      const onlineFriends = [];

      for (const friend of friends) {
        // Consider online if last active within 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        if (friend.lastActive > fiveMinutesAgo && friend.status === 'available') {
          onlineFriends.push(friend);
        }
      }

      return onlineFriends;
    } catch (error) {
      console.error('Error getting online friends:', error);
      return [];
    }
  }

  // Search users
  static async searchUsers(query, limit = 20) {
    try {
      const db = getFirestore(getFirebaseApp());
      const profilesRef = collection(db, 'social_profiles');

      // Simple search by display name (Firestore doesn't support complex text search)
      const q = query(profilesRef, limit(limit * 2)); // Get more to filter
      const querySnapshot = await getDocs(q);

      const users = [];
      querySnapshot.forEach((doc) => {
        const profile = { id: doc.id, ...doc.data() };
        if (profile.displayName.toLowerCase().includes(query.toLowerCase())) {
          users.push(profile);
        }
      });

      return users.slice(0, limit);
    } catch (error) {
      console.error('Error searching users:', error);
      return [];
    }
  }
}

export default SocialManager;