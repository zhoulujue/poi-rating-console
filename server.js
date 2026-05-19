const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { chromium } = require("playwright-core");
const yelp = require("yelp-fusion");

function loadLocalConfig() {
  try {
    return require("./server-config");
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
    return {};
  }
}

const {
  tripAdvisorApiKey,
  bookingAffiliateId,
  bookingToken,
  bookingUseSandbox,
  bookingAccommodationIds = {},
  yelpApiKey,
  yelpFusionAiApiKey,
  geminiApiKey,
  geminiModel = "gemini-2.5-flash",
  braveApiKey,
  tavilyApiKey,
} = loadLocalConfig();

const PORT = Number(process.env.PORT || 4173);
const MAX_PORT_ATTEMPTS = 20;
const ROOT = __dirname;
const CACHE_DIR = process.env.POI_CACHE_DIR || path.join(ROOT, ".data");
const CACHE_FILE = process.env.POI_CACHE_FILE || path.join(CACHE_DIR, "poi-cache.json");
const CACHE_MAX_ENTRIES = Number(process.env.POI_CACHE_MAX_ENTRIES || 1000);
const TRIPADVISOR_BASE = "https://api.content.tripadvisor.com/api/v1";
const BOOKING_BASE = bookingUseSandbox
  ? "https://demandapi-sandbox.booking.com/3.1"
  : "https://demandapi.booking.com/3.1";
const CHROME_EXECUTABLE = process.env.CHROME_EXECUTABLE || "";
const yelpClient = yelpApiKey ? yelp.client(yelpApiKey) : null;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const RESTAURANT_INSIGHT_DIMENSIONS = ["环境", "氛围", "口味", "服务"];
const HOTEL_INSIGHT_DIMENSIONS = [
  "价格与性价比",
  "位置与交通便利性",
  "清洁度与卫生安全",
  "房间本身",
  "设施与服务",
  "品牌与信任感",
  "场景匹配",
];

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== "object") return value;

  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = sortDeep(value[key]);
      return result;
    }, {});
}

function stableStringify(value) {
  return JSON.stringify(sortDeep(value));
}

function makeCacheKey(parts) {
  return crypto.createHash("sha256").update(stableStringify(parts)).digest("hex");
}

function loadResponseCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    return {
      version: 1,
      entries: parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {},
    };
  } catch {
    return { version: 1, entries: {} };
  }
}

const responseCache = loadResponseCache();

function persistResponseCache() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const entries = Object.entries(responseCache.entries);
  if (entries.length > CACHE_MAX_ENTRIES) {
    entries
      .sort(([, a], [, b]) => String(a.updatedAt || "").localeCompare(String(b.updatedAt || "")))
      .slice(0, entries.length - CACHE_MAX_ENTRIES)
      .forEach(([key]) => {
        delete responseCache.entries[key];
      });
  }

  const tmpFile = `${CACHE_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(responseCache, null, 2));
  fs.renameSync(tmpFile, CACHE_FILE);
}

function getCacheEntry(key) {
  return responseCache.entries[key] || null;
}

function writeCacheEntry(key, payload, meta = {}) {
  const now = new Date().toISOString();
  const previous = responseCache.entries[key];
  responseCache.entries[key] = {
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    payload,
    meta,
  };
  persistResponseCache();
  return responseCache.entries[key];
}

function withCacheMetadata(payload, cache) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  return { ...payload, cache };
}

function getRequiredPlatformsForType(type) {
  if (type === "hotel") return ["Google", "Booking", "Agoda", "TripAdvisor"];
  if (type === "restaurant") return ["Google", "Yelp", "Michelin", "TripAdvisor"];
  return [];
}

function getProviderTargetPlatforms(source, type) {
  if (source === "tripadvisor") return ["TripAdvisor"];
  if (source === "booking") return type === "restaurant" ? [] : ["Booking"];
  if (source === "yelp") return type === "hotel" ? [] : ["Yelp"];
  if (source === "brave" || source === "tavily" || source === "gemini") return getGeminiPlatforms(type);
  return [];
}

function ratingHasUsableValue(rating) {
  if (!rating) return false;
  if (rating.label) return true;
  const score = Number(rating.score);
  return Number.isFinite(score) && score > 0;
}

function getPayloadPlatforms(payload) {
  const platforms = new Set();
  toArray(payload?.data).forEach((poi) => {
    Object.entries(poi?.ratings || {}).forEach(([platform, rating]) => {
      if (ratingHasUsableValue(rating)) platforms.add(platform);
    });
  });
  return Array.from(platforms).sort();
}

function getMissingPlatforms(payload, targetPlatforms) {
  const present = new Set(getPayloadPlatforms(payload));
  return targetPlatforms.filter((platform) => !present.has(platform));
}

function providerCacheIsUsable(payload, targetPlatforms) {
  return getMissingPlatforms(payload, targetPlatforms).length === 0;
}

function getProviderCacheKey(url, source) {
  const params = {};
  Array.from(url.searchParams.keys())
    .sort()
    .forEach((key) => {
      params[key] = url.searchParams.getAll(key).map((value) => value.trim());
    });

  return makeCacheKey({
    kind: "provider",
    source,
    path: url.pathname,
    params,
  });
}

function maybeServeCachedProvider(res, url, source) {
  const type = url.searchParams.get("type") || "all";
  const targetPlatforms = getProviderTargetPlatforms(source, type);
  const key = getProviderCacheKey(url, source);
  const entry = getCacheEntry(key);

  if (entry && providerCacheIsUsable(entry.payload, targetPlatforms)) {
    sendJson(
      res,
      200,
      withCacheMetadata(entry.payload, {
        status: "hit",
        source,
        updatedAt: entry.updatedAt,
        platforms: getPayloadPlatforms(entry.payload),
      }),
    );
    return true;
  }

  res.__cacheWrite = {
    key,
    source,
    targetPlatforms,
    staleMissingPlatforms: entry ? getMissingPlatforms(entry.payload, targetPlatforms) : [],
  };
  return false;
}

function sendJson(res, status, payload) {
  const cacheWrite = res.__cacheWrite;
  let responsePayload = payload;

  if (cacheWrite && status >= 200 && status < 300) {
    const platforms = getPayloadPlatforms(payload);
    const entry = writeCacheEntry(cacheWrite.key, payload, {
      source: cacheWrite.source,
      targetPlatforms: cacheWrite.targetPlatforms,
      platforms,
    });
    responsePayload = withCacheMetadata(payload, {
      status: cacheWrite.forceRefresh
        ? "refreshed"
        : cacheWrite.staleMissingPlatforms?.length
          ? "refreshed-missing-platforms"
          : "stored",
      source: cacheWrite.source,
      updatedAt: entry.updatedAt,
      platforms,
      missingPlatforms: getMissingPlatforms(payload, cacheWrite.targetPlatforms),
      previousMissingPlatforms: cacheWrite.staleMissingPlatforms,
    });
  }

  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(responsePayload));
}

function getTripAdvisorCategory(type) {
  if (type === "hotel") return "hotels";
  if (type === "restaurant") return "restaurants";
  return undefined;
}

function normalizeLookupKey(value) {
  return (value || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ");
}

function getPlatformSearchUrl(platform, query, city) {
  const fullQuery = `${query} ${city || ""}`.trim();
  const encodedFullQuery = encodeURIComponent(fullQuery);
  const encodedQuery = encodeURIComponent(query);
  const encodedCity = encodeURIComponent(city || "");

  const urls = {
    Agoda: `https://www.agoda.com/search?text=${encodedFullQuery}`,
    Booking: `https://www.booking.com/searchresults.html?ss=${encodedFullQuery}`,
    Google: `https://www.google.com/maps/search/${encodedFullQuery}`,
    Michelin: `https://guide.michelin.com/us/en/search?q=${encodedFullQuery}`,
    TripAdvisor: `https://www.tripadvisor.com/Search?q=${encodedFullQuery}`,
    Yelp: `https://www.yelp.com/search?find_desc=${encodedQuery}&find_loc=${encodedCity}`,
  };

  return urls[platform];
}

