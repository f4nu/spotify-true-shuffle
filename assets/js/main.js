let SPOTIFY_API; // Globally stores the Spotify API instance
let SHUFFLE_MAX_BATCH_SAMPLE_SIZE = 50; // The sample size for batch shuffling of tracks
let RECENT_SPOTIFY_PLAYBACK_PLAYLIST_ID; // Caches the playlist id of the most recently shuffled playlist
let RECENT_SPOTIFY_SHUFFLED_TRACKS = []; // Caches the most recently shuffled tracks from Spotify
const ARE_CREATED_PLAYLISTS_PUBLIC = false; // Determines whether created playlists are public or not by True Shuffle

// UI Buttons active text tags
const UI_BUTTONS_TAGS = {
    SHUFFLE: 'Reshuffle',
    SAVE: 'Save To New Playlist',
};

/**
 * Retrieves and shuffles the selected playlist, displaying results without starting playback.
 */
async function shuffle_only() {
    const playlist_id = document.getElementById('choose_playlist').value;
    const alt_shuffle = document.getElementById('alt-shuffle').checked;

    ui_render_application_message('');

    let songs;
    try {
        ui_render_play_button('Retrieving Songs...', false);
        if (playlist_id === SPOTIFY_API._constants.LIKED_SONGS_PLAYLIST_ID) {
            songs = await SPOTIFY_API.get_liked_tracks({
                on_progress: (progress, total) => {
                    ui_render_play_button(`Retrieving Songs... [${progress} / ${total}]`, false);
                },
            });
        } else {
            songs = await SPOTIFY_API.get_playlist_tracks(playlist_id, {
                on_progress: (progress, total) => {
                    ui_render_play_button(`Retrieving Songs... [${progress} / ${total}]`, false);
                },
            });
        }

        songs = songs.filter((song) => !song.local);

        if (songs.length === 0) {
            log('ERROR', 'No songs to shuffle.');
            ui_render_play_button(UI_BUTTONS_TAGS.SHUFFLE, true);
            alert('No songs to shuffle. Please select a different playlist.');
            return;
        }
    } catch (error) {
        log('ERROR', 'Failed to retrieve songs.');
        alert('Failed to retrieve songs from Spotify. Refresh the page to try again.');
        return console.log(error);
    }

    ui_render_play_button('Shuffling Songs...', false);
    const size = Math.max(SHUFFLE_MAX_BATCH_SAMPLE_SIZE, Math.ceil(songs.length / 10));
    const shuffled = songs.length <= 10 ? swap_shuffle(songs) : batch_swap_shuffle(songs, size);

    const results = alt_shuffle
        ? get_spread_batch_no_adjacent(shuffled, shuffled.length, size)
        : get_spread_batch(shuffled, shuffled.length, size);

    RECENT_SPOTIFY_SHUFFLED_TRACKS = results;
    RECENT_SPOTIFY_PLAYBACK_PLAYLIST_ID = playlist_id;

    ui_render_queued_songs(results, false);
    ui_render_play_button(UI_BUTTONS_TAGS.SHUFFLE, true);
    ui_render_save_button(UI_BUTTONS_TAGS.SAVE, true);
}

/**
 * Saves the most recently shuffled tracks to a new playlist.
 */
