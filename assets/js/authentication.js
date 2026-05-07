const AUTH_MAX_RECENT_CONNECTION_AGE = 1000 * 60 * 60 * 24 * 7; // 7 days
const AUTH_APPLICATION_SCOPES = [
    'playlist-modify-public',
    'playlist-modify-private',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-modify-playback-state',
    'user-library-read',
    'user-read-playback-state',
];

/**
 * Returns whether this device connected to Spotify recently or not.
 * @returns {Boolean}
 */
function auth_has_recently_connected() {
    const last_connection_at = localStorage.getItem('last_connection_at');
    return last_connection_at && parseInt(last_connection_at) > Date.now() - AUTH_MAX_RECENT_CONNECTION_AGE;
}

/**
 * Generates and returns an authentication integrity hash that is valid for up to specified "expiry" seconds.
 *
 * @param {Number} expiry
 * @returns {String}
 */
function auth_get_hash(expiry = 60) {
    const hash = random_string(20);
    localStorage.setItem('auth_hash', btoa(`${hash}:${Date.now() + 1000 * expiry}`));
    log('AUTHENTICATION', `Generated Authentication Hash: ${hash}`);
    return hash;
}

/**
 * Validates the provided integrity hash against a stored hash and returns a boolean specifying whether the hash is valid.
 *
 * @param {String} hash
 * @returns {Boolean}
 */
function auth_validate_hash(hash) {
    const raw = localStorage.getItem('auth_hash');
    if (typeof raw == 'string') {
        const [integrity, expiry] = atob(raw).split(':');
        return hash === integrity && parseInt(expiry) > Date.now();
    }
    return false;
}

/**
 * Stores the provided Spotify access token and expiry timestamp in local storage.
 *
 * @param {String} token
 * @param {Number} expiry
 */
function auth_set_access_token(token, expiry) {
    _auth_access_token_cache = undefined;
    localStorage.setItem('access_token', btoa(`${token}:${expiry.toString()}`));
    log('AUTHENTICATION', `Stored Spotify Access Token: [REDACTED] Expires: ${new Date(expiry).toLocaleString()}`);
}

let _auth_access_token_cache;
/**
 * Retrieves a valid Spotify access token from local storage.
 *
 * @returns {String=}
 */
function auth_get_access_token() {
    if (_auth_access_token_cache) return _auth_access_token_cache;
    const raw = localStorage.getItem('access_token');
    if (typeof raw == 'string') {
        const [token, expiry] = atob(raw).split(':');
        _auth_access_token_cache = parseInt(expiry) > Date.now() ? token : undefined;
        return _auth_access_token_cache;
    }
}

function auth_get_client_id() {
    return localStorage.getItem('client_id');
}

function auth_set_client_id(id) {
    localStorage.setItem('client_id', id.trim());
}

function auth_clear_all() {
    _auth_access_token_cache = undefined;
    ['client_id', 'access_token', 'refresh_token', 'last_connection_at', 'auth_hash', 'code_verifier'].forEach(
        (key) => localStorage.removeItem(key)
    );
}

function auth_set_refresh_token(token) {
    localStorage.setItem('refresh_token', token);
}

function auth_get_refresh_token() {
    return localStorage.getItem('refresh_token');
}

/**
 * Uses the stored refresh token to silently obtain a new access token.
 *
 * @returns {Promise<String|null>}
 */
async function auth_refresh_access_token() {
    const refresh_token = auth_get_refresh_token();
    if (!refresh_token) return null;

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token,
                client_id: auth_get_client_id(),
            }),
        });

        if (!response.ok) {
            localStorage.removeItem('refresh_token');
            return null;
        }

        const data = await response.json();
        auth_set_access_token(data.access_token, Date.now() + data.expires_in * 1000);
        if (data.refresh_token) auth_set_refresh_token(data.refresh_token);
        localStorage.setItem('last_connection_at', Date.now().toString());
        return data.access_token;
    } catch {
        return null;
    }
}

// PKCE helpers

function auth_generate_code_verifier(length = 128) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(values)
        .map((x) => possible[x % possible.length])
        .join('');
}

async function auth_generate_code_challenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Step 1: Redirects the user to the Spotify OAuth page using Authorization Code + PKCE flow.
 */
async function auth_connect_spotify() {
    const integrity = auth_get_hash(60);
    const callback_uri = encodeURIComponent(location.origin + location.pathname);
    const scopes = encodeURIComponent(AUTH_APPLICATION_SCOPES.join(' '));

    const code_verifier = auth_generate_code_verifier();
    const code_challenge = await auth_generate_code_challenge(code_verifier);
    localStorage.setItem('code_verifier', code_verifier);

    ui_render_connect_button('Connecting...', false);
    log('AUTHENTICATION', `Redirecting to Spotify OAuth Page: ${callback_uri}`);

    location.href = `https://accounts.spotify.com/authorize?client_id=${auth_get_client_id()}&response_type=code&redirect_uri=${callback_uri}&state=${integrity}&scope=${scopes}&code_challenge_method=S256&code_challenge=${code_challenge}`;
}

/**
 * Step 2: Parses the authorization code from the Spotify OAuth redirect and exchanges it for tokens.
 */
async function auth_parse_connection_parameters() {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (!code || !state) return;

    // Clean the URL before any async work so the code can't be replayed on refresh
    history.replaceState({}, '', location.origin + location.pathname + location.hash);

    if (!auth_validate_hash(state)) return;

    const code_verifier = localStorage.getItem('code_verifier');
    if (!code_verifier) return;
    localStorage.removeItem('code_verifier');

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: location.origin + location.pathname,
                client_id: auth_get_client_id(),
                code_verifier,
            }),
        });

        if (!response.ok) return;

        const data = await response.json();
        auth_set_access_token(data.access_token, Date.now() + data.expires_in * 1000);
        if (data.refresh_token) auth_set_refresh_token(data.refresh_token);
        localStorage.setItem('last_connection_at', Date.now().toString());
    } catch {
        // Token exchange failed silently; user will need to reconnect manually
    }
}
