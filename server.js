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
  googleClientId,
  sessionSecret,
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
const CACHE_ENTRIES_DIR = process.env.POI_CACHE_ENTRIES_DIR || path.join(CACHE_DIR, "entries");
const FAVORITES_DIR = process.env.POI_FAVORITES_DIR || path.join(CACHE_DIR, "favorites");
const MICHELIN_DATA_FILE = process.env.MICHELIN_DATA_FILE || path.join(ROOT, "data", "michelin_my_maps.csv");
const CACHE_MAX_ENTRIES = Number(process.env.POI_CACHE_MAX_ENTRIES || 10000000);
const CACHE_MEMORY_MAX_ENTRIES = Number(process.env.POI_CACHE_MEMORY_MAX_ENTRIES || 5000);
const LEGACY_CACHE_LOAD_LIMIT_BYTES = Number(process.env.POI_LEGACY_CACHE_LOAD_LIMIT_BYTES || 50 * 1024 * 1024);
const TRIPADVISOR_BASE = "https://api.content.tripadvisor.com/api/v1";
const AI_SEARCH_MODEL = process.env.POI_AI_SEARCH_MODEL || "gemini-2.5-flash";
const ROUTE_PLAN_MODEL = process.env.POI_ROUTE_PLAN_MODEL || "gemini-2.5-flash";
const COMPANION_MODEL = process.env.POI_COMPANION_MODEL || "gemini-2.5-flash";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || googleClientId || "";
const AUTH_COOKIE_NAME = "poi_session";
const SESSION_MAX_AGE_SECONDS = Number(process.env.POI_SESSION_MAX_AGE_SECONDS || 60 * 60 * 24 * 30);
const SESSION_SECRET =
  process.env.POI_SESSION_SECRET ||
  sessionSecret ||
  crypto
    .createHash("sha256")
    .update([geminiApiKey, tripAdvisorApiKey, braveApiKey, tavilyApiKey, ROOT].filter(Boolean).join("|") || "poi-rating-console-dev")
    .digest("hex");
const BOOKING_BASE = bookingUseSandbox
  ? "https://demandapi-sandbox.booking.com/3.1"
  : "https://demandapi.booking.com/3.1";
const CHROME_EXECUTABLE = process.env.CHROME_EXECUTABLE || "";
const yelpClient = yelpApiKey ? yelp.client(yelpApiKey) : null;
let michelinRows = null;
let michelinLoadError = null;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};
const PUBLIC_STATIC_FILES = new Set(["/index.html", "/styles.css", "/app.js", "/config.js"]);

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

function loadLegacyResponseCache() {
  try {
    const stat = fs.statSync(CACHE_FILE);
    if (stat.size > LEGACY_CACHE_LOAD_LIMIT_BYTES) {
      console.warn(`Legacy cache file is ${stat.size} bytes; skipping in-memory load. New cache entries use ${CACHE_ENTRIES_DIR}.`);
      return {};
    }

    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    return parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {};
  } catch {
    return {};
  }
}

const responseCache = {
  entries: new Map(),
};
const inflightCacheWrites = new Map();

function getCacheEntryFile(key) {
  return path.join(CACHE_ENTRIES_DIR, key.slice(0, 2), `${key}.json`);
}

function rememberCacheEntry(key, entry) {
  if (!entry) return entry;

  if (responseCache.entries.has(key)) {
    responseCache.entries.delete(key);
  }
  responseCache.entries.set(key, entry);

  while (responseCache.entries.size > CACHE_MEMORY_MAX_ENTRIES) {
    const oldestKey = responseCache.entries.keys().next().value;
    responseCache.entries.delete(oldestKey);
  }

  return entry;
}

function loadCacheEntryFromDisk(key) {
  try {
    const entry = JSON.parse(fs.readFileSync(getCacheEntryFile(key), "utf8"));
    return rememberCacheEntry(key, entry);
  } catch {
    return null;
  }
}

function persistCacheEntry(key, entry) {
  const file = getCacheEntryFile(key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmpFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(entry));
  fs.renameSync(tmpFile, file);
}

function getCacheEntry(key) {
  const hotEntry = responseCache.entries.get(key);
  if (hotEntry) return rememberCacheEntry(key, hotEntry);

  return loadCacheEntryFromDisk(key);
}

function writeCacheEntry(key, payload, meta = {}) {
  const now = new Date().toISOString();
  const previous = getCacheEntry(key);
  const entry = {
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    payload,
    meta,
  };
  rememberCacheEntry(key, entry);
  persistCacheEntry(key, entry);
  return entry;
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signSessionPayload(payload) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function parseCookies(req) {
  return String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator === -1) return cookies;
      const name = part.slice(0, separator);
      const value = part.slice(separator + 1);
      cookies[name] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function getRequestProtocol(req) {
  return req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http");
}

function createSessionCookie(req, user) {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = base64UrlEncode(JSON.stringify({ ...user, expiresAt }));
  const signature = signSessionPayload(payload);
  return serializeCookie(AUTH_COOKIE_NAME, `${payload}.${signature}`, {
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: getRequestProtocol(req) === "https",
  });
}

function createClearSessionCookie(req) {
  return serializeCookie(AUTH_COOKIE_NAME, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: getRequestProtocol(req) === "https",
  });
}

function getSessionUser(req) {
  const token = parseCookies(req)[AUTH_COOKIE_NAME];
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = signSessionPayload(payload);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return null;
  }

  try {
    const user = JSON.parse(base64UrlDecode(payload));
    if (!user.sub || Number(user.expiresAt) < Date.now()) return null;
    return {
      sub: user.sub,
      email: user.email || "",
      name: user.name || user.email || "Google User",
      picture: user.picture || "",
    };
  } catch {
    return null;
  }
}

function getUserFavoritesFile(user) {
  const userKey = crypto.createHash("sha256").update(user.sub).digest("hex");
  return path.join(FAVORITES_DIR, `${userKey}.json`);
}

function loadUserFavorites(user) {
  try {
    const parsed = JSON.parse(fs.readFileSync(getUserFavoritesFile(user), "utf8"));
    return Array.isArray(parsed.favorites) ? parsed.favorites : [];
  } catch {
    return [];
  }
}

function saveUserFavorites(user, favorites) {
  fs.mkdirSync(FAVORITES_DIR, { recursive: true });
  const file = getUserFavoritesFile(user);
  const tmpFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify({ favorites }, null, 2));
  fs.renameSync(tmpFile, file);
}

function getFavoriteKey(poi) {
  return normalizeLookupKey(poi.placeId || poi.id || `${poi.type}-${poi.name}-${poi.city}`);
}

function sanitizeFavoritePoi(value) {
  const poi = value && typeof value === "object" ? value : {};
  const type = poi.type === "hotel" ? "hotel" : "restaurant";
  const favorite = {
    id: String(poi.id || poi.placeId || `${type}-${poi.name || "poi"}`),
    placeId: String(poi.placeId || ""),
    type,
    name: String(poi.name || "Untitled POI").slice(0, 160),
    city: String(poi.city || "").slice(0, 120),
    area: String(poi.area || "").slice(0, 160),
    category: String(poi.category || "").slice(0, 160),
    description: String(poi.description || "").slice(0, 600),
    price: String(poi.price || "").slice(0, 120),
    photoUrl: String(poi.photoUrl || "").slice(0, 1000),
    ratings: poi.ratings && typeof poi.ratings === "object" ? poi.ratings : {},
    tags: toArray(poi.tags).map(String).slice(0, 8),
    lat: Number(poi.lat),
    lng: Number(poi.lng),
    savedAt: new Date().toISOString(),
  };
  favorite.favoriteKey = getFavoriteKey(favorite);
  return favorite;
}

