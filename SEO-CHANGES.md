# On Click Solutions SEO patch

Prepared from `surekhaenterprisesandtraders-cyber/onclicksolutions` main branch on 2026-07-16.

Changes:
- removes duplicate canonical, Open Graph, Twitter and robots metadata
- changes canonical and social URLs to https://onclicksolutions.in/
- replaces the unsubstantiated "#1 trusted" meta claim with factual copy
- updates LocalBusiness structured data to the custom domain
- changes the logo and About links from "#" to "#home" and "#about"
- updates the PWA manifest start URL and scope for the custom domain
- updates service-worker cache routes from the GitHub Pages subpath to the custom-domain root
- adds robots.txt and sitemap.xml

Before publishing, verify the listed email, hours, phone number and Mumbai service area.

## Publish

Replace the matching files in the repository root, then commit and push:

```bash
git add index.html manifest.json sw.js robots.txt sitemap.xml CNAME
git commit -m "Fix SEO metadata and canonical domain"
git push
```

After deployment, submit `https://onclicksolutions.in/sitemap.xml` in Google Search Console and request indexing for `https://onclicksolutions.in/`.