async function save_to_playlist() {
    // Retrieve the shuffled tracks uris from the most recent shuffle
    const uris = RECENT_SPOTIFY_SHUFFLED_TRACKS.map(({ uri }) => uri);

    // Retrieve the recently shuffled playlist
    const playlists = await SPOTIFY_API.get_playlists();
    const recent_playlist = playlists[RECENT_SPOTIFY_PLAYBACK_PLAYLIST_ID];

    // Come up with a concise yet unique name for the shuffle results playlist
    const date = new Date();
    const day = date.getDate();
    const hours = date.getHours() % 12 || 12;
    const am_pm = date.getHours() >= 12 ? 'PM' : 'AM';
    const minutes = date.getMinutes();
    const month = MONTH_NAMES[date.getMonth()];
    const day_prefix = get_month_date_prefix(day);
    const name = `Shuffle Results From ${month.substring(0, 3)} ${day}${day_prefix}, ${hours}:${minutes} ${am_pm}`;

    // Create the shuffle results playlist
    let playlist;
    try {
        ui_render_save_button('Creating Playlist...', false);
        playlist = await SPOTIFY_API.create_playlist(name, {
            description: `True Shuffle generated results from the "${recent_playlist.name}" playlist with over ${recent_playlist.tracks.total} songs.`,
            public: ARE_CREATED_PLAYLISTS_PUBLIC,
        });
    } catch (error) {
        ui_render_save_button(UI_BUTTONS_TAGS.SAVE, true);
        log('ERROR', 'Failed to create the shuffle results playlist.');
        alert('Failed to create the shuffle results playlist.');
        return console.log(error);
    }

    // Set the shuffled tracks into the playlist
    try {
        ui_render_save_button('Updating Playlist...', false);
        await SPOTIFY_API.set_playlist_tracks(playlist.id, uris);
    } catch (error) {
        ui_render_save_button(UI_BUTTONS_TAGS.SAVE, true);
        log('ERROR', 'Failed to store shuffled tracks into the playlist.');
        alert('Failed to store shuffled tracks into the playlist.');
        return console.log(error);
    }

    // Disable the UI button after the playlist has been successfully created
    ui_render_save_button('', false, false);

    // Render the application message to alert the user
    ui_render_application_message(`Your shuffled music has been placed inside a new playlist called<br>
    <strong>${name}</strong>.`);
}

/**
 * Begins loading the application with the Spotify user access token.
 */
async function load_application() {
    // Hide the authentication UI & Display the loading UI
    log('APPLICATION', 'Loading application...');
    const loading_message = document.getElementById('loader_message');
    document.getElementById('loader_container').setAttribute('style', '');
    document.getElementById('auth_section').setAttribute('style', 'display: none;');

    // Initialize the Spotify API instance
    let profile;
    try {
        loading_message.innerText = 'Retrieving Your Spotify Profile';
        SPOTIFY_API = await SpotifyAPI(auth_get_access_token());
        profile = await SPOTIFY_API.get_profile(); // This should be cached in the SpotifyAPI instance already
    } catch (error) {
        log('ERROR', 'Failed to retrieve Spotify profile.');
        loading_message.innerText = 'Failed to retrieve Spotify profile. Refresh the page to try again.';
        return console.log(error);
    }

    // Fetch the user's playlists from Spotify
    try {
        // Retrieve the user's playlists along with the total number of liked songs
        loading_message.innerText = 'Retrieving Your Spotify Playlists';
        const [playlists, total_liked_songs] = await Promise.all([
            SPOTIFY_API.get_playlists(),
            SPOTIFY_API.get_liked_tracks({ count: true }),
        ]);

        // Create a dummy playlist for the user's liked songs
        playlists[SPOTIFY_API._constants.LIKED_SONGS_PLAYLIST_ID] = {
            id: SPOTIFY_API._constants.LIKED_SONGS_PLAYLIST_ID,
            type: 'playlist',
            name: 'Your Music / Liked Songs',
            description: 'The songs you liked on Spotify.',
            snapshot_id: total_liked_songs.toString(), // Use the total number of liked songs as the snapshot ID as we don't have a real snapshot ID for the liked songs playlist
            tracks: {
                total: total_liked_songs,
            },
            owner: {
                me: true,
            },
        };

        // If the user has no playlists, display an error message
        const identifiers = Object.keys(playlists);
        if (identifiers.length === 0) throw 'No Playlists Found. Please Create Or Like A Playlist On Spotify.';

        // Sort the playlist identifiers based on personalization factors
        identifiers.sort((a, b) => {
            const a_total_tracks = playlists[a].tracks.total;
            const a_owned_by_me = playlists[a].owner.me ? 1_000_000 : 0;
            const b_total_tracks = playlists[b].tracks.total;
            const b_owned_by_me = playlists[b].owner.me ? 1_000_000 : 0;
            const a_is_liked_songs = a === SPOTIFY_API._constants.LIKED_SONGS_PLAYLIST_ID ? 100_000_000 : 0;
            const b_is_liked_songs = b === SPOTIFY_API._constants.LIKED_SONGS_PLAYLIST_ID ? 100_000_000 : 0;

            // Sort the playlists by decreasing number of tracks
            // Sort playlists owned by the user higher than other playlists
            return (
                b_total_tracks + b_owned_by_me + b_is_liked_songs - (a_total_tracks + a_owned_by_me + a_is_liked_songs)
            );
        });

        // Insert empty spacers between the liked playlist, user's playlists, and followed playlists
        for (let i = 0; i < identifiers.length; i++) {
            // Ensure the current identifier is not a spacer
            if (identifiers[i]) {
                const current = playlists[identifiers[i]];
                const next = playlists[identifiers[i + 1]];

                // Insert a spacer if this is the liked songs playlist
                if (current.id === SPOTIFY_API._constants.LIKED_SONGS_PLAYLIST_ID) identifiers.splice(i + 1, 0, '');

                // Insert a spacer if this is a user playlist and the next playlist is not a user playlist
                if (current.owner.me && (!next || !next.owner.me)) identifiers.splice(i + 1, 0, '');
            }
        }

        // Render the playlist identifiers to HTML for the UI
        const rendered = identifiers.map((id) => {
            // If there is no ID, render an empty spacer
            if (!id) return '<option value="spacer" disabled>    </option>';

            // Render the playlist as an option in the UI selector
            const playlist = playlists[id];
            const playlist_songs = playlist.tracks.total;
            const playlist_name = clamp_string(playlist.name || playlist.id || 'Unknown', 25);
            const playlist_author_name = clamp_string(
                playlist.owner.display_name || playlist.owner.id || 'Unknown',
                25
            );
            const playlist_owned_by_me = playlist.owner.me === true;
            return `<option value="${playlist.id}">${playlist_name} - ${playlist_songs} Songs ${
                playlist_owned_by_me ? '(By You)' : `(By ${playlist_author_name})`
            }</option>`;
        });

        // Render the devices in the UI selector
        document.getElementById('choose_playlist').innerHTML = rendered.join('\n');
    } catch (error) {
        log('ERROR', 'Failed to retrieve Spotify playlists.');
        loading_message.innerText = 'Failed to retrieve Spotify playlists. Refresh the page to try again.';
        return console.log(error);
    }

    // Update the landing title with a more personalized message
    document.querySelector('.landing-title').innerText = `Welcome, ${profile.display_name}!`;

    // Hide the loading UI & Display the application UI
    document.querySelector('.container').classList.add('authenticated');
    document.getElementById('application_section').setAttribute('style', '');
    document.getElementById('loader_container').setAttribute('style', 'display: none;');
}