function getPlatformMaxScore(platform) {
  if (platform === "Booking" || platform === "Agoda") return 10;
  if (platform === "Michelin") return 3;
  return 5;
}

function extractFirstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

function extractFirstInteger(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return Number(match[1].replace(/[,\s]/g, ""));
  }
  return null;
}

function extractAssistedRating(platform, text) {
  const compactText = text.replace(/\s+/g, " ");
  const max = getPlatformMaxScore(platform);
  const scorePatterns = {
    Agoda: [
      /Scored\s+([0-9](?:\.[0-9])?)\s+out of 10/i,
      /([0-9](?:\.[0-9])?)\s*\/\s*10/i,
      /rating(?:\D{0,30})([0-9](?:\.[0-9])?)/i,
    ],
    Booking: [
      /Scored\s+([0-9](?:\.[0-9])?)\s+out of 10/i,
      /Review score\s+([0-9](?:\.[0-9])?)/i,
      /([0-9](?:\.[0-9])?)\s*\/\s*10/i,
    ],
    Google: [
      /([0-5](?:\.[0-9])?)\s+stars/i,
      /Rated\s+([0-5](?:\.[0-9])?)/i,
      /([0-5](?:\.[0-9])?)\s*\\([0-9,]+\\)/i,
    ],
    Michelin: [
      /([1-3])\s+MICHELIN\s+Star/i,
      /([1-3])\s+Star(?:s)?/i,
      /Bib Gourmand/i,
      /Selected Restaurants?/i,
    ],
    TripAdvisor: [
      /([0-5](?:\.[0-9])?)\s+of\s+5\s+bubbles/i,
      /([0-5](?:\.[0-9])?)\s*\/\s*5/i,
      /rating(?:\D{0,30})([0-5](?:\.[0-9])?)/i,
    ],
    Yelp: [
      /([0-5](?:\.[0-9])?)\s+star rating/i,
      /([0-5](?:\.[0-9])?)\s*\/\s*5/i,
      /rating(?:\D{0,30})([0-5](?:\.[0-9])?)/i,
    ],
  };
  const reviewPatterns = [
    /([0-9][0-9,\s]*)\s+reviews/i,
    /([0-9][0-9,\s]*)\s+review/i,
    /\\(([0-9][0-9,\s]*)\\)/i,
  ];

  if (platform === "Michelin") {
    if (/Bib Gourmand/i.test(compactText)) {
      return { score: 0, max, label: "Bib Gourmand", reviews: null };
    }
    if (/Selected Restaurants?/i.test(compactText)) {
      return { score: 0, max, label: "入选", reviews: null };
    }
  }

  const score = extractFirstMatch(compactText, scorePatterns[platform] || []);
  if (!Number.isFinite(score) || score < 0 || score > max) {
    return null;
  }

  return {
    score,
    max,
    reviews: extractFirstInteger(compactText, reviewPatterns),
  };
}

async function handleAssistRating(req, res, url) {
  const platform = url.searchParams.get("platform");
  const query = url.searchParams.get("q")?.trim() || "";
  const city = url.searchParams.get("city")?.trim() || "";
  const searchUrl = getPlatformSearchUrl(platform, query, city);

  if (!platform || !query || !searchUrl) {
    sendJson(res, 400, { error: "Missing or unsupported platform/query" });
    return;
  }

  let browser;
  try {
    const launchOptions = {
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    };
    if (CHROME_EXECUTABLE) launchOptions.executablePath = CHROME_EXECUTABLE;

    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({
      locale: "en-US",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      viewport: { width: 1365, height: 900 },
    });

    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(3500);

    const text = await page.locator("body").innerText({ timeout: 10000 });
    const rating = extractAssistedRating(platform, text);

    if (!rating) {
      sendJson(res, 200, {
        data: null,
        searchUrl: page.url(),
        warning: "未能自动识别评分。可打开查询页后手动录入。",
      });
      return;
    }

    sendJson(res, 200, {
      data: {
        ...rating,
        updated: "自动识别",
        source: "assist",
        sourceUrl: page.url(),
      },
      searchUrl: page.url(),
    });
  } catch (error) {
    sendJson(res, 200, {
      data: null,
      searchUrl,
      warning: `自动识别失败：${error.message}`,
    });
  } finally {
    if (browser) await browser.close();
  }
}

