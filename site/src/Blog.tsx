import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Clock3 } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { supabase } from './supabase';
import './blog.css';

type Post = {id:string;slug:string;title:string;excerpt:string;content:string;keywords:string;publishedAt?:string;updatedAt:string};
type BlogPage = {posts:Post[];page:number;pageSize:number;total:number;totalPages:number};

function setMetadata(post?: Post) {
  const description = post?.excerpt || 'Practical answers to home, office and vehicle cleaning problems in Zimbabwe from Detail.';
  document.title = post ? `${post.title} | Detail Zimbabwe` : 'Cleaning advice for Zimbabwe | Detail';
  let descriptionNode = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
  if (!descriptionNode) { descriptionNode = document.createElement('meta'); descriptionNode.name = 'description'; document.head.append(descriptionNode); }
  descriptionNode.content = description;
  let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
  canonical.href = post ? `https://blog.detailapp.co.zw/${post.slug}` : 'https://blog.detailapp.co.zw/';
  const schema = document.createElement('script'); schema.type = 'application/ld+json'; schema.dataset.blogSchema = 'true';
  schema.text = JSON.stringify(post ? {'@context':'https://schema.org','@type':'Article',headline:post.title,description,datePublished:post.publishedAt,dateModified:post.updatedAt,author:{'@type':'Organization',name:'Detail'},publisher:{'@type':'Organization',name:'Catalyst Labs'},mainEntityOfPage:canonical.href} : {'@context':'https://schema.org','@type':'Blog',name:'Detail Cleaning Guide',url:canonical.href});
  document.querySelector('[data-blog-schema]')?.remove(); document.head.append(schema);
}

export function Blog() {
  const slug = location.pathname.split('/').filter(Boolean)[0];
  const requestedPage = Math.max(1, Number(new URLSearchParams(location.search).get('page')) || 1);
  const [listing, setListing] = useState<BlogPage>({posts:[],page:requestedPage,pageSize:6,total:0,totalPages:0});
  const [post, setPost] = useState<Post>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true); setError('');
    supabase.functions.invoke('marketplace-api', { body: { name: 'blogPublicList', data: slug ? {slug} : {page:requestedPage, limit:6} } }).then(({data, error}) => { if (error || data?.error) throw new Error(data?.error || error?.message); return data; }).then(body => {
      if (body.post) { setPost(body.post); setMetadata(body.post); } else { setListing(body); setMetadata(); }
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'The cleaning guide is temporarily unavailable.')).finally(() => setLoading(false));
  }, [slug, requestedPage]);

  return <div className="blog-site"><header><a className="blog-logo" href="https://detailapp.co.zw"><BrandMark/> DETAIL</a><nav><a href="/">All articles</a><a href="https://detailapp.co.zw">Main website</a><a href="https://detailapp.co.zw/#join" className="blog-cta">Join waitlist</a></nav></header><main>
    {error ? <section className="blog-empty"><h1>We could not load that page.</h1><p>{error}</p><a href="/">Browse the cleaning guide</a></section> : loading ? <p className="blog-loading">Loading the cleaning guide…</p> : post ? <article className="blog-article"><a href="/"><ArrowLeft size={16}/> All articles</a><p className="blog-kicker">DETAIL CLEANING GUIDE · ZIMBABWE</p><h1>{post.title}</h1><p className="blog-deck">{post.excerpt}</p><div className="blog-date"><Clock3 size={16}/> Updated {new Date(post.updatedAt).toLocaleDateString('en-ZW',{dateStyle:'long'})}</div><div className="blog-body">{post.content.split(/\n\n+/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div><aside><h2>Find the right clean, without the runaround.</h2><p>Detail helps customers describe a job, compare cleaner offers and keep progress together.</p><a href="https://detailapp.co.zw/#join">Join the Detail waitlist <ArrowRight size={17}/></a></aside></article> : <>
      <section className="blog-hero"><p>DETAIL CLEANING GUIDE</p><h1>Clear answers for a cleaner Zimbabwe.</h1><span>Practical solutions for homes, offices and vehicles—and a simpler way to find trusted cleaning help.</span></section>
      <div className="blog-directory-head"><div><h2>Latest cleaning articles</h2><p>{listing.total} published {listing.total === 1 ? 'article' : 'articles'}</p></div></div>
      <section className="blog-grid">{listing.posts.length ? listing.posts.map(item => <article key={item.id}><p>Cleaning guide</p><h2><a href={`/${item.slug}`}>{item.title}</a></h2><span>{item.excerpt}</span><a href={`/${item.slug}`} className="read">Read the answer <ArrowRight size={16}/></a></article>) : <div className="blog-empty"><h2>Published advice is coming soon.</h2><p>Our editors are preparing the first Detail cleaning guides.</p></div>}</section>
      {listing.totalPages > 1 && <nav className="blog-pagination" aria-label="Blog pages"><a aria-disabled={listing.page === 1} href={listing.page > 2 ? `/?page=${listing.page - 1}` : '/'}><ArrowLeft size={16}/> Previous</a><span>Page {listing.page} of {listing.totalPages}</span><a aria-disabled={listing.page === listing.totalPages} href={`/?page=${listing.page + 1}`}>Next <ArrowRight size={16}/></a></nav>}
    </>}
  </main><footer><BrandMark/> Detail is a Catalyst Labs product · <a href="mailto:support@detailapp.co.zw">support@detailapp.co.zw</a></footer></div>;
}
