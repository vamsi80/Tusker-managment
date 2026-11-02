// The website passes Next's fetch cache options (fetch(url, { next: { revalidate } })).
// Declared the way Next's own types do; this app's fetch ignores them.
interface RequestInit {
    next?: { revalidate?: number | false; tags?: string[] };
}