async function verifyGoogleCredential(credential) {
  if (!GOOGLE_CLIENT_ID) {
    const error = new Error("Google OAuth Client ID is not configured.");
    error.status = 500;
    throw error;
  }
  if (!credential || typeof credential !== "string") {
    const error = new Error("Missing Google credential.");
    error.status = 400;
    throw error;
  }

  const response = await fetchWithTimeout(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
    {},
    10000,
    "Google token verification",
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error_description || payload.error || "Google credential verification failed.");
    error.status = 401;
    throw error;
  }
  if (payload.aud !== GOOGLE_CLIENT_ID) {
    const error = new Error("Google credential audience does not match this app.");
    error.status = 401;
    throw error;
  }
  if (payload.email_verified !== "true" && payload.email_verified !== true) {
    const error = new Error("Google email is not verified.");
    error.status = 401;
    throw error;
  }

  return {
    sub: payload.sub,
    email: payload.email || "",
    name: payload.name || payload.email || "Google User",
    picture: payload.picture || "",
  };
}

function getInflightCacheWrite(key) {
  return inflightCacheWrites.get(key)?.promise || null;
}

function startInflightCacheWrite(key) {
  if (inflightCacheWrites.has(key)) return inflightCacheWrites.get(key).promise;

  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  }).finally(() => {
    inflightCacheWrites.delete(key);
  });

  promise.catch(() => {
    // A failing upstream request should notify any waiting duplicate requests,
    // but it should never become an unhandled rejection that stops the server.
  });
  inflightCacheWrites.set(key, { promise, resolve, reject });
  return promise;
}

function resolveInflightCacheWrite(key, entry) {
  const inflight = inflightCacheWrites.get(key);
  if (inflight) inflight.resolve(entry);
}

function rejectInflightCacheWrite(key, error) {
  const inflight = inflightCacheWrites.get(key);
  if (inflight) inflight.reject(error);
}

function serveInflightCacheWrite(res, promise, cacheMetadata) {
  promise
    .then((entry) => {
      sendJson(
        res,
        200,
        withCacheMetadata(entry.payload, {
          ...cacheMetadata,
          status: "hit",
          updatedAt: entry.updatedAt,
          platforms: cacheMetadata.platforms || getPayloadPlatforms(entry.payload),
        }),
      );
    })
    .catch((error) => {
      sendJson(res, 502, {
        error: error.message || "Cached request failed",
      });
    });
}

Object.entries(loadLegacyResponseCache()).forEach(([key, entry]) => {
  rememberCacheEntry(key, entry);
  if (!fs.existsSync(getCacheEntryFile(key))) {
    try {
      persistCacheEntry(key, entry);
    } catch (error) {
      console.warn(`Failed to migrate cache entry ${key}: ${error.message}`);
    }
  }
});

function withCacheMetadata(payload, cache) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  return { ...payload, cache };
}

function getKnowBeforeCacheIdentity(payload) {
  const poi = payload?.poi || {};
  const identity = payload?.cacheIdentity || poi.cacheIdentity || {};
  const id = identity.id || identity.placeId || identity.googlePlaceId || poi.id || "";
  const normalizedId = normalizeLookupKey(id);
  const type = identity.type || poi.type || "poi";
  const source = identity.source || (normalizedId.startsWith("google ") ? "google-places" : "poi");

  if (normalizedId) {
    return {
      source,
      type,
      id: normalizedId,
    };
  }

  return {
    source,
    type,
    name: normalizeLookupKey(identity.name || poi.name),
    city: normalizeLookupKey(identity.city || poi.city),
    area: normalizeLookupKey(identity.area || poi.area),
  };
}

function getKnowBeforeCacheKey(payload) {
  return makeCacheKey({
    kind: "know-before-you-go",
    identity: getKnowBeforeCacheIdentity(payload),
  });
}

function getLegacyKnowBeforePayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const legacyPayload = { ...payload };
  delete legacyPayload.cacheIdentity;

  if (legacyPayload.poi && typeof legacyPayload.poi === "object") {
    legacyPayload.poi = { ...legacyPayload.poi };
    delete legacyPayload.poi.id;
    delete legacyPayload.poi.cacheIdentity;
  }

  return legacyPayload;
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
  if (source === "michelin") return type === "hotel" ? [] : ["Michelin"];
  if (source === "brave" || source === "tavily" || source === "gemini") return getGeminiPlatforms(type);
  return [];
}

const SEARCH_FALLBACK_SOURCES = new Set(["brave", "tavily", "gemini"]);

function sanitizeProviderPayloadForSource(payload, source) {
  if (!SEARCH_FALLBACK_SOURCES.has(source) || !payload || typeof payload !== "object" || !Array.isArray(payload.data)) {
    return payload;
  }

  let changed = false;
  const data = payload.data
    .map((poi) => {
      if (!poi?.ratings?.Michelin) return poi;

      changed = true;
      const ratings = { ...poi.ratings };
      delete ratings.Michelin;

      return {
        ...poi,
        ratings,
        tags: toArray(poi.tags).filter((tag) => tag !== "Michelin"),
      };
    })
    .filter((poi) => Object.keys(poi?.ratings || {}).length);

  return changed ? { ...payload, data } : payload;
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

const PROVIDER_IDENTITY_PARAM_KEYS = new Set(["poiId", "poiSource", "placeId", "cacheIdentityId", "cacheIdentitySource"]);

function getProviderCacheParams(url, options = {}) {
  const includeIdentity = options.includeIdentity !== false;
  const params = {};
  Array.from(url.searchParams.keys())
    .sort()
    .forEach((key) => {
      if (!includeIdentity && PROVIDER_IDENTITY_PARAM_KEYS.has(key)) return;
      params[key] = url.searchParams.getAll(key).map((value) => value.trim());
    });
  return params;
}

function getProviderCacheIdentity(url) {
  const id =
    url.searchParams.get("poiId") ||
    url.searchParams.get("placeId") ||
    url.searchParams.get("cacheIdentityId") ||
    "";
  const normalizedId = normalizeLookupKey(id);
  if (!normalizedId) return null;

  return {
    source: url.searchParams.get("poiSource") || url.searchParams.get("cacheIdentitySource") || "poi",
    type: url.searchParams.get("type") || "all",
    id: normalizedId,
  };
}

function getProviderCacheKey(url, source) {
  const identity = getProviderCacheIdentity(url);
  if (identity) {
    return makeCacheKey({
      kind: "provider",
      source,
      path: url.pathname,
      identity,
    });
  }

  return makeCacheKey({
    kind: "provider",
    source,
    path: url.pathname,
    params: getProviderCacheParams(url),
  });
}

function getLegacyProviderCacheKey(url, source) {
  return makeCacheKey({
    kind: "provider",
    source,
    path: url.pathname,
    params: getProviderCacheParams(url, { includeIdentity: false }),
  });
}

function maybeServeCachedProvider(res, url, source) {
  const type = url.searchParams.get("type") || "all";
  const targetPlatforms = getProviderTargetPlatforms(source, type);
  const identity = getProviderCacheIdentity(url);
  const cacheScope = identity ? "poi-identity" : "request";
  const key = getProviderCacheKey(url, source);
  const legacyKey = getLegacyProviderCacheKey(url, source);
  const directEntry = getCacheEntry(key);
  const legacyEntry = legacyKey !== key ? getCacheEntry(legacyKey) : null;
  const entry = directEntry || legacyEntry;
  const cachedPayload = entry ? sanitizeProviderPayloadForSource(entry.payload, source) : null;

  if (entry && providerCacheIsUsable(cachedPayload, targetPlatforms)) {
    if (!directEntry) {
      writeCacheEntry(key, cachedPayload, {
        source,
        targetPlatforms,
        cacheScope,
        platforms: getPayloadPlatforms(cachedPayload),
        migratedFrom: "request",
      });
    }

    sendJson(
      res,
      200,
      withCacheMetadata(cachedPayload, {
        status: "hit",
        source,
        scope: cacheScope,
        updatedAt: entry.updatedAt,
        platforms: getPayloadPlatforms(cachedPayload),
      }),
    );
    return true;
  }

  const inflight = getInflightCacheWrite(key);
  if (inflight) {
    serveInflightCacheWrite(res, inflight, {
      source,
      scope: cacheScope,
      platforms: cachedPayload ? getPayloadPlatforms(cachedPayload) : [],
    });
    return true;
  }

  res.__cacheWrite = {
    key,
    source,
    targetPlatforms,
    staleMissingPlatforms: cachedPayload ? getMissingPlatforms(cachedPayload, targetPlatforms) : [],
    cacheScope,
  };
  startInflightCacheWrite(key);
  return false;
}

function sendJson(res, status, payload) {
  const cacheWrite = res.__cacheWrite;
  let responsePayload = payload;

  if (cacheWrite && status >= 200 && status < 300) {
    responsePayload = sanitizeProviderPayloadForSource(payload, cacheWrite.source);
    const platforms = getPayloadPlatforms(responsePayload);
    const entry = writeCacheEntry(cacheWrite.key, responsePayload, {
      source: cacheWrite.source,
      targetPlatforms: cacheWrite.targetPlatforms,
      cacheScope: cacheWrite.cacheScope,
      platforms,
    });
    responsePayload = withCacheMetadata(responsePayload, {
      status: cacheWrite.forceRefresh
        ? "refreshed"
        : cacheWrite.staleMissingPlatforms?.length
          ? "refreshed-missing-platforms"
          : "stored",
      source: cacheWrite.source,
      scope: cacheWrite.cacheScope,
      updatedAt: entry.updatedAt,
      platforms,
      missingPlatforms: getMissingPlatforms(responsePayload, cacheWrite.targetPlatforms),
      previousMissingPlatforms: cacheWrite.staleMissingPlatforms,
    });
    resolveInflightCacheWrite(cacheWrite.key, entry);
  } else if (cacheWrite) {
    rejectInflightCacheWrite(cacheWrite.key, new Error(payload?.error || `Request failed with ${status}`));
  }

  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(responsePayload));
}

