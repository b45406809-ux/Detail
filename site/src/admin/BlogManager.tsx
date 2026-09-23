import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Eye, FilePlus2, Pencil, Save, Send, Trash2 } from 'lucide-react';
import { adminCall } from './api';

type Status = 'DRAFT' | 'PUBLISHED';
type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  keywords: string;
  status: Status;
  publishedAt?: string;
  updatedAt: string;
};

const emptyPost: Post = {
  id: '', slug: '', title: '', excerpt: '', content: '',
  keywords: 'cleaning Zimbabwe, Detail cleaning app', status: 'DRAFT', updatedAt: '',
};
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);

export function BlogManager() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [editing, setEditing] = useState<Post | null>(null);
  const [filter, setFilter] = useState<'ALL' | Status>('ALL');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const load = async () => {
    try {
      const result = await adminCall<{posts: Post[]}>('blogList');
      setPosts(result.posts);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load the blog directory.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const filteredPosts = useMemo(() => posts.filter(post => filter === 'ALL' || post.status === filter), [posts, filter]);
  const update = (key: keyof Post, value: string) => setEditing(current => current ? ({
    ...current, [key]: value,
    ...(key === 'title' && !current.id ? { slug: slugify(value) } : {}),
  }) : current);

  const save = async (status: Status) => {
    if (!editing) return;
    setMessage(''); setError('');
    if (!editing.title || !editing.slug || !editing.excerpt || !editing.content) {
      setError('Title, URL slug, search excerpt and article are required.'); return;
    }
    setSaving(true);
    try {
      const result = await adminCall<{post: Post}>('blogSave', {...editing, status});
      setEditing(result.post);
      setMessage(status === 'PUBLISHED' ? 'Published to the Detail blog.' : 'Draft saved.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this article.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (post: Post) => {
    const warning = post.status === 'PUBLISHED' ? 'This published URL will stop working.' : 'This draft cannot be recovered.';
    if (!window.confirm(`Delete “${post.title}”? ${warning}`)) return;
    setError('');
    try {
      await adminCall('blogDelete', {id: post.id});
      if (editing?.id === post.id) setEditing(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete this article.');
    }
  };

  if (editing) return <section>
    <header className="module-header"><div><button className="directory-back" onClick={() => { setEditing(null); setMessage(''); setError(''); }}><ArrowLeft size={15}/> Blog directory</button><h1>{editing.id ? 'Edit article' : 'New article'}</h1><p>Save privately, preview the article, then publish when it is ready.</p></div></header>
    <div className="panel blog-editor">
      <label>Article title<input value={editing.title} onChange={event => update('title', event.target.value)}/></label>
      <label>URL slug<input value={editing.slug} onChange={event => update('slug', slugify(event.target.value))}/></label>
      <label>Search excerpt<textarea value={editing.excerpt} onChange={event => update('excerpt', event.target.value)} maxLength={300}/></label>
      <label>Topics and search phrases<input value={editing.keywords} onChange={event => update('keywords', event.target.value)}/></label>
      <label>Article (plain text; use blank lines between paragraphs)<textarea className="article-input" value={editing.content} onChange={event => update('content', event.target.value)}/></label>
      {message && <p className="inline-success">{message}</p>}{error && <p className="inline-error">{error}</p>}
      <div className="editor-actions"><button onClick={() => setPreviewing(true)}><Eye size={15}/> Preview</button><button disabled={saving} onClick={() => void save('DRAFT')}><Save size={15}/> Save draft</button><button disabled={saving} className="publish" onClick={() => void save('PUBLISHED')}><Send size={15}/> Publish</button></div>
    </div>
    {previewing && <div className="draft-preview" role="dialog" aria-modal="true"><article><button onClick={() => setPreviewing(false)}>Close preview</button><small>DRAFT PREVIEW · NOT PUBLIC</small><h1>{editing.title || 'Untitled article'}</h1><p className="preview-excerpt">{editing.excerpt}</p>{editing.content.split(/\n\n+/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</article></div>}
  </section>;

  return <section>
    <header className="module-header"><div><h1>Blog & GEO</h1><p>Manage every draft and published article from one directory.</p></div><button className="publish" onClick={() => { setEditing({...emptyPost}); setMessage(''); setError(''); }}><FilePlus2 size={15}/> Add new blog</button></header>
    <div className="blog-summary"><article><strong>{posts.length}</strong><span>All blogs</span></article><article><strong>{posts.filter(post => post.status === 'DRAFT').length}</strong><span>Drafts</span></article><article><strong>{posts.filter(post => post.status === 'PUBLISHED').length}</strong><span>Published</span></article></div>
    <div className="blog-filters">{(['ALL', 'DRAFT', 'PUBLISHED'] as const).map(value => <button className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{value === 'ALL' ? 'All blogs' : value === 'DRAFT' ? 'Drafts' : 'Published'}</button>)}</div>
    {error && <p className="inline-error">{error}</p>}
    <div className="table-wrap"><table><thead><tr><th>Article</th><th>Status</th><th>Last updated</th><th>Public URL</th><th>Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={5}>Loading blog directory…</td></tr> : filteredPosts.length === 0 ? <tr><td colSpan={5}>No articles in this view.</td></tr> : filteredPosts.map(post => <tr key={post.id}><td><b>{post.title}</b><small className="blog-slug">/{post.slug}</small></td><td><span className={post.status === 'PUBLISHED' ? 'status-yes' : 'status-no'}>{post.status}</span></td><td>{new Date(post.updatedAt).toLocaleDateString()}</td><td>{post.status === 'PUBLISHED' ? <a href={`https://blog.detailapp.co.zw/${post.slug}`} target="_blank" rel="noreferrer">View live</a> : 'Not public'}</td><td><div className="row-actions"><button onClick={() => { setEditing(post); setMessage(''); setError(''); }}><Pencil size={14}/> Edit</button><button className="danger" onClick={() => void remove(post)}><Trash2 size={14}/> Delete</button></div></td></tr>)}</tbody></table></div>
  </section>;
}