async function tripAdvisorFetch(endpoint, params) {
  const url = new URL(`${TRIPADVISOR_BASE}${endpoint}`);
  url.searchParams.set("key", tripAdvisorApiKey);
  url.searchParams.set("language", "en");

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.message || response.statusText;
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

async function bookingFetch(endpoint, body) {
  const response = await fetch(`${BOOKING_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${bookingToken}`,
      "content-type": "application/json",
      "x-affiliate-id": String(bookingAffiliateId),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.message || response.statusText;
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

function normalizeTripAdvisorDetails(details, fallbackType) {
  const address = details.address_obj || {};
  const category = details.category?.name?.toLowerCase();
  const type =
    category?.includes("hotel") || fallbackType === "hotel"
      ? "hotel"
      : "restaurant";

  return {
    id: `tripadvisor-${details.location_id}`,
    type,
    name: details.name,
    city: address.city || address.state || "TripAdvisor",
    area: address.street1 || address.address_string || "TripAdvisor",
    category: type === "hotel" ? "TripAdvisor 酒店结果" : "TripAdvisor 餐饮结果",
    description: details.description || "来自 TripAdvisor Content API 的实时搜索结果。",
    price: details.price_level || "暂无价格等级",
    tags: ["TripAdvisor", "实时结果"],
    tripAdvisorUrl: details.web_url,
    photoUrl: details.photoUrl,
    reviewsPreview: details.reviewsPreview || [],
    photosPreview: details.photosPreview || [],
    ratings: {
      TripAdvisor: {
        score: Number(details.rating || 0),
        max: 5,
        reviews: Number(details.num_reviews || 0),
        updated: "实时",
      },
    },
  };
}

async function hydrateTripAdvisorDetails(details) {
  if (!details?.location_id) return details;

  const [reviews, photos] = await Promise.all([
    tripAdvisorFetch(`/location/${details.location_id}/reviews`, {
      limit: 3,
    }).catch(() => ({ data: [] })),
    tripAdvisorFetch(`/location/${details.location_id}/photos`, {
      limit: 3,
    }).catch(() => ({ data: [] })),
  ]);

  const reviewData = toArray(reviews.data || reviews);
  const photoData = toArray(photos.data || photos);
  const firstPhoto = photoData[0]?.images?.large?.url || photoData[0]?.images?.medium?.url || photoData[0]?.url;

  return {
    ...details,
    photoUrl: firstPhoto,
    reviewsPreview: reviewData.slice(0, 3).map((review) => ({
      title: review.title,
      text: review.text,
      rating: review.rating,
      published: review.published_date,
    })),
    photosPreview: photoData.slice(0, 3).map((photo) => ({
      url: photo.images?.large?.url || photo.images?.medium?.url || photo.url,
      caption: photo.caption,
    })),
  };
}

function normalizeYelpBusiness(business) {
  const location = business.location || {};
  const city = location.city || location.state || "Yelp";
  const area = location.address1 || location.display_address?.join(", ") || "Yelp";
  const categories = (business.categories || []).map((category) => category.title).filter(Boolean);

  return {
    id: `yelp-${business.id}`,
    type: "restaurant",
    name: business.name,
    city,
    area,
    category: categories.length ? categories.join(" · ") : "Yelp 餐饮结果",
    description: "来自 Yelp Fusion API 的实时餐厅评分。Yelp 官方 MCP 可作为未来的自然语言查询入口。",
    price: business.price || "暂无价格等级",
    tags: ["Yelp", "实时结果", "yelp-fusion"],
    photoUrl: business.image_url,
    yelpUrl: business.url,
    ratings: {
      Yelp: {
        score: Number(business.rating || 0),
        max: 5,
        reviews: Number(business.review_count || 0),
        updated: "实时",
      },
    },
  };
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.accommodations)) return value.accommodations;
  return Object.values(value).filter((item) => item && typeof item === "object");
}

function getBookingScore(details, scores) {
  return (
    details.review_score?.score ||
    details.review_score ||
    details.reviewScore ||
    details.score ||
    scores?.review_score?.score ||
    scores?.review_score ||
    scores?.score ||
    0
  );
}

function getBookingReviewCount(details, scores) {
  return (
    details.review_score?.review_count ||
    details.review_score?.reviews_count ||
    details.review_count ||
    details.number_of_reviews ||
    scores?.review_score?.review_count ||
    scores?.review_count ||
    scores?.number_of_reviews ||
    0
  );
}

function normalizeBookingDetails(details, scoresById) {
  const id = details.id || details.accommodation || details.accommodation_id;
  const scoreDetails = scoresById.get(String(id));
  const address = details.address || details.location || {};
  const city =
    address.city ||
    details.city ||
    details.city_name ||
    details.location?.city ||
    "Booking";
  const area =
    address.line_one ||
    address.address_line ||
    details.address ||
    details.location?.address ||
    "Booking";
  const description =
    details.description?.text ||
    details.description ||
    "来自 Booking.com Demand API 的实时酒店评分。";
  const photoUrl =
    details.photos?.[0]?.url ||
    details.photos?.[0]?.large ||
    details.photo_url ||
    details.main_photo_url;

  return {
    id: `booking-${id}`,
    type: "hotel",
    name: details.name || details.title || `Booking accommodation ${id}`,
    city,
    area,
    category: "Booking 酒店结果",
    description,
    price: details.price_category || details.currency || "Booking 酒店",
    tags: ["Booking", "实时结果"],
    photoUrl,
    bookingUrl: details.url,
    ratings: {
      Booking: {
        score: Number(getBookingScore(details, scoreDetails) || 0),
        max: 10,
        reviews: Number(getBookingReviewCount(details, scoreDetails) || 0),
        updated: "实时",
      },
    },
  };
}

function extractJsonObject(text) {
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || text;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
}

function formatKnowBeforeRating(source, rating) {
  if (!rating) return null;
  const value = rating.label || `${rating.score}/${rating.max}`;
  const reviewCount = Number(rating.reviews);
  const reviews =
    rating.reviews === null || rating.reviews === undefined
      ? "评价数未知"
      : Number.isFinite(reviewCount)
        ? `${reviewCount.toLocaleString("zh-CN")} 条评价`
        : `${rating.reviews} 条评价`;
  return `${source} ${value}，${reviews}`;
}

function getSourceSignals(sources) {
  return sources
    .flatMap((source) => [
      ...(Array.isArray(source.reviewsPreview)
        ? source.reviewsPreview.flatMap((review) =>
            typeof review === "string"
              ? [review]
              : [review.title, review.text, review.rating ? `review rating ${review.rating}` : ""],
          )
        : []),
      ...(Array.isArray(source.photosPreview)
        ? source.photosPreview.map((photo) => (typeof photo === "string" ? photo : photo.caption))
        : []),
      source.description,
      source.category,
    ])
    .filter(Boolean)
    .map((value) => String(value).replace(/\s+/g, " ").trim())
    .filter((value) => value.length > 0)
    .filter((value) => value !== "[object Object]")
    .filter((value) => !/Google Places|Tavily Search API|Brave Search API|Gemini Search|实时搜索结果|公开网页评分补全/.test(value))
    .slice(0, 8);
}

function getInsightDimensions(type) {
  return type === "hotel" ? HOTEL_INSIGHT_DIMENSIONS : RESTAURANT_INSIGHT_DIMENSIONS;
}

function findSignal(signals, keywords) {
  return signals.find((signal) => {
    const normalized = signal.toLowerCase();
    return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
  });
}

function buildFallbackDimensionInsights(poi, ratings, sourceSignals, ratingSummary) {
  const dimensions = getInsightDimensions(poi.type);
  const signal = sourceSignals[0];

  return dimensions.map((label) => {
    if (poi.type === "hotel") {
      const hotelSummaries = {
        价格与性价比: poi.price && poi.price !== "暂无价格信息" ? `当前价格线索为 ${poi.price}，需结合 Booking/Agoda 近期房价判断性价比。` : "当前来源未明确给出价格或费用细节，性价比需要打开预订平台核对实时房价。",
        位置与交通便利性: poi.area ? `位置线索为 ${poi.area}，建议结合地图确认到目的地和公共交通的距离。` : "当前来源未明确提及交通便利性，需要核对地图位置。",
        清洁度与卫生安全: "当前来源未明确提及清洁度或卫生安全细节，建议重点查看近期低分评论。",
        房间本身: signal ? `公开来源线索提到：${signal}。房间面积、隔音、床品等仍需查看近期评论确认。` : "当前来源未明确提及房间面积、隔音、床品或景观等房间细节。",
        设施与服务: "当前来源未明确提及早餐、健身房、泳池、前台等设施服务细节，建议补查平台评论。",
        品牌与信任感: ratingSummary !== "暂无可比较评分" ? `评分信号为：${ratingSummary}。可作为品牌/口碑可信度的初步判断。` : "当前评分覆盖不足，品牌与信任感需要更多平台交叉验证。",
        场景匹配: poi.category ? `当前定位为 ${poi.category}，是否适合商务、亲子、度假或短住仍需结合行程需求判断。` : "当前来源未明确适合的住宿场景，需要结合行程需求再判断。",
      };
      return { label, summary: hotelSummaries[label] };
    }

    const environmentSignal = findSignal(sourceSignals, ["环境", "排队", "座位", "拥挤", "空间", "crowd", "seat", "line", "queue", "standing"]);
    const tasteSignal = findSignal(sourceSignals, ["口味", "味道", "好吃", "菜", "taco", "food", "flavor", "taste", "delicious", "fresh"]);
    const serviceSignal = findSignal(sourceSignals, ["服务", "速度", "态度", "上菜", "service", "staff", "quick", "fast", "wait"]);

    const restaurantSummaries = {
      环境: environmentSignal
        ? `环境相关评论线索：${environmentSignal}。${poi.area ? `这条判断需要和 ${poi.area} 这家分店对应起来看。` : "仍建议核对具体分店。"}`
        : poi.area
          ? `位置/分店线索为 ${poi.area}。当前来源未明确提及店内空间、座位、排队或噪音等环境细节。`
          : "当前来源未明确提及店内空间、座位、排队或噪音等环境细节。",
      氛围: signal
        ? `可参考的氛围线索：${signal}。是否适合约会、聚餐、独食或快餐，需要结合你的场景判断。`
        : poi.category
          ? `餐厅定位为 ${poi.category}，但当前来源未明确描述实际氛围。`
          : "当前来源未明确提及氛围，需要查看评论中的用餐场景描述。",
      口味: tasteSignal
        ? `口味相关评论线索：${tasteSignal}。评分概览为 ${ratingSummary}，可作为口味稳定性的辅助信号。`
        : ratingSummary !== "暂无可比较评分"
          ? `评分概览：${ratingSummary}。这能反映整体口碑，但当前来源未明确提及具体招牌菜或口味风格。`
          : "当前来源未明确提及菜品口味或招牌菜，需要补查评论。",
      服务: serviceSignal
        ? `服务相关评论线索：${serviceSignal}。建议继续核对服务速度、态度和排队管理是否稳定。`
        : "当前来源未明确提及服务速度、态度或排队管理情况。",
    };
    return { label, summary: restaurantSummaries[label] };
  });
}

function normalizeDimensionInsightItems(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return null;
        return {
          label: item?.label || item?.name || "",
          summary: item?.summary || item?.text || item?.description || "",
        };
      })
      .filter((item) => item?.label && item?.summary);
  }

  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([label, summary]) => ({
        label,
        summary: typeof summary === "string" ? summary : summary?.summary || summary?.text || "",
      }))
      .filter((item) => item.label && item.summary);
  }

  return [];
}