function readJsonBody(req, maxBytes = 100000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
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

function normalizeMichelinSearchText(value) {
  return (value || "")
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ");
}

const MICHELIN_SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "da",
  "de",
  "der",
  "di",
  "do",
  "du",
  "el",
  "en",
  "in",
  "la",
  "le",
  "les",
  "of",
  "restaurant",
  "the",
]);

function getMichelinSearchTokens(value) {
  return normalizeMichelinSearchText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !MICHELIN_SEARCH_STOP_WORDS.has(token));
}

const MICHELIN_GENERIC_CITY_KEYS = new Set([
  "brave search",
  "gemini search",
  "google places",
  "michelin guide",
  "tavily search",
  "tripadvisor",
  "yelp",
]);

function getMichelinCityKey(value) {
  const key = normalizeMichelinSearchText(value);
  if (key.length < 3 || MICHELIN_GENERIC_CITY_KEYS.has(key)) return "";
  return key;
}

function michelinCityMatches(row, cityKey) {
  if (!cityKey) return true;

  const locationText = `${row.normalizedLocation} ${row.normalizedAddress}`.trim();
  if (locationText.includes(cityKey) || cityKey.includes(row.normalizedLocation)) {
    return true;
  }

  const cityTokens = getMichelinSearchTokens(cityKey).filter((token) => token.length > 2);
  if (!cityTokens.length) return true;
  return cityTokens.some((token) => locationText.includes(token));
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (char === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((value) => value.trim()));
}

function getMichelinAwardRank(award) {
  if (/3\s+stars?/i.test(award)) return 500;
  if (/2\s+stars?/i.test(award)) return 400;
  if (/1\s+star/i.test(award)) return 300;
  if (/bib\s+gourmand/i.test(award)) return 200;
  if (/selected/i.test(award)) return 100;
  return 0;
}

function loadMichelinRows() {
  if (michelinRows) return michelinRows;
  if (michelinLoadError) throw michelinLoadError;

  try {
    const text = fs.readFileSync(MICHELIN_DATA_FILE, "utf8");
    const rows = parseCsvRows(text);
    const headers = rows[0] || [];
    const headerIndex = new Map(headers.map((header, index) => [header, index]));
    const pick = (cells, header) => cells[headerIndex.get(header)]?.trim() || "";

    michelinRows = rows.slice(1).map((cells) => {
      const facilitiesAndServices = pick(cells, "FacilitiesAndServices")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const row = {
        name: pick(cells, "Name"),
        address: pick(cells, "Address"),
        location: pick(cells, "Location"),
        price: pick(cells, "Price"),
        cuisine: pick(cells, "Cuisine"),
        longitude: Number(pick(cells, "Longitude")),
        latitude: Number(pick(cells, "Latitude")),
        phoneNumber: pick(cells, "PhoneNumber"),
        url: pick(cells, "Url"),
        websiteUrl: pick(cells, "WebsiteUrl"),
        award: pick(cells, "Award"),
        greenStar: pick(cells, "GreenStar") === "1",
        facilitiesAndServices,
        description: pick(cells, "Description"),
      };

      const normalizedName = normalizeMichelinSearchText(row.name);
      const normalizedLocation = normalizeMichelinSearchText(row.location);
      const normalizedAddress = normalizeMichelinSearchText(row.address);
      return {
        ...row,
        normalizedName,
        normalizedLocation,
        normalizedAddress,
        normalizedAll: normalizeMichelinSearchText([
          row.name,
          row.address,
          row.location,
          row.cuisine,
          row.award,
        ].filter(Boolean).join(" ")),
        nameTokens: new Set(getMichelinSearchTokens(row.name)),
        allTokens: new Set(getMichelinSearchTokens(`${row.name} ${row.location} ${row.address}`)),
        awardRank: getMichelinAwardRank(row.award),
      };
    }).filter((row) => row.name);

    return michelinRows;
  } catch (error) {
    michelinLoadError = error;
    throw error;
  }
}

function normalizeMichelinRating(row) {
  const award = row.award || "Michelin Guide";
  const max = 3;

  if (/3\s+stars?/i.test(award)) {
    return { score: 3, max, label: "3 星", reviews: null };
  }

  if (/2\s+stars?/i.test(award)) {
    return { score: 2, max, label: "2 星", reviews: null };
  }

  if (/1\s+star/i.test(award)) {
    return { score: 1, max, label: "1 星", reviews: null };
  }

  if (/bib\s+gourmand/i.test(award)) {
    return { score: 0, max, label: "Bib Gourmand", reviews: null };
  }

  if (/selected/i.test(award)) {
    return { score: 0, max, label: "入选", reviews: null };
  }

  return { score: 0, max, label: award, reviews: null };
}

