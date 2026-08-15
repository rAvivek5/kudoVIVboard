import type { GiphyItem } from '@/types';
import { env, hasGiphy } from './env';

const BASE = 'https://api.giphy.com/v1/gifs';

interface GiphyApiImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyApiItem {
  id: string;
  title: string;
  images: Record<string, GiphyApiImage>;
}

function getBestImage(images: Record<string, GiphyApiImage>) {
  return (
    images.fixed_width_downsampled ||
    images.fixed_width ||
    images.downsized_medium ||
    images.downsized ||
    images.original ||
    images.preview_gif ||
    images.preview ||
    null
  );
}

function normalize(item: GiphyApiItem): GiphyItem | null {
  const image = getBestImage(item.images);

  if (!image?.url) {
    console.warn(`Skipping GIF ${item.id}: no usable image found.`);
    return null;
  }

  return {
    id: item.id,
    title: item.title || 'GIF',
    previewUrl: image.url,
    fullUrl: image.url,
    width: Number(image.width) || 0,
    height: Number(image.height) || 0,
  };
}

async function call(
  path: string,
  params: Record<string, string>
): Promise<GiphyItem[]> {
  if (!hasGiphy) {
    throw new Error(
      'GIF search is disabled. Add VITE_GIPHY_API_KEY to enable it.'
    );
  }

  const url = new URL(`${BASE}${path}`);

  url.searchParams.set('api_key', env.giphyKey);
  url.searchParams.set('rating', 'pg-13');
  url.searchParams.set('bundle', 'messaging_non_clips');

  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value)
  );

  const res = await fetch(url.toString());

  if (!res.ok) {
    throw new Error(
      `Giphy request failed (${res.status}). Please try again later.`
    );
  }

  const json = await res.json();

  // Helpful while debugging. Remove later if you like.
  console.log('First GIF:', json.data?.[0]);
  console.log('Images:', json.data?.[0]?.images);

  // return (json.data ?? [])
  //   .map(normalize)
  //   .filter((gif): gif is GiphyItem => gif !== null);

    return (json.data ?? [])
  .map(normalize)
  .filter((gif: GiphyItem | null): gif is GiphyItem => gif !== null);
}

export function searchGifs(
  query: string,
  limit = 24,
  offset = 0
): Promise<GiphyItem[]> {
  return call('/search', {
    q: query,
    limit: String(limit),
    offset: String(offset),
    lang: 'en',
  });
}

export function trendingGifs(limit = 24): Promise<GiphyItem[]> {
  return call('/trending', {
    limit: String(limit),
  });
}

export { hasGiphy };