function normalizeKnowBeforeSummary(summary, fallback, type) {
  const expectedLabels = getInsightDimensions(type);
  const summaryDimensions = new Map(
    normalizeDimensionInsightItems(summary?.dimensionInsights).map((item) => [item.label, item.summary]),
  );
  const fallbackDimensions = new Map(
    normalizeDimensionInsightItems(fallback.dimensionInsights).map((item) => [item.label, item.summary]),
  );

  return {
    ...fallback,
    ...(summary && typeof summary === "object" ? summary : {}),
    dimensionInsights: expectedLabels.map((label) => ({
      label,
      summary:
        summaryDimensions.get(label) ||
        fallbackDimensions.get(label) ||
        `当前来源未明确提及${label}，建议查看近期评论后再判断。`,
    })),
  };
}

function buildFallbackKnowBeforeYouGo(payload) {
  const poi = payload.poi || {};
  const ratings = payload.ratings || {};
  const sources = payload.sources || [];
  const ratingLines = Object.entries(ratings)
    .filter(([, rating]) => rating)
    .map(([source, rating]) => formatKnowBeforeRating(source, rating))
    .filter(Boolean);
  const sourceNames = Array.from(new Set(sources.map((source) => source.name).filter(Boolean)));
  const requiredSources = poi.type === "hotel" ? ["Google", "Booking", "Agoda", "TripAdvisor"] : ["Google", "Yelp", "Michelin", "TripAdvisor"];
  const coveredSources = requiredSources.filter((source) => ratings[source]);
  const missingSources = requiredSources.filter((source) => !ratings[source]);
  const ratingSummary = ratingLines.length ? ratingLines.join("；") : "暂无可比较评分";
  const sourceSignals = getSourceSignals(sources);
  const numericRatings = Object.entries(ratings)
    .filter(([, rating]) => rating && Number.isFinite(Number(rating.score)) && Number.isFinite(Number(rating.max)) && Number(rating.max) > 0)
    .map(([source, rating]) => ({
      source,
      normalized: Number(rating.score) / Number(rating.max),
      line: formatKnowBeforeRating(source, rating),
    }))
    .sort((a, b) => b.normalized - a.normalized);
  const strongestRating = numericRatings[0]?.line;
  const guideSignal = ratings.Michelin?.label ? `Michelin 信号：${ratings.Michelin.label}` : null;
  const dimensionInsights = buildFallbackDimensionInsights(poi, ratings, sourceSignals, ratingSummary);

  return {
    headline: poi.type === "hotel" ? `${poi.name || "这家酒店"}住宿决策速览` : `${poi.name || "这个餐厅"}到访前速览`,
    overview: `${poi.name || "该 POI"} 当前可用信息显示：${ratingSummary}。已覆盖 ${coveredSources.length}/${requiredSources.length} 个核心评分平台${
      missingSources.length ? `，仍缺 ${missingSources.join("、")} 的可靠评分` : "，核心平台覆盖较完整"
    }。${poi.area ? `地址/区域线索为 ${poi.area}，` : ""}最终决策前建议核对具体分店、营业时间和近期评论。`,
    uniqueTraits: [
      poi.category ? `定位特征：${poi.category}。` : null,
      strongestRating ? `最突出的评分信号：${strongestRating}。` : null,
      guideSignal || (sourceSignals[0] ? `来源线索：${sourceSignals[0]}。` : null),
    ].filter(Boolean),
    advantages: [
      coveredSources.length >= Math.max(3, requiredSources.length - 1)
        ? `核心平台覆盖较完整，已覆盖 ${coveredSources.join("、")}。`
        : `已有 ${coveredSources.join("、") || "少量平台"} 返回，可作为初筛依据。`,
      strongestRating ? `高分或高评价量信号明显：${strongestRating}。` : null,
      sourceNames.length ? `可交叉核对的来源包括 ${sourceNames.join("、")}。` : null,
    ].filter(Boolean),
    tradeoffs: [
      missingSources.length ? `缺失 ${missingSources.join("、")} 的可靠评分，结论仍有盲区。` : "核心评分虽完整，但仍要看近期评论确认体验是否稳定。",
      poi.area ? `需要锁定 ${poi.area} 这家分店，避免相同品牌不同地址混淆。` : "同名或连锁 POI 可能造成结果混淆，需要先核对地址。",
      "排队、订位、营业时间、价格和临时服务状态不一定能从评分中看出，出发前仍需确认。",
    ],
    keyTakeaways: [
      coveredSources.length ? `核心评分覆盖：${coveredSources.join("、")}。` : "核心评分仍待补齐，当前只能做初步判断。",
      ratingLines.length ? `评分概览：${ratingSummary}。` : "暂无足够评分数据，建议先补齐平台结果。",
      sourceNames.length ? `已参考来源：${sourceNames.join("、")}。` : "额外搜索来源暂未返回可用内容。",
      poi.area ? `分店/地址识别点：${poi.area}。` : "需要先确认具体分店地址，避免平台结果串店。",
    ],
    bestFor: [
      poi.type === "hotel" ? "需要快速比较住宿口碑的行程" : "想快速判断是否值得排队或绕路的用餐决策",
      ratingLines.length ? "重视跨平台评分一致性的用户" : "需要先收集更多公开口碑的用户",
      "希望先锁定具体 Google POI 分店再看其它来源的人",
    ],
    watchouts: [
      sourceNames.length ? `当前已参考 ${sourceNames.join("、")}，不同平台可能对应不同分店。` : "目前可用来源有限，建议打开平台页面核对。",
      "热门 POI 的排队、订位、营业时间和价格波动需要临近出发前再确认。",
      "搜索补全来源可能抓到相近名称，最终决策前建议核对地址。",
    ],
    decisionTips: [
      ratingLines.length ? `评分概览：${ratingLines.join("；")}。` : "先使用自动识别或手动录入补齐核心平台评分。",
      poi.area ? `核对地址：${poi.area}，避免选错分店。` : "优先确认具体分店地址。",
      "如果多个来源评分差异大，以最近评论和与你需求最接近的平台为准。",
    ],
    ratingRead: [
      coveredSources.length ? `当前核心平台覆盖 ${coveredSources.length}/${requiredSources.length}，覆盖越高越适合直接决策。` : "目前核心平台覆盖不足，不建议只看单一来源。",
      missingSources.length ? `缺失平台：${missingSources.join("、")}，这些平台最好继续补查。` : "核心平台暂无明显缺口，可以把注意力放到评论内容和位置匹配。",
      "评分只是第一层信号，评价量、更新时间、分店地址匹配度会直接影响可信度。",
    ],
    dimensionInsights,
    sourceSummary: sources.length ? `已汇总 ${sourceNames.join("、")} 等来源。` : "目前暂无额外搜索来源返回内容。",
    confidence: ratingLines.length >= 3 ? "high" : ratingLines.length >= 2 ? "medium" : "low",
  };
}