function normalizeMichelinPoi(row) {
  const rating = normalizeMichelinRating(row);
  const locationParts = row.location.split(",").map((part) => part.trim()).filter(Boolean);
  const city = locationParts[0] || row.location || "Michelin Guide";
  const category = [row.cuisine, row.award].filter(Boolean).join(" · ") || "Michelin Guide 餐厅";
  const description = row.description || `${row.name} 收录于 MICHELIN Guide。`;
  const tags = ["Michelin", row.award, row.greenStar ? "Green Star" : null, row.cuisine].filter(Boolean);
  const sourceUrls = [row.url, row.websiteUrl].filter(Boolean);

  return {
    id: `michelin-${normalizeLookupKey(`${row.name}-${row.location}`)}`,
    type: "restaurant",
    name: row.name,
    city,
    area: row.address || row.location || "Michelin Guide",
    category,
    description,
    price: row.price || "暂无价格等级",
    tags,
    michelinUrl: row.url,
    sourceUrls,
    latitude: Number.isFinite(row.latitude) ? row.latitude : undefined,
    longitude: Number.isFinite(row.longitude) ? row.longitude : undefined,
    facilitiesAndServices: row.facilitiesAndServices,
    ratings: {
      Michelin: {
        ...rating,
        updated: "Michelin My Maps",
        source: "michelin-my-maps",
        sourceUrl: row.url,
      },
    },
  };
}

