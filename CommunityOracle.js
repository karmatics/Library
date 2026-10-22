class CommunityOracle {
  static profiles = new Map([
    ['u_rob', { id: 'u_rob', name: 'Rob Brown', tag: 1001, reputation: 0.98, badges: ['Architect', 'Verified'], pollsCreated: 4 }],
    ['u_sarah', { id: 'u_sarah', name: 'Sarah', tag: 1002, reputation: 0.88, badges: ['Top Reviewer'], pollsCreated: 2 }],
    ['u_dave1', { id: 'u_dave1', name: 'Dave', tag: 1042, reputation: 0.72, badges: ['Contributor'], pollsCreated: 1 }],
    ['u_dave2', { id: 'u_dave2', name: 'Dave', tag: 1005, reputation: 0.65, badges: ['Active'], pollsCreated: 0 }],
    ['u_alex', { id: 'u_alex', name: 'Alex', tag: 1088, reputation: 0.45, badges: ['Probationary'], pollsCreated: 0 }]
  ]);

  static loadProfiles() {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('community_profiles_v1');
        if (raw) {
          const arr = JSON.parse(raw);
          arr.forEach(p => this.profiles.set(p.id, p));
        }
      } catch (e) {}
    }
  }

  static saveProfiles() {
    if (typeof localStorage !== 'undefined') {
      try {
        const arr = Array.from(this.profiles.values());
        localStorage.setItem('community_profiles_v1', JSON.stringify(arr));
      } catch (e) {}
    }
  }

  static getAllProfiles() {
    this.loadProfiles();
    return Array.from(this.profiles.values());
  }

  static getProfile(userId) {
    if (!userId) {
      return {
        id: 'u_anon',
        name: 'Anonymous',
        tag: 1099,
        reputation: 0.25,
        badges: ['Guest'],
        pollsCreated: 0
      };
    }
    if (this.profiles.has(userId)) return this.profiles.get(userId);
    this.loadProfiles();
    if (this.profiles.has(userId)) return this.profiles.get(userId);

    const fallbackName = userId.replace(/^u_/, '').replace(/\d+$/, '') || 'Anonymous';
    return {
      id: userId,
      name: fallbackName,
      tag: 1099,
      reputation: 0.35,
      badges: ['New Arrival'],
      pollsCreated: 0
    };
  }

  static addOrUpdateProfile(profileData) {
    if (!profileData) return null;
    const name = (profileData.name || profileData.displayName || 'Anonymous').trim();
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');

    let id = profileData.id;
    if (!id) {
      const existingMatches = Array.from(this.profiles.values()).filter(p => p.name.toLowerCase() === name.toLowerCase());
      id = `u_${normalized}${existingMatches.length > 0 ? existingMatches.length + 1 : ''}`;
    }

    const tag = profileData.tag || Math.floor(1000 + Math.random() * 9000);
    const reputation = profileData.reputation !== undefined ? profileData.reputation : 0.50;
    const badges = profileData.badges || (reputation >= 0.8 ? ['Verified'] : ['Contributor']);

    const profile = {
      id,
      name,
      displayName: name,
      tag,
      reputation,
      badges,
      pollsCreated: profileData.pollsCreated || 0,
      avatarUrl: profileData.avatarUrl || ''
    };

    this.profiles.set(id, profile);
    this.saveProfiles();
    return profile;
  }

  static getReputationWeight(userId) {
    const prof = this.getProfile(userId);
    return typeof prof.reputation === 'number' ? prof.reputation : 0.35;
  }
}

globalThis.CommunityOracle = CommunityOracle;
if (typeof module !== 'undefined' && module.exports) module.exports = CommunityOracle;