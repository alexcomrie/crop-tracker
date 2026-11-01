import type { AppSettings } from '../types';

export interface CommunityPost {
  id: string;
  author: string;
  authorId: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  commentCount?: number;
  likeCount?: number;
  likedByMe?: boolean;
}

export interface CommunityComment {
  id: string;
  postId: string;
  parentId: string;
  author: string;
  authorId: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

function apiUrl(settings: AppSettings): string {
  const fromSettings = (settings as AppSettings & { communityApiUrl?: string }).communityApiUrl;
  const fromEnv = (import.meta.env.VITE_COMMUNITY_API_URL as string | undefined) || '';
  return (fromSettings || fromEnv || '').trim();
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function communityStatus(settings: AppSettings): Promise<{ enabled: boolean; remote: boolean }> {
  const base = apiUrl(settings);
  if (!base) return { enabled: false, remote: false };
  try {
    const raw = await fetchJson(`${base}?action=status`) as { success?: boolean; data?: { communityEnabled?: boolean } };
    return { enabled: raw?.data?.communityEnabled !== false, remote: true };
  } catch {
    return { enabled: false, remote: false };
  }
}

export async function fetchPosts(settings: AppSettings): Promise<CommunityPost[]> {
  const base = apiUrl(settings);
  if (!base) return [];
  try {
    const raw = await fetchJson(`${base}?action=posts`) as { success?: boolean; data?: { posts?: CommunityPost[] } };
    return raw?.data?.posts ?? [];
  } catch {
    return [];
  }
}

export async function fetchComments(settings: AppSettings, postId: string): Promise<CommunityComment[]> {
  const base = apiUrl(settings);
  if (!base) return [];
  try {
    const raw = await fetchJson(`${base}?action=comments&postId=${encodeURIComponent(postId)}`) as { success?: boolean; data?: { comments?: CommunityComment[] } };
    return raw?.data?.comments ?? [];
  } catch {
    return [];
  }
}

export async function createPost(settings: AppSettings, author: string, authorId: string, text: string): Promise<CommunityPost | null> {
  const base = apiUrl(settings);
  if (!base) return null;
  try {
    const raw = await fetchJson(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'createpost', post: { author, authorId, text } }),
    }) as { success?: boolean; data?: { post?: CommunityPost } };
    return raw?.data?.post ?? null;
  } catch {
    return null;
  }
}

export async function createComment(settings: AppSettings, postId: string, parentId: string, author: string, authorId: string, text: string): Promise<CommunityComment | null> {
  const base = apiUrl(settings);
  if (!base) return null;
  try {
    const raw = await fetchJson(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'createcomment', comment: { postId, parentId, author, authorId, text } }),
    }) as { success?: boolean; data?: { comment?: CommunityComment } };
    return raw?.data?.comment ?? null;
  } catch {
    return null;
  }
}

export async function toggleLike(settings: AppSettings, postId: string, farmerId: string): Promise<boolean | null> {
  const base = apiUrl(settings);
  if (!base) return null;
  try {
    const raw = await fetchJson(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'like', postId, farmerId }),
    }) as { success?: boolean; data?: { liked?: boolean } };
    return raw?.data?.liked ?? null;
  } catch {
    return null;
  }
}

// Local weekly-limit helpers (server also enforces them).
const POSTS_KEY = 'community_posts_week';
const COMMENTS_KEY = 'community_comments_week';

interface WeekCounter { weekStart: number; count: number; }

function weekStart(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

function readCounter(key: string): WeekCounter {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    if (raw && raw.weekStart === weekStart()) return raw;
  } catch { /* ignore */ }
  return { weekStart: weekStart(), count: 0 };
}

function writeCounter(key: string, c: WeekCounter) {
  try { localStorage.setItem(key, JSON.stringify(c)); } catch { /* ignore */ }
}

export function remainingPosts(): number {
  return Math.max(0, 3 - readCounter(POSTS_KEY).count);
}

export function remainingComments(): number {
  return Math.max(0, 10 - readCounter(COMMENTS_KEY).count);
}

export function recordPost() {
  const c = readCounter(POSTS_KEY);
  c.count += 1;
  writeCounter(POSTS_KEY, c);
}

export function recordComment() {
  const c = readCounter(COMMENTS_KEY);
  c.count += 1;
  writeCounter(COMMENTS_KEY, c);
}