function scoreMichelinRow(row, queryKey, queryTokens, cityKey) {
  if (cityKey && !michelinCityMatches(row, cityKey)) return 0;

  let score = 0;
  let nameScore = 0;
  const name = row.normalizedName;

  if (name === queryKey) {
    nameScore += 5000;
  } else if (name.startsWith(queryKey)) {
    nameScore += 3000;
  } else if (name.includes(queryKey)) {
    nameScore += 2200;
  } else if (queryKey.includes(name) && name.length > 3) {
    nameScore += 1800;
  }

  const matchedNameTokens = queryTokens.filter((token) => row.nameTokens.has(token));
  const tokenRatio = queryTokens.length ? matchedNameTokens.length / queryTokens.length : 0;
  if (!nameScore && tokenRatio < 0.5) return 0;

  score += nameScore;
  if (queryTokens.length && matchedNameTokens.length) {
    score += Math.round(tokenRatio * 1100);
    score += matchedNameTokens.length * 120;
  }

  if (row.normalizedAll.includes(queryKey)) {
    score += 350;
  }

  if (cityKey) score += 700;

  if (score > 0) score += row.awardRank;
  return score;
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

function createTimeoutError(label, timeoutMs) {
  const error = new Error(`${label} timed out after ${timeoutMs}ms`);
  error.name = "AbortError";
  return error;
}

async function withTimeout(promise, timeoutMs, label = "Request") {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(createTimeoutError(label, timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithTimeout(resource, options = {}, timeoutMs = 15000, label = "Fetch") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(resource, {
      ...options,
      signal: options.signal || controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw createTimeoutError(label, timeoutMs);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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

  const response = await fetchWithTimeout(url, {
    headers: {
      accept: "application/json",
    },
  }, 15000, "TripAdvisor API");
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
  const response = await fetchWithTimeout(`${BOOKING_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${bookingToken}`,
      "content-type": "application/json",
      "x-affiliate-id": String(bookingAffiliateId),
    },
    body: JSON.stringify(body),
  }, 20000, "Booking API");
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
    const cacheOnly = url.searchParams.get("cacheOnly") === "1";
    const cacheKey = getKnowBeforeCacheKey(payload);
    const legacyCacheKey = makeCacheKey({
      kind: "know-before-you-go",
      payload: getLegacyKnowBeforePayload(payload),
    });
    const cached = getCacheEntry(cacheKey) || (legacyCacheKey !== cacheKey ? getCacheEntry(legacyCacheKey) : null);

    if (cached && !forceRefresh) {
      if (!getCacheEntry(cacheKey)) {
        writeCacheEntry(cacheKey, cached.payload, {
          source: "know-before-you-go",
          cacheScope: "poi-identity",
          migratedFrom: "payload",
        });
      }

      sendJson(
        res,
        200,
        withCacheMetadata(cached.payload, {
          status: "hit",
          source: "know-before-you-go",
          scope: "poi-identity",
          updatedAt: cached.updatedAt,
        }),
      );
      return;
    }

    if (cacheOnly) {
      sendJson(res, 404, {
        error: "Know Before You Go cache miss",
        cache: {
          status: "miss",
          source: "know-before-you-go",
          scope: "poi-identity",
        },
      });
      return;
    }

    if (!forceRefresh) {
      const inflight = getInflightCacheWrite(cacheKey);
      if (inflight) {
        serveInflightCacheWrite(res, inflight, {
          source: "know-before-you-go",
          scope: "poi-identity",
        });
        return;
      }
    }

    res.__cacheWrite = {
      key: cacheKey,
      source: "know-before-you-go",
      targetPlatforms: [],
      staleMissingPlatforms: [],
      forceRefresh,
      cacheScope: "poi-identity",
    };
    startInflightCacheWrite(cacheKey);

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
  if (type === "restaurant") return ["Yelp"];
  return ["Booking", "Agoda", "Yelp"];
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

function normalizeAiSearchText(value) {
  return (value || "").toString().trim().replace(/\s+/g, " ");
}

function normalizeAiPoiType(value, fallback = "restaurant") {
  if (value === "hotel" || value === "lodging" || /hotel|住宿|酒店/i.test(value || "")) return "hotel";
  if (value === "restaurant" || /restaurant|餐厅|吃|dining|food/i.test(value || "")) return "restaurant";
  return fallback === "hotel" ? "hotel" : "restaurant";
}

function buildFallbackAiIntent(payload) {
  const query = normalizeAiSearchText(payload.query);
  const filters = payload.filters || {};
  const inferredScene =
    payload.scene ||
    (/约会|情侣|date/i.test(query)
      ? "Date Night"
      : /亲子|家庭|family/i.test(query)
        ? "Family Fun"
        : /商务|出差|business/i.test(query)
          ? "Business"
          : /独处|一个人|solo/i.test(query)
            ? "Solo"
            : /夜生活|酒吧|night/i.test(query)
              ? "Night Out"
              : "");
  const scene = inferredScene;
  const type = normalizeAiPoiType(filters.type || payload.type || query, "restaurant");
  const location =
    normalizeAiSearchText(filters.district) ||
    normalizeAiSearchText(filters.city) ||
    (/曼哈顿|manhattan/i.test(query) ? "Manhattan" : "") ||
    normalizeAiSearchText(filters.location) ||
    "";
  const budgetMatch = query.match(/(?:\$|USD\s*)\s*([0-9][0-9,]*)|([0-9][0-9,]*)\s*(?:美元|美金|刀)/i);

  return {
    originalQuery: query,
    location,
    scene,
    persona: /情侣|couple/i.test(query) ? "情侣" : "",
    origin: /新泽西|new jersey|nj/i.test(query) ? "New Jersey" : "",
    type,
    budget: normalizeAiSearchText(filters.budget) || (budgetMatch ? `<= $${budgetMatch[1] || budgetMatch[2]}` : ""),
    keywords: [scene, filters.transit, filters.distance].filter(Boolean).map(String),
    filters: {
      city: normalizeAiSearchText(filters.city),
      district: normalizeAiSearchText(filters.district),
      transit: normalizeAiSearchText(filters.transit),
      distance: normalizeAiSearchText(filters.distance),
    },
  };
}

function normalizeAiSearchPayload(parsed, requestPayload) {
  const fallbackIntent = buildFallbackAiIntent(requestPayload);
  const intent = {
    ...fallbackIntent,
    ...(parsed?.intent && typeof parsed.intent === "object" ? parsed.intent : {}),
  };
  intent.type = normalizeAiPoiType(intent.type || fallbackIntent.type, fallbackIntent.type);
  intent.location = normalizeAiSearchText(intent.location || fallbackIntent.location);
  intent.scene = normalizeAiSearchText(intent.scene || fallbackIntent.scene);
  intent.persona = normalizeAiSearchText(intent.persona);
  intent.origin = normalizeAiSearchText(intent.origin);
  intent.budget = normalizeAiSearchText(intent.budget);
  intent.keywords = toArray(intent.keywords).map(normalizeAiSearchText).filter(Boolean);
  intent.filters = {
    ...fallbackIntent.filters,
    ...(intent.filters && typeof intent.filters === "object" ? intent.filters : {}),
  };

  const candidates = toArray(parsed?.candidates || parsed?.data)
    .map((candidate, index) => {
      const name = normalizeAiSearchText(candidate.name || candidate.title);
      if (!name) return null;
      const type = normalizeAiPoiType(candidate.type || intent.type, intent.type);
      const city = normalizeAiSearchText(candidate.city || intent.filters.city || intent.location);
      const area = normalizeAiSearchText(candidate.area || candidate.neighborhood || intent.filters.district || intent.location);
      const queryParts = [
        candidate.searchQuery,
        name,
        area,
        city,
        type === "hotel" ? "hotel" : "restaurant",
      ].filter(Boolean);

      return {
        id: `ai-${normalizeLookupKey(`${name}-${city || area || index}`)}`,
        name,
        type,
        city,
        area,
        category: normalizeAiSearchText(candidate.category || candidate.cuisine || (type === "hotel" ? "酒店" : "餐厅")),
        why: normalizeAiSearchText(candidate.why || candidate.reason || candidate.summary),
        price: normalizeAiSearchText(candidate.price || candidate.priceHint || candidate.budget),
        tags: toArray(candidate.tags).map(normalizeAiSearchText).filter(Boolean).slice(0, 4),
        searchQuery: normalizeAiSearchText(queryParts.join(" ")),
      };
    })
    .filter(Boolean)
    .slice(0, 10);

  return {
    intent,
    data: candidates,
  };
}

function getAiSearchCacheKey(payload) {
  return makeCacheKey({
    kind: "ai-search",
    query: normalizeLookupKey(payload.query),
    scene: normalizeLookupKey(payload.scene),
    filters: sortDeep(payload.filters || {}),
  });
}

async function handleAiSearch(req, res, url) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.message === "Invalid JSON" ? 400 : 413, { error: error.message });
    return;
  }

  const query = normalizeAiSearchText(payload.query);
  if (query.length < 2 && !payload.scene) {
    sendJson(res, 200, {
      intent: buildFallbackAiIntent(payload),
      data: [],
    });
    return;
  }

  const cacheKey = getAiSearchCacheKey(payload);
  const forceRefresh = url.searchParams.get("refresh") === "1";
  const cached = forceRefresh ? null : getCacheEntry(cacheKey);
  if (cached) {
    sendJson(res, 200, withCacheMetadata(cached.payload, {
      status: "hit",
      source: "ai-search",
      updatedAt: cached.updatedAt,
    }));
    return;
  }

  if (!geminiApiKey) {
    const fallback = normalizeAiSearchPayload({}, payload);
    const entry = writeCacheEntry(cacheKey, fallback, { source: "ai-search", model: AI_SEARCH_MODEL, fallback: true });
    sendJson(res, 200, withCacheMetadata({
      ...fallback,
      warning: "Gemini API key 未配置，已返回规则解析结果。",
    }, {
      status: "stored",
      source: "ai-search",
      updatedAt: entry.updatedAt,
    }));
    return;
  }

  const filters = payload.filters || {};
  const prompt = `
You are a POI discovery planner. Parse the user's natural-language travel/dining intent and return concrete POI candidates.

User query: ${query || payload.scene}
Selected scenario: ${payload.scene || "none"}
City filter: ${filters.city || "unknown"}
District/business area filter: ${filters.district || "none"}
Transit filter: ${filters.transit || "none"}
Distance filter: ${filters.distance || "none"}
Type filter: ${filters.type || payload.type || "auto"}

Return ONLY valid JSON in this exact shape:
{
  "intent": {
    "location": "target city, district, landmark, or area",
    "scene": "date|family|business|solo|nightlife|general",
    "persona": "who is going, if mentioned",
    "origin": "where they start from, if mentioned",
    "type": "restaurant|hotel",
    "budget": "budget constraint if any",
    "keywords": ["safe", "convenient"],
    "filters": {
      "city": "city",
      "district": "district/business area",
      "transit": "subway line or station",
      "distance": "distance requirement"
    }
  },
  "candidates": [
    {
      "name": "real POI name",
      "type": "restaurant|hotel",
      "city": "city",
      "area": "neighborhood/address hint",
      "category": "short category/cuisine/hotel style",
      "why": "one sentence matching the user's intent",
      "price": "price or budget hint if available",
      "tags": ["Date Night", "Safe"],
      "searchQuery": "best Google Places text search query"
    }
  ]
}

Rules:
- Return 4 to 8 real POI candidates when possible.
- Prefer candidates that match location, scene, budget, safety/convenience, and persona.
- Do not invent exact ratings.
- If the user asks in Chinese, keep intent labels and reasons concise Chinese where natural.
- Candidate names must be specific establishments, not neighborhoods or generic categories.
`;

  try {
    let modelData;
    try {
      modelData = await geminiGenerateRatings(prompt, true, 30000, AI_SEARCH_MODEL);
    } catch (error) {
      if (!isAbortError(error) && !isGeminiLocationUnsupported(error)) throw error;
      modelData = await geminiGenerateRatings(
        `${prompt}

Google Search grounding is unavailable or timed out. Return a conservative answer from model knowledge. If uncertain, return fewer candidates.`,
        false,
        20000,
        AI_SEARCH_MODEL,
      );
    }

    const text = modelData.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    const parsed = extractJsonObject(text);
    const normalized = normalizeAiSearchPayload(parsed || {}, payload);
    const responsePayload = {
      ...normalized,
      rawText: text,
      warning: parsed ? undefined : "AI 搜索结果无法解析，已返回规则解析结果。",
    };
    const entry = writeCacheEntry(cacheKey, responsePayload, { source: "ai-search", model: AI_SEARCH_MODEL });
    sendJson(res, 200, withCacheMetadata(responsePayload, {
      status: "stored",
      source: "ai-search",
      updatedAt: entry.updatedAt,
    }));
  } catch (error) {
    const fallback = normalizeAiSearchPayload({}, payload);
    const entry = writeCacheEntry(cacheKey, fallback, { source: "ai-search", model: AI_SEARCH_MODEL, fallback: true });
    sendJson(res, 200, withCacheMetadata({
      ...fallback,
      warning: `AI 搜索失败，已返回规则解析结果：${error.message}`,
    }, {
      status: "stored",
      source: "ai-search",
      updatedAt: entry.updatedAt,
    }));
  }
}

function normalizeRouteStop(stop, index) {
  return {
    index,
    id: normalizeAiSearchText(stop.id || stop.placeId || `${stop.name || "stop"}-${index}`),
    name: normalizeAiSearchText(stop.name || `Stop ${index + 1}`),
    type: normalizeAiPoiType(stop.type, "restaurant"),
    city: normalizeAiSearchText(stop.city),
    area: normalizeAiSearchText(stop.area || stop.address),
    category: normalizeAiSearchText(stop.category),
    address: normalizeAiSearchText(stop.address),
    lat: Number(stop.lat),
    lng: Number(stop.lng),
  };
}

function formatRouteTime(minutesAfterStart) {
  const baseMinutes = 19 * 60 + 30 + minutesAfterStart;
  const hours24 = Math.floor(baseMinutes / 60) % 24;
  const minutes = baseMinutes % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function buildFallbackRoutePlan(stops, prompt = "", warning = "") {
  const lowerPrompt = prompt.toLowerCase();
  const isEvening = /dinner|night|evening|bar|movie|cocktail|晚|夜|酒|电影/.test(lowerPrompt);
  const stopCount = stops.length;
  const minutes = Math.max(90, stopCount * 55 + Math.max(0, stopCount - 1) * 15);

  return {
    title: isEvening ? "Your evening, planned." : "Your route, planned.",
    flowTitle: isEvening ? "Tonight's flow" : "Route flow",
    summary: prompt || "A practical route using your selected stops in order.",
    durationText: `~${Math.round((minutes / 60) * 10) / 10} hrs`,
    distanceText: "Google Maps will calculate live distance",
    travelMode: "walking",
    stopOrder: stops.map((_, index) => index),
    itinerary: stops.map((stop, index) => ({
      stopIndex: index,
      name: stop.name,
      subtitle: [stop.category || (stop.type === "hotel" ? "Hotel" : "Stop"), stop.area || stop.city].filter(Boolean).join(" · "),
      time: formatRouteTime(index * 70),
      note:
        index === 0
          ? "Start here and use the first stop to set the pace."
          : index === stops.length - 1
            ? "End here so the route has a clear finish."
            : "Keep this stop flexible depending on walking time and wait times.",
    })),
    tips: [
      "Check live opening hours before leaving.",
      "Use Google Maps for real-time walking, transit, or rideshare timing.",
    ],
    warning,
  };
}

function normalizeRoutePlanPayload(value, stops, prompt, warning = "") {
  const fallback = buildFallbackRoutePlan(stops, prompt, warning);
  const plan = value && typeof value === "object" ? value : {};
  const rawOrder = Array.isArray(plan.stopOrder) ? plan.stopOrder : fallback.stopOrder;
  const seen = new Set();
  const stopOrder = rawOrder
    .map((index) => Number(index))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < stops.length && !seen.has(index) && seen.add(index));
  const normalizedOrder = stopOrder.length >= 2 ? stopOrder : fallback.stopOrder;
  const itinerarySource = Array.isArray(plan.itinerary) ? plan.itinerary : fallback.itinerary;
  const itinerary = itinerarySource.slice(0, stops.length).map((item, index) => {
    const stopIndex = Number.isInteger(Number(item?.stopIndex)) ? Number(item.stopIndex) : normalizedOrder[index] ?? index;
    const stop = stops[stopIndex] || stops[index] || {};
    return {
      stopIndex,
      name: normalizeAiSearchText(item?.name || stop.name || `Stop ${index + 1}`),
      subtitle: normalizeAiSearchText(
        item?.subtitle || [stop.category || (stop.type === "hotel" ? "Hotel" : "Stop"), stop.area || stop.city].filter(Boolean).join(" · "),
      ),
      time: normalizeAiSearchText(item?.time || formatRouteTime(index * 70)),
      note: normalizeAiSearchText(item?.note || item?.description || ""),
      travelToNext: normalizeAiSearchText(item?.travelToNext || ""),
    };
  });

  return {
    title: normalizeAiSearchText(plan.title || fallback.title),
    flowTitle: normalizeAiSearchText(plan.flowTitle || fallback.flowTitle),
    summary: normalizeAiSearchText(plan.summary || fallback.summary),
    durationText: normalizeAiSearchText(plan.durationText || fallback.durationText),
    distanceText: normalizeAiSearchText(plan.distanceText || fallback.distanceText),
    travelMode: normalizeAiSearchText(plan.travelMode || fallback.travelMode || "walking"),
    stopOrder: normalizedOrder,
    itinerary: itinerary.length ? itinerary : fallback.itinerary,
    tips: toArray(plan.tips).map(normalizeAiSearchText).filter(Boolean).slice(0, 5),
  };
}

function getRoutePlanCacheKey(payload) {
  return makeCacheKey({
    kind: "route-plan",
    prompt: normalizeLookupKey(payload.prompt),
    city: normalizeLookupKey(payload.city),
    stops: (payload.stops || []).map((stop) => ({
      id: normalizeLookupKey(stop.id || stop.placeId),
      name: normalizeLookupKey(stop.name),
      lat: Number(stop.lat).toFixed(5),
      lng: Number(stop.lng).toFixed(5),
    })),
  });
}

async function handleRoutePlan(req, res, url) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(req, 200000);
  } catch (error) {
    sendJson(res, error.message === "Invalid JSON" ? 400 : 413, { error: error.message });
    return;
  }

  const stops = (Array.isArray(payload.stops) ? payload.stops : [])
    .slice(0, 10)
    .map(normalizeRouteStop)
    .filter((stop) => stop.name);
  const promptText = normalizeAiSearchText(payload.prompt);

  if (stops.length < 2) {
    sendJson(res, 400, { error: "At least two stops are required." });
    return;
  }

  const cacheKey = getRoutePlanCacheKey({ ...payload, stops });
  const forceRefresh = url.searchParams.get("refresh") === "1";
  const cached = forceRefresh ? null : getCacheEntry(cacheKey);
  if (cached) {
    sendJson(res, 200, withCacheMetadata(cached.payload, {
      status: "hit",
      source: "route-plan",
      updatedAt: cached.updatedAt,
    }));
    return;
  }

  if (!geminiApiKey) {
    const fallbackPayload = {
      data: buildFallbackRoutePlan(stops, promptText, "Gemini API key 未配置，已返回基础路线。"),
      warning: "Gemini API key 未配置，已返回基础路线。",
    };
    const entry = writeCacheEntry(cacheKey, fallbackPayload, { source: "route-plan", model: ROUTE_PLAN_MODEL, fallback: true });
    sendJson(res, 200, withCacheMetadata(fallbackPayload, {
      status: "stored",
      source: "route-plan",
      updatedAt: entry.updatedAt,
    }));
    return;
  }

  const stopsText = stops
    .map((stop, index) => {
      const location = [stop.address, stop.area, stop.city].filter(Boolean).join(", ");
      return `${index}. ${stop.name} | type=${stop.type} | category=${stop.category || "unknown"} | location=${location || "unknown"} | lat=${stop.lat || ""} | lng=${stop.lng || ""}`;
    })
    .join("\n");

  const prompt = `
You are a practical city route planner. Create a concise itinerary using the selected POI stops.

Selected city/area: ${normalizeAiSearchText(payload.city) || "unknown"}
User optional instruction: ${promptText || "none"}
Stops, zero-based indexes:
${stopsText}

Return ONLY valid JSON in this exact shape:
{
  "title": "Your evening, planned.",
  "flowTitle": "Tonight's flow",
  "summary": "one sentence route overview",
  "durationText": "~3.5 hrs",
  "distanceText": "1.2 mi walking",
  "travelMode": "walking",
  "stopOrder": [0, 1, 2],
  "itinerary": [
    {
      "stopIndex": 0,
      "name": "POI name",
      "subtitle": "Dinner · SoHo",
      "time": "7:30 PM",
      "note": "short practical note",
      "travelToNext": "10 min walk"
    }
  ],
  "tips": ["short practical tip"]
}

Rules:
- Use only the provided stops; do not invent new stops.
- You may reorder stops if the user's instruction implies a better flow; otherwise keep the provided order.
- Keep times realistic. If no date/time is given, assume an evening plan starting around 7:30 PM.
- Keep copy concise and useful for a mobile itinerary.
- If the user writes Chinese, return Chinese notes naturally, but keep short POI names as provided.
`;

  try {
    let modelData;
    try {
      modelData = await geminiGenerateRatings(prompt, false, 30000, ROUTE_PLAN_MODEL);
    } catch (error) {
      if (!isAbortError(error) && !isGeminiLocationUnsupported(error)) throw error;
      modelData = await geminiGenerateRatings(
        `${prompt}

The previous request timed out or the runtime location is unsupported. Return a conservative route plan from the provided stops only.`,
        false,
        20000,
        ROUTE_PLAN_MODEL,
      );
    }

    const text = modelData.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    const parsed = extractJsonObject(text);
    const responsePayload = {
      data: normalizeRoutePlanPayload(parsed || {}, stops, promptText, parsed ? "" : "Gemini 结果无法解析，已返回基础路线。"),
      rawText: text,
      warning: parsed ? undefined : "Gemini 结果无法解析，已返回基础路线。",
    };
    const entry = writeCacheEntry(cacheKey, responsePayload, { source: "route-plan", model: ROUTE_PLAN_MODEL });
    sendJson(res, 200, withCacheMetadata(responsePayload, {
      status: "stored",
      source: "route-plan",
      updatedAt: entry.updatedAt,
    }));
  } catch (error) {
    const warning = `Route 规划失败，已返回基础路线：${error.message}`;
    const fallbackPayload = {
      data: buildFallbackRoutePlan(stops, promptText, warning),
      warning,
    };
    const entry = writeCacheEntry(cacheKey, fallbackPayload, { source: "route-plan", model: ROUTE_PLAN_MODEL, fallback: true });
    sendJson(res, 200, withCacheMetadata(fallbackPayload, {
      status: "stored",
      source: "route-plan",
      updatedAt: entry.updatedAt,
    }));
  }
}