async function handleKnowBeforeYouGo(req, res, url) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 100000) req.destroy();
  });
  req.on("end", async () => {
    let payload;
    try {
      payload = JSON.parse(body || "{}");
    } catch {
      sendJson(res, 400, { error: "Invalid JSON" });
      return;
    }

    const fallback = buildFallbackKnowBeforeYouGo(payload);
    const forceRefresh = url.searchParams.get("refresh") === "1" || req.headers["x-cache-refresh"] === "1";
    const cacheKey = makeCacheKey({
      kind: "know-before-you-go",
      payload,
    });
    const cached = getCacheEntry(cacheKey);

    if (cached && !forceRefresh) {
      sendJson(
        res,
        200,
        withCacheMetadata(cached.payload, {
          status: "hit",
          source: "know-before-you-go",
          updatedAt: cached.updatedAt,
        }),
      );
      return;
    }

    res.__cacheWrite = {
      key: cacheKey,
      source: "know-before-you-go",
      targetPlatforms: [],
      staleMissingPlatforms: [],
      forceRefresh,
    };

    if (!geminiApiKey) {
      sendJson(res, 200, {
        data: fallback,
        warning: "缺少 Gemini API key，已使用规则摘要。",
      });
      return;
    }

    const prompt = `
You are helping a user decide whether to visit a POI. Create an information-rich "Know Before You Go" decision brief in Simplified Chinese based only on the provided evidence.

Requirements:
- Summarize the most important facts across ALL available provider evidence: ratings, review counts, platform coverage, source snippets, address/branch signals, photos/review previews, and conflicts or missing data.
- Give enough substance for a user to decide whether this POI is worth visiting, booking, queueing for, or skipping.
- Make the POI's DISTINCTIVE traits, advantages, and downside tradeoffs stand out. Explain what makes this specific POI different from a generic restaurant/hotel.
- Distinguish "advantages" from "tradeoffs": advantages are reasons to choose it; tradeoffs are reasons a user may hesitate, skip, or verify first.
- Make the summary close to the POI itself, not a generic destination summary.
- If the POI type is restaurant, you MUST summarize these exact dimensions: 环境, 氛围, 口味, 服务.
- If the POI type is hotel, you MUST summarize these exact dimensions: 价格与性价比, 位置与交通便利性, 清洁度与卫生安全, 房间本身, 设施与服务, 品牌与信任感, 场景匹配.
- Each dimension summary should be 1-2 Chinese sentences and should use concrete evidence from ratings, review snippets, descriptions, category, location/branch signals, and source reliability. If a dimension is not mentioned in evidence, explicitly say 当前来源未明确提及 and explain what the user should verify.
- Be specific when evidence is specific; explicitly say when a data point is missing or uncertain.
- Do not invent opening hours, prices, awards, menu items, amenities, policies, or operational details unless they appear in evidence.
- Prefer practical, decision-oriented language over generic praise.

Return ONLY valid JSON:
{
  "headline": "short title naming the POI and core verdict",
  "overview": "2-4 sentences with the key overall summary and decision context",
  "uniqueTraits": ["3 bullets explaining what is distinctive about this exact POI"],
  "advantages": ["3 concrete strengths or reasons to choose it"],
  "tradeoffs": ["3 concrete downsides, uncertainty points, or reasons to verify before going"],
  "dimensionInsights": [
    { "label": "dimension name", "summary": "POI-specific summary grounded in evidence" }
  ],
  "keyTakeaways": ["4 concrete bullets with the most important facts"],
  "ratingRead": ["3 bullets explaining how to interpret the ratings, review counts, coverage, and confidence"],
  "bestFor": ["3 bullets describing who this is best for"],
  "watchouts": ["3 bullets with risks, uncertainty, missing data, or practical caveats"],
  "decisionTips": ["3 practical next-step bullets"],
  "sourceSummary": "one sentence naming which sources were actually useful and any notable gaps",
  "confidence": "high|medium|low"
}

Evidence:
${JSON.stringify(payload, null, 2)}
`;

    try {
      const modelData = await geminiGenerateRatings(prompt, false, 25000);
      const text = modelData.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
      const parsed = extractJsonObject(text);
      sendJson(res, 200, {
        data: normalizeKnowBeforeSummary(parsed, fallback, payload.poi?.type),
        rawText: text,
        warning: parsed ? undefined : "LLM 输出无法解析，已使用规则摘要。",
      });
    } catch (error) {
      sendJson(res, 200, {
        data: fallback,
        warning: `LLM 摘要失败，已使用规则摘要：${error.message}`,
      });
    }
  });
}

function getGeminiPlatforms(type) {
  if (type === "hotel") return ["Booking", "Agoda"];
  if (type === "restaurant") return ["Yelp", "Michelin"];
  return ["Booking", "Agoda", "Yelp", "Michelin"];
}

function normalizeGeminiRating(rating, platform) {
  if (!rating) return null;
  const max = Number(rating.max || getPlatformMaxScore(platform));
  const score = Number(rating.score || 0);

  if (rating.label) {
    return {
      score,
      max,
      label: String(rating.label),
      reviews: Number.isFinite(Number(rating.reviews)) ? Number(rating.reviews) : null,
      updated: "Gemini Search",
      source: "gemini",
      sourceUrl: rating.sourceUrl || rating.url,
    };
  }

  if (!Number.isFinite(score) || score < 0 || score > max) {
    return null;
  }

  return {
    score,
    max,
    reviews: Number.isFinite(Number(rating.reviews)) ? Number(rating.reviews) : null,
    updated: "Gemini Search",
    source: "gemini",
    sourceUrl: rating.sourceUrl || rating.url,
  };
}

function normalizeGeminiPoi(payload, fallbackQuery, fallbackType, requestedPlatforms) {
  const type = payload.type === "hotel" || payload.type === "restaurant" ? payload.type : fallbackType;
  const ratings = {};

  requestedPlatforms.forEach((platform) => {
    const rating = normalizeGeminiRating(payload.ratings?.[platform], platform);
    if (rating) ratings[platform] = rating;
  });

  return {
    id: `gemini-${normalizeLookupKey(`${type}-${payload.name || fallbackQuery}`)}`,
    type,
    name: payload.name || fallbackQuery,
    city: payload.city || "Gemini Search",
    area: payload.area || "公开网页搜索",
    category: `${requestedPlatforms.join(" / ")} · Gemini Search`,
    description: payload.summary || "来自 Gemini Grounding with Google Search 的公开网页评分补全。",
    price: payload.price || "暂无价格信息",
    tags: ["Gemini Search", ...requestedPlatforms],
    ratings,
  };
}