function save_client_id() {
    const input = document.getElementById('client_id_input').value.trim();
    if (!input) return alert('Please enter a valid Client ID.');
    auth_set_client_id(input);
    document.getElementById('setup_section').style.display = 'none';
    document.getElementById('auth_section').style.display = '';
}

function forget_app_id() {
    auth_clear_all();
    location.reload();
}

window.addEventListener('load', async () => {
    // Ensure localStorage is available else browser is unsupported
    log('STARTUP', 'Checking for local storage support...');
    if (!local_storage_supported()) return ui_render_connect_button('Unsupported Browser', false);

    // Show the setup screen if no Client ID has been saved yet
    if (!auth_get_client_id()) {
        document.getElementById('setup_section').style.display = '';
        document.getElementById('auth_section').style.display = 'none';
        return;
    }

    // Attempt to parse authorization code from Spotify OAuth callback
    log('STARTUP', 'Parsing authentication connection parameters from Spotify...');
    await auth_parse_connection_parameters();

    // Determine if a valid access token is available and load application
    if (auth_get_access_token()) return load_application();

    // Try refreshing silently if we have a stored refresh token
    if (auth_get_refresh_token()) {
        log('STARTUP', 'Attempting silent token refresh...');
        const token = await auth_refresh_access_token();
        if (token) return load_application();
    }

    // If the user has recently connected their account with the application, automatically reconnect with Spotify
    if (auth_has_recently_connected()) {
        log('STARTUP', 'User has recently connected their account with the application, redirecting to reconnect...');
        auth_connect_spotify();
    }
});