function normalizeCompanionMessage(message) {
  const role = message?.role === "assistant" ? "assistant" : "user";
  const text = normalizeAiSearchText(message?.text || message?.answer || "").slice(0, 1800);
  return text ? { role, text } : null;
}

function compactCompanionContext(context = {}) {
  const poi = context.poi && typeof context.poi === "object" ? context.poi : {};
  return {
    poi: {
      id: normalizeAiSearchText(poi.id || poi.placeId),
      name: normalizeAiSearchText(poi.name),
      type: poi.type === "hotel" ? "hotel" : "restaurant",
      city: normalizeAiSearchText(poi.city),
      area: normalizeAiSearchText(poi.area),
      category: normalizeAiSearchText(poi.category),
      description: normalizeAiSearchText(poi.description).slice(0, 900),
      price: normalizeAiSearchText(poi.price),
    },
    ratings: context.ratings && typeof context.ratings === "object" ? context.ratings : {},
    knowBeforeYouGo: context.knowBeforeYouGo && typeof context.knowBeforeYouGo === "object" ? context.knowBeforeYouGo : null,
    sources: toArray(context.sources)
      .slice(0, 16)
      .map((source) => ({
        name: normalizeAiSearchText(source?.name || source?.category).slice(0, 120),
        category: normalizeAiSearchText(source?.category).slice(0, 160),
        description: normalizeAiSearchText(source?.description).slice(0, 900),
        city: normalizeAiSearchText(source?.city).slice(0, 120),
        area: normalizeAiSearchText(source?.area).slice(0, 160),
        ratings: source?.ratings && typeof source.ratings === "object" ? source.ratings : {},
        reviewsPreview: toArray(source?.reviewsPreview).slice(0, 4),
        photosPreview: toArray(source?.photosPreview).slice(0, 4),
        urls: toArray(source?.urls).slice(0, 6),
      })),
    platformStatuses: context.platformStatuses && typeof context.platformStatuses === "object" ? context.platformStatuses : {},
  };
}