function getBravePlatformQuery(platform, query, type, city) {
  const locationHint = city ? ` ${city}` : "";
  const base = `"${query}"${locationHint}`;
  const platformHints = {
    Agoda: `${base} Agoda rating reviews hotel`,
    Booking: `${base} Booking.com review score hotel`,
    Yelp: `${base} Yelp rating reviews restaurant`,
    Michelin: `${base} Michelin Guide stars restaurant`,
  };
  return platformHints[platform] || `${base} ${platform} rating reviews ${type}`;
}

function getBraveCombinedQuery(platforms, query, type, city) {
  const locationHint = city ? ` ${city}` : "";
  const base = `"${query}"${locationHint}`;
  const platformText = platforms.join(" OR ");
  return `${base} ${platformText} rating reviews ${type}`;
}

async function braveWebSearch(q) {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", q);
  url.searchParams.set("count", "5");
  url.searchParams.set("search_lang", "en");
  url.searchParams.set("country", "us");
  url.searchParams.set("safesearch", "moderate");

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "X-Subscription-Token": braveApiKey,
    },
  });
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.message || response.statusText);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

function stripHtml(value) {
  return (value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractRatingFromBraveText(platform, text) {
  const normalized = stripHtml(text);
  const max = getPlatformMaxScore(platform);

  if (platform === "Michelin") {
    const star = normalized.match(/([1-3])\s*(?:MICHELIN\s*)?Star/i);
    if (star?.[1]) return { score: Number(star[1]), max, label: `${star[1]} Star`, reviews: null };
    if (/Bib Gourmand/i.test(normalized)) return { score: 0, max, label: "Bib Gourmand", reviews: null };
    if (/Selected/i.test(normalized)) return { score: 0, max, label: "Selected", reviews: null };
    return null;
  }

  const patterns =
    platform === "Booking" || platform === "Agoda"
      ? [
          /review score\s*(?:of)?\s*([0-9](?:\.[0-9])?)/i,
          /average review score\s*(?:of)?\s*([0-9](?:\.[0-9])?)/i,
          /(?:Scored|score|rating)\s*([0-9](?:\.[0-9])?)\s*(?:out of|\/)\s*10/i,
          /([0-9](?:\.[0-9])?)\s*\/\s*10/i,
        ]
      : [
          /([0-5](?:\.[0-9])?)\s*(?:out of|\/)\s*5/i,
          /([0-5](?:\.[0-9])?)[-\s]*star/i,
          /([0-5](?:\.[0-9])?)\s*star/i,
          /rating\s*([0-5](?:\.[0-9])?)/i,
        ];

  const score = extractFirstMatch(normalized, patterns);
  if (!Number.isFinite(score) || score < 0 || score > max) return null;

  return {
    score,
    max,
    reviews: extractFirstInteger(normalized, [
      /([0-9][0-9,\s]*)\s+reviews/i,
      /([0-9][0-9,\s]*)\s+review/i,
      /\(([0-9][0-9,\s]*)\)/i,
    ]),
  };
}

function normalizeBravePoi(resultsByPlatform, fallbackQuery, fallbackType, city) {
  const ratings = {};
  const urls = [];

  Object.entries(resultsByPlatform).forEach(([platform, result]) => {
    if (!result?.rating) return;
    ratings[platform] = {
      ...result.rating,
      updated: "Brave Search",
      source: "brave",
      sourceUrl: result.url,
    };
    if (result.url) urls.push(result.url);
  });

  return {
    id: `brave-${normalizeLookupKey(`${fallbackType}-${fallbackQuery}`)}`,
    type: fallbackType,
    name: fallbackQuery,
    city: city || "Brave Search",
    area: "公开网页搜索",
    category: `${Object.keys(resultsByPlatform).join(" / ")} · Brave Search`,
    description: "来自 Brave Search API 的公开网页评分补全。",
    price: "暂无价格信息",
    tags: ["Brave Search", ...Object.keys(resultsByPlatform)],
    ratings,
    sourceUrls: urls,
  };
}

async function handleBraveRatings(req, res, url) {
  const query = url.searchParams.get("q")?.trim() || "";
  const type = url.searchParams.get("type") || "all";
  const city = url.searchParams.get("city")?.trim() || "";
  const requestedPlatforms = getGeminiPlatforms(type);

  if (query.length < 2) {
    sendJson(res, 200, { data: [] });
    return;
  }

  if (!braveApiKey) {
    sendJson(res, 200, {
      data: [],
      warning: "Brave Search 需要 API key。请在 server-config.js 中配置 braveApiKey。",
    });
    return;
  }

  try {
    const brave = await braveWebSearch(getBraveCombinedQuery(requestedPlatforms, query, type, city));
    const webResults = brave.web?.results || [];
    const entries = requestedPlatforms.map((platform) => {
      const parsed = webResults
        .map((item) => {
          const combined = `${item.title || ""} ${item.description || ""}`;
          return {
            title: stripHtml(item.title),
            url: item.url,
            description: stripHtml(item.description),
            rating: extractRatingFromBraveText(platform, combined),
          };
        })
        .find((item) => item.rating);

      return [platform, parsed || null];
    });
    const resultsByPlatform = Object.fromEntries(entries);
    const poi = normalizeBravePoi(resultsByPlatform, query, type === "all" ? "hotel" : type, city);

    sendJson(res, 200, {
      data: Object.keys(poi.ratings).length ? [poi] : [],
      resultsByPlatform,
    });
  } catch (error) {
    sendJson(res, 200, {
      data: [],
      warning: `Brave Search 失败：${error.message}`,
      details: error.payload,
    });
  }
}

function getTavilyQuery(platform, query, type, city) {
  const locationHint = city ? ` in ${city}` : "";
  return `${query}${locationHint} ${type} rating on ${platform}. Find review score, star rating, and review count if available.`;
}

function getTavilyDomains(platform) {
  return {
    Agoda: ["agoda.com"],
    Booking: ["booking.com"],
    Yelp: ["yelp.com"],
    Michelin: ["guide.michelin.com"],
  }[platform] || [];
}

async function tavilySearch(query, platform) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${tavilyApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      include_answer: "basic",
      include_raw_content: "text",
      max_results: 6,
      include_domains: getTavilyDomains(platform),
    }),
  });
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data?.error || data?.message || response.statusText);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

function normalizeTavilyPoi(resultsByPlatform, fallbackQuery, fallbackType, city) {
  const ratings = {};

  Object.entries(resultsByPlatform).forEach(([platform, result]) => {
    if (!result?.rating) return;
    ratings[platform] = {
      ...result.rating,
      updated: "Tavily Search",
      source: "tavily",
      sourceUrl: result.url,
    };
  });

  return {
    id: `tavily-${normalizeLookupKey(`${fallbackType}-${fallbackQuery}`)}`,
    type: fallbackType,
    name: fallbackQuery,
    city: city || "Tavily Search",
    area: "公开网页搜索",
    category: `${Object.keys(resultsByPlatform).join(" / ")} · Tavily Search`,
    description: "来自 Tavily Search API 的公开网页评分补全。",
    price: "暂无价格信息",
    tags: ["Tavily Search", ...Object.keys(resultsByPlatform)],
    ratings,
  };
}

