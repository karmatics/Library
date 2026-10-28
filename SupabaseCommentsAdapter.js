class SupabaseCommentsAdapter {
  /**
   * Supabase Client-Side Persistence Adapter for Public Static Deployments.
   * Enables public GitHub Pages viewers to read and submit in-situ comments,
   * voting threads, and author annotations via Supabase's PostgREST API
   * without exposing private home network IPs or requiring server hosting.
   */
  constructor(options = {}) {
    this.supabaseUrl = options.supabaseUrl || localStorage.getItem('dr_supabase_url') || '';
    this.anonKey = options.anonKey || localStorage.getItem('dr_supabase_key') || '';
    this.isLocalFallback = !this.supabaseUrl || !this.anonKey;
  }

  static getSqlSchema() {
    return `-- ==============================================================================
-- 🏛️ ROB BROWN OPUS & COMMENTS SUPABASE RELATIONAL SCHEMA
-- ==============================================================================

-- 1. Community Profiles Table
CREATE TABLE IF NOT EXISTS public.community_profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  tag INTEGER NOT NULL,
  reputation NUMERIC DEFAULT 0.50,
  badges TEXT[] DEFAULT ARRAY['Visitor'],
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Threads Table
CREATE TABLE IF NOT EXISTS public.threads (
  id TEXT PRIMARY KEY,
  dossier_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  title TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Comments Table
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id TEXT REFERENCES public.threads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT DEFAULT 'published',
  votes_count INTEGER DEFAULT 0,
  xpath TEXT DEFAULT NULL,
  locator JSONB DEFAULT '{}'::jsonb,
  is_author_directive BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Votes Table
CREATE TABLE IF NOT EXISTS public.comment_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  vote_delta INTEGER NOT NULL CHECK (vote_delta IN (-1, 1)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(comment_id, user_id)
);

-- Row Level Security (RLS) Configuration
ALTER TABLE public.community_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_votes ENABLE ROW LEVEL SECURITY;

-- Anonymous Read Policies
CREATE POLICY "Public profiles are readable by everyone" ON public.community_profiles FOR SELECT USING (true);
CREATE POLICY "Threads are readable by everyone" ON public.threads FOR SELECT USING (true);
CREATE POLICY "Comments are readable by everyone" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Votes are readable by everyone" ON public.comment_votes FOR SELECT USING (true);

-- Anonymous Insert Policies (Rate-limited via anon key)
CREATE POLICY "Anyone can create or update their profile" ON public.community_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can initiate a thread" ON public.threads FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can submit a comment" ON public.comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can vote on a comment" ON public.comment_votes FOR INSERT WITH CHECK (true);
`;
  }

  async fetchComments(threadId) {
    if (this.isLocalFallback) {
      return this._fetchLocalFallback(threadId);
    }

    try {
      const url = `${this.supabaseUrl}/rest/v1/comments?thread_id=eq.${encodeURIComponent(threadId)}&order=created_at.asc`;
      const res = await fetch(url, {
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${this.anonKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) throw new Error(`Supabase request failed: HTTP ${res.status}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn('[SupabaseCommentsAdapter] Falling back to local storage:', e);
      return this._fetchLocalFallback(threadId);
    }
  }

  async postComment(commentData = {}) {
    const payload = {
      thread_id: commentData.threadId,
      user_id: commentData.userId || 'u_anon',
      author_name: commentData.authorName || 'Guest Reader',
      text: commentData.text,
      xpath: commentData.xpath || null,
      locator: commentData.locator || {},
      is_author_directive: Boolean(commentData.isAuthorDirective)
    };

    if (this.isLocalFallback) {
      return this._saveLocalFallback(commentData.threadId, payload);
    }

    try {
      const url = `${this.supabaseUrl}/rest/v1/comments`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${this.anonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`Post comment failed: HTTP ${res.status}`);
      const rows = await res.json();
      return rows[0] || payload;
    } catch (e) {
      console.warn('[SupabaseCommentsAdapter] Failed to post to Supabase, saving locally:', e);
      return this._saveLocalFallback(commentData.threadId, payload);
    }
  }

  _fetchLocalFallback(threadId) {
    try {
      const raw = localStorage.getItem(`local_thread_${threadId}`);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  _saveLocalFallback(threadId, payload) {
    const list = this._fetchLocalFallback(threadId);
    const item = {
      id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      created_at: new Date().toISOString(),
      ...payload
    };
    list.push(item);
    localStorage.setItem(`local_thread_${threadId}`, JSON.stringify(list));
    return item;
  }
}

globalThis.SupabaseCommentsAdapter = SupabaseCommentsAdapter;
if (typeof module !== 'undefined' && module.exports) module.exports = SupabaseCommentsAdapter;