function buildFallbackCompanionAnswer(context, question, warning = "") {
  const poi = context.poi || {};
  const ratingText = Object.entries(context.ratings || {})
    .filter(([, rating]) => Number(rating?.score) > 0)
    .slice(0, 4)
    .map(([source, rating]) => `${source} ${rating.score}/${rating.max || 5}${rating.reviews ? `，${rating.reviews} 条评价` : ""}`)
    .join("；");
  const knowBefore = context.knowBeforeYouGo?.overview || context.knowBeforeYouGo?.headline || "";
  const base = [
    `${poi.name || "这个 POI"} 的可用上下文显示：${ratingText || "目前缺少稳定的平台评分"}。`,
    knowBefore ? `Know Before You Go 摘要提到：${knowBefore}` : "",
    question ? `关于“${question}”，我建议优先核对近期评论、营业时间、地址分店和与你场景最相关的平台信息。` : "",
    warning,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    answer: base,
    highlights: [
      ratingText || "当前评分覆盖还不完整",
      poi.area || poi.city ? `位置线索：${[poi.area, poi.city].filter(Boolean).join(", ")}` : "",
      poi.price ? `价格线索：${poi.price}` : "",
    ].filter(Boolean),
    caveats: ["没有在上下文中出现的信息我不会替你编造。", "出发前仍建议确认营业时间、订位和具体分店。"],
    followups: ["适合我的场景吗？", "最大的风险是什么？", "我应该重点看哪些评论？"],
    confidence: ratingText || knowBefore ? "medium" : "low",
  };
}

function normalizeCompanionAnswer(parsed, fallback) {
  if (!parsed || typeof parsed !== "object") return fallback;
  return {
    answer: normalizeAiSearchText(parsed.answer || parsed.reply || fallback.answer).slice(0, 2600),
    highlights: toArray(parsed.highlights).map(normalizeAiSearchText).filter(Boolean).slice(0, 4),
    caveats: toArray(parsed.caveats).map(normalizeAiSearchText).filter(Boolean).slice(0, 4),
    followups: toArray(parsed.followups).map(normalizeAiSearchText).filter(Boolean).slice(0, 4),
    confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : fallback.confidence,
  };
}

async function handlePoiCompanion(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(req, 650000);
  } catch (error) {
    sendJson(res, error.message === "Invalid JSON" ? 400 : 413, { error: error.message });
    return;
  }

  const question = normalizeAiSearchText(payload.question).slice(0, 1200);
  const context = compactCompanionContext(payload.context || {});
  const messages = toArray(payload.messages).map(normalizeCompanionMessage).filter(Boolean).slice(-8);

  if (!question) {
    sendJson(res, 400, { error: "Missing question" });
    return;
  }

  const fallback = buildFallbackCompanionAnswer(context, question);
  if (!geminiApiKey) {
    sendJson(res, 200, {
      data: fallback,
      warning: "Gemini API key 未配置，已使用现有信息生成基础回答。",
    });
    return;
  }

  const prompt = `
You are Roamie, an AI Companion for one specific POI. You are the user's most knowledgeable assistant about this POI.

Use ONLY the provided POI context. Do not invent facts, opening hours, booking availability, prices, menu items, amenities, policies, awards, or neighborhood claims that are not in the evidence.
If evidence is missing, say what is unknown and what the user should verify.
Answer in the user's language. Be warm, concise, practical, and decision-oriented.
When the user asks for a recommendation, weigh ratings, review counts, platform coverage, Know Before You Go, source snippets, and missing/conflicting signals.

Return ONLY valid JSON:
{
  "answer": "natural answer to the user's latest question, grounded in this POI's context",
  "highlights": ["up to 4 short evidence-backed points"],
  "caveats": ["up to 4 uncertainty or verification points"],
  "followups": ["up to 4 useful next questions the user could ask"],
  "confidence": "high|medium|low"
}

POI context:
${JSON.stringify(context, null, 2)}

Recent conversation:
${JSON.stringify(messages, null, 2)}

Latest user question:
${question}
`;

  try {
    let modelData;
    try {
      modelData = await geminiGenerateRatings(prompt, false, 30000, COMPANION_MODEL);
    } catch (error) {
      if (!isAbortError(error) && !isGeminiLocationUnsupported(error)) throw error;
      modelData = await geminiGenerateRatings(
        `${prompt}

The previous request timed out or the runtime location is unsupported. Return a conservative answer using only the provided POI context.`,
        false,
        20000,
        COMPANION_MODEL,
      );
    }

    const text = modelData.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    const parsed = extractJsonObject(text);
    sendJson(res, 200, {
      data: normalizeCompanionAnswer(parsed, fallback),
      rawText: text,
      warning: parsed ? undefined : "Gemini 输出无法解析，已使用基础回答。",
    });
  } catch (error) {
    sendJson(res, 200, {
      data: buildFallbackCompanionAnswer(context, question, `Gemini 回答失败：${error.message}`),
      warning: `Gemini 回答失败，已使用基础回答：${error.message}`,
    });
  }
}

