import fs from "fs";
import path from "path";

const SITE_URL = "https://kharchakitab.com";
const INDEXNOW_KEY = "8rs7ufd6dv3azpcxshkjjkn5qwx0mv0z";
const BLOG_DIR = path.join(process.cwd(), "content/blog");

function getAllBlogUrls() {
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => `${SITE_URL}/blog/${f.replace(/\.mdx$/, "")}`);
}

const urls = [
  `${SITE_URL}/`,
  `${SITE_URL}/blog`,
  ...getAllBlogUrls(),
];

const body = {
  host: "kharchakitab.com",
  key: INDEXNOW_KEY,
  keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
  urlList: urls,
};

console.log(`Pinging IndexNow for ${urls.length} URLs...`);
urls.forEach((u) => console.log(" ", u));

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

if (res.ok) {
  console.log(`\nDone. Status: ${res.status} — URLs queued for indexing.`);
} else {
  const text = await res.text();
  console.error(`\nFailed. Status: ${res.status}`);
  console.error(text);
  process.exit(1);
}