async function handleTavilyRatings(req, res, url) {
  const query = url.searchParams.get("q")?.trim() || "";
  const type = url.searchParams.get("type") || "all";
  const city = url.searchParams.get("city")?.trim() || "";
  const requestedPlatforms = getGeminiPlatforms(type);

  if (query.length < 2) {
    sendJson(res, 200, { data: [] });
    return;
  }

  if (!tavilyApiKey) {
    sendJson(res, 200, {
      data: [],
      warning: "Tavily Search 需要 API key。请在 server-config.js 中配置 tavilyApiKey。",
    });
    return;
  }

  try {
    const entries = [];
    const answers = [];

    for (const platform of requestedPlatforms) {
      const tavily = await tavilySearch(getTavilyQuery(platform, query, type, city), platform);
      if (tavily.answer) answers.push(`${platform}: ${tavily.answer}`);
      const searchableText = [
        tavily.answer,
        ...(tavily.results || []).flatMap((item) => [
          item.title,
          item.content,
          item.raw_content,
          item.url,
        ]),
      ]
        .filter(Boolean)
        .join("\n");
      const relatedResult = (tavily.results || [])[0];
      const rating = extractRatingFromBraveText(
        platform,
        relatedResult
          ? `${tavily.answer || ""} ${relatedResult.title || ""} ${relatedResult.content || ""} ${relatedResult.raw_content || ""}`
          : searchableText,
      );

      entries.push([
        platform,
        rating
          ? {
              title: stripHtml(relatedResult?.title),
              url: relatedResult?.url,
              description: stripHtml(relatedResult?.content),
              rating,
            }
          : null,
      ]);
    }

    const resultsByPlatform = Object.fromEntries(entries);
    const poi = normalizeTavilyPoi(resultsByPlatform, query, type === "all" ? "hotel" : type, city);

    sendJson(res, 200, {
      data: Object.keys(poi.ratings).length ? [poi] : [],
      resultsByPlatform,
      answer: answers.join("\n"),
    });
  } catch (error) {
    sendJson(res, 200, {
      data: [],
      warning: `Tavily Search 失败：${error.message}`,
      details: error.payload,
    });
  }
}

function isAbortError(error) {
  return error?.name === "AbortError" || error?.message === "This operation was aborted";
}

function isGeminiLocationUnsupported(error) {
  return (
    error.status === 400 &&
    (error.message?.includes("User location is not supported") ||
      error.payload?.error?.status === "FAILED_PRECONDITION")
  );
}