function requireSessionUser(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    sendJson(res, 401, { error: "Not signed in" });
    return null;
  }
  return user;
}

function handleMe(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const user = getSessionUser(req);
  sendJson(res, 200, {
    user,
    favorites: user ? loadUserFavorites(user) : [],
    googleClientConfigured: Boolean(GOOGLE_CLIENT_ID),
  });
}

async function handleGoogleAuth(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const payload = await readJsonBody(req, 200000);
    const user = await verifyGoogleCredential(payload.credential);
    res.setHeader("Set-Cookie", createSessionCookie(req, user));
    sendJson(res, 200, {
      user,
      favorites: loadUserFavorites(user),
      googleClientConfigured: Boolean(GOOGLE_CLIENT_ID),
    });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Google sign-in failed" });
  }
}

function handleLogout(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  res.setHeader("Set-Cookie", createClearSessionCookie(req));
  sendJson(res, 200, { ok: true });
}

async function handleFavorites(req, res, url) {
  const user = requireSessionUser(req, res);
  if (!user) return;

  if (req.method === "GET") {
    sendJson(res, 200, { favorites: loadUserFavorites(user) });
    return;
  }

  if (req.method === "POST") {
    try {
      const payload = await readJsonBody(req, 250000);
      const favorite = sanitizeFavoritePoi(payload.poi);
      const favorites = loadUserFavorites(user).filter((item) => item.favoriteKey !== favorite.favoriteKey);
      const nextFavorites = [favorite, ...favorites].slice(0, 500);
      saveUserFavorites(user, nextFavorites);
      sendJson(res, 200, { favorite, favorites: nextFavorites });
    } catch (error) {
      sendJson(res, error.message === "Invalid JSON" ? 400 : 413, { error: error.message });
    }
    return;
  }

  if (req.method === "DELETE") {
    let id = url.searchParams.get("id") || "";
    if (!id) {
      try {
        const payload = await readJsonBody(req, 50000);
        id = payload.id || payload.favoriteKey || "";
      } catch {
        id = "";
      }
    }
    const key = normalizeLookupKey(id);
    if (!key) {
      sendJson(res, 400, { error: "Missing favorite id" });
      return;
    }
    const nextFavorites = loadUserFavorites(user).filter((item) => {
      return item.favoriteKey !== key && normalizeLookupKey(item.id) !== key && normalizeLookupKey(item.placeId) !== key;
    });
    saveUserFavorites(user, nextFavorites);
    sendJson(res, 200, { favorites: nextFavorites });
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
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

  const response = await fetchWithTimeout(url, {
    headers: {
      accept: "application/json",
      "X-Subscription-Token": braveApiKey,
    },
  }, 12000, "Brave Search API");
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
  const response = await fetchWithTimeout("https://api.tavily.com/search", {
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
  }, 15000, "Tavily Search API");
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
    const searches = await Promise.allSettled(
      requestedPlatforms.map(async (platform) => ({
        platform,
        tavily: await tavilySearch(getTavilyQuery(platform, query, type, city), platform),
      })),
    );
    const entries = [];
    const answers = [];
    const failures = [];

    searches.forEach((result, index) => {
      const platform = requestedPlatforms[index];
      if (result.status === "rejected") {
        failures.push(`${platform}: ${result.reason.message}`);
        entries.push([platform, null]);
        return;
      }

      const { tavily } = result.value;
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
    });

    const resultsByPlatform = Object.fromEntries(entries);
    const poi = normalizeTavilyPoi(resultsByPlatform, query, type === "all" ? "hotel" : type, city);

    sendJson(res, 200, {
      data: Object.keys(poi.ratings).length ? [poi] : [],
      resultsByPlatform,
      answer: answers.join("\n"),
      warning: failures.length && !Object.keys(poi.ratings).length ? `Tavily Search 部分或全部失败：${failures.join("；")}` : undefined,
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

async function geminiGenerateRatings(prompt, useSearch, timeoutMs = 30000, modelName = geminiModel) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
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
    "Yelp": { "score": 4.5, "max": 5, "reviews": 1234, "sourceUrl": "https://..." }
  }
}

Rules:
- Include only platforms where you found credible public evidence.
- Do not guess ratings.
- Do not return Michelin ratings. Michelin is handled by the local michelin-my-maps dataset.
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

function handleMichelinSearch(req, res, url) {
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

  try {
    const city = url.searchParams.get("city")?.trim() || url.searchParams.get("location")?.trim() || "";
    const queryKey = normalizeMichelinSearchText(query);
    const cityKey = getMichelinCityKey(city);
    const queryTokens = getMichelinSearchTokens(query);
    const matches = loadMichelinRows()
      .map((row) => ({
        row,
        score: scoreMichelinRow(row, queryKey, queryTokens, cityKey),
      }))
      .filter((match) => match.score >= 450)
      .sort((a, b) => b.score - a.score || b.row.awardRank - a.row.awardRank)
      .slice(0, 8)
      .map((match) => normalizeMichelinPoi(match.row));

    sendJson(res, 200, {
      data: matches,
      connector: {
        name: "ngshiheng/michelin-my-maps",
        dataset: "data/michelin_my_maps.csv",
        license: "MIT",
      },
    });
  } catch (error) {
    sendJson(res, 502, {
      error: `Michelin 数据源不可用：${error.message}`,
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
    const response = await withTimeout(
      yelpClient.search({
        term: query,
        location: url.searchParams.get("location") || url.searchParams.get("city") || "New York, NY",
        categories: "restaurants",
        limit: 6,
        sort_by: "best_match",
      }),
      15000,
      "Yelp Fusion API",
    );

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
    const response = await fetchWithTimeout("https://api.yelp.com/ai/chat/v2", {
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
    }, 20000, "Yelp AI Chat API");
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

  if (!PUBLIC_STATIC_FILES.has(requested)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requested);
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  const filePath = path.resolve(ROOT, `.${decodedPath}`);
  const relative = path.relative(ROOT, filePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
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

  if (url.pathname === "/api/me") {
    handleMe(req, res);
    return;
  }

  if (url.pathname === "/api/auth/google") {
    handleGoogleAuth(req, res);
    return;
  }

  if (url.pathname === "/api/logout") {
    handleLogout(req, res);
    return;
  }

  if (url.pathname === "/api/favorites") {
    handleFavorites(req, res, url);
    return;
  }

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

  if (url.pathname === "/api/michelin/search") {
    if (maybeServeCachedProvider(res, url, "michelin")) return;
    handleMichelinSearch(req, res, url);
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

  if (url.pathname === "/api/ai-search") {
    handleAiSearch(req, res, url);
    return;
  }

  if (url.pathname === "/api/route-plan") {
    handleRoutePlan(req, res, url);
    return;
  }

  if (url.pathname === "/api/know-before-you-go") {
    handleKnowBeforeYouGo(req, res, url);
    return;
  }

  if (url.pathname === "/api/poi-companion") {
    handlePoiCompanion(req, res);
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
