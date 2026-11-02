import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const store = {
  treatments: [] as any[],
  posts: [] as any[],
  comments: [] as any[],
  likes: [] as any[],
  communityEnabled: true,
};

function json(res: Response, obj: any) { res.json(obj); }

router.get("/", (req: Request, res: Response) => {
  const action = String(req.query.action || "health").toLowerCase();
  if (action === "health") return json(res, { success: true, ok: true, version: 1, communityEnabled: store.communityEnabled });
  if (action === "status") return json(res, { success: true, data: { communityEnabled: store.communityEnabled } });
  if (action === "treatments") return json(res, { success: true, data: { entries: store.treatments, updatedAt: new Date().toISOString() } });
  if (action === "posts") {
    const likesMap: Record<string, number> = {};
    store.likes.forEach(l => { likesMap[l.postId] = (likesMap[l.postId] || 0) + 1; });
    const posts = store.posts.map(p => ({ ...p, commentCount: store.comments.filter(c => c.postId === p.id).length, likeCount: likesMap[p.id] || 0 }));
    return json(res, { success: true, data: { posts } });
  }
  if (action === "comments") {
    const postId = String(req.query.postId || "");
    return json(res, { success: true, data: { comments: store.comments.filter(c => c.postId === postId) } });
  }
  res.status(400).json({ success: false, error: "Unknown action" });
});

router.post("/", (req: Request, res: Response) => {
  const body = req.body || {};
  const action = String(body.action || "").toLowerCase();
  if (action === "createpost") {
    const p = body.post || {};
    const post = { id: "post_" + Date.now(), author: p.author, authorId: p.authorId || "", text: p.text, createdAt: Date.now(), updatedAt: Date.now() };
    store.posts.unshift(post);
    return json(res, { success: true, data: { post } });
  }
  if (action === "createcomment") {
    const c = body.comment || {};
    const comment = { id: "comment_" + Date.now(), postId: c.postId, parentId: c.parentId || "", author: c.author, authorId: c.authorId || "", text: c.text, createdAt: Date.now(), updatedAt: Date.now() };
    store.comments.push(comment);
    return json(res, { success: true, data: { comment } });
  }
  if (action === "like") {
    const { postId, farmerId } = body;
    const idx = store.likes.findIndex(l => l.postId === postId && l.farmerId === farmerId);
    if (idx >= 0) { store.likes.splice(idx, 1); return json(res, { success: true, data: { liked: false } }); }
    store.likes.push({ postId, farmerId, createdAt: Date.now() });
    return json(res, { success: true, data: { liked: true } });
  }
  if (action === "killswitch") {
    store.communityEnabled = !!body.enabled;
    return json(res, { success: true, data: { enabled: store.communityEnabled } });
  }
  res.status(400).json({ success: false, error: "Unknown action" });
});

export default router;