async function geminiGenerateRatings(prompt, useSearch, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`,
    {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": geminiApiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
      }),
    },
  ).finally(() => clearTimeout(timeout));
  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || response.statusText;
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

async function handleGeminiRatings(req, res, url) {
  const query = url.searchParams.get("q")?.trim() || "";
  const type = url.searchParams.get("type") || "all";
  const city = url.searchParams.get("city")?.trim() || "";
  const requestedPlatforms = getGeminiPlatforms(type);

  if (query.length < 2) {
    sendJson(res, 200, { data: [] });
    return;
  }

  if (!geminiApiKey) {
    sendJson(res, 200, {
      data: [],
      warning: "Gemini Search 需要 Gemini API key。请在 server-config.js 中配置 geminiApiKey。",
    });
    return;
  }

  const prompt = `
Find public rating information for this POI.

POI name: ${query}
POI type: ${type}
Location hint: ${city || "unknown"}
Platforms to check: ${requestedPlatforms.join(", ")}

Return ONLY valid JSON in this exact shape:
{
  "name": "canonical POI name",
  "type": "hotel|restaurant",
  "city": "city if found",
  "area": "neighborhood or address if found",
  "summary": "one short sentence about the sources used",
  "ratings": {
    "Booking": { "score": 9.1, "max": 10, "reviews": 1234, "sourceUrl": "https://..." },
    "Agoda": { "score": 8.8, "max": 10, "reviews": 1234, "sourceUrl": "https://..." },
    "Yelp": { "score": 4.5, "max": 5, "reviews": 1234, "sourceUrl": "https://..." },
    "Michelin": { "score": 1, "max": 3, "label": "1 Star", "reviews": null, "sourceUrl": "https://..." }
  }
}

Rules:
- Include only platforms where you found credible public evidence.
- Do not guess ratings.
- For Michelin, use score 0 with label "Selected" or "Bib Gourmand" if applicable.
- Put the direct or most relevant source URL in sourceUrl.
`;

  try {
    let data;
    let groundingUnavailable = false;

    try {
      data = await geminiGenerateRatings(prompt, true, 35000);
    } catch (error) {
      groundingUnavailable = isGeminiLocationUnsupported(error);
      const groundingTimedOut = isAbortError(error);

      if (!groundingUnavailable && !groundingTimedOut) {
        throw error;
      }

      data = await geminiGenerateRatings(
        `${prompt}

Google Search grounding is unavailable or timed out in this runtime, so answer only if you can infer from reliable public knowledge in the model context. If you are uncertain, return an empty ratings object. Do not guess.`,
        false,
        20000,
      );
      groundingUnavailable = groundingUnavailable || groundingTimedOut;
    }

    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    const parsed = extractJsonObject(text);
    const poi = normalizeGeminiPoi(parsed || {}, query, type === "all" ? "hotel" : type, requestedPlatforms);

    sendJson(res, 200, {
      data: Object.keys(poi.ratings).length ? [poi] : [],
      rawText: text,
      groundingMetadata: data.candidates?.[0]?.groundingMetadata,
      warning: groundingUnavailable
        ? "Gemini Google Search grounding 当前不可用或超时，已降级为非搜索 Gemini 解析；不确定的评分不会返回。"
        : undefined,
    });
  } catch (error) {
    if (isGeminiLocationUnsupported(error)) {
      sendJson(res, 200, {
        data: [],
        warning:
          "Gemini API 当前网络/地区不可用：User location is not supported for the API use。请换到支持 Gemini API 的网络区域后重试。",
        details: error.payload,
      });
      return;
    }

    if (isAbortError(error)) {
      sendJson(res, 200, {
        data: [],
        warning: "Gemini Search 超时。已停止本次查询，请稍后重试或使用自动识别/手动录入。",
      });
      return;
    }

    sendJson(res, 200, {
      data: [],
      warning: `Gemini Search 失败：${error.message}`,
      details: error.payload,
    });
  }
}

async function handleTripAdvisorSearch(req, res, url) {
  if (!tripAdvisorApiKey) {
    sendJson(res, 500, { error: "Missing TripAdvisor API key" });
    return;
  }

  const query = url.searchParams.get("q")?.trim() || "";
  const type = url.searchParams.get("type") || "all";

  if (query.length < 2) {
    sendJson(res, 200, { data: [] });
    return;
  }

  try {
    const category = getTripAdvisorCategory(type);
    const search = await tripAdvisorFetch("/location/search", {
      searchQuery: query,
      category,
    });
    const matches = (search.data || []).slice(0, 6);

    const details = await Promise.all(
      matches.map((match) =>
        tripAdvisorFetch(`/location/${match.location_id}/details`, {
          currency: "USD",
        }).catch(() => null),
      ),
    );
    const hydratedDetails = await Promise.all(
      details.filter(Boolean).map((item) => hydrateTripAdvisorDetails(item)),
    );

    sendJson(res, 200, {
      data: hydratedDetails.map((item) => normalizeTripAdvisorDetails(item, type)),
      connector: {
        name: "pab1it0/tripadvisor-mcp-compatible",
        tools: [
          "search_locations",
          "get_location_details",
          "get_location_reviews",
          "get_location_photos",
        ],
      },
    });
  } catch (error) {
    sendJson(res, error.status || 502, {
      error: error.message,
      details: error.payload,
    });
  }
}

function getBookingAccommodationIds(url) {
  const directId = url.searchParams.get("accommodation_id");
  if (directId) return [Number(directId)].filter(Boolean);

  const query = normalizeLookupKey(url.searchParams.get("q"));
  const configuredId =
    bookingAccommodationIds[query] ||
    bookingAccommodationIds[url.searchParams.get("q")] ||
    bookingAccommodationIds[query.replace(/\s/g, "-")];

  if (Array.isArray(configuredId)) {
    return configuredId.map(Number).filter(Boolean);
  }

  return configuredId ? [Number(configuredId)].filter(Boolean) : [];
}

async function handleBookingSearch(req, res, url) {
  const type = url.searchParams.get("type") || "all";
  if (type === "restaurant") {
    sendJson(res, 200, { data: [] });
    return;
  }

  const query = url.searchParams.get("q")?.trim() || "";
  if (query.length < 2) {
    sendJson(res, 200, { data: [] });
    return;
  }

  if (!bookingAffiliateId || !bookingToken) {
    sendJson(res, 200, {
      data: [],
      warning: "Booking 需要 Affiliate ID 和 token。请在 server-config.js 中配置 bookingAffiliateId / bookingToken。",
    });
    return;
  }

  const accommodationIds = getBookingAccommodationIds(url);
  if (!accommodationIds.length) {
    sendJson(res, 200, {
      data: [],
      warning:
        "Booking Demand API 需要 accommodation id。请在 server-config.js 的 bookingAccommodationIds 中映射酒店名称，或传 accommodation_id。",
    });
    return;
  }

  try {
    const details = await bookingFetch("/accommodations/details", {
      accommodations: accommodationIds,
      extras: ["description", "photos", "review_score"],
      languages: ["zh-cn", "en-gb"],
    });
    const scores = await bookingFetch("/accommodations/reviews/scores", {
      accommodations: accommodationIds,
    }).catch(() => ({ data: [] }));

    const scoresById = new Map(
      toArray(scores.data || scores).map((item) => [
        String(item.id || item.accommodation || item.accommodation_id),
        item,
      ]),
    );

    sendJson(res, 200, {
      data: toArray(details.data || details).map((item) =>
        normalizeBookingDetails(item, scoresById),
      ),
    });
  } catch (error) {
    sendJson(res, error.status || 502, {
      error: error.message,
      details: error.payload,
    });
  }
}

async function handleYelpSearch(req, res, url) {
  const type = url.searchParams.get("type") || "all";
  if (type === "hotel") {
    sendJson(res, 200, { data: [] });
    return;
  }

  const query = url.searchParams.get("q")?.trim() || "";
  if (query.length < 2) {
    sendJson(res, 200, { data: [] });
    return;
  }

  if (!yelpClient) {
    sendJson(res, 200, {
      data: [],
      warning: "Yelp 需要 API key。请在 server-config.js 中配置 yelpApiKey；如要走官方 Yelp MCP/Fusion AI，也可配置 yelpFusionAiApiKey。",
      connector: {
        mcp: "Yelp/yelp-mcp",
        nodeClient: "tonybadguy/yelp-fusion",
        fusionAiConfigured: Boolean(yelpFusionAiApiKey),
      },
    });
    return;
  }

  try {
    const response = await yelpClient.search({
      term: query,
      location: url.searchParams.get("location") || url.searchParams.get("city") || "New York, NY",
      categories: "restaurants",
      limit: 6,
      sort_by: "best_match",
    });

    sendJson(res, 200, {
      data: (response.jsonBody.businesses || []).map(normalizeYelpBusiness),
      connector: {
        mcp: "Yelp/yelp-mcp",
        nodeClient: "tonybadguy/yelp-fusion",
        fusionAiConfigured: Boolean(yelpFusionAiApiKey),
      },
    });
  } catch (error) {
    sendJson(res, error.statusCode || error.status || 502, {
      error: error.message,
      details: error.response?.body || error.jsonBody,
    });
  }
}

async function handleYelpAgent(req, res, url) {
  const query = url.searchParams.get("q")?.trim() || "";
  const latitude = url.searchParams.get("latitude");
  const longitude = url.searchParams.get("longitude");
  const apiKey = yelpFusionAiApiKey || yelpApiKey;

  if (!query) {
    sendJson(res, 400, { error: "Missing query" });
    return;
  }

  if (!apiKey) {
    sendJson(res, 200, {
      data: null,
      warning: "Yelp AI Chat / Yelp MCP 需要 API key。请在 server-config.js 中配置 yelpFusionAiApiKey 或 yelpApiKey。",
      connector: {
        mcp: "Yelp/yelp-mcp",
        tool: "yelp_agent",
        endpoint: "https://api.yelp.com/ai/chat/v2",
      },
    });
    return;
  }

  const userContext =
    latitude && longitude
      ? {
          latitude: Number(latitude),
          longitude: Number(longitude),
        }
      : undefined;

  try {
    const response = await fetch("https://api.yelp.com/ai/chat/v2", {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query,
        user_context: userContext,
      }),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const error = new Error(data?.error?.description || data?.message || response.statusText);
      error.status = response.status;
      error.payload = data;
      throw error;
    }

    sendJson(res, 200, {
      data,
      connector: {
        mcp: "Yelp/yelp-mcp",
        tool: "yelp_agent",
        endpoint: "https://api.yelp.com/ai/chat/v2",
      },
    });
  } catch (error) {
    sendJson(res, error.status || 502, {
      error: error.message,
      details: error.payload,
    });
  }
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(ROOT, decodeURIComponent(requested)));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "content-type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
    });
    res.end(content);
  });
}

function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/tripadvisor/search") {
    if (maybeServeCachedProvider(res, url, "tripadvisor")) return;
    handleTripAdvisorSearch(req, res, url);
    return;
  }

  if (url.pathname === "/api/booking/search") {
    if (maybeServeCachedProvider(res, url, "booking")) return;
    handleBookingSearch(req, res, url);
    return;
  }

  if (url.pathname === "/api/yelp/search") {
    if (maybeServeCachedProvider(res, url, "yelp")) return;
    handleYelpSearch(req, res, url);
    return;
  }

  if (url.pathname === "/api/yelp/agent") {
    handleYelpAgent(req, res, url);
    return;
  }

  if (url.pathname === "/api/gemini/ratings") {
    if (maybeServeCachedProvider(res, url, "gemini")) return;
    handleGeminiRatings(req, res, url);
    return;
  }

  if (url.pathname === "/api/brave/ratings") {
    if (maybeServeCachedProvider(res, url, "brave")) return;
    handleBraveRatings(req, res, url);
    return;
  }

  if (url.pathname === "/api/tavily/ratings") {
    if (maybeServeCachedProvider(res, url, "tavily")) return;
    handleTavilyRatings(req, res, url);
    return;
  }

  if (url.pathname === "/api/know-before-you-go") {
    handleKnowBeforeYouGo(req, res, url);
    return;
  }

  if (url.pathname === "/api/assist-rating") {
    handleAssistRating(req, res, url);
    return;
  }

  serveStatic(req, res, url);
}

function listenWithPortFallback(port, attemptsLeft = MAX_PORT_ATTEMPTS) {
  const server = http.createServer(handleRequest);

  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is already in use. Trying ${nextPort}...`);
      server.close();
      listenWithPortFallback(nextPort, attemptsLeft - 1);
      return;
    }

    console.error(error.message);
    process.exitCode = 1;
  });

  server.listen(port, () => {
    console.log(`POI ratings app running at http://127.0.0.1:${port}`);
  });
}

listenWithPortFallback(PORT);
