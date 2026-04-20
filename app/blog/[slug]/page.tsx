import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { compile, run } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import * as runtime from "react/jsx-runtime";
import { getAllPosts, getPostBySlug } from "@/src/lib/blog";
import { mdxComponents } from "@/src/components/blog/MdxComponents";
import { SITE_NAME, SITE_URL } from "@/src/config/site";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: "article",
      title: `${post.title} | ${SITE_NAME}`,
      description: post.description,
      publishedTime: post.date,
      tags: post.tags,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const compiled = await compile(post.content, { outputFormat: "function-body", remarkPlugins: [remarkGfm] });
  const { default: MdxContent } = await run(String(compiled), {
    ...runtime,
    baseUrl: import.meta.url,
  });

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    mainEntityOfPage: `${SITE_URL}/blog/${slug}`,
    keywords: post.tags.join(", "),
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 font-[family:var(--font-body)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />

      <nav className="mb-8">
        <Link
          href="/blog"
          className="text-sm text-[var(--kk-ember)] hover:underline"
        >
          ← All posts
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="mb-3 text-3xl font-bold font-[family:var(--font-display)] tracking-tight">
          {post.title}
        </h1>
        <div className="flex items-center gap-3 text-sm text-[var(--kk-ash)]">
          <time dateTime={post.date}>
            {new Date(post.date).toLocaleDateString("en-IN", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
          <span>·</span>
          <span>{post.readingTime}</span>
        </div>
        {post.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[var(--kk-smoke)] px-2.5 py-0.5 text-xs text-[var(--kk-ash)]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </header>

      <article className="prose-kk">
        <MdxContent components={mdxComponents} />
      </article>

      <div className="mt-12 border-t border-[var(--kk-smoke-heavy)] pt-6">
        <Link
          href="/blog"
          className="text-sm text-[var(--kk-ember)] hover:underline"
        >
          ← Back to all posts
        </Link>
      </div>
    </main>
  );
}
