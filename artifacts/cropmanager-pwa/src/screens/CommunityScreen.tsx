import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { toast } from 'sonner';
import { MessageCircle, Heart, Send, Clock, ShieldAlert, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  communityStatus,
  fetchPosts,
  fetchComments,
  createPost,
  createComment,
  toggleLike,
  remainingPosts,
  remainingComments,
  recordPost,
  recordComment,
  type CommunityPost,
  type CommunityComment,
} from '../lib/community';
import { ensureFarmerId, farmerDisplayName } from '../lib/farmer';

export function CommunityScreen() {
  const { settings } = useAppStore();
  const farmerId = ensureFarmerId(settings);
  const name = farmerDisplayName(settings);

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [remote, setRemote] = useState(false);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [activePost, setActivePost] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, CommunityComment[]>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});

  const localEnabled = settings.communityEnabled === true;

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const status = await communityStatus(settings);
      if (!alive) return;
      setRemote(status.remote);
      const isEnabled = localEnabled && status.enabled;
      setEnabled(isEnabled);
      if (isEnabled) {
        const list = await fetchPosts(settings);
        if (alive) setPosts(list);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [settings, localEnabled]);

  async function handlePost() {
    if (!draft.trim()) return;
    if (remainingPosts() <= 0) {
      toast.error('You have used your 3 posts for this week.');
      return;
    }
    setPosting(true);
    try {
      const created = await createPost(settings, name, farmerId, draft.trim());
      if (created) {
        setPosts(prev => [created, ...prev]);
        setDraft('');
        recordPost();
        toast.success('Posted to the community');
      } else {
        toast.error('Could not post — check your connection or community settings.');
      }
    } finally {
      setPosting(false);
    }
  }

  async function loadComments(postId: string) {
    if (comments[postId]) return;
    const list = await fetchComments(settings, postId);
    setComments(prev => ({ ...prev, [postId]: list }));
  }

  async function handleComment(postId: string, parentId = '') {
    const text = (commentDraft[postId] ?? '').trim();
    if (!text) return;
    if (remainingComments() <= 0) {
      toast.error('You have used your 10 comments for this week.');
      return;
    }
    const created = await createComment(settings, postId, parentId, name, farmerId, text);
    if (created) {
      setComments(prev => ({ ...prev, [postId]: [...(prev[postId] ?? []), created] }));
      setCommentDraft(prev => ({ ...prev, [postId]: '' }));
      recordComment();
      // bump count on the post
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, commentCount: (p.commentCount ?? 0) + 1 } : p));
    } else {
      toast.error('Could not comment — check your connection.');
    }
  }

  async function handleLike(postId: string) {
    const result = await toggleLike(settings, postId, farmerId);
    if (result === null) { toast.error('Could not like — check your connection.'); return; }
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const wasLiked = p.likedByMe === true;
      const delta = result ? (wasLiked ? 0 : 1) : (wasLiked ? -1 : 0);
      return { ...p, likedByMe: result, likeCount: Math.max(0, (p.likeCount ?? 0) + delta) };
    }));
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!localEnabled || enabled === false) {
    return (
      <div className="min-h-screen bg-gray-50 pb-24 pt-2 px-4 max-w-md mx-auto flex flex-col items-center justify-center text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-green-50 border flex items-center justify-center">
          <Users className="w-8 h-8 text-green-700" />
        </div>
        <h1 className="text-2xl font-bold">Community</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          Coming Soon. The community feed lets farmers share notes, ask questions
          and help each other. It will be switched on once the shared Google Sheet
          is connected.
        </p>
        <div className="bg-white rounded-xl border p-3 text-xs text-muted-foreground max-w-xs">
          <p className="font-semibold text-gray-700 mb-1">To enable it:</p>
          <ol className="list-decimal list-inside space-y-0.5 text-left">
            <li>Set up the Google Sheet (see docs/google-sheet-setup.md).</li>
            <li>Add <code className="bg-gray-100 px-1 rounded">VITE_COMMUNITY_API_URL</code> to the PWA env.</li>
            <li>Turn on “Community” in Settings.</li>
          </ol>
        </div>
        {remote === false && (
          <p className="text-[10px] text-amber-700 flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> No community endpoint configured.</p>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 pt-2 px-4 max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Community</h1>
      <p className="text-[11px] text-muted-foreground">
        {remainingPosts()} post{remainingPosts() === 1 ? '' : 's'} and {remainingComments()} comment{remainingComments() === 1 ? '' : 's'} left this week · Farmer ID {farmerId}
      </p>

      <div className="bg-white rounded-xl border p-3 space-y-2">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Share a note, question or tip with other farmers…"
          rows={3}
          className="w-full border rounded-lg p-2 text-sm"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{draft.trim().length}/500</span>
          <Button size="sm" onClick={() => void handlePost()} disabled={!draft.trim() || posting || remainingPosts() <= 0}>
            <Send className="w-3.5 h-3.5 mr-1" /> {posting ? 'Posting…' : 'Post'}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {posts.length === 0 && (
          <p className="text-xs text-muted-foreground bg-white rounded-xl p-3 border">No posts yet — be the first.</p>
        )}
        {posts.map(post => {
          const isOpen = activePost === post.id;
          const postComments = comments[post.id] ?? [];
          return (
            <div key={post.id} className="bg-white rounded-xl border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-green-800">{post.author}</p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(post.createdAt).toLocaleDateString()}</p>
              </div>
              <p className="text-sm whitespace-pre-line">{post.text}</p>
              <div className="flex items-center gap-3 text-xs">
                <button onClick={() => void handleLike(post.id)} className={`flex items-center gap-1 ${post.likedByMe ? 'text-red-500' : 'text-gray-500'}`}>
                  <Heart className={`w-3.5 h-3.5 ${post.likedByMe ? 'fill-red-500' : ''}`} /> {post.likeCount ?? 0}
                </button>
                <button onClick={() => { setActivePost(isOpen ? null : post.id); if (!isOpen) void loadComments(post.id); }} className="flex items-center gap-1 text-gray-500">
                  <MessageCircle className="w-3.5 h-3.5" /> {post.commentCount ?? 0}
                </button>
              </div>

              {isOpen && (
                <div className="border-t pt-2 space-y-2">
                  {postComments.map(c => (
                    <div key={c.id} className="bg-gray-50 rounded-lg p-2">
                      <p className="text-[10px] font-semibold text-gray-700">{c.author}</p>
                      <p className="text-xs whitespace-pre-line">{c.text}</p>
                      {c.parentId && <p className="text-[9px] text-muted-foreground">reply</p>}
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      value={commentDraft[post.id] ?? ''}
                      onChange={e => setCommentDraft(prev => ({ ...prev, [post.id]: e.target.value }))}
                      placeholder="Write a comment…"
                      className="h-8 text-xs"
                    />
                    <Button size="sm" className="h-8" onClick={() => void handleComment(post.id)} disabled={!(commentDraft[post.id] ?? '').trim() || remainingComments() <= 0}>
                      Send
